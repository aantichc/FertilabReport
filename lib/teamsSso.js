import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isFertilabUser } from '../src/identity.js';

export const TENANT_ID = 'f1894d88-c4bd-408e-996c-07bb5a04e151';
export const CLIENT_ID = 'b93ab8b1-fc15-48d9-bd38-ab5e8404a516';
export const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
export const TEAMS_CLIENTS = ['1fec8e78-bce4-4aaf-ab1b-5451cc387264', '5e3ce6c0-2b1f-4285-8d4b-75ee78787346'];
const keys = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));

export async function verifyTeamsToken(token, keySet = keys) {
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ['RS256'], issuer: ISSUER, audience: CLIENT_ID,
    requiredClaims: ['exp', 'iat', 'oid', 'tid', 'scp', 'azp'], clockTolerance: 5,
  });
  if (payload.ver !== '2.0' || payload.tid !== TENANT_ID ||
      !TEAMS_CLIENTS.includes(payload.azp) ||
      typeof payload.scp !== 'string' || !payload.scp.split(' ').includes('access_as_user') ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(payload.oid)) {
    throw new Error('Invalid Teams identity');
  }
  return { oid: payload.oid.toLowerCase(), tid: payload.tid };
}

// Match the provider-owned identity, never editable user_metadata or an email
// supplied by the browser. Bounded pagination avoids an unbounded admin scan.
export async function findAzureUser(admin, { oid, tid }) {
  let match;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const user of data.users) {
      if (!isFertilabUser(user) || user.banned_until && Date.parse(user.banned_until) > Date.now()) continue;
      if (user.identities?.some(identity => {
        const claims = identity.identity_data?.custom_claims;
        return identity.provider === 'azure' && identity.identity_data?.email_verified === true &&
          claims?.oid?.toLowerCase() === oid && claims?.tid === tid;
      })) {
        if (match && match.id !== user.id) throw new Error('Ambiguous Azure identity');
        match = user;
      }
    }
    if (data.users.length < 200) return match || null;
  }
  throw new Error('Identity directory exceeds lookup limit');
}

export async function exchangeTeamsIdentity(adminClient, authClient, identity) {
  const user = await findAzureUser(adminClient.auth.admin, identity);
  if (!user) return null; // First use: establish the Azure identity via OAuth.
  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  if (linkError) throw linkError;
  if (link.user?.id !== user.id || !isFertilabUser(link.user) || !link.properties?.hashed_token) {
    throw new Error('Identity changed during session exchange');
  }
  const { data, error } = await authClient.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (error) throw error;
  if (data.user?.id !== user.id || !isFertilabUser(data.user) || !data.session) {
    throw new Error('Invalid exchanged session');
  }
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}
