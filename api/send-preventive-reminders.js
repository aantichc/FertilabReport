import nodemailer from "nodemailer";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bvqtznwagqrlwydslaxv.supabase.co";
const SUPABASE_SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CATEGORY_LABELS = {
  IT: "IT",
  INSTALLATIONS: "Instalaciones",
  PURCHASES: "Compras",
};

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVER_KEY,
    Authorization: `Bearer ${SUPABASE_SERVER_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayMadrid() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T12:00:00`);
}

function addInterval(date, count, unit) {
  const next = new Date(date);
  if (unit === "days") next.setDate(next.getDate() + count);
  if (unit === "weeks") next.setDate(next.getDate() + count * 7);
  if (unit === "months") next.setMonth(next.getMonth() + count);
  return next;
}

function subtractLead(date, count, unit) {
  const next = new Date(date);
  next.setDate(next.getDate() - count * (unit === "weeks" ? 7 : 1));
  return next;
}

function occurrencesDue(task, today) {
  const due = [];
  let occurrence = new Date(`${task.start_date}T12:00:00`);
  const horizon = addInterval(today, Math.max(task.notify_lead_count ?? 0, 0) + 1, task.notify_lead_unit ?? "days");
  const maxIterations = task.repeat_enabled ? 800 : 1;

  for (let index = 0; index < maxIterations && occurrence <= horizon; index += 1) {
    const notifyDate = subtractLead(occurrence, task.notify_lead_count ?? 0, task.notify_lead_unit ?? "days");
    if (notifyDate <= today && occurrence >= today) due.push(dateKey(occurrence));
    if (!task.repeat_enabled) break;
    const next = addInterval(occurrence, task.repeat_every_count ?? 1, task.repeat_every_unit ?? "weeks");
    if (next <= occurrence) break;
    occurrence = next;
  }

  return due;
}

function buildEmailHtml(task, occurrenceDate) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5;">
      <h1 style="margin: 0 0 16px;">Recordatorio de preventivo</h1>
      <p><strong>Preventivo:</strong> ${escapeHtml(task.title)}</p>
      <p><strong>Clase:</strong> ${escapeHtml(CATEGORY_LABELS[task.category] || task.category || "IT")}</p>
      <p><strong>Fecha prevista:</strong> ${escapeHtml(occurrenceDate)}</p>
      ${
        task.content
          ? `<div style="margin: 18px 0; padding: 14px; border-left: 4px solid #2563eb; background: #eff6ff;">${escapeHtml(task.content).replaceAll("\n", "<br>")}</div>`
          : ""
      }
      <p>
        <a href="https://fertilabreport-six.vercel.app" style="color: #116466; font-weight: 700;">
          Abrir calendario de Fertilab Reports
        </a>
      </p>
    </div>
  `;
}

async function hasNotification(taskId, occurrenceDate) {
  const rows = await supabaseRequest(
    `preventive_notification_log?select=id&task_id=eq.${encodeURIComponent(taskId)}&occurrence_date=eq.${encodeURIComponent(occurrenceDate)}&limit=1`,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function recordNotification(taskId, occurrenceDate, recipients) {
  await supabaseRequest("preventive_notification_log", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      task_id: taskId,
      occurrence_date: occurrenceDate,
      recipients,
      created_at: new Date().toISOString(),
    }),
  });
}

export default async function handler(request, response) {
  if (!process.env.CRON_SECRET || request.headers?.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!SUPABASE_SERVER_KEY) {
    response.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" });
    return;
  }
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!gmailUser || !gmailAppPassword) {
    response.status(500).json({ error: "Gmail SMTP is not configured" });
    return;
  }

  try {
    const recipients = await supabaseRequest("notification_recipients?select=email&order=email.asc");
    const recipientEmails = recipients.map((recipient) => recipient.email).filter(Boolean);
    if (!recipientEmails.length) {
      response.status(200).json({ ok: true, sent: 0, reason: "No recipients configured" });
      return;
    }

    const tasks = await supabaseRequest("preventive_tasks?select=*&notify_enabled=eq.true&order=start_date.asc");
    const today = todayMadrid();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
    const from = process.env.EMAIL_FROM?.trim() || `Fertilab Alertas <${gmailUser}>`;
    let sent = 0;

    for (const task of tasks) {
      for (const occurrenceDate of occurrencesDue(task, today)) {
        if (await hasNotification(task.id, occurrenceDate)) continue;
        await transporter.sendMail({
          from,
          to: recipientEmails,
          subject: `Preventivo: ${task.title}`,
          html: buildEmailHtml(task, occurrenceDate),
        });
        await recordNotification(task.id, occurrenceDate, recipientEmails);
        sent += 1;
      }
    }

    response.status(200).json({ ok: true, sent });
  } catch (error) {
    response.status(500).json({ error: error.message || "Unexpected preventive reminder error" });
  }
}
