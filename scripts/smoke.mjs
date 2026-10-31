import assert from "node:assert/strict";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:4180";
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
  "PASS: status, unauthenticated account isolation, protected résumé endpoint, origin rejection, input validation, explicit missing-database response.",
);
