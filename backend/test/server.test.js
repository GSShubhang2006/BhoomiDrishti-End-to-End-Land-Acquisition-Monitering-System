const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { app } = require("../server");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("health endpoint reports an unavailable database without claiming success", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, "unavailable");
  assert.equal(body.database, "disconnected");
});

test("data endpoints do not fall back to volatile demo records", async () => {
  const response = await fetch(`${baseUrl}/api/projects`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.message, /Database is unavailable/);
});

test("field verification and officer endpoints require a live database", async () => {
  const [verificationResponse, officerResponse] = await Promise.all([
    fetch(`${baseUrl}/api/field-verifications`),
    fetch(`${baseUrl}/api/users/field-officers`),
  ]);

  assert.equal(verificationResponse.status, 503);
  assert.equal(officerResponse.status, 503);
});

test("unknown routes return a not-found response", async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.message, "Route not found");
});

test("invalid JSON receives an explicit client error", async () => {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.message, "Request body contains invalid JSON");
});

test("unconfigured browser origins are rejected", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: "https://untrusted.example" },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.message, "Origin is not allowed by CORS");
});
