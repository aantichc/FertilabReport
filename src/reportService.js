import { HistoryEntryType, ReportStatus } from "./models.js";
import { notifyReportCreated } from "./notificationService.js";
import { recipientService } from "./recipientService.js";
import { supabaseClient } from "./supabaseClient.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeReports(reports) {
  return reports.map((report) => ({
    id: report.id,
    title: report.title,
    content: report.content,
    currentStatus: report.current_status,
    publishedAt: report.published_at,
    updatedAt: report.updated_at,
    history: Array.isArray(report.report_history)
      ? report.report_history.map((entry) => ({
          id: entry.id,
          type: entry.type,
          content: entry.content ?? "",
          previousStatus: entry.previous_status,
          newStatus: entry.new_status,
          createdAt: entry.created_at,
          user: entry.user_name,
        }))
      : [],
  }));
}

export const reportService = {
  async getReports() {
    return normalizeReports(await supabaseClient.listReports());
  },

  async createReport({ title, content, status, user }) {
    const timestamp = nowIso();
    const report = await supabaseClient.createReport({
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      current_status: status,
      published_at: timestamp,
      updated_at: timestamp,
    });

    await supabaseClient.createHistoryEntry({
      id: crypto.randomUUID(),
      report_id: report.id,
      type: HistoryEntryType.CREATED,
      content: content.trim(),
      previous_status: null,
      new_status: status,
      created_at: timestamp,
      user_name: user?.trim() || null,
    });

    const normalizedReport = (await this.getReports()).find((item) => item.id === report.id);
    await notifyReportCreated(normalizedReport, await recipientService.getRecipients());
    return normalizedReport;
  },

  async addUpdate(reportId, content, user) {
    const timestamp = nowIso();
    const report = (await this.getReports()).find((item) => item.id === reportId);
    if (!report) return;

    await supabaseClient.createHistoryEntry({
      id: crypto.randomUUID(),
      report_id: reportId,
      type: HistoryEntryType.UPDATE,
      content: content.trim(),
      previous_status: null,
      new_status: report.currentStatus,
      created_at: timestamp,
      user_name: user?.trim() || null,
    });
    await supabaseClient.updateReport(reportId, { updated_at: timestamp });
  },

  async changeStatus(reportId, newStatus, comment, user) {
    const timestamp = nowIso();
    const report = (await this.getReports()).find((item) => item.id === reportId);
    if (!report || report.currentStatus === newStatus) return;

    await supabaseClient.createHistoryEntry({
      id: crypto.randomUUID(),
      report_id: reportId,
      type: HistoryEntryType.STATUS_CHANGE,
      content: comment.trim(),
      previous_status: report.currentStatus,
      new_status: newStatus,
      created_at: timestamp,
      user_name: user?.trim() || null,
    });
    await supabaseClient.updateReport(reportId, { current_status: newStatus, updated_at: timestamp });
  },

  async deleteReport(reportId) {
    await supabaseClient.deleteReport(reportId);
  },

  async seedIfEmpty() {
    if ((await this.getReports()).length > 0) return;
    const timestamp = new Date();
    timestamp.setMinutes(timestamp.getMinutes() - 95);
    const publishedAt = timestamp.toISOString();
    const updatedAt = new Date().toISOString();

    const report = await supabaseClient.createReport({
      id: crypto.randomUUID(),
      title: "Problema con el servidor principal",
      content: "El servidor principal ha dejado de responder y se está investigando la causa.",
      current_status: ReportStatus.RED,
      published_at: publishedAt,
      updated_at: updatedAt,
    });

    await supabaseClient.createHistoryEntry({
      id: crypto.randomUUID(),
      report_id: report.id,
      type: HistoryEntryType.CREATED,
      content: "Problema detectado. El servidor principal no responde.",
      previous_status: null,
      new_status: ReportStatus.RED,
      created_at: publishedAt,
      user_name: "Sistema",
    });
  },
};
