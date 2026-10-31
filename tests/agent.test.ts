import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import {
  publicLink,
  platformFor,
  sharedDraft,
  previewFromHTML,
  socialPreview,
  agentPreferencesSchema,
} from "../src/lib/shared-links";
import {
  agentInstructions,
  parseAgentReply,
  agentMode,
  askAgent,
} from "../src/lib/agent-model";
import { handleAgent } from "../src/lib/agent-api";
import { emptyProfile } from "../src/lib/types";
import { emptyAgentPreferences } from "../src/lib/agent-types";

test("shared URLs reject executable schemes, credentials, local addresses and lookalike social hosts", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1/x",
    "https://[::1]/",
    "https://user:secret@example.com",
    "https://example.com:4433/",
    "https://example.local/",
  ])
    assert.equal(publicLink(url), null);
  assert.equal(platformFor("https://www.instagram.com/reel/abc/"), "Instagram");
  assert.equal(
    platformFor("https://instagram.com.evil.example/reel/abc/"),
    "Website",
  );
  assert.equal(platformFor("https://lnkd.in/abc"), "LinkedIn");
});
test("incoming phone share preserves a caption and extracts its link", () => {
  const draft = sharedDraft({
    text: "Medical conference https://www.linkedin.com/posts/example/",
    title: "Research opportunity",
  });
  assert.equal(draft.url, "https://www.linkedin.com/posts/example/");
  assert.equal(draft.title, "Research opportunity");
  assert.equal(draft.caption, "Medical conference");
  assert.equal(sharedDraft({ url: "javascript:alert(1)" }).url, "");
  assert.equal(
    agentPreferencesSchema.safeParse({
      brief: "Research",
      sources: ["https://devpost.com/"],
      useProfile: false,
    }).success,
    true,
  );
  assert.equal(
    agentPreferencesSchema.safeParse({
      brief: "Research",
      sources: ["javascript:alert(1)"],
      useProfile: false,
    }).success,
    false,
  );
});
test("public previews read metadata without executing or rendering page content", () => {
  const preview = previewFromHTML(
    '<script>throw Error("never run")</script><meta content="Research &amp; science" property="og:title"><meta name="description" content="A student program">',
  );
  assert.deepEqual(preview, {
    title: "Research & science",
    caption: "A student program",
  });
});
test("social preview never fetches arbitrary sites or follows a redirect", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; redirect: unknown }[] = [];
  globalThis.fetch = (async (input, options) => {
    calls.push({ url: String(input), redirect: options?.redirect });
    return new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/" },
    });
  }) as typeof fetch;
  try {
    assert.equal(await socialPreview("https://example.com/"), null);
    assert.equal(
      await socialPreview("https://www.instagram.com/accounts/login/"),
      null,
    );
    assert.equal(calls.length, 0);
    assert.equal(
      await socialPreview("https://www.instagram.com/reel/example/"),
      null,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].redirect, "manual");
  } finally {
    globalThis.fetch = original;
  }
});
test("assistant context excludes the profile by default and limits opted-in fields", () => {
  const profile = {
    ...emptyProfile,
    name: "Hidden Name",
    age: 22,
    profession: "Student",
    city: "Delhi",
    interests: ["Research"],
  };
  const defaults = agentInstructions(emptyAgentPreferences, profile, [], false);
  assert.ok(!defaults.includes("Hidden Name"));
  assert.ok(!defaults.includes("Delhi"));
  assert.ok(defaults.includes("NO browsing or search tools"));
  const consented = agentInstructions(
    { ...emptyAgentPreferences, useProfile: true },
    profile,
    [],
    true,
  );
  assert.ok(consented.includes('"city":"Delhi"'));
  assert.ok(!consented.includes('"age"'));
  assert.ok(!consented.includes("Hidden Name"));
  assert.ok(consented.includes("untrusted data"));
});
test("model adapters parse text and accept only safe cited links", () => {
  const result = parseAgentReply(
    {
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Check the official requirements.",
              annotations: [
                {
                  type: "url_citation",
                  title: "Official",
                  url: "https://example.org/",
                },
                {
                  type: "url_citation",
                  title: "Bad",
                  url: "javascript:alert(1)",
                },
              ],
            },
          ],
        },
      ],
    },
    true,
  );
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://example.org/");
  assert.equal(
    parseAgentReply(
      { choices: [{ message: { content: "An open-model reply" } }] },
      false,
    ).content,
    "An open-model reply",
  );
  assert.throws(() => parseAgentReply({ choices: [] }, false));
});

// A test double only: the application has no local persistence fallback.
function memoryDatabase() {
  const collections = new Map<string, any[]>();
  const same = (record: any, query: any) =>
    Object.entries(query).every(([key, value]) => record[key] === value);
  return {
    collection(name: string) {
      if (!collections.has(name)) collections.set(name, []);
      const rows = collections.get(name)!;
      return {
        async insertOne(value: any) {
          rows.push(structuredClone(value));
          return {};
        },
        async findOne(query: any) {
          return structuredClone(rows.find((row) => same(row, query)) || null);
        },
        find(query: any) {
          let found = rows
            .filter((row) => same(row, query))
            .map((row) => {
              const { userId: _owner, ...rest } = row;
              return rest;
            });
          return {
            sort(sort: any) {
              const key = Object.keys(sort)[0];
              found.sort((a, b) =>
                String(b[key]).localeCompare(String(a[key])),
              );
              return this;
            },
            limit(n: number) {
              found = found.slice(0, n);
              return this;
            },
            async toArray() {
              return structuredClone(found);
            },
          };
        },
        async updateOne(query: any, update: any, options?: any) {
          const found = rows.find((row) => same(row, query));
          if (found) {
            Object.assign(found, structuredClone(update.$set));
            return { matchedCount: 1 };
          }
          if (options?.upsert)
            rows.push({ ...query, ...structuredClone(update.$set) });
          return { matchedCount: 0 };
        },
        async findOneAndUpdate(query: any, update: any) {
          let found = rows.find((row) => same(row, query));
          if (!found) {
            found = { ...query, count: 0, ...update.$setOnInsert };
            rows.push(found);
          }
          found.count += update.$inc.count;
          return structuredClone(found);
        },
      };
    },
  } as unknown as Db;
}
test("notes and shared links persist per account, duplicates update, and archive cannot affect another account", async () => {
  const keys = [
    "MODEL_API_KEY",
    "AGENT_API_KEY",
    "AGENT_BASE_URL",
    "AGENT_MODEL",
  ];
  const previous = keys.map((key) => process.env[key]);
  keys.forEach((key) => delete process.env[key]);
  const db = memoryDatabase();
  const call = (user: string, path: string, method = "GET", body?: unknown) =>
    handleAgent(
      db,
      user,
      emptyProfile,
      `agent/${path}`,
      method,
      async () => body,
    );
  try {
    assert.equal(agentMode().connected, false);
    assert.equal(
      await askAgent(emptyAgentPreferences, emptyProfile, [], []),
      null,
    );
    const sent = await (
      await call("alice", "chat", "POST", {
        message: "I want research opportunities.",
      })
    ).json();
    assert.equal(sent.reply, null);
    assert.match(sent.notice, /note is saved/);
    const data = {
      url: "https://www.linkedin.com/posts/research/",
      title: "Research",
      caption: "Application details supplied by the user.",
    };
    const { lead } = await (await call("alice", "links", "POST", data)).json();
    const duplicate = await (
      await call("alice", "links", "POST", { ...data, title: "Updated" })
    ).json();
    assert.equal(duplicate.lead.id, lead.id);
    assert.equal(duplicate.duplicate, true);
    const blocked = await call("bob", "link-archive", "PUT", {
      id: lead.id,
      archived: true,
    });
    assert.equal(blocked.status, 404);
    await call("alice", "preferences", "PUT", {
      brief: "Medical research",
      sources: ["https://example.org/"],
      useProfile: false,
    });
    const alice = await (await call("alice", "state")).json();
    const bob = await (await call("bob", "state")).json();
    assert.equal(alice.messages.length, 1);
    assert.equal(alice.leads.length, 1);
    assert.equal(alice.preferences.brief, "Medical research");
    assert.equal(bob.messages.length, 0);
    assert.equal(bob.leads.length, 0);
    assert.equal(bob.preferences.brief, "");
    assert.ok(!JSON.stringify(bob).includes("Medical research"));
    await call("alice", "link-archive", "PUT", { id: lead.id, archived: true });
    assert.equal(
      (await (await call("alice", "state")).json()).leads[0].archived,
      true,
    );
    await call("alice", "link-archive", "PUT", {
      id: lead.id,
      archived: false,
    });
    assert.equal(
      (await (await call("alice", "state")).json()).leads[0].archived,
      false,
    );
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});

test("model requests select the configured transport and do not expose keys in status", async () => {
  const keys = [
    "MODEL_API_KEY",
    "AGENT_API_KEY",
    "AGENT_BASE_URL",
    "AGENT_MODEL",
  ];
  const previous = keys.map((key) => process.env[key]);
  const original = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  keys.forEach((key) => delete process.env[key]);
  globalThis.fetch = (async (input, options) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(options?.body)) });
    return Response.json(
      url.endsWith("/responses")
        ? {
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Meta response",
                    annotations: [],
                  },
                ],
              },
            ],
          }
        : { choices: [{ message: { content: "Hosted response" } }] },
    );
  }) as typeof fetch;
  try {
    process.env.MODEL_API_KEY = "test-key-never-send";
    assert.equal(
      (await askAgent(emptyAgentPreferences, emptyProfile, [], []))?.content,
      "Meta response",
    );
    assert.equal(calls[0].url, "https://api.meta.ai/v1/responses");
    assert.equal(calls[0].body.tools[0].type, "web_search");
    assert.equal(calls[0].body.store, false);
    assert.ok(!JSON.stringify(agentMode()).includes("test-key"));
    process.env.AGENT_API_KEY = "hosted-test-key";
    assert.equal(
      agentMode().connected,
      false,
      "Partial hosted setup must not silently charge the direct Meta key",
    );
    process.env.AGENT_BASE_URL = "https://models.example.org/v1";
    process.env.AGENT_MODEL = "meta/muse-glimmer";
    assert.equal(agentMode().search, false);
    assert.equal(
      (await askAgent(emptyAgentPreferences, emptyProfile, [], []))?.content,
      "Hosted response",
    );
    assert.equal(
      calls[1].url,
      "https://models.example.org/v1/chat/completions",
    );
    assert.equal(calls[1].body.model, "meta/muse-glimmer");
    assert.equal(calls[1].body.messages[0].role, "system");
    assert.equal(calls[1].body.tools, undefined);
    process.env.AGENT_BASE_URL = "broken";
    assert.equal(agentMode().connected, false);
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
