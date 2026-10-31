import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
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
import { agentMode, askAgent } from "./agent-model";
import { tokenHash } from "./security";
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
          "Your note is saved privately. AI replies will be available once a Meta model is connected.",
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
      const result = await askAgent(
        (settings?.preferences || emptyAgentPreferences) as AgentPreferences,
        profile,
        imports as unknown as SharedLead[],
        recent.reverse() as unknown as AgentMessage[],
      );
      if (!result) throw new Error("NO_MODEL");
      const reply: AgentMessage = {
        id: randomUUID(),
        role: "assistant",
        ...result,
        createdAt: new Date().toISOString(),
      };
      await messages.insertOne({ ...reply, userId });
      return json({ sent, reply });
    } catch {
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
