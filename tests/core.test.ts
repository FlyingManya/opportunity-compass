import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  checkPassword,
  sameOrigin,
  tokenHash,
  newToken,
} from "../src/lib/security";
import {
  signupSchema,
  profileSchema,
  savedSchema,
} from "../src/lib/validation";
import { emptyProfile } from "../src/lib/types";
import { catalog, filterCatalog, relevance } from "../src/lib/catalog";
import { calendarFile } from "../src/lib/calendar";
test("passwords are salted and only the original password verifies", async () => {
  const a = await hashPassword("a-good-long-password");
  const b = await hashPassword("a-good-long-password");
  assert.notEqual(a, b);
  assert.ok(!a.includes("a-good-long-password"));
  assert.equal(await checkPassword("a-good-long-password", a), true);
  assert.equal(await checkPassword("wrong-password", a), false);
  assert.equal(await checkPassword("anything", "bad-hash"), false);
});
test("sessions use unpredictable tokens and hashes distinct from the token", () => {
  const a = newToken(),
    b = newToken();
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
  assert.notEqual(tokenHash(a), a);
  assert.equal(tokenHash(a).length, 64);
});
test("auth validation normalizes email and rejects weak passwords", () => {
  const u = signupSchema.parse({
    name: " Manya ",
    email: "USER@example.com",
    password: "long-password-123",
  });
  assert.equal(u.email, "user@example.com");
  assert.equal(u.name, "Manya");
  assert.equal(
    signupSchema.safeParse({ name: "A", email: "bad", password: "x" }).success,
    false,
  );
});
test("profile supports independent experience fields and validates timezone and age", () => {
  const p = {
    ...emptyProfile,
    name: "Manya",
    age: 25,
    experience: [
      { field: "Software", years: 2 },
      { field: "Dance", years: 8 },
    ],
  };
  assert.equal(profileSchema.parse(p).experience.length, 2);
  assert.equal(profileSchema.safeParse({ ...p, age: -1 }).success, false);
  assert.equal(
    profileSchema.safeParse({ ...p, timezone: "Moon/Crater" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...p,
      experience: [{ field: "Software", years: -2 }],
    }).success,
    false,
  );
});
test("filtering respects category, text, month, and event vs deadline", () => {
  const first = catalog[0];
  assert.ok(
    filterCatalog(
      catalog,
      "hackathons",
      "AI",
      "",
      "deadline",
      emptyProfile,
    ).every((o) => o.category === "hackathons"),
  );
  assert.equal(
    filterCatalog(
      catalog,
      "all",
      "unfindable-xyz",
      "",
      "deadline",
      emptyProfile,
    ).length,
    0,
  );
  const altered = {
    ...first,
    deadline: "2026-12-01T12:00:00Z",
    eventDate: "2027-01-04T12:00:00Z",
  };
  assert.equal(
    filterCatalog([altered], "all", "", "2026-12", "deadline", emptyProfile)
      .length,
    1,
  );
  assert.equal(
    filterCatalog([altered], "all", "", "2026-12", "event", emptyProfile)
      .length,
    0,
  );
});
test("matching identifies skill evidence and age incompatibility without certainty claims", () => {
  assert.deepEqual(
    relevance(catalog[0], { ...emptyProfile, skills: ["Python"] }).matches,
    ["Python"],
  );
  assert.equal(
    relevance(catalog[0], { ...emptyProfile, age: 16 }).ineligible,
    true,
  );
});
test("calendar export labels samples and uses exclusive next-day ends", () => {
  const o = { ...catalog[0], deadline: "2026-12-31T12:00:00Z" };
  const text = calendarFile([o]);
  assert.match(text, /\[SAMPLE\]/);
  assert.match(text, /DTSTART;VALUE=DATE:20261231/);
  assert.match(text, /DTEND;VALUE=DATE:20270101/);
  assert.match(
    text.replace(/\r\n /g, ""),
    /not an actual application deadline/,
  );
  assert.ok(!text.replaceAll("\r\n", "").includes("\n"));
});
test("calendar text escapes newline-based event injection", () => {
  const text = calendarFile([
    { ...catalog[0], title: "Hello\nBEGIN:VEVENT, extra; data" },
  ]);
  assert.ok(text.includes("Hello\\nBEGIN:VEVENT\\, extra\\; data"));
  assert.equal(text.split("\r\nBEGIN:VEVENT").length, 2);
});
test("mutations reject unrelated origins", () => {
  assert.equal(
    sameOrigin("https://evil.example", "http://127.0.0.1:4180/api/profile"),
    false,
  );
  assert.equal(
    sameOrigin("http://127.0.0.1:4180", "http://127.0.0.1:4180/api/profile"),
    true,
  );
});
test("checklist input rejects unsupported statuses and negative indices", () => {
  assert.equal(
    savedSchema.safeParse({ opportunityId: "a", status: "hired" }).success,
    false,
  );
  assert.equal(
    savedSchema.safeParse({ opportunityId: "a", completedTasks: [-1] }).success,
    false,
  );
});
test("calendar content lines fit 75 UTF-8 octets and unfold without losing text", () => {
  const title = "A possibility 🌱 ".repeat(20);
  const text = calendarFile([{ ...catalog[0], title }]);
  for (const line of text.split("\r\n"))
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  assert.ok(text.replace(/\r\n /g, "").includes(title));
});
