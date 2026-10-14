import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL ?? "https://bvqtznwagqrlwydslaxv.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cXR6bndhZ3FybHd5ZHNsYXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTIzMTYsImV4cCI6MjEwNjk4ODMxNn0.sgAdwLF1cdDTAhp72WJ2hM35Ig1PptZTrgHOz7322ME";

export const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

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
  const { data: { session }, error } = await authClient.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Debes iniciar sesión con Microsoft.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: headers({ ...options.headers, Authorization: `Bearer ${session.access_token}` }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function notificationRequest(resource, options = {}) {
  const { data: { session }, error } = await authClient.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("Debes iniciar sesión con Microsoft.");
  const response = await fetch(`/api/notification-data?resource=${resource}`, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.error || "No se han podido procesar las notificaciones."}${result.code ? ` (${result.code})` : ""}`);
  return result;
}

function encode(value) {
  return encodeURIComponent(value);
}

function isMissingTableError(error, tableName) {
  return String(error?.message ?? "").includes(`'public.${tableName}'`);
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
    return notificationRequest("recipients");
  },
  async createRecipient(email) {
    return notificationRequest("recipients", { method: "POST", body: JSON.stringify({ email }) });
  },
  async updateRecipient(id, email) {
    return notificationRequest("recipients", { method: "PATCH", body: JSON.stringify({ id, email }) });
  },
  async deleteRecipient(id) {
    return notificationRequest("recipients", { method: "DELETE", body: JSON.stringify({ id }) });
  },
  async appendEmailLog(entry) {
    return notificationRequest("logs", { method: "POST", body: JSON.stringify(entry) });
  },
  async listEmailLog() {
    return notificationRequest("logs");
  },

  async listCalendarNotes() {
    return request("calendar_notes?select=*&order=note_date.asc,created_at.asc");
  },

  async listPreventiveTasks() {
    try {
      return await request("preventive_tasks?select=*&order=start_date.asc,created_at.asc");
    } catch (error) {
      if (isMissingTableError(error, "preventive_tasks")) return [];
      throw error;
    }
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

  async updatePreventiveTask(id, patch) {
    const rows = await request(`preventive_tasks?id=eq.${encode(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return rows[0];
  },

  async deletePreventiveTask(id) {
    return request(`preventive_tasks?id=eq.${encode(id)}`, {
      method: "DELETE",
    });
  },
};
