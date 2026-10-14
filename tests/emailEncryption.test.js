import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptEmail, decryptEmail, emailFingerprint, encodeEmails, decodeEmails } from "../lib/emailEncryption.js";
import handler from "../api/notification-data.js";

process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("base64");

test("emails are randomized, authenticated, and bound to a particular row", () => {
  const a = encryptEmail(" Person@Example.org ", "recipients:one");
  const b = encryptEmail("person@example.org", "recipients:one");
  assert.notEqual(a, b);
  assert.equal(a.includes("@"), false);
  assert.equal(decryptEmail(a, "recipients:one"), "person@example.org");
  assert.throws(() => decryptEmail(a, "recipients:two"));
  const tampered = Buffer.from(a.slice(7), "base64url"); tampered[28] ^= 1;
  assert.throws(() => decryptEmail(`enc:v1:${tampered.toString("base64url")}`, "recipients:one"));
  assert.throws(() => decryptEmail("person@example.org", "recipients:one"));
  const originalKey = process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY;
  process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptEmail(a, "recipients:one"));
  delete process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY;
  assert.throws(() => encryptEmail("person@example.org", "recipients:one"));
  process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY = originalKey;
});

test("fingerprints prevent duplicates without storing a plaintext email or unsalted hash", () => {
  assert.equal(emailFingerprint(" Person@Example.org "), emailFingerprint("person@example.org"));
  assert.notEqual(emailFingerprint("other@example.org"), emailFingerprint("person@example.org"));
  assert.throws(() => encryptEmail("a@example.org\r\nBcc:b@example.org", "x"));
  const emails = ["one@example.org", "two@example.org"];
  const encrypted = encodeEmails(emails, "email_log", "row");
  assert.deepEqual(decodeEmails(encrypted, "email_log", "row"), emails);
  assert.throws(() => decodeEmails(encrypted, "preventive_notification_log", "row"));
});

function response() {
  return { code: 0, body: null, headers: {}, setHeader(key,value) { this.headers[key]=value; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } };
}

test("notification API rejects unauthenticated callers before storage access", async () => {
  const res = response();
  await handler({method:"GET",query:{resource:"recipients"},headers:{}},res);
  assert.equal(res.code,401);
  assert.equal(res.headers["Cache-Control"],"no-store");
});

test("authenticated recipient CRUD encrypts writes and decrypts reads", async t => {
  process.env.SUPABASE_ANON_KEY="test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-service";
  let stored;
  t.mock.method(globalThis,"fetch",async (url,options={}) => {
    const request = url instanceof Request ? url : new Request(url,options);
    if (request.url.includes("/auth/v1/user")) return new Response(JSON.stringify({email:"test@fertilab.org",app_metadata:{provider:"azure"}}));
    assert.equal(request.headers.get("apikey"),"test-service");
    if (request.method === "POST" || request.method === "PATCH") {
      stored=await request.json();
      assert.match(stored.email,/^enc:v1:/);
      assert.equal(JSON.stringify(stored).includes("person@example.org"),false);
      assert.match(stored.email_fingerprint,/^[a-f0-9]{64}$/);
      return new Response(null,{status:201});
    }
    return new Response(JSON.stringify([stored]));
  });
  const base={headers:{authorization:"Bearer verified-session"},query:{resource:"recipients"}};
  let res=response(); await handler({...base,method:"POST",body:{email:"person@example.org"}},res);
  assert.equal(res.code,200);
  res=response(); await handler({...base,method:"GET"},res);
  assert.equal(res.code,200); assert.equal(res.body[0].email,"person@example.org");
  res=response(); await handler({...base,method:"PATCH",body:{id:stored.id,email:"new@example.org"}},res);
  assert.equal(res.code,200);
  res=response(); await handler({...base,method:"GET"},res); assert.equal(res.body[0].email,"new@example.org");
});


test("migration encrypts existing recipients and both log tables without emitting plaintext", async () => {
  const { buildMigration } = await import("../scripts/build-email-migration.mjs");
  const id="11111111-1111-4111-8111-111111111111";
  const sql=buildMigration({recipients:[{id,email:"private@example.org"}],logs:[{id,recipients:["private@example.org"]}],preventiveLogs:[{id,recipients:["other@example.org"]}]});
  assert.equal(sql.includes("@example.org"),false);
  assert.equal(sql.includes(process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY),false);
  assert.match(sql,/REVOKE ALL/); assert.match(sql,/SET NOT NULL/);
  assert.match(sql,/preventive_notification_log_emails_encrypted/);
});


test("notification history API encrypts every recipient and decrypts only after authentication", async t => {
  let row;
  t.mock.method(globalThis,"fetch",async (url,options={}) => {
    const request=url instanceof Request ? url : new Request(url,options);
    if(request.url.includes("/auth/v1/user")) return new Response(JSON.stringify({email:"test@fertilab.org",app_metadata:{provider:"azure"}}));
    if(request.method === "POST") { row=await request.json(); return new Response(null,{status:201}); }
    return new Response(JSON.stringify([row]));
  });
  const base={headers:{authorization:"Bearer verified-session"},query:{resource:"logs"}};
  const id="11111111-1111-4111-8111-111111111111";
  let res=response();
  await handler({...base,method:"POST",body:{id,report_id:id,recipients:["person@example.org"],subject:"Notification",payload:{title:"Title",recipients:["person@example.org"]}}},res);
  assert.equal(res.code,200);
  assert.equal(JSON.stringify(row).includes("person@example.org"),false);
  res=response(); await handler({...base,method:"GET"},res);
  assert.equal(res.code,200); assert.deepEqual(res.body[0].recipients,["person@example.org"]);
});
