import test from "node:test";
import assert from "node:assert/strict";
import { isFertilabUser, accountName } from "../src/identity.js";
import { requireFertilabSession } from "../lib/serverAuth.js";

const user = { email: "alan.antich@fertilab.org", app_metadata: { provider: "azure" }, user_metadata: { full_name: "Alan Antich" } };

test("accepts a Fertilab Microsoft identity and uses its account name", () => {
  assert.equal(isFertilabUser(user), true);
  assert.equal(accountName(user), "Alan Antich");
  assert.equal(accountName({ email: user.email }), user.email);
});

test("rejects external accounts, lookalike domains and anonymous identities", () => {
  for (const email of ["user@outlook.com", "user@fertilab.org.evil.com", "user@notfertilab.org", "fertilab.org@evil.com"]) {
    assert.equal(isFertilabUser({ ...user, email }), false);
  }
  assert.equal(isFertilabUser({ ...user, is_anonymous: true }), false);
  assert.equal(isFertilabUser(null), false);
});

test("user-editable metadata cannot grant access", () => {
  assert.equal(isFertilabUser({ ...user, app_metadata: { provider: "email" }, user_metadata: { provider: "azure" } }), false);
});

test("email API rejects missing and malformed credentials", async () => {
  assert.equal(await requireFertilabSession({ headers: {} }), false);
  assert.equal(await requireFertilabSession({ headers: { authorization: "Basic credentials" } }), false);
});

test("email API verifies the token with Supabase and rejects invalid/external users", async (t) => {
  const oldKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_ANON_KEY = "test-key";
  t.after(() => { if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey; });
  const request = { headers: { authorization: "Bearer test-token" } };
  let responseUser = user;
  let ok = true;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).pathname, "/auth/v1/user");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return { ok, json: async () => responseUser };
  });
  assert.equal(await requireFertilabSession(request), true);
  responseUser = { ...user, email: "external@outlook.com" };
  assert.equal(await requireFertilabSession(request), false);
  ok = false;
  assert.equal(await requireFertilabSession(request), false);
});
