import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { Binary } from "mongodb";
import type { Profile } from "./types";
import {
  emptyAgentPreferences,
  type AgentMessage,
  type AgentPreferences,
  type SharedLead,
  type ResearchedSaved,
} from "./agent-types";
import {
  agentPreferencesSchema,
  chatSchema,
  leadSchema,
  publicLink,
  platformFor,
  socialPreview,
} from "./shared-links";
import {
  agentMode,
  askAgent,
  explainOpportunityWithMuse,
  explainOpportunityWithSpark,
  findDeadlineWithMuse,
  extractProfileKeywordsWithMeta,
  isDiscoveryRequest,
} from "./agent-model";
import { tokenHash } from "./security";
import { demoOpportunities, type DemoOpportunity } from "./demo-opportunities";
import { matchedDiscoverySource } from "./discovery-source";
import { sourceQueue } from "./source-queue";
import { validDeadlineDate } from "./deadline-research";
import { parseQuickLookReply, quickLookMetaPrompt } from "./quick-look";
import {
  sameOpportunity,
  uniqueOpportunities,
  type OpportunityIdentity,
} from "./opportunity-duplicates";
type DiscoveredOpportunity = OpportunityIdentity & {
  userId: string;
  description: string;
  reason: string;
  discoveredAt: string;
  status: string;
  requestedRemote?: boolean;
  deadlineEvidence?: string;
  deadlineSourceUrl?: string;
  deadlineOrigin?: "manual" | "muse";
};
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

function todayFor(profile: Profile) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.timezone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function pruneExpired(db: Db, userId: string, today: string) {
  const expired = { userId, deadline: { $ne: "", $lt: today } };
  const [researched, demo] = await Promise.all([
    db.collection("discovered_opportunities").deleteMany(expired),
    db.collection("manual_opportunities").deleteMany(expired),
    db.collection("saved_researched").deleteMany(expired),
  ]);
  return (researched.deletedCount || 0) + (demo.deletedCount || 0);
}

async function removeOpportunity(db: Db, userId: string, sourceUrl: string) {
  const id = statusId(sourceUrl);
  await Promise.all([
    db.collection("discovered_opportunities").deleteOne({ userId, sourceUrl }),
    db.collection("manual_opportunities").deleteOne({ userId, sourceUrl }),
    db.collection("saved_researched").deleteOne({ userId, sourceUrl }),
    db.collection("opportunity_status_images").deleteOne({ userId, id }),
    db.collection("opportunity_card_images").deleteOne({ userId, id }),
  ]);
}

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
  const undated = await db.collection("discovered_opportunities").findOne({
    userId,
    sourceUrl,
    deadline: "",
  });
  if (undated) return undated;
  const manual = await db
    .collection<DemoOpportunity & { userId: string }>("manual_opportunities")
    .findOne({ userId, sourceUrl });
  if (manual && (manual.deadline || manual.eventDate || "9999-12-31") >= today)
    return manual;
  return null;
}

async function generateStatusImage(prompt: string) {
  const key = process.env.MODEL_API_KEY;
  if (!key) return null;
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
    const errorBody = await response.json().catch(() => null);
    const error = errorBody?.error;
    const message =
      typeof error?.message === "string"
        ? error.message.replaceAll(key, "[redacted]").slice(0, 300)
        : undefined;
    console.error("Muse Image status generation failed", {
      status: response.status,
      type: typeof error?.type === "string" ? error.type : undefined,
      code: typeof error?.code === "string" ? error.code : undefined,
      message,
      requestId: response.headers.get("x-request-id") || undefined,
    });
    if ([402, 403, 404].includes(response.status)) return null;
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
async function generateCardImage(opportunity: {
  title: unknown;
  organizer: unknown;
  description: unknown;
  sourceUrl: unknown;
}) {
  const key = process.env.MODEL_API_KEY;
  if (!key) return null;
  const prompt = `Create a polished, landscape editorial image for this specific opportunity card. Opportunity: ${String(opportunity.title).slice(0, 180)}. Organizer: ${String(opportunity.organizer).slice(0, 180)}. Official source URL: ${String(opportunity.sourceUrl).slice(0, 400)}. Description: ${String(opportunity.description).slice(0, 500)}. Use web and image search to check the organizer's official visual identity and the event context before drawing. Make the scene distinctly relevant to this event and organizer, with a clean central subject and rich variation across different opportunities. Include a logo only if you can verify its genuine design from the official source; otherwise omit it. No invented dates, prices, claims, UI, watermarks, or text. This is an illustration, not an official event poster.`;
  const startedAt = Date.now();
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const response = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "muse-image-1.0",
      prompt,
      n: 1,
      size: "1536x1024",
      response_format: "b64_json",
      output_format: "webp",
    }),
    signal: AbortSignal.timeout(50000),
  });
  let encoded: unknown;
  if (response.ok) {
    const result = await response.json();
    encoded = result.data?.[0]?.b64_json;
  } else {
    const errorBody = await response.json().catch(() => null);
    console.warn("Muse Image card generation failed", {
      status: response.status,
      param:
        typeof errorBody?.error?.param === "string"
          ? errorBody.error.param
          : undefined,
      message:
        typeof errorBody?.error?.message === "string"
          ? errorBody.error.message.replaceAll(key, "[redacted]").slice(0, 300)
          : undefined,
      requestId: response.headers.get("x-request-id") || undefined,
    });
    if (response.status !== 404 && response.status !== 503) return null;
    const remaining = 55000 - (Date.now() - startedAt);
    if (remaining < 5000) return null;
    const alternate = await fetch("https://api.meta.ai/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "muse-image-1.0",
        input: prompt,
        store: false,
      }),
      signal: AbortSignal.timeout(remaining),
    });
    if (!alternate.ok) {
      const alternateError = await alternate.json().catch(() => null);
      console.warn("Muse Image response fallback failed", {
        status: alternate.status,
        message:
          typeof alternateError?.error?.message === "string"
            ? alternateError.error.message
                .replaceAll(key, "[redacted]")
                .slice(0, 300)
            : undefined,
        requestId: alternate.headers.get("x-request-id") || undefined,
      });
      return null;
    }
    const result = await alternate.json();
    encoded = result.output?.find(
      (item: { type: string }) => item.type === "image_generation_call",
    )?.result;
  }
  if (typeof encoded !== "string") return null;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length && bytes.length <= 4 * 1024 * 1024 ? bytes : null;
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
  // A saved profile is first-party account context. Résumé sharing remains a
  // separate choice; retain that preference while migrating older accounts.
  if (
    profile.onboarded &&
    ["agent/state", "agent/quick-look", "agent/chat"].includes(path)
  ) {
    const existing = await briefs.findOne({ userId });
    if (
      !existing?.preferences?.useProfile ||
      !existing?.preferences?.useMetaContext
    ) {
      await briefs.updateOne(
        { userId },
        {
          $set: {
            preferences: {
              ...emptyAgentPreferences,
              ...existing?.preferences,
              useProfile: true,
              useMetaContext: true,
            },
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
  }
  const discoveries = db.collection<DiscoveredOpportunity>(
    "discovered_opportunities",
  );
  const statusImages = db.collection("opportunity_status_images");
  const cardImages = db.collection("opportunity_card_images");
  const manual = db.collection<DemoOpportunity & { userId: string }>(
    "manual_opportunities",
  );
  if (path === "agent/demo-seed" && method === "POST") {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: profile.timezone || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const current = demoOpportunities.filter(
      (item) => (item.deadline || item.eventDate || "9999-12-31") >= today,
    );
    await Promise.all(
      current.map(async (item) => {
        await manual.updateOne(
          { userId, sourceUrl: item.sourceUrl },
          { $set: { ...item, userId, manuallyAddedAt: new Date() } },
          { upsert: true },
        );
        await statusImages.updateOne(
          { userId, id: statusId(item.sourceUrl) },
          {
            $setOnInsert: {
              userId,
              id: statusId(item.sourceUrl),
              sourceUrl: item.sourceUrl,
              data: null,
              fallback: true,
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
      }),
    );
    return json({ added: current.length });
  }
  if (path.startsWith("agent/card-image/") && method === "GET") {
    const id = path.slice("agent/card-image/".length);
    if (!/^[a-f0-9]{64}$/.test(id))
      return json({ error: "Image not found." }, 404);
    const image = await cardImages.findOne({ userId, id });
    if (!image?.data) return json({ error: "Image not found." }, 404);
    return new Response(new Uint8Array(image.data.buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (path === "agent/card-image" && method === "POST") {
    const body = (await input()) as { sourceUrl?: unknown };
    if (
      typeof body.sourceUrl !== "string" ||
      body.sourceUrl.length > 2048 ||
      !publicLink(body.sourceUrl)
    )
      return json({ error: "Choose an opportunity from your dashboard." }, 400);
    const opportunity =
      (await statusOpportunity(db, userId, profile, body.sourceUrl)) ||
      (await discoveries.findOne({
        userId,
        sourceUrl: body.sourceUrl,
        deadline: "",
      }));
    if (!opportunity)
      return json({ error: "Opportunity not found on your dashboard." }, 404);
    if ("provenance" in opportunity && opportunity.provenance === "demo")
      return json({ imageUrl: null, unavailable: true });
    const id = statusId(body.sourceUrl);
    const existing = await cardImages.findOne({ userId, id });
    if (existing?.data)
      return json({ imageUrl: `/api/agent/card-image/${id}` });
    if (
      existing?.version === 4 &&
      existing?.attemptedAt &&
      Date.now() - new Date(existing.attemptedAt).getTime() < 86400000
    )
      return json({ imageUrl: null, unavailable: true });
    if (!(await allowed(db, userId, "card-image")))
      return json({ error: "Image limit reached. Try later." }, 429);
    try {
      const bytes = await generateCardImage({
        title: opportunity.title,
        organizer: opportunity.organizer,
        description: opportunity.description,
        sourceUrl: body.sourceUrl,
      });
      await cardImages.updateOne(
        { userId, id },
        {
          $set: {
            userId,
            id,
            sourceUrl: body.sourceUrl,
            data: bytes ? new Binary(bytes) : null,
            attemptedAt: new Date(),
            version: 4,
          },
        },
        { upsert: true },
      );
      return json({
        imageUrl: bytes ? `/api/agent/card-image/${id}` : null,
        unavailable: !bytes,
      });
    } catch (error) {
      console.warn("Muse Image card unavailable", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return json({ imageUrl: null, unavailable: true });
    }
  }
  if (path === "agent/interested" && method === "GET") {
    await pruneExpired(db, userId, todayFor(profile));
    const items = await db
      .collection<ResearchedSaved & { userId: string }>("saved_researched")
      .find({ userId }, { projection: { _id: 0, userId: 0 } })
      .sort({ savedAt: -1 })
      .limit(100)
      .toArray();
    return json({ items });
  }
  if (
    path === "agent/interested" &&
    (method === "POST" || method === "DELETE")
  ) {
    const data = (await input()) as { sourceUrl?: unknown };
    if (typeof data.sourceUrl !== "string" || !publicLink(data.sourceUrl))
      return json({ error: "Choose an opportunity from your dashboard." }, 400);
    const sourceUrl = publicLink(data.sourceUrl)!;
    const savedResearch = db.collection<ResearchedSaved & { userId: string }>(
      "saved_researched",
    );
    if (method === "DELETE") {
      await savedResearch.deleteOne({ userId, sourceUrl });
      return json({ ok: true });
    }
    await pruneExpired(db, userId, todayFor(profile));
    const opportunity =
      (await discoveries.findOne({ userId, sourceUrl })) ||
      (await manual.findOne({ userId, sourceUrl }));
    if (!opportunity)
      return json(
        { error: "This opportunity is no longer available on your dashboard." },
        404,
      );
    const item: ResearchedSaved = {
      id: statusId(sourceUrl),
      sourceUrl,
      title: String(opportunity.title).slice(0, 180),
      organizer: String(opportunity.organizer).slice(0, 180),
      description: String(opportunity.description).slice(0, 600),
      deadline: String(opportunity.deadline || ""),
      savedAt: new Date().toISOString(),
    };
    await savedResearch.updateOne(
      { userId, sourceUrl },
      { $set: { ...item, userId } },
      { upsert: true },
    );
    return json({ item });
  }
  if (path === "agent/quick-look" && (method === "GET" || method === "POST")) {
    const preferences = (await briefs.findOne({ userId }))?.preferences as
      AgentPreferences | undefined;
    const resume = await db
      .collection<{
        userId: string;
        type: string;
        data: Binary;
        updatedAt?: Date;
      }>("resumes")
      .findOne({ userId });
    const resumeText =
      resume?.type === "text/plain"
        ? Buffer.from(resume.data.buffer).toString("utf8").slice(0, 4000)
        : "";
    const hasSignals =
      (!!preferences?.useProfile &&
        !!(
          profile.profession ||
          profile.skills.length ||
          profile.interests.length ||
          profile.experience.length
        )) ||
      !!preferences?.brief?.trim() ||
      (!!resume && !!preferences?.useResume);
    const signature = tokenHash(
      JSON.stringify({
        profession: profile.profession,
        skills: profile.skills,
        interests: profile.interests,
        experience: profile.experience,
        brief: preferences?.brief || "",
        consent: !!preferences?.useMetaContext,
        profileConsent: !!preferences?.useProfile,
        resumeConsent: !!preferences?.useResume,
        resumeUpdatedAt: resume?.updatedAt?.toISOString() || "",
      }),
    );
    const cache = db.collection("quick_look_topics");
    const saved = await cache.findOne({ userId });
    const setupReason = !preferences?.useMetaContext
      ? "Save your profile to create personal ideas."
      : !hasSignals
        ? "Add interests to your profile or a search brief to create personal ideas."
        : !process.env.MODEL_API_KEY
          ? "Meta AI is not connected right now."
          : "";
    if (method === "GET")
      return json({
        topics: saved?.signature === signature ? saved.topics : [],
        unavailable: !!setupReason,
        reason: setupReason,
        stale:
          saved?.signature !== signature &&
          hasSignals &&
          !!preferences?.useMetaContext &&
          !!process.env.MODEL_API_KEY,
      });
    if (saved?.signature === signature) return json({ topics: saved.topics });
    if (
      !hasSignals ||
      !preferences?.useMetaContext ||
      !process.env.MODEL_API_KEY
    )
      return json({ topics: [], unavailable: true, reason: setupReason });
    if (!(await allowed(db, userId, "quick-look")))
      return json({
        topics: [],
        unavailable: true,
        reason: "Too many requests right now. Please retry shortly.",
      });
    try {
      const text = quickLookMetaPrompt(profile, preferences, resumeText);
      const input: unknown =
        preferences.useResume && resume?.type === "application/pdf"
          ? [
              {
                role: "user",
                content: [
                  { type: "input_text", text },
                  {
                    type: "input_file",
                    filename: "resume.pdf",
                    file_data: `data:application/pdf;base64,${Buffer.from(resume.data.buffer).toString("base64")}`,
                  },
                ],
              },
            ]
          : text;
      const response = await fetch("https://api.meta.ai/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.META_TEXT_MODEL || "muse-spark-1.3",
          input,
          store: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Meta status ${response.status}`);
      const body = await response.json();
      const reply = (body.output || [])
        .filter((item: { type: string }) => item.type === "message")
        .flatMap(
          (item: { content?: { type: string; text?: string }[] }) =>
            item.content || [],
        )
        .filter((part: { type: string }) => part.type === "output_text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n");
      const topics = parseQuickLookReply(reply);
      if (topics.length < 3) throw new Error("Empty topics");
      await cache.updateOne(
        { userId },
        { $set: { userId, signature, topics, updatedAt: new Date() } },
        { upsert: true },
      );
      return json({ topics });
    } catch (error) {
      console.warn("Quick Look generation unavailable", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return json({
        topics: [],
        unavailable: true,
        reason: "Meta could not create ideas right now. Please retry.",
      });
    }
  }
  if (path.startsWith("agent/status-image/") && method === "GET") {
    const id = path.slice("agent/status-image/".length);
    if (!/^[a-f0-9]{64}$/.test(id))
      return json({ error: "Image not found." }, 404);
    const image = await statusImages.findOne({ userId, id });
    if (!image?.data) return json({ error: "Image not found." }, 404);
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
            data: bytes ? new Binary(bytes) : null,
            fallback: !bytes,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      return json({
        id,
        imageUrl: bytes
          ? `/api/agent/status-image/${id}?v=${Date.now()}`
          : null,
        statusReady: true,
        fallback: !bytes,
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
  if (path === "agent/discoveries/deadline/manual" && method === "POST") {
    const body = (await input()) as { sourceUrl?: unknown; deadline?: unknown };
    const rawUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    const sourceUrl = publicLink(rawUrl);
    if (!sourceUrl)
      return json({ error: "Choose a card from your dashboard." }, 400);
    if (!validDeadlineDate(body.deadline))
      return json({ error: "Enter a valid calendar date." }, 400);
    const matches = { userId, sourceUrl: { $in: [rawUrl, sourceUrl] } };
    const researched = await discoveries.findOne(matches);
    const opportunity = researched || (await manual.findOne(matches));
    if (!opportunity)
      return json({ error: "This card is not in your dashboard." }, 404);
    if (opportunity.deadline)
      return json({ error: "This card already has a deadline." }, 409);
    if (body.deadline < todayFor(profile)) {
      await removeOpportunity(db, userId, opportunity.sourceUrl);
      return json({
        removed: true,
        message:
          "That deadline has passed, so the opportunity was removed from your dashboard and Interested.",
      });
    }
    const target = researched ? discoveries : manual;
    const result = await target.updateOne(
      { userId, sourceUrl: opportunity.sourceUrl, deadline: "" },
      {
        $set: {
          deadline: body.deadline,
          deadlineOrigin: "manual",
          deadlineEvidence: "",
          deadlineSourceUrl: "",
        },
      },
    );
    if (!result.matchedCount)
      return json(
        { error: "This card changed. Refresh the dashboard and try again." },
        409,
      );
    await db
      .collection<ResearchedSaved & { userId: string }>("saved_researched")
      .updateOne(
        { userId, sourceUrl: opportunity.sourceUrl },
        { $set: { deadline: body.deadline } },
      );
    return json({ found: true, deadline: body.deadline, origin: "manual" });
  }
  if (path === "agent/discoveries/deadline" && method === "POST") {
    const body = (await input()) as { sourceUrl?: unknown };
    const rawUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    const sourceUrl = publicLink(rawUrl);
    if (!sourceUrl)
      return json({ error: "A valid dashboard link is required." }, 400);
    const matches = { userId, sourceUrl: { $in: [rawUrl, sourceUrl] } };
    const researched = await discoveries.findOne(matches);
    const demo = researched ? null : await manual.findOne(matches);
    const opportunity = researched || demo;
    if (!opportunity)
      return json({ error: "This card is not in your dashboard." }, 404);
    if (opportunity.deadline)
      return json({
        deadline: opportunity.deadline,
        found: true,
        alreadyKnown: true,
      });
    if (!(await allowed(db, userId, "deadline-recheck")))
      return json({ error: "Please try again in a little while." }, 429);
    const today = todayFor(profile);
    try {
      const finding = await findDeadlineWithMuse(
        sourceUrl,
        opportunity.title,
        today,
      );
      if (!finding)
        return json({
          found: false,
          message:
            "Muse Wonder could not confirm an application deadline on this source. You can check the page or try again later.",
        });
      if (finding.expired) {
        await removeOpportunity(db, userId, opportunity.sourceUrl);
        return json({
          removed: true,
          message: `Muse Wonder found a past deadline (${finding.deadline}), so this opportunity was removed.`,
        });
      }
      const update = {
        deadline: finding.deadline,
        deadlineEvidence: finding.evidence,
        deadlineSourceUrl: finding.sourceUrl,
        deadlineOrigin: "muse" as const,
      };
      const target = researched ? discoveries : manual;
      const result = await target.updateOne(
        { userId, sourceUrl: opportunity.sourceUrl, deadline: "" },
        { $set: update },
      );
      if (!result.matchedCount)
        return json({
          found: false,
          message:
            "This card changed while Muse was searching. Refresh the dashboard to see its latest date.",
        });
      await db
        .collection<ResearchedSaved & { userId: string }>("saved_researched")
        .updateOne(
          { userId, sourceUrl: opportunity.sourceUrl },
          { $set: { deadline: finding.deadline } },
        );
      return json({
        found: true,
        deadline: finding.deadline,
        sourceUrl: finding.sourceUrl,
        evidence: finding.evidence,
      });
    } catch (error) {
      console.error("Muse Wonder deadline lookup unavailable", {
        code: error instanceof Error ? error.message : "unknown",
      });
      return json(
        {
          error:
            "Muse Wonder could not check this deadline right now. Please try again later.",
        },
        502,
      );
    }
  }
  if (path === "agent/discoveries/detail" && method === "POST") {
    const body = (await input()) as { sourceUrl?: string };
    const rawUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    const sourceUrl = publicLink(rawUrl);
    if (!sourceUrl) return json({ error: "A valid source is required." }, 400);
    const matches = { userId, sourceUrl: { $in: [rawUrl, sourceUrl] } };
    const opportunity =
      (await discoveries.findOne(matches)) || (await manual.findOne(matches));
    if (!opportunity)
      return json({ error: "This card is not in your dashboard." }, 404);
    if (!(await allowed(db, userId, "opportunity-detail")))
      return json({ error: "Please try again shortly." }, 429);
    try {
      const settings = await briefs.findOne({ userId });
      const detail = await explainOpportunityWithMuse(
        sourceUrl,
        opportunity.title,
        profile,
        (settings?.preferences || emptyAgentPreferences) as AgentPreferences,
      );
      return json({ ...detail, provider: "Muse Wonder", verified: true });
    } catch (error) {
      console.error("Muse Wonder detail unavailable", {
        code: error instanceof Error ? error.message : "unknown",
      });
      try {
        const detail = await explainOpportunityWithSpark(opportunity.title);
        return json({ ...detail, provider: "Muse Spark", verified: false });
      } catch (fallbackError) {
        console.error("Muse Spark detail unavailable", {
          code:
            fallbackError instanceof Error ? fallbackError.message : "unknown",
        });
        return json({
          content: "",
          sources: [],
          provider: "Template",
          verified: false,
        });
      }
    }
  }
  if (path === "agent/discoveries/refresh" && method === "POST") {
    return json({ removed: await pruneExpired(db, userId, todayFor(profile)) });
  }
  if (path === "agent/discoveries" && method === "DELETE") {
    const body = (await input()) as { sourceUrl?: string };
    const rawUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    const sourceUrl = publicLink(rawUrl);
    if (!sourceUrl)
      return json({ error: "A valid dashboard link is required." }, 400);
    const removed = await discoveries.deleteOne({
      userId,
      sourceUrl: { $in: [rawUrl, sourceUrl] },
    });
    return json({ removed: removed.deletedCount || 0 });
  }
  if (path === "agent/discoveries" && method === "GET") {
    const today = todayFor(profile);
    await pruneExpired(db, userId, today);
    const [rows, unverifiedRows, manualRows] = await Promise.all([
      discoveries
        .find(
          { userId, deadline: { $gte: today } },
          { projection: { _id: 0, userId: 0 } },
        )
        .sort({ deadline: 1 })
        .limit(20)
        .toArray(),
      discoveries
        .find({ userId, deadline: "" }, { projection: { _id: 0, userId: 0 } })
        .sort({ discoveredAt: -1 })
        .limit(20)
        .toArray(),
      manual
        .find(
          { userId },
          { projection: { _id: 0, userId: 0, manuallyAddedAt: 0 } },
        )
        .limit(20)
        .toArray(),
    ]);
    const currentManual = manualRows.filter(
      (item) => (item.deadline || item.eventDate || "9999-12-31") >= today,
    );
    const opportunities = uniqueOpportunities([
      ...currentManual,
      ...rows,
      ...unverifiedRows.filter(
        (item) =>
          item.status !== "Search lead; deadline and eligibility unverified",
      ),
    ])
      .sort((left, right) =>
        (
          left.deadline ||
          ("eventDate" in left ? String(left.eventDate) : "") ||
          "9999-12-31"
        ).localeCompare(
          right.deadline ||
            ("eventDate" in right ? String(right.eventDate) : "") ||
            "9999-12-31",
        ),
      )
      .slice(0, 20);
    const images = await statusImages
      .find(
        {
          userId,
          id: { $in: opportunities.map((item) => statusId(item.sourceUrl)) },
        },
        { projection: { _id: 0, id: 1, updatedAt: 1, fallback: 1 } },
      )
      .toArray();
    const imageStates = new Map(
      images.map((image) => [
        image.id,
        {
          version: new Date(image.updatedAt).getTime(),
          fallback: !!image.fallback,
        },
      ]),
    );
    return json({
      opportunities: opportunities.map((item) => {
        const id = statusId(item.sourceUrl);
        const state = imageStates.get(id);
        return {
          ...item,
          statusImageUrl:
            state && !state.fallback
              ? `/api/agent/status-image/${id}?v=${state.version}`
              : null,
          statusReady: !!state,
          statusFallback: !!state?.fallback,
        };
      }),
    });
  }
  if (path === "agent/state" && method === "GET") {
    const [imports, settings] = await Promise.all([
      leads
        .find({ userId }, { projection: { _id: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      briefs.findOne({ userId }, { projection: { _id: 0, userId: 0 } }),
    ]);
    const recent = await messages
      .find(
        {
          userId,
          ...(settings?.chatStartedAt
            ? { createdAt: { $gte: settings.chatStartedAt } }
            : {}),
        },
        { projection: { _id: 0, userId: 0 } },
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return json({
      messages: recent.reverse(),
      leads: imports,
      preferences: settings?.preferences || emptyAgentPreferences,
      mode: agentMode(),
    });
  }
  if (path === "agent/chat/new" && method === "POST") {
    await briefs.updateOne(
      { userId },
      { $set: { chatStartedAt: new Date().toISOString() } },
      { upsert: true },
    );
    return json({ ok: true });
  }
  if (path === "agent/preferences" && method === "PUT") {
    const preferences = agentPreferencesSchema.parse(await input());
    if (profile.onboarded) {
      preferences.useProfile = true;
      preferences.useMetaContext = true;
    }
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
      const [settings, imports] = await Promise.all([
        briefs.findOne({ userId }),
        leads
          .find(
            { userId, archived: false },
            { projection: { _id: 0, userId: 0 } },
          )
          .sort({ createdAt: -1 })
          .limit(8)
          .toArray(),
      ]);
      const recent = await messages
        .find(
          {
            userId,
            ...(settings?.chatStartedAt
              ? { createdAt: { $gte: settings.chatStartedAt } }
              : {}),
          },
          { projection: { _id: 0, userId: 0 } },
        )
        .sort({ createdAt: -1 })
        .limit(12)
        .toArray();
      const discover = agentMode().search && isDiscoveryRequest(message);
      const conversation = recent.reverse() as unknown as AgentMessage[];
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: profile.timezone || "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const preferences = (settings?.preferences ||
        emptyAgentPreferences) as AgentPreferences;
      const known: OpportunityIdentity[] = discover
        ? [
            ...(await manual.find({ userId }).toArray()),
            ...(await discoveries.find({ userId }).toArray()),
          ]
        : [];
      const resumeForAgent = settings?.preferences?.useResume
        ? await db
            .collection<{ userId: string; type: string; data: Binary }>(
              "resumes",
            )
            .findOne({ userId })
        : null;
      const result = await askAgent(
        preferences,
        profile,
        imports as unknown as SharedLead[],
        conversation,
        resumeForAgent,
        discover,
        undefined,
        known,
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
        const items = Array.isArray(parsed.opportunities)
          ? parsed.opportunities.slice(0, 20)
          : [];
        let added = 0;
        let leadsAdded = 0;
        let alreadyListed = 0;
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
          const unverified = item.deadline === "";
          if (
            !unverified &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(item.deadline) ||
              !Number.isFinite(Date.parse(item.deadline)) ||
              new Date(item.deadline).toISOString().slice(0, 10) !==
                item.deadline ||
              item.deadline < today)
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
          const candidate = {
            title: item.title,
            organizer: item.organizer,
            deadline: item.deadline,
            sourceUrl: url,
          };
          const existing = known.find((entry) =>
            sameOpportunity(entry, candidate),
          );
          if (existing && (existing.deadline || unverified)) {
            alreadyListed++;
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
                status: unverified
                  ? "Search lead; deadline and eligibility unverified"
                  : "AI-researched; confirm on official page",
              },
            },
            { upsert: true },
          );
          known.push(candidate);
          if (unverified) leadsAdded++;
          else added++;
        }
        const keywordsCollection = db.collection("profile_keywords");
        const signature = tokenHash(
          JSON.stringify({
            profile: preferences.useProfile ? profile : null,
            brief: preferences.brief,
            resume:
              preferences.useResume && resumeForAgent?.type === "text/plain"
                ? Buffer.from(resumeForAgent.data.buffer)
                    .toString("utf8")
                    .slice(0, 2500)
                : null,
            consent: preferences.useMetaContext,
          }),
        );
        const cachedKeywords = await keywordsCollection.findOne({ userId });
        let profileKeywords: string[] =
          cachedKeywords?.signature === signature
            ? cachedKeywords.keywords || []
            : [];
        if (cachedKeywords?.signature !== signature) {
          const fallback =
            preferences.useMetaContext && preferences.useProfile
              ? [
                  profile.profession,
                  ...profile.skills,
                  ...profile.interests,
                ].filter(Boolean)
              : [];
          let extracted: string[] = [];
          if (
            preferences.useMetaContext &&
            preferences.useProfile &&
            process.env.MODEL_API_KEY
          ) {
            try {
              extracted = await extractProfileKeywordsWithMeta(
                profile,
                preferences.brief,
                preferences.useResume && resumeForAgent?.type === "text/plain"
                  ? Buffer.from(resumeForAgent.data.buffer).toString("utf8")
                  : "",
              );
            } catch {
              // Profile fields remain usable when keyword extraction is unavailable.
            }
          }
          profileKeywords = [...new Set([...extracted, ...fallback])].slice(
            0,
            20,
          );
          await keywordsCollection.updateOne(
            { userId },
            {
              $set: {
                userId,
                signature,
                keywords: profileKeywords,
                updatedAt: new Date(),
              },
            },
            { upsert: true },
          );
        }
        const sourceLeads = sourceQueue(
          result.sources,
          message,
          profileKeywords,
          known,
          20,
          today,
        );
        for (const lead of sourceLeads) {
          if (added + leadsAdded >= 20) break;
          await discoveries.updateOne(
            { userId, sourceUrl: lead.sourceUrl },
            {
              $set: {
                userId,
                ...lead,
                description:
                  "Open this card for a Muse Wonder summary of the linked opportunity.",
                deadline: "",
                reason:
                  "Found through a web search for your request; details need review.",
                discoveredAt: new Date().toISOString(),
                status: "Search lead; deadline not mentioned",
              },
            },
            { upsert: true },
          );
          known.push({ ...lead, deadline: "" });
          leadsAdded++;
        }
        const overflow = (
          await discoveries
            .find({ userId }, { projection: { _id: 1 } })
            .sort({ discoveredAt: -1 })
            .toArray()
        ).slice(20);
        if (overflow.length)
          await discoveries.deleteMany({
            userId,
            _id: { $in: overflow.map((item) => item._id) },
          });
        console.info("Opportunity discovery validation", {
          candidates: items.length,
          sources: result.sources.length,
          added,
          leadsAdded,
          alreadyListed,
          skipped,
        });
        const reply: AgentMessage = {
          id: randomUUID(),
          role: "assistant",
          content: added
            ? `I added ${added} deadline-checked opportunit${added === 1 ? "y" : "ies"}${leadsAdded ? ` and ${leadsAdded} event link${leadsAdded === 1 ? "" : "s"} that need date and eligibility checks` : ""} to your Discover dashboard. Please check each official page before applying.`
            : leadsAdded
              ? `I added ${leadsAdded} event link${leadsAdded === 1 ? "" : "s"} to your Discover dashboard. Their deadlines and eligibility are not verified yet, so open the official pages before applying.`
              : alreadyListed
                ? "I found an opportunity matching your request, but it is already on your Discover dashboard. Please check the official page before applying."
                : "I couldn't add a new matching link from this search. Try a more specific topic or add a source in your search brief.",
          createdAt: new Date().toISOString(),
          sources: [],
        };
        await messages.insertOne({ ...reply, userId });
        return json({ sent, reply, added, leadsAdded });
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
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      return json({
        sent,
        reply: null,
        notice: timedOut
          ? "The search took too long. Your message was saved; you can try again."
          : "Your message was saved, but the AI service couldn’t reply. Please try again.",
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
