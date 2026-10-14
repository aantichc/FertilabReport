import { createClient } from "@supabase/supabase-js";
import { decryptEmail, encryptEmail, emailContext, emailFingerprint, normalizeEmail, decodeEmails } from "./emailEncryption.js";

export function notificationAdmin() {
  const url = process.env.SUPABASE_URL || "https://bvqtznwagqrlwydslaxv.supabase.co";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Notification storage is not configured");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function listRecipients(admin = notificationAdmin()) {
  const rows = checked(await admin.from("notification_recipients").select("id,email"));
  return rows.map(row => ({ id: row.id, email: decryptEmail(row.email, emailContext("notification_recipients", row.id)) }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function recipientRecord(email, id) {
  email = normalizeEmail(email);
  return { id, email: encryptEmail(email, emailContext("notification_recipients", id)), email_fingerprint: emailFingerprint(email) };
}

export async function listEmailLog(admin = notificationAdmin()) {
  return checked(await admin.from("email_log").select("*").order("created_at", { ascending: false }).limit(5))
    .map(row => ({ ...row, recipients: decodeEmails(row.recipients, "email_log", row.id) }));
}
