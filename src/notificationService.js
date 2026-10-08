import { storage } from "./storage.js";
import { StatusMeta } from "./models.js";

export function notifyReportCreated(report, recipients) {
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
      status: StatusMeta[report.currentStatus].label,
      content: report.content,
      publishedAt: report.publishedAt,
      link: `${window.location.origin}${window.location.pathname}#parte-${report.id}`,
    },
  };

  storage.appendEmailLog(notification);
  return { sent: true, notification };
}
