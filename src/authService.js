import { authClient } from "./supabaseClient.js";
import { isFertilabUser } from "./identity.js";
export { isFertilabUser, accountName } from "./identity.js";

export const authService = {
  async getSession() {
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
