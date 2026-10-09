export async function signInTeams({ auth, authentication, origin, requestId }) {
  // Generate the PKCE verifier in the tab, where the session will be stored.
  const callbackUrl = new URL('/teams-auth.html', origin);
  const { data, error } = await auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'openid profile email',
      redirectTo: callbackUrl.href,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Microsoft no ha devuelto la dirección de acceso.');
  const popupUrl = new URL(callbackUrl);
  popupUrl.searchParams.set('authorize', data.url);
  popupUrl.searchParams.set('requestId', requestId);
  const result = JSON.parse(await authentication.authenticate({
    url: popupUrl.href, width: 600, height: 650,
  }));
  if (result?.requestId !== requestId || typeof result.code !== 'string' || !result.code) {
    throw new Error('No se ha podido validar el resultado del inicio de sesión.');
  }
  // Only the one-use code crosses the Teams channel; tokens stay in the tab.
  const { error: exchangeError } = await auth.exchangeCodeForSession(result.code);
  if (exchangeError) throw exchangeError;
}

export function validateTeamsAuthorizeUrl(value, supabaseUrl, callbackUrl) {
  const url = new URL(value);
  if (url.origin !== new URL(supabaseUrl).origin || url.pathname !== '/auth/v1/authorize'
    || url.searchParams.get('provider') !== 'azure'
    || url.searchParams.get('redirect_to') !== callbackUrl
    || !url.searchParams.get('code_challenge')
    || url.searchParams.get('code_challenge_method')?.toLowerCase() !== 's256') {
    throw new Error('La dirección de autenticación no es válida.');
  }
  return url.href;
}
