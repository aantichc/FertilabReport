import { authClient } from "./supabaseClient.js";
import { isFertilabUser } from "./identity.js";
import { authentication, teamsHostReady } from "./teamsHost.js";
import { signInTeams } from "./teamsAuthFlow.js";
export { isFertilabUser, accountName } from "./identity.js";

export const authService = {
  async getSession() {
    await teamsHostReady;
    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    if (!data.session) return null;
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError) throw userError;
    if (!isFertilabUser(user)) {
      await authClient.auth.signOut({ scope: "local" });
      throw new Error("Solo pueden acceder cuentas Microsoft de Fertilab (@fertilab.org).");
    }
    return { ...data.session, user };
  },
  async signIn() {
    if (await teamsHostReady) {
      await signInTeams({ auth: authClient.auth, authentication, origin: window.location.origin, requestId: crypto.randomUUID() });
      return;
    }
    if (window.parent !== window) {
      throw new Error("No se ha podido conectar con Teams. Cierra y vuelve a abrir Fertilab Reports.");
    }
    const { error } = await authClient.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid profile email",
        redirectTo: `${window.location.origin}${window.location.pathname}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  },
  async signOut() {
    const { error } = await authClient.auth.signOut({ scope: "local" });
    if (error) throw error;
  },
  onChange(callback) {
    return authClient.auth.onAuthStateChange((_event, session) => {
      // Avoid calling Auth methods while Supabase is dispatching its event.
      window.setTimeout(() => callback(session), 0);
    });
  },
};
