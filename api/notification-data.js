import { randomUUID } from "node:crypto";
import { requireFertilabSession } from "../lib/serverAuth.js";
import { notificationAdmin, checked, listRecipients, recipientRecord, listEmailLog } from "../lib/notificationData.js";
import { encodeEmails, normalizeEmail } from "../lib/emailEncryption.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  const resource = request.query?.resource;
  const method = request.method;
  try {
    if (!await requireFertilabSession(request)) return response.status(401).json({ error: "Inicia sesión con Microsoft de Fertilab." });
    if (!["recipients", "logs"].includes(resource)) return response.status(400).json({ error: "Recurso no válido." });
    if (!(resource === "recipients" ? ["GET", "POST", "PATCH", "DELETE"] : ["GET", "POST"]).includes(method)) {
      response.setHeader("Allow", resource === "recipients" ? "GET, POST, PATCH, DELETE" : "GET, POST");
      return response.status(405).json({ error: "Method not allowed" });
    }
    if (method === "GET") return response.status(200).json(resource === "recipients" ? await listRecipients() : await listEmailLog());
    const body = request.body ?? {};
    const id = method === "POST" ? (body.id ?? randomUUID()) : body.id;
    if (!uuid.test(id ?? "")) return response.status(400).json({ error: "Identificador no válido." });
    if (resource === "recipients") {
      let record;
      if (method !== "DELETE") {
        try { record = recipientRecord(normalizeEmail(body.email), id); }
        catch (error) { if (error.message === "Invalid email address") return response.status(400).json({ error: "Correo no válido." }); throw error; }
      }
      const admin = notificationAdmin();
      if (method === "POST") checked(await admin.from("notification_recipients").insert(record));
      else if (method === "PATCH") checked(await admin.from("notification_recipients").update(record).eq("id", id));
      else checked(await admin.from("notification_recipients").delete().eq("id", id));
    } else {
      if (!uuid.test(body.report_id ?? "") || !Array.isArray(body.recipients) || body.recipients.length > 200 || typeof body.subject !== "string" || body.subject.length > 1000) return response.status(400).json({ error: "Notificación no válida." });
      let recipients;
      try { recipients = encodeEmails(body.recipients, "email_log", id); }
      catch (error) { if (error.message === "Invalid email address") return response.status(400).json({ error: "Correo no válido." }); throw error; }
      // Store the known report fields only; arbitrary client payloads cannot stash plaintext recipients.
      const fields = ["title", "category", "urgency", "status", "content", "publishedAt", "link"];
      const payload = Object.fromEntries(fields.filter(field => typeof body.payload?.[field] === "string").map(field => [field, body.payload[field]]));
      checked(await notificationAdmin().from("email_log").insert({ id, report_id: body.report_id, recipients, subject: body.subject, payload, created_at: new Date().toISOString() }));
    }
    return response.status(200).json({ ok: true });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Ese correo ya está configurado." });
    const code = error.message === "Email encryption key is not configured" || error.message === "Invalid email encryption key"
      ? "EMAIL_KEY_UNAVAILABLE"
      : error.message === "Notification storage is not configured" ? "NOTIFICATION_STORAGE_UNAVAILABLE"
      : error.message === "SUPABASE_ANON_KEY is not configured" ? "AUTH_CONFIGURATION_UNAVAILABLE"
      : error.code === "42501" ? "NOTIFICATION_STORAGE_PERMISSION"
      : error.code === "PGRST003" ? "NOTIFICATION_STORAGE_TIMEOUT"
      : error.message === "Invalid encrypted email" || error.message?.includes("authenticate data") ? "EMAIL_DECRYPTION_FAILED"
      : "NOTIFICATION_SERVICE_UNAVAILABLE";
    // Stable diagnostic codes only: never log addresses, request bodies, keys or session tokens.
    console.error("Notification API failure", { resource, code });
    return response.status(503).json({ error: "No se han podido procesar los correos de notificación.", code });
  }
}
