export async function signInTeamsSilently({ authentication, auth, fetchImpl = fetch, timeoutMs = 10000 }) {
  const controller = new AbortController();
  let timer;
  try {
    const token = await Promise.race([
      authentication.getAuthToken({ silent: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Teams SSO timeout')); }, timeoutMs);
      }),
    ]);
    const response = await fetchImpl('/api/teams-sso', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal, cache: 'no-store',
    });
    if (!response.ok || controller.signal.aborted) return null;
    const session = await response.json();
    if (controller.signal.aborted || !session.access_token || !session.refresh_token) return null;
    const { data, error } = await auth.setSession(session);
    if (error) throw error;
    return data.session;
  } catch {
    return null; // Consent, unsupported host and first login use the popup button.
  } finally { clearTimeout(timer); }
}
