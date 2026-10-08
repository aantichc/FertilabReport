const REPORTS_KEY = "fertilab.reports.v1";
const RECIPIENTS_KEY = "fertilab.notificationRecipients.v1";
const EMAIL_LOG_KEY = "fertilab.emailLog.v1";

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getReports() {
    return readJson(REPORTS_KEY, []);
  },

  saveReports(reports) {
    writeJson(REPORTS_KEY, reports);
  },

  getRecipients() {
    return readJson(RECIPIENTS_KEY, []);
  },

  saveRecipients(recipients) {
    writeJson(RECIPIENTS_KEY, recipients);
  },

  getEmailLog() {
    return readJson(EMAIL_LOG_KEY, []);
  },

  appendEmailLog(entry) {
    const log = readJson(EMAIL_LOG_KEY, []);
    writeJson(EMAIL_LOG_KEY, [entry, ...log]);
  },
};
