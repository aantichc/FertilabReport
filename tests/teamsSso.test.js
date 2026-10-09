import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyTeamsToken, findAzureUser, exchangeTeamsIdentity, TENANT_ID, CLIENT_ID, ISSUER, TEAMS_CLIENTS } from '../lib/teamsSso.js';
import { signInTeamsSilently } from '../src/teamsSsoFlow.js';
import handler from '../api/teams-sso.js';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const oid = '05a2f170-b12f-4299-9363-9b2e06aaae82';
const identity = { oid, tid: TENANT_ID };
const user = {
  id: 'trusted-user', email: 'member@fertilab.org', app_metadata: { provider: 'azure' },
  identities: [{ provider: 'azure', identity_data: { email_verified: true, custom_claims: identity } }],
};
async function token(overrides = {}, signingKey = privateKey) {
  return new SignJWT({ ver: '2.0', oid, tid: TENANT_ID, scp: 'access_as_user', azp: TEAMS_CLIENTS[0], ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(ISSUER).setAudience(CLIENT_ID)
    .setIssuedAt().setExpirationTime('5m').sign(signingKey);
}
test('Only a signed Teams delegated token for this tenant and application is accepted', async () => {
  assert.deepEqual(await verifyTeamsToken(await token(), publicKey), identity);
  for (const claims of [{ tid: 'other' }, { scp: 'User.Read' }, { azp: 'untrusted-client' }, { oid: 'invalid' }, { ver: '1.0' }]) {
    await assert.rejects(verifyTeamsToken(await token(claims), publicKey));
  }
  const wrongAudience = await new SignJWT({ ...identity, ver: '2.0', scp: 'access_as_user', azp: TEAMS_CLIENTS[0] })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(ISSUER).setAudience('graph')
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  await assert.rejects(verifyTeamsToken(wrongAudience, publicKey));
  const expired = await new SignJWT({ ...identity, ver: '2.0', scp: 'access_as_user', azp: TEAMS_CLIENTS[0] })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(ISSUER).setAudience(CLIENT_ID)
    .setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey);
  await assert.rejects(verifyTeamsToken(expired, publicKey));
  const otherKeys = await generateKeyPair('RS256');
  await assert.rejects(verifyTeamsToken(await token({}, otherKeys.privateKey), publicKey));
});
test('Editable metadata and matching emails cannot establish a Teams identity', async () => {
  const forged = { ...user, identities: [], user_metadata: { custom_claims: identity } };
  assert.equal(await findAzureUser({ listUsers: async () => ({ data: { users: [forged] } }) }, identity), null);
  assert.equal(await findAzureUser({ listUsers: async () => ({ data: { users: [user] } }) }, identity), user);
  assert.equal(await findAzureUser({ listUsers: async () => ({ data: { users: [{ ...user, email: 'other@example.com' }] } }) }, identity), null);
});
test('Session exchange preserves the existing user and returns only session tokens', async () => {
  let minted = 0;
  const adminClient = { auth: { admin: {
    listUsers: async () => ({ data: { users: [user] } }),
    generateLink: async args => {
      assert.deepEqual(args, { type: 'magiclink', email: user.email }); minted++;
      return { data: { user, properties: { hashed_token: 'server-only-hash' } } };
    },
  } } };
  const authClient = { auth: { verifyOtp: async args => {
    assert.deepEqual(args, { type: 'magiclink', token_hash: 'server-only-hash' });
    return { data: { user, session: { access_token: 'access', refresh_token: 'refresh' } } };
  } } };
  assert.deepEqual(await exchangeTeamsIdentity(adminClient, authClient, identity), { access_token: 'access', refresh_token: 'refresh' });
  assert.equal(await exchangeTeamsIdentity(adminClient, authClient, { ...identity, oid: 'different' }), null);
  assert.equal(minted, 1);
  adminClient.auth.admin.generateLink = async () => ({ data: { user: { ...user, id: 'other' }, properties: { hashed_token: 'hash' } } });
  await assert.rejects(exchangeTeamsIdentity(adminClient, authClient, identity));
});
test('Silent login falls back for consent, first use, and timeout without installing a session', async () => {
  let installs = 0;
  const auth = { setSession: async () => { installs++; return { data: { session: {} } }; } };
  assert.equal(await signInTeamsSilently({ authentication: { getAuthToken: async () => { throw new Error('consent'); } }, auth }), null);
  assert.equal(await signInTeamsSilently({ authentication: { getAuthToken: async () => 'token' }, auth, fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await signInTeamsSilently({ authentication: { getAuthToken: () => new Promise(() => {}) }, auth, timeoutMs: 5 }), null);
  assert.equal(installs, 0);
});
test('Endpoint rejects missing or malformed tokens and never caches its response', async () => {
  for (const authorization of ['', 'Bearer malformed']) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: 'POST', headers: { authorization } }, res);
    assert.equal(res.code, 401);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body, { error: 'Invalid Teams token' });
  }
});
