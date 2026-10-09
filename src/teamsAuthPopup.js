import { app, authentication } from '@microsoft/teams-js';
import { validateTeamsAuthorizeUrl } from './teamsAuthFlow.js';

// This page never creates a Supabase client: the PKCE exchange belongs to the tab.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bvqtznwagqrlwydslaxv.supabase.co';
const status = document.querySelector('#auth-status');
const storageKey = 'fertilab.teamsAuthRequest';

async function completeAuth() {
  await app.initialize();
  const params = new URLSearchParams(window.location.search);
  if (params.has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error')) {
    throw new Error('Microsoft no ha completado el acceso. Cierra esta ventana e inténtalo de nuevo.');
  }
  if (params.has('authorize')) {
    const requestId = params.get('requestId');
    if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Solicitud no válida.');
    const url = validateTeamsAuthorizeUrl(params.get('authorize'), supabaseUrl, `${window.location.origin}/teams-auth.html`);
    sessionStorage.setItem(storageKey, requestId);
    window.location.replace(url);
    return;
  }
  const code = params.get('code');
  const requestId = sessionStorage.getItem(storageKey);
  if (!code || !requestId) throw new Error('No se ha recibido el resultado de Microsoft.');
  sessionStorage.removeItem(storageKey);
  window.history.replaceState(null, '', window.location.pathname);
  status.textContent = 'Acceso completado. Volviendo a Teams…';
  authentication.notifySuccess(JSON.stringify({ code, requestId }));
}

completeAuth().catch((error) => {
  sessionStorage.removeItem(storageKey);
  status.textContent = error.message || 'No se ha podido completar el acceso.';
  try { authentication.notifyFailure(status.textContent); } catch { /* Keep the message visible if Teams is unavailable. */ }
});
