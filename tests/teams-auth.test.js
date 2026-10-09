import test from 'node:test';
import assert from 'node:assert/strict';
import { signInTeams, validateTeamsAuthorizeUrl } from '../src/teamsAuthFlow.js';

const origin = 'https://fertilabreport-six.vercel.app';
const supabaseUrl = 'https://bvqtznwagqrlwydslaxv.supabase.co';
const requestId = '043202e8-e14c-4adc-b42c-65d7e292554c';
function authorizeUrl() {
  const url = new URL('/auth/v1/authorize', supabaseUrl);
  url.search = new URLSearchParams({ provider: 'azure', redirect_to: `${origin}/teams-auth.html`, code_challenge: 'challenge', code_challenge_method: 's256' });
  return url.href;
}

test('Teams exchanges the popup code in the original tab and uses a local popup entry', async () => {
  let exchanged;
  await signInTeams({ origin, requestId, auth: {
    async signInWithOAuth(options) {
      assert.equal(options.options.skipBrowserRedirect, true);
      assert.equal(options.options.redirectTo, `${origin}/teams-auth.html`);
      assert.equal(options.options.scopes, 'openid profile email');
      return { data: { url: authorizeUrl() } };
    },
    async exchangeCodeForSession(code) { exchanged = code; return {}; },
  }, authentication: {
    async authenticate(options) {
      const url = new URL(options.url);
      assert.equal(url.origin, origin);
      assert.equal(url.pathname, '/teams-auth.html');
      assert.equal(url.searchParams.get('authorize'), authorizeUrl());
      assert.equal(url.searchParams.get('requestId'), requestId);
      return JSON.stringify({ code: 'one-use-code', requestId });
    },
  } });
  assert.equal(exchanged, 'one-use-code');
});

test('Teams rejects mismatched popup results and propagates cancellation without exchanging a code', async () => {
  for (const result of [{ code: 'code', requestId: 'other' }, { requestId }]) {
    await assert.rejects(signInTeams({ origin, requestId,
      auth: { async signInWithOAuth() { return { data: { url: authorizeUrl() } }; }, async exchangeCodeForSession() { assert.fail('Must not exchange uncorrelated results'); } },
      authentication: { async authenticate() { return JSON.stringify(result); } },
    }), /validar/);
  }
  await assert.rejects(signInTeams({ origin, requestId,
    auth: { async signInWithOAuth() { return { data: { url: authorizeUrl() } }; } },
    authentication: { async authenticate() { throw new Error('CancelledByUser'); } },
  }), /CancelledByUser/);
});

test('popup cannot redirect to another origin, provider, callback, or non-PKCE flow', () => {
  assert.equal(validateTeamsAuthorizeUrl(authorizeUrl(), supabaseUrl, `${origin}/teams-auth.html`), authorizeUrl());
  for (const change of [
    u => { u.hostname = 'evil.example'; },
    u => { u.pathname = '/other'; },
    u => u.searchParams.set('provider', 'email'),
    u => u.searchParams.set('redirect_to', 'https://evil.example'),
    u => u.searchParams.delete('code_challenge'),
    u => u.searchParams.set('code_challenge_method', 'plain'),
  ]) {
    const url = new URL(authorizeUrl()); change(url);
    assert.throws(() => validateTeamsAuthorizeUrl(url.href, supabaseUrl, `${origin}/teams-auth.html`));
  }
});
