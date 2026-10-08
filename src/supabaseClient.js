const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL ?? "https://bvqtznwagqrlwydslaxv.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cXR6bndhZ3FybHd5ZHNsYXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTIzMTYsImV4cCI6MjEwNjk4ODMxNn0.sgAdwLF1cdDTAhp72WJ2hM35Ig1PptZTrgHOz7322ME";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function encode(value) {
  return encodeURIComponent(value);
}

export const supabaseClient = {
  async listReports() {
    return request("reports?select=*,report_history(*)&order=updated_at.desc&report_history.order=created_at.asc");
  },

  async createReport(report) {
    const rows = await request("reports", {
      method: "POST",
      body: JSON.stringify(report),
    });
    return rows[0];
  },

  async updateReport(id, patch) {
    const rows = await request(`reports?id=eq.${encode(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return rows[0];
  },

  async deleteReport(id) {
    return request(`reports?id=eq.${encode(id)}`, {
      method: "DELETE",
    });
  },

  async createHistoryEntry(entry) {
    const rows = await request("report_history", {
      method: "POST",
      body: JSON.stringify(entry),
    });
    return rows[0];
  },

  async listRecipients() {
    return request("notification_recipients?select=*&order=email.asc");
  },

  async createRecipient(email) {
    const rows = await request("notification_recipients", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return rows[0];
  },

  async updateRecipient(id, email) {
    const rows = await request(`notification_recipients?id=eq.${encode(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ email }),
    });
    return rows[0];
  },

  async deleteRecipient(id) {
    return request(`notification_recipients?id=eq.${encode(id)}`, {
      method: "DELETE",
    });
  },

  async appendEmailLog(entry) {
    const rows = await request("email_log", {
      method: "POST",
      body: JSON.stringify(entry),
    });
    return rows[0];
  },

  async listEmailLog() {
    return request("email_log?select=*&order=created_at.desc&limit=5");
  },

  async listCalendarNotes() {
    return request("calendar_notes?select=*&order=note_date.asc,created_at.asc");
  },

  async listPreventiveTasks() {
    return request("preventive_tasks?select=*&order=start_date.asc,created_at.asc");
  },

  async createCalendarNote(note) {
    const rows = await request("calendar_notes", {
      method: "POST",
      body: JSON.stringify(note),
    });
    return rows[0];
  },

  async deleteCalendarNote(id) {
    return request(`calendar_notes?id=eq.${encode(id)}`, {
      method: "DELETE",
    });
  },

  async createPreventiveTask(task) {
    const rows = await request("preventive_tasks", {
      method: "POST",
      body: JSON.stringify(task),
    });
    return rows[0];
  },

  async deletePreventiveTask(id) {
    return request(`preventive_tasks?id=eq.${encode(id)}`, {
      method: "DELETE",
    });
  },
};
