import { createClient } from '@supabase/supabase-js';
import { verifyTeamsToken, exchangeTeamsIdentity } from '../lib/teamsSso.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const bearer = /^Bearer (\S{1,16384})$/i.exec(req.headers.authorization || '');
  if (!bearer) return res.status(401).json({ error: 'Invalid Teams token' });
  let identity;
  try { identity = await verifyTeamsToken(bearer[1]); }
  catch { return res.status(401).json({ error: 'Invalid Teams token' }); }
  try {
    const url = process.env.SUPABASE_URL || 'https://bvqtznwagqrlwydslaxv.supabase.co';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!serviceKey || !anonKey) throw new Error('SSO configuration missing');
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const session = await exchangeTeamsIdentity(createClient(url, serviceKey, options), createClient(url, anonKey, options), identity);
    if (!session) return res.status(409).json({ error: 'Microsoft sign-in required for first use' });
    return res.status(200).json(session);
  } catch {
    // Never log access tokens, links, refresh tokens or directory records.
    return res.status(503).json({ error: 'Teams SSO unavailable; use Microsoft sign-in' });
  }
}
