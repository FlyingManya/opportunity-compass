import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { Binary } from "mongodb";
import type { Profile } from "./types";
import {
  emptyAgentPreferences,
  type AgentMessage,
  type AgentPreferences,
  type SharedLead,
} from "./agent-types";
import {
  agentPreferencesSchema,
  chatSchema,
  leadSchema,
  publicLink,
  platformFor,
  socialPreview,
} from "./shared-links";
import { agentMode, askAgent, isDiscoveryRequest } from "./agent-model";
import { tokenHash } from "./security";
import { curatedForUser } from "./curated-opportunities";
import { matchedDiscoverySource } from "./discovery-source";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function allowed(db: Db, userId: string, action: string) {
  const bucket = Math.floor(Date.now() / 900000);
  const record = await db.collection("rate_limits").findOneAndUpdate(
    { _id: tokenHash(`${action}:${userId}:${bucket}`) as never },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + 1800000) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return (record?.count || 0) <= 30;
}
const statusId = (sourceUrl: string) => tokenHash(sourceUrl);

async function statusOpportunity(
  db: Db,
  userId: string,
  profile: Profile,
  sourceUrl: string,
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.timezone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const found = await db.collection("discovered_opportunities").findOne({
    userId,
    sourceUrl,
    deadline: { $gte: today },
  });
  if (found) return found;
  const [settings, recent, shared] = await Promise.all([
    db.collection("agent_preferences").findOne({ userId }),
    db
      .collection("agent_messages")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(12)
      .toArray(),
    db
      .collection("shared_leads")
      .find({ userId, archived: false })
      .limit(12)
      .toArray(),
  ]);
  return curatedForUser(
    (settings?.preferences || emptyAgentPreferences) as AgentPreferences,
    recent as unknown as AgentMessage[],
    shared as unknown as SharedLead[],
    today,
  ).find((item) => item.sourceUrl === sourceUrl);
}

async function generateStatusImage(prompt: string) {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("META_IMAGE_NOT_CONFIGURED");
  const response = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "muse-image-1.0",
      prompt,
      n: 1,
      size: "1024x1536",
      response_format: "b64_json",
      output_format: "webp",
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!response.ok) {
    console.error("Muse Image status generation failed", {
      status: response.status,
    });
    throw new Error("META_IMAGE_FAILED");
  }
  const result = await response.json();
  const encoded = result.data?.[0]?.b64_json;
  if (typeof encoded !== "string") throw new Error("META_IMAGE_FAILED");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 4 * 1024 * 1024)
    throw new Error("META_IMAGE_FAILED");
  return bytes;
}
export async function handleAgent(
  db: Db,
  userId: string,
  profile: Profile,
  path: string,
  method: string,
  input: () => Promise<unknown>,
) {
  const messages = db.collection("agent_messages");
  const leads = db.collection("shared_leads");
  const briefs = db.collection("agent_preferences");
  const discoveries = db.collection("discovered_opportunities");
  const statusImages = db.collection("opportunity_status_images");
  if (path.startsWith("agent/status-image/") && method === "GET") {
    const id = path.slice("agent/status-image/".length);
    if (!/^[a-f0-9]{64}$/.test(id))
      return json({ error: "Image not found." }, 404);
    const image = await statusImages.findOne({ userId, id });
    if (!image) return json({ error: "Image not found." }, 404);
    return new Response(new Uint8Array(image.data.buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (path === "agent/status-image" && method === "POST") {
    const body = (await input()) as { sourceUrl?: unknown };
    if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 2048)
      return json({ error: "Choose an opportunity." }, 400);
    const opportunity = await statusOpportunity(
      db,
      userId,
      profile,
      body.sourceUrl,
    );
    if (!opportunity)
      return json(
        { error: "This opportunity is no longer on your dashboard." },
        404,
      );
    if (!process.env.MODEL_API_KEY)
      return json(
        { error: "Muse Image needs a Meta Model API key on the server." },
        503,
      );
    if (!(await allowed(db, userId, "status-image")))
      return json(
        { error: "Please wait before generating more status images." },
        429,
      );
    const prompt = `Create a beautiful vertical editorial illustration for a personal opportunity discovery story. Subject: ${String(opportunity.title).slice(0, 180)}. Organizer: ${String(opportunity.organizer).slice(0, 180)}. Context: ${String(opportunity.description).slice(0, 400)}. Contemporary illustrated 2D art, warm sophisticated colors, welcoming and optimistic, interesting people and environment relevant to the subject, polished composition. Keep the lower half and upper edge visually calm so the app can overlay its own accurate title and deadline. Do not include any words, dates, letters, logos, watermarks, UI, or invented claims.`;
    try {
      const bytes = await generateStatusImage(prompt);
      const id = statusId(body.sourceUrl);
      await statusImages.updateOne(
        { userId, id },
        {
          $set: {
            userId,
            id,
            sourceUrl: body.sourceUrl,
            data: new Binary(bytes),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      return json({
        id,
        imageUrl: `/api/agent/status-image/${id}?v=${Date.now()}`,
      });
    } catch {
      return json(
        {
          error:
            "Muse Image could not create this status. Please try again later.",
        },
        502,
      );
    }
  }
  if (path === "agent/discoveries" && method === "GET") {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: profile.timezone || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [rows, saved, recent, shared] = await Promise.all([
      discoveries
        .find(
          { userId, deadline: { $gte: today } },
          { projection: { _id: 0, userId: 0 } },
        )
        .sort({ deadline: 1 })
        .limit(30)
        .toArray(),
      briefs.findOne({ userId }, { projection: { _id: 0, userId: 0 } }),
      messages
        .find({ userId }, { projection: { _id: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(12)
        .toArray(),
      leads
        .find(
          { userId, archived: false },
          { projection: { _id: 0, userId: 0 } },
        )
        .sort({ createdAt: -1 })
        .limit(12)
        .toArray(),
    ]);
    const curated = curatedForUser(
      (saved?.preferences || emptyAgentPreferences) as AgentPreferences,
      recent as unknown as AgentMessage[],
      shared as unknown as SharedLead[],
      today,
    );
    const seen = new Set(rows.map((item) => item.sourceUrl));
    const opportunities = [
      ...rows,
      ...curated.filter((item) => !seen.has(item.sourceUrl)),
    ].sort((left, right) => left.deadline.localeCompare(right.deadline));
    const images = await statusImages
      .find(
        {
          userId,
          id: { $in: opportunities.map((item) => statusId(item.sourceUrl)) },
        },
        { projection: { _id: 0, id: 1, updatedAt: 1 } },
      )
      .toArray();
    const imageTimes = new Map(
      images.map((image) => [image.id, new Date(image.updatedAt).getTime()]),
    );
    return json({
      opportunities: opportunities.map((item) => {
        const id = statusId(item.sourceUrl);
        const version = imageTimes.get(id);
        return {
          ...item,
          statusImageUrl: version
            ? `/api/agent/status-image/${id}?v=${version}`
            : null,
        };
      }),
    });
  }
  if (path === "agent/state" && method === "GET") {
    const [recent, imports, settings] = await Promise.all([
      messages
        .find({ userId }, { projection: { _id: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      leads
        .find({ userId }, { projection: { _id: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      briefs.findOne({ userId }, { projection: { _id: 0, userId: 0 } }),
    ]);
    return json({
      messages: recent.reverse(),
      leads: imports,
      preferences: settings?.preferences || emptyAgentPreferences,
      mode: agentMode(),
    });
  }
  if (path === "agent/preferences" && method === "PUT") {
    const preferences = agentPreferencesSchema.parse(await input());
    preferences.sources = [
      ...new Set(preferences.sources.map((url) => publicLink(url)!)),
    ];
    await briefs.updateOne(
      { userId },
      { $set: { preferences, updatedAt: new Date() } },
      { upsert: true },
    );
    return json({ preferences });
  }
  if (path === "agent/chat" && method === "POST") {
    const { message } = chatSchema.parse(await input());
    if (!(await allowed(db, userId, "agent-chat")))
      return json(
        {
          error:
            "You’ve sent quite a few messages. Please try again in 15 minutes.",
        },
        429,
      );
    const sent: AgentMessage = {
      id: randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    await messages.insertOne({ ...sent, userId });
    if (!agentMode().connected)
      return json({
        sent,
        reply: null,
        notice:
          "Your note is saved privately. AI replies will be available once a model is connected.",
      });
    try {
      const [settings, recent, imports] = await Promise.all([
        briefs.findOne({ userId }),
        messages
          .find({ userId }, { projection: { _id: 0, userId: 0 } })
          .sort({ createdAt: -1 })
          .limit(12)
          .toArray(),
        leads
          .find(
            { userId, archived: false },
            { projection: { _id: 0, userId: 0 } },
          )
          .sort({ createdAt: -1 })
          .limit(8)
          .toArray(),
      ]);
      const discover = agentMode().search && isDiscoveryRequest(message);
      const result = await askAgent(
        (settings?.preferences || emptyAgentPreferences) as AgentPreferences,
        profile,
        imports as unknown as SharedLead[],
        recent.reverse() as unknown as AgentMessage[],
        settings?.preferences?.useResume
          ? await db
              .collection<{ userId: string; type: string; data: Binary }>(
                "resumes",
              )
              .findOne({ userId })
          : null,
        discover,
      );
      if (!result) throw new Error("NO_MODEL");
      if (discover) {
        const raw = result.content.replace(/^```(?:json)?\s*|\s*```$/g, "");
        let parsed: { opportunities?: unknown } = {};
        try {
          parsed = JSON.parse(
            raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1),
          );
        } catch {
          // A malformed model response cannot create dashboard entries.
        }
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: profile.timezone || "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const items = Array.isArray(parsed.opportunities)
          ? parsed.opportunities.slice(0, 4)
          : [];
        let added = 0;
        const skipped = { fields: 0, deadline: 0, source: 0 };
        for (const item of items) {
          if (
            typeof item.title !== "string" ||
            typeof item.organizer !== "string" ||
            typeof item.description !== "string" ||
            typeof item.deadline !== "string" ||
            typeof item.sourceUrl !== "string" ||
            typeof item.reason !== "string"
          ) {
            skipped.fields++;
            continue;
          }
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline) ||
            !Number.isFinite(Date.parse(item.deadline)) ||
            new Date(item.deadline).toISOString().slice(0, 10) !==
              item.deadline ||
            item.deadline < today
          ) {
            skipped.deadline++;
            continue;
          }
          const url = matchedDiscoverySource(
            item.sourceUrl,
            item.title,
            result.sources,
            message,
          );
          if (!url) {
            skipped.source++;
            console.info("Opportunity source mismatch");
            continue;
          }
          await discoveries.updateOne(
            { userId, sourceUrl: url },
            {
              $set: {
                userId,
                sourceUrl: url,
                title: item.title.slice(0, 180),
                organizer: item.organizer.slice(0, 180),
                description: item.description.slice(0, 600),
                deadline: item.deadline,
                reason: item.reason.slice(0, 300),
                discoveredAt: new Date().toISOString(),
                status: "AI-researched; confirm on official page",
              },
            },
            { upsert: true },
          );
          added++;
        }
        console.info("Opportunity discovery validation", {
          candidates: items.length,
          sources: result.sources.length,
          added,
          skipped,
        });
        const reply: AgentMessage = {
          id: randomUUID(),
          role: "assistant",
          content: added
            ? `I added ${added} opportunity${added === 1 ? "" : "ies"} matching your request to your Discover dashboard. Please check each official page before applying.`
            : "This search didn't produce a card with a verified official source and future deadline. That doesn't mean there are no relevant events. Try a named organizer or a broader category, and check any promising leads on the official site.",
          createdAt: new Date().toISOString(),
          sources: [],
        };
        await messages.insertOne({ ...reply, userId });
        return json({ sent, reply, added });
      }
      const reply: AgentMessage = {
        id: randomUUID(),
        role: "assistant",
        ...result,
        createdAt: new Date().toISOString(),
      };
      await messages.insertOne({ ...reply, userId });
      return json({ sent, reply });
    } catch (error) {
      console.error("Opportunity agent failed", {
        name: error instanceof Error ? error.name : "unknown",
        code: error instanceof Error ? error.message : "unknown",
      });
      return json({
        sent,
        reply: null,
        notice:
          "Your message is saved, but the AI service couldn’t reply. Please try again later; check the model connection or credit balance.",
      });
    }
  }
  if (path === "agent/links" && method === "POST") {
    const data = leadSchema.parse(await input());
    if (!(await allowed(db, userId, "agent-import")))
      return json({ error: "Please wait before adding more links." }, 429);
    const url = publicLink(data.url)!;
    const existing = await leads.findOne(
      { userId, url },
      { projection: { _id: 0, userId: 0 } },
    );
    const preview = !data.caption ? await socialPreview(url) : null;
    const title =
      data.title || preview?.title || `${platformFor(url)} opportunity`;
    const caption = data.caption || preview?.caption || "";
    const lead: SharedLead = {
      id: existing?.id || randomUUID(),
      url,
      platform: platformFor(url),
      title,
      caption,
      metadata: data.caption
        ? "provided-text"
        : preview
          ? "public-preview"
          : "link-only",
      createdAt: existing?.createdAt || new Date().toISOString(),
      archived: false,
    };
    await leads.updateOne({ userId, url }, { $set: lead }, { upsert: true });
    return json({ lead, duplicate: !!existing });
  }
  if (path === "agent/link-archive" && method === "PUT") {
    const data = (await input()) as { id?: unknown; archived?: unknown };
    if (
      typeof data.id !== "string" ||
      data.id.length > 100 ||
      typeof data.archived !== "boolean"
    )
      return json({ error: "Choose a saved link." }, 400);
    const result = await leads.updateOne(
      { userId, id: data.id },
      { $set: { archived: data.archived } },
    );
    return result.matchedCount
      ? json({ ok: true })
      : json({ error: "Link not found." }, 404);
  }
  return json({ error: "Not found." }, 404);
}
