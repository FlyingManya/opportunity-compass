import assert from "node:assert/strict";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:4180";
const home = await fetch(base + "/");
assert.equal(home.status, 200);
const welcome = await home.text();
assert.ok(welcome.includes("A little direction."));
assert.ok(!welcome.includes("Search sample opportunities"));
assert.ok(!welcome.includes("Build something that matters."));
const dashboard = await fetch(base + "/dashboard", { redirect: "manual" });
assert.equal(dashboard.status, 307);
assert.equal(new URL(dashboard.headers.get("location"), base).pathname, "/");
const share = await fetch(
  base +
    "/share?url=https%3A%2F%2Fwww.instagram.com%2Freel%2Fexample%2F&title=Shared%20event",
);
assert.equal(share.status, 200);
assert.ok((await share.text()).includes("Sign in to continue"));
const manifest = await fetch(base + "/manifest.webmanifest").then((response) =>
  response.json(),
);
assert.equal(manifest.share_target.action, "/share");
for (const path of [
  "agent/state",
  "agent/links",
  "agent/chat",
  "agent/preferences",
]) {
  const response = await fetch(base + "/api/" + path);
  assert.equal(response.status, 401);
}
const status = await fetch(base + "/api/status").then((r) => r.json());
assert.ok(
  ["not-configured", "connected", "unavailable"].includes(status.database),
);
assert.equal((await fetch(base + "/api/me").then((r) => r.json())).user, null);
assert.equal((await fetch(base + "/api/saved")).status, 401);
assert.equal((await fetch(base + "/api/resume")).status, 401);
assert.equal(
  (
    await fetch(base + "/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://unrelated.example",
      },
      body: "{}",
    })
  ).status,
  403,
);
assert.equal(
  (
    await fetch(base + "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        email: "invalid",
        password: "short",
      }),
    })
  ).status,
  400,
);
if (status.database === "not-configured") {
  const r = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test",
      email: "test@example.com",
      password: "a-long-test-password",
    }),
  });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, "DATABASE_SETUP_REQUIRED");
}
console.log(
  "PASS: public welcome page, protected dashboard redirect, status, unauthenticated account isolation, protected résumé endpoint, origin rejection, input validation, explicit missing-database response.",
);
