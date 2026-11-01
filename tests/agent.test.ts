import { test } from "node:test";
import assert from "node:assert/strict";
import { Binary, type Db } from "mongodb";
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
  parseClaudeReply,
  isDiscoveryRequest,
} from "../src/lib/agent-model";
import { handleAgent } from "../src/lib/agent-api";
import { curatedForUser } from "../src/lib/curated-opportunities";
import { matchedDiscoverySource } from "../src/lib/discovery-source";
import { emptyProfile } from "../src/lib/types";
import {
  emptyAgentPreferences,
  type AgentMessage,
} from "../src/lib/agent-types";

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
test("research cards use exact official search pages when the model varies the URL", () => {
  const source = {
    title: "Bloomberg x WiCyS 2026 CTF Application Open",
    url: "https://www.wicys.org/event/bloomberg-x-wicys-2026-ctf-application-open/",
  };
  assert.equal(
    matchedDiscoverySource(
      "https://www.wicys.org/event/bloomberg-wicys-2026-ctf/",
      "Bloomberg x WiCyS 2026 CTF",
      [source],
      "Find women in tech competitions",
    ),
    source.url,
  );
  assert.equal(
    matchedDiscoverySource(
      "https://www.wicys.org/event/unrelated/",
      "Unrelated scholarship",
      [source],
      "Find scholarships",
    ),
    null,
  );
  assert.equal(
    matchedDiscoverySource(
      "https://www.wicys.org/event/bloomberg-wicys-2026-ctf/",
      "Bloomberg x WiCyS 2026 CTF",
      [
        source,
        { ...source, url: "https://www.wicys.org/other/bloomberg-ctf/" },
      ],
      "Find women in tech competitions",
    ),
    null,
  );
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
  assert.ok(consented.includes("Exclude expired opportunities"));
});
test("model adapters parse text and accept only safe cited links", () => {
  assert.deepEqual(
    parseClaudeReply({
      content: [
        {
          type: "text",
          text: "Try this program.",
          citations: [
            {
              type: "web_search_result_location",
              title: "Official",
              url: "https://example.org/",
            },
            { type: "web_search_result_location", url: "javascript:alert(1)" },
          ],
        },
      ],
    }),
    {
      content: "Try this program.",
      sources: [{ title: "Official", url: "https://example.org/" }],
    },
  );
  const result = parseAgentReply(
    {
      output: [
        {
          type: "web_search_call",
          results: [
            { title: "Organizer", url: "https://organizer.example.org/apply" },
            { title: "Blocked", url: "http://127.0.0.1/private" },
          ],
        },
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
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].url, "https://organizer.example.org/apply");
  assert.equal(result.sources[1].url, "https://example.org/");
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
    "CLAUDE_API_KEY",
    "CLAUDE_MODEL",
    "AGENT_PROVIDER",
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

test("current curated lead appears only for interested accounts and expires", async () => {
  const interested = {
    ...emptyAgentPreferences,
    sources: ["https://womenhack.com/events/"],
  };
  assert.equal(curatedForUser(interested, [], [], "2026-11-01").length, 1);
  assert.equal(curatedForUser(interested, [], [], "2026-11-14").length, 0);
  assert.equal(
    curatedForUser(emptyAgentPreferences, [], [], "2026-11-01").length,
    0,
  );
  const db = memoryDatabase();
  await db.collection("agent_preferences").insertOne({
    userId: "alice",
    preferences: interested,
  });
  const forAlice = await handleAgent(
    db,
    "alice",
    emptyProfile,
    "agent/discoveries",
    "GET",
    async () => null,
  );
  const forBob = await handleAgent(
    db,
    "bob",
    emptyProfile,
    "agent/discoveries",
    "GET",
    async () => null,
  );
  assert.equal((await forAlice.json()).opportunities[0].provenance, "curated");
  assert.equal((await forBob.json()).opportunities.length, 0);
});

test("model requests select the configured transport and do not expose keys in status", async () => {
  const keys = [
    "MODEL_API_KEY",
    "AGENT_API_KEY",
    "AGENT_BASE_URL",
    "AGENT_MODEL",
    "CLAUDE_API_KEY",
    "CLAUDE_MODEL",
    "AGENT_PROVIDER",
  ];
  const previous = keys.map((key) => process.env[key]);
  const original = globalThis.fetch;
  const calls: { url: string; body: any; headers: Headers }[] = [];
  keys.forEach((key) => delete process.env[key]);
  globalThis.fetch = (async (input, options) => {
    const url = String(input);
    calls.push({
      url,
      body: JSON.parse(String(options?.body)),
      headers: new Headers(options?.headers),
    });
    return Response.json(
      url.endsWith("/messages")
        ? {
            content: [
              {
                type: "text",
                text: "Claude response",
                citations: [
                  {
                    type: "web_search_result_location",
                    title: "Program",
                    url: "https://example.org/",
                  },
                ],
              },
            ],
          }
        : url.endsWith("/responses")
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
    process.env.CLAUDE_API_KEY = "claude-test-key";
    assert.equal(agentMode().label, "Claude");
    assert.equal(agentMode().search, true);
    assert.equal(
      (await askAgent(emptyAgentPreferences, emptyProfile, [], []))?.content,
      "Claude response",
    );
    assert.equal(calls[2].url, "https://api.anthropic.com/v1/messages");
    assert.equal(calls[2].headers.get("x-api-key"), "claude-test-key");
    assert.equal(calls[2].headers.get("anthropic-version"), "2023-06-01");
    assert.equal(calls[2].body.model, "claude-sonnet-5-5");
    assert.equal(calls[2].body.tools[0].name, "web_search");
    assert.ok(!JSON.stringify(agentMode()).includes("claude-test-key"));
    await askAgent(
      { ...emptyAgentPreferences, useResume: true },
      emptyProfile,
      [],
      [
        {
          id: "test",
          role: "user",
          content: "Find suitable opportunities",
          createdAt: new Date().toISOString(),
        },
      ],
      {
        type: "application/pdf",
        data: new Binary(Buffer.from("%PDF-private-resume")),
      },
    );
    assert.equal(calls[3].body.messages[0].content[0].type, "document");
    assert.ok(!JSON.stringify(calls[2].body).includes("%PDF-private-resume"));
    process.env.AGENT_PROVIDER = "meta";
    const privateHistory: AgentMessage[] = [
      {
        id: "old",
        role: "user",
        content: "Private prior chat",
        createdAt: "2026-10-31T00:00:00Z",
      },
      {
        id: "new",
        role: "user",
        content: "Find opportunities",
        createdAt: "2026-11-01T00:00:00Z",
      },
    ];
    const privateResume = {
      type: "application/pdf",
      data: new Binary(Buffer.from("%PDF-private-resume")),
    };
    assert.equal(agentMode().label, "Meta AI");
    await askAgent(
      { ...emptyAgentPreferences, useProfile: true, useResume: true },
      { ...emptyProfile, profession: "Engineer" },
      [],
      privateHistory,
      privateResume,
      true,
    );
    assert.equal(calls[4].url, "https://api.meta.ai/v1/responses");
    assert.equal(calls[4].body.input.length, 1);
    assert.equal(calls[4].body.input[0].content, "Find opportunities");
    assert.equal(calls[4].body.tools[0].search_context_size, "high");
    assert.deepEqual(calls[4].body.include, ["web_search_call.results"]);
    assert.ok(!JSON.stringify(calls[4].body).includes("Engineer"));
    assert.ok(!JSON.stringify(calls[4].body).includes("file_data"));
    await askAgent(
      {
        ...emptyAgentPreferences,
        useProfile: true,
        useResume: true,
        useMetaContext: true,
      },
      { ...emptyProfile, profession: "Engineer" },
      [],
      privateHistory,
      privateResume,
      true,
    );
    assert.equal(calls[5].body.input[1].content[1].type, "input_file");
    assert.ok(calls[5].body.instructions.includes("Engineer"));
    assert.ok(calls[5].body.instructions.includes("DISCOVERY TASK"));
    await askAgent(
      emptyAgentPreferences,
      emptyProfile,
      [],
      [
        {
          id: "women-search",
          role: "user",
          content: "Find women in tech hackathons",
          createdAt: "2026-11-01T00:00:00Z",
        },
      ],
      null,
      true,
    );
    assert.ok(
      calls[6].body.instructions.includes("https://devpost.com/hackathons"),
    );
    assert.ok(
      calls[6].body.instructions.includes("https://womenhack.com/events/"),
    );
    assert.ok(!calls[6].body.instructions.includes("Private prior chat"));
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});

test("discovery saves only cited opportunities with future deadlines for the current account", async () => {
  assert.equal(isDiscoveryRequest("Find women in tech fellowships"), true);
  assert.equal(isDiscoveryRequest("Hello"), false);
  const previous = process.env.CLAUDE_API_KEY;
  const original = globalThis.fetch;
  process.env.CLAUDE_API_KEY = "test-only";
  const opportunities = [
    {
      title: "Future program",
      organizer: "Organizer",
      description: "For engineers",
      deadline: "2999-01-01",
      sourceUrl: "https://official.example.org/apply",
      reason: "Skills match",
    },
    {
      title: "Expired program",
      organizer: "Organizer",
      description: "Old",
      deadline: "2000-01-01",
      sourceUrl: "https://official.example.org/old",
      reason: "Old",
    },
    {
      title: "Uncited program",
      organizer: "Organizer",
      description: "No source",
      deadline: "2999-01-01",
      sourceUrl: "https://other.example.org/apply",
      reason: "Unknown",
    },
  ];
  let citedUrl = "https://official.example.org/apply/?utm_source=search";
  globalThis.fetch = (async () =>
    Response.json({
      content: [
        {
          type: "text",
          text: JSON.stringify({ opportunities }),
          citations: [
            {
              type: "web_search_result_location",
              title: "Official",
              url: citedUrl,
            },
          ],
        },
      ],
    })) as typeof fetch;
  try {
    const db = memoryDatabase();
    const response = await handleAgent(
      db,
      "alice",
      emptyProfile,
      "agent/chat",
      "POST",
      async () => ({ message: "Find women in tech fellowships" }),
    );
    const body = await response.json();
    assert.equal(body.added, 1);
    assert.match(body.reply.content, /added 1 opportunity/);
    const rows = await db
      .collection("discovered_opportunities")
      .find({ userId: "alice" })
      .toArray();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Future program");
    citedUrl = "https://official.example.org/women-tech-event";
    opportunities.splice(0, opportunities.length, {
      title: "Women in tech event",
      organizer: "Organizer",
      description: "A second event",
      deadline: "2999-02-01",
      sourceUrl: citedUrl,
      reason: "Matches the new request",
    });
    const next = await handleAgent(
      db,
      "alice",
      emptyProfile,
      "agent/chat",
      "POST",
      async () => ({ message: "Find a women in tech event" }),
    );
    assert.equal((await next.json()).added, 1);
    assert.deepEqual(
      (
        await db
          .collection("discovered_opportunities")
          .find({ userId: "alice" })
          .toArray()
      )
        .map((item) => item.title)
        .sort(),
      ["Future program", "Women in tech event"],
    );
    assert.equal(
      (
        await db
          .collection("discovered_opportunities")
          .find({ userId: "bob" })
          .toArray()
      ).length,
      0,
    );
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.CLAUDE_API_KEY;
    else process.env.CLAUDE_API_KEY = previous;
  }
});

test("a user-supplied official page can match a searched organizer site", async () => {
  const previous = process.env.CLAUDE_API_KEY;
  const original = globalThis.fetch;
  process.env.CLAUDE_API_KEY = "test-only";
  const url = "https://official.example.org/event/current";
  globalThis.fetch = (async () =>
    Response.json({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            opportunities: [
              {
                title: "Current competition",
                organizer: "Organizer",
                description: "A current competition",
                deadline: "2999-01-01",
                sourceUrl: url,
                reason: "Relevant skills",
              },
            ],
          }),
          citations: [
            {
              type: "web_search_result_location",
              title: "Organizer calendar",
              url: "https://official.example.org/events",
            },
          ],
        },
      ],
    })) as typeof fetch;
  try {
    const db = memoryDatabase();
    const matched = await handleAgent(
      db,
      "alice",
      emptyProfile,
      "agent/chat",
      "POST",
      async () => ({ message: `Find this competition: ${url}` }),
    );
    assert.equal((await matched.json()).added, 1);
    const unmatched = await handleAgent(
      db,
      "bob",
      emptyProfile,
      "agent/chat",
      "POST",
      async () => ({ message: "Find this competition" }),
    );
    assert.equal((await unmatched.json()).added, 0);
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.CLAUDE_API_KEY;
    else process.env.CLAUDE_API_KEY = previous;
  }
});
