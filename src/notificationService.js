import { storage } from "./storage.js";
import { supabaseClient } from "./supabaseClient.js";
import { CategoryMeta, ReportCategory, StatusMeta } from "./models.js";

export async function notifyReportCreated(report, recipients) {
  if (!recipients.length) {
    return { sent: false, reason: "No hay destinatarios configurados." };
  }

  const notification = {
    id: crypto.randomUUID(),
    reportId: report.id,
    recipients: recipients.map((recipient) => recipient.email),
    subject: `Nuevo parte: ${report.title}`,
    createdAt: new Date().toISOString(),
    payload: {
      title: report.title,
      category: CategoryMeta[report.category ?? ReportCategory.IT].label,
      urgency: report.isUrgent ? "Urgente" : "Normal",
      status: StatusMeta[report.currentStatus].label,
      content: report.content,
      publishedAt: report.publishedAt,
      link: `${window.location.origin}${window.location.pathname}#parte-${report.id}`,
    },
  };

  storage.appendEmailLog(notification);
  await supabaseClient.appendEmailLog({
    id: notification.id,
    report_id: report.id,
    recipients: notification.recipients,
    subject: notification.subject,
    payload: notification.payload,
    created_at: notification.createdAt,
  });

  try {
    await fetch("/api/send-report-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: notification.recipients,
        report: notification.payload,
      }),
    });
  } catch (error) {
    console.error("Email delivery failed", error);
  }

  return { sent: true, notification };
}
