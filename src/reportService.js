import { HistoryEntryType, ReportCategory } from "./models.js";
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
    category: report.category ?? ReportCategory.IT,
    isUrgent: Boolean(report.is_urgent),
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

  async createReport({ title, content, status, category, isUrgent, user }) {
    const timestamp = nowIso();
    const report = await supabaseClient.createReport({
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      category,
      is_urgent: Boolean(isUrgent),
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

  async setUrgency(reportId, isUrgent) {
    await supabaseClient.updateReport(reportId, { is_urgent: Boolean(isUrgent), updated_at: nowIso() });
  },

  async deleteReport(reportId) {
    await supabaseClient.deleteReport(reportId);
  },
};
