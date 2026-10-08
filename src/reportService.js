import { HistoryEntryType, ReportStatus } from "./models.js";
import { notifyReportCreated } from "./notificationService.js";
import { storage } from "./storage.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeReports(reports) {
  return reports.map((report) => ({
    ...report,
    history: Array.isArray(report.history) ? report.history : [],
  }));
}

export const reportService = {
  getReports() {
    return normalizeReports(storage.getReports());
  },

  createReport({ title, content, status }) {
    const timestamp = nowIso();
    const report = {
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      currentStatus: status,
      publishedAt: timestamp,
      updatedAt: timestamp,
      history: [
        {
          id: crypto.randomUUID(),
          type: HistoryEntryType.CREATED,
          content: content.trim(),
          previousStatus: null,
          newStatus: status,
          createdAt: timestamp,
          user: null,
        },
      ],
    };

    const reports = [report, ...this.getReports()];
    storage.saveReports(reports);
    notifyReportCreated(report, storage.getRecipients());
    return report;
  },

  addUpdate(reportId, content) {
    const timestamp = nowIso();
    const reports = this.getReports().map((report) => {
      if (report.id !== reportId) return report;

      return {
        ...report,
        updatedAt: timestamp,
        history: [
          ...report.history,
          {
            id: crypto.randomUUID(),
            type: HistoryEntryType.UPDATE,
            content: content.trim(),
            previousStatus: null,
            newStatus: report.currentStatus,
            createdAt: timestamp,
            user: null,
          },
        ],
      };
    });
    storage.saveReports(reports);
  },

  changeStatus(reportId, newStatus, comment) {
    const timestamp = nowIso();
    const reports = this.getReports().map((report) => {
      if (report.id !== reportId || report.currentStatus === newStatus) return report;

      return {
        ...report,
        currentStatus: newStatus,
        updatedAt: timestamp,
        history: [
          ...report.history,
          {
            id: crypto.randomUUID(),
            type: HistoryEntryType.STATUS_CHANGE,
            content: comment.trim(),
            previousStatus: report.currentStatus,
            newStatus,
            createdAt: timestamp,
            user: null,
          },
        ],
      };
    });
    storage.saveReports(reports);
  },

  deleteReport(reportId) {
    const reports = this.getReports().filter((report) => report.id !== reportId);
    storage.saveReports(reports);
  },

  seedIfEmpty() {
    if (this.getReports().length > 0) return;
    const timestamp = new Date();
    timestamp.setMinutes(timestamp.getMinutes() - 95);
    const publishedAt = timestamp.toISOString();
    const updatedAt = new Date().toISOString();

    storage.saveReports([
      {
        id: crypto.randomUUID(),
        title: "Problema con el servidor principal",
        content: "El servidor principal ha dejado de responder y se está investigando la causa.",
        currentStatus: ReportStatus.RED,
        publishedAt,
        updatedAt,
        history: [
          {
            id: crypto.randomUUID(),
            type: HistoryEntryType.CREATED,
            content: "Problema detectado. El servidor principal no responde.",
            previousStatus: null,
            newStatus: ReportStatus.RED,
            createdAt: publishedAt,
            user: null,
          },
        ],
      },
    ]);
  },
};
