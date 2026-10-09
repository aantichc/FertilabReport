import { isFertilabUser } from "../src/identity.js";

export async function requireFertilabSession(request) {
  const authorization = request.headers?.authorization;
  if (!/^Bearer \S+$/i.test(authorization || "")) return false;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bvqtznwagqrlwydslaxv.supabase.co";
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!apiKey) throw new Error("SUPABASE_ANON_KEY is not configured");
  const result = await fetch(`${url}/auth/v1/user`, { headers: { apikey: apiKey, Authorization: authorization } });
  if (!result.ok) return false;
  return isFertilabUser(await result.json());
}
