import { CategoryMeta, HistoryEntryType, ReportCategory, StatusMeta, categories, statuses } from "./models.js";
import { recipientService } from "./recipientService.js";
import { reportService } from "./reportService.js";
import { authService, accountName, isFertilabUser } from "./authService.js";
import { supabaseClient } from "./supabaseClient.js";

const REFRESH_INTERVAL_MS = 30000;

const state = {
  section: "reports",
  filter: "ALL",
  categoryFilter: "ALL",
  sortBy: "updatedAt",
  listLimit: window.matchMedia("(max-width: 640px)").matches ? "3" : "ALL",
  selectedReportId: null,
  activeUser: "",
  session: null,
  authLoading: true,
  authBusy: false,
  reports: [],
  recipients: [],
  emailLog: [],
  calendarNotes: [],
  preventiveTasks: [],
  calendarMode: "month",
  calendarDate: new Date(),
  selectedCalendarNoteId: null,
  selectedPreventiveTaskId: null,
  confirmDialog: null,
  loading: false,
  refreshing: false,
  error: "",
};

const app = document.querySelector("#app");
let refreshTimer = null;
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
}

function formatDay(iso) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function dayKey(iso) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusDot(status) {
  const meta = StatusMeta[status];
  return `<span class="status-dot ${meta.tone}" aria-hidden="true"></span>`;
}

function statusLabel(status) {
  return `${statusDot(status)}<span>${StatusMeta[status].label}</span>`;
}

function categoryBadge(category) {
  const meta = CategoryMeta[category ?? ReportCategory.IT] ?? CategoryMeta[ReportCategory.IT];
  return `<span class="category-badge ${meta.tone}">${escapeHtml(meta.label)}</span>`;
}

function urgencyBadge(isUrgent) {
  return isUrgent ? `<span class="urgency-badge">Urgente</span>` : "";
}

function categoryOptions(selectedValue) {
  return `
    <option value="ALL" ${selectedValue === "ALL" ? "selected" : ""}>Todas</option>
    ${categories.map((category) => `<option value="${category}" ${selectedValue === category ? "selected" : ""}>${CategoryMeta[category].label}</option>`).join("")}
  `;
}

function matchesCategoryFilter(report) {
  return state.categoryFilter === "ALL" || (report.category ?? ReportCategory.IT) === state.categoryFilter;
}

function getSortedReports() {
  const reports = state.reports;
  const filtered = reports.filter((report) => {
    const matchesStatus = state.filter === "ALL" || report.currentStatus === state.filter;
    return matchesStatus && matchesCategoryFilter(report);
  });

  const sorted = filtered.sort((a, b) => {
    if (state.sortBy === "status") return StatusMeta[b.currentStatus].rank - StatusMeta[a.currentStatus].rank;
    return new Date(b[state.sortBy]).getTime() - new Date(a[state.sortBy]).getTime();
  });

  if (state.listLimit === "ALL") return sorted;
  return sorted.slice(0, Number(state.listLimit));
}

function getSelectedReport() {
  return state.reports.find((report) => report.id === state.selectedReportId) ?? state.reports[0] ?? null;
}

function hasActiveUser() {
  return Boolean(state.activeUser.trim());
}

function hasAccessGranted() {
  return Boolean(state.session && isFertilabUser(state.session.user));
}

function normalizeEmailLog(log) {
  return log.map((entry) => ({
    id: entry.id,
    reportId: entry.report_id,
    recipients: entry.recipients ?? [],
    subject: entry.subject,
    payload: entry.payload ?? {},
    createdAt: entry.created_at,
  }));
}

function normalizeCalendarNotes(notes) {
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content ?? "",
    noteDate: note.note_date,
    createdAt: note.created_at,
    createdBy: note.created_by,
  }));
}

function normalizePreventiveTasks(tasks) {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    content: task.content ?? "",
    category: task.category ?? ReportCategory.IT,
    startDate: task.start_date,
    repeatEnabled: Boolean(task.repeat_enabled),
    repeatEveryCount: task.repeat_every_count ?? 1,
    repeatEveryUnit: task.repeat_every_unit ?? "weeks",
    notifyEnabled: Boolean(task.notify_enabled),
    notifyLeadCount: task.notify_lead_count ?? 1,
    notifyLeadUnit: task.notify_lead_unit ?? "days",
    createdAt: task.created_at,
    createdBy: task.created_by,
  }));
}

function renderShell(content) {
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">F</div>
          <div>
            <strong>Fertilab</strong>
            <span>Gestión de partes</span>
          </div>
        </div>
        <nav class="nav">
          <button class="${state.section === "reports" ? "active" : ""}" data-section="reports">Ver partes</button>
          <button class="${state.section === "create" ? "active" : ""}" data-section="create">Generar parte</button>
          <button class="${state.section === "calendar" ? "active" : ""}" data-section="calendar">Calendario</button>
          <button class="${state.section === "settings" ? "active" : ""}" data-section="settings">Correos de notificación</button>
        </nav>
      </aside>
      <main class="main">
        <div class="user-bar">
          <div>
            <span>Usuario activo</span>
            <strong>${hasActiveUser() ? escapeHtml(state.activeUser) : "Sin identificar"}</strong>
          </div>
          <div class="user-actions">
            <button data-refresh type="button">${state.refreshing ? "Actualizando..." : "Refrescar"}</button>
            <button class="subtle" data-sign-out type="button">Salir</button>
          </div>
        </div>
        ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ""}
        ${content}
        ${renderConfirmDialog()}
      </main>
    </div>
  `;

  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      render();
    });
  });
  document.querySelector("[data-refresh]").addEventListener("click", () => {
    refreshSharedData({ silent: true });
  });
  document.querySelector("[data-sign-out]").addEventListener("click", async () => {
    try { await authService.signOut(); applySession(null); }
    catch { state.error = "No se ha podido cerrar la sesión. Inténtalo de nuevo."; render(); }
  });
  document.querySelector("[data-confirm-cancel]")?.addEventListener("click", () => {
    state.confirmDialog = null;
    render();
  });
  document.querySelector("[data-confirm-accept]")?.addEventListener("click", () => {
    const action = state.confirmDialog?.action;
    state.confirmDialog = null;
    if (action) withReload(action);
  });
}

function renderConfirmDialog() {
  if (!state.confirmDialog) return "";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">${escapeHtml(state.confirmDialog.title)}</h2>
        <p>${escapeHtml(state.confirmDialog.message)}</p>
        <div class="dialog-actions">
          <button type="button" data-confirm-cancel>Cancelar</button>
          <button class="danger" type="button" data-confirm-accept>${escapeHtml(state.confirmDialog.acceptLabel ?? "Eliminar")}</button>
        </div>
      </section>
    </div>
  `;
}

function askConfirmation({ title, message, acceptLabel = "Eliminar", action }) {
  state.confirmDialog = { title, message, acceptLabel, action };
  render();
}

function renderReports() {
  if (state.loading) {
    renderShell(`<div class="empty">Cargando datos compartidos...</div>`);
    return;
  }

  const reports = getSortedReports();
  const selectedReport = getSelectedReport();
  const cards = reports
    .map(
      (report) => `
        <button class="report-card ${report.isUrgent ? "urgent" : ""} ${report.id === selectedReport?.id ? "selected" : ""}" data-select-report="${report.id}">
          <div class="card-title">${statusDot(report.currentStatus)}<strong>${escapeHtml(report.title)}</strong></div>
          <div class="card-tags">${urgencyBadge(report.isUrgent)}${categoryBadge(report.category)}</div>
          <p>${escapeHtml(report.content.slice(0, 170))}${report.content.length > 170 ? "..." : ""}</p>
          <dl class="meta-grid">
            <div><dt>Publicado</dt><dd>${formatDate(report.publishedAt)}</dd></div>
            <div><dt>Actualizado</dt><dd>${formatDate(report.updatedAt)}</dd></div>
            <div><dt>Actualizaciones</dt><dd>${Math.max(report.history.length - 1, 0)}</dd></div>
          </dl>
        </button>
      `,
    )
    .join("");

  renderShell(`
    <header class="page-header">
      <div>
        <p class="eyebrow">Partes</p>
        <h1>Seguimiento operativo</h1>
      </div>
      <button class="primary" data-section="create">Nuevo parte</button>
    </header>
    <section class="toolbar">
      <label>Estado
        <select id="filter-status">
          <option value="ALL">Todos</option>
          ${statuses.map((status) => `<option value="${status}" ${state.filter === status ? "selected" : ""}>${StatusMeta[status].label}</option>`).join("")}
        </select>
      </label>
      <label>Clase
        <select id="filter-category">
          ${categoryOptions(state.categoryFilter)}
        </select>
      </label>
      <label>Ordenar por
        <select id="sort-by">
          <option value="updatedAt" ${state.sortBy === "updatedAt" ? "selected" : ""}>Última actualización</option>
          <option value="publishedAt" ${state.sortBy === "publishedAt" ? "selected" : ""}>Fecha de publicación</option>
          <option value="status" ${state.sortBy === "status" ? "selected" : ""}>Estado</option>
        </select>
      </label>
      <label>Límite
        <select id="list-limit">
          ${["3", "5", "10", "50", "100", "ALL"].map((limit) => `<option value="${limit}" ${state.listLimit === limit ? "selected" : ""}>${limit === "ALL" ? "Todos" : limit}</option>`).join("")}
        </select>
      </label>
    </section>
    <section class="workbench">
      <div class="report-list">${cards || `<div class="empty">No hay partes para este filtro.</div>`}</div>
      <div class="detail-panel">${selectedReport ? renderReportDetail(selectedReport) : `<div class="empty">Selecciona o crea un parte.</div>`}</div>
    </section>
  `);

  document.querySelector("#filter-status").addEventListener("change", (event) => {
    state.filter = event.target.value;
    render();
  });
  document.querySelector("#filter-category").addEventListener("change", (event) => {
    state.categoryFilter = event.target.value;
    render();
  });
  document.querySelector("#sort-by").addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    render();
  });
  document.querySelector("#list-limit").addEventListener("change", (event) => {
    state.listLimit = event.target.value;
    render();
  });
  document.querySelectorAll("[data-select-report]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedReportId = button.dataset.selectReport;
      render();
    });
  });
  bindDetailActions();
}

function renderReportDetail(report) {
  const history = [...report.history]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(renderHistoryEntry)
    .join("");

  return `
    <article class="detail">
      <div class="detail-heading">
        <div>
          <div class="status-pill ${StatusMeta[report.currentStatus].tone}">${statusLabel(report.currentStatus)}</div>
          ${urgencyBadge(report.isUrgent)}
          ${categoryBadge(report.category)}
          <h2>${escapeHtml(report.title)}</h2>
        </div>
        <button class="danger" data-delete-report="${report.id}">Eliminar</button>
      </div>
      <p class="report-body">${escapeHtml(report.content)}</p>
      <dl class="detail-dates">
        <div><dt>Publicado</dt><dd>${formatDate(report.publishedAt)}</dd></div>
        <div><dt>Última actualización</dt><dd>${formatDate(report.updatedAt)}</dd></div>
      </dl>
      <form class="stack-form" id="progress-form">
        <label>Estado
          <select name="status">
            ${statuses.map((status) => `<option value="${status}" ${status === report.currentStatus ? "selected" : ""}>${StatusMeta[status].label}</option>`).join("")}
          </select>
        </label>
        <label>Actualización opcional
          <textarea name="content" rows="4" placeholder="Describe la actualización o el motivo del cambio de estado"></textarea>
        </label>
        <button type="submit">Guardar actualización</button>
      </form>
      <form class="inline-form" id="urgency-form">
        <label class="check-field">
          <input name="isUrgent" type="checkbox" value="yes" ${report.isUrgent ? "checked" : ""} />
          <span>Marcar como urgente</span>
        </label>
        <button type="submit">Guardar urgencia</button>
      </form>
      <section class="timeline">
        <div class="section-title">Historial</div>
        ${history}
      </section>
    </article>
  `;
}

function renderHistoryEntry(entry) {
  const isStatusChange = entry.type === HistoryEntryType.STATUS_CHANGE;
  const label = entry.type === HistoryEntryType.CREATED ? "Creación" : entry.type === HistoryEntryType.UPDATE ? "Actualización" : "Cambio de estado";
  const transition = isStatusChange
    ? `<div class="transition">${statusLabel(entry.previousStatus)}<span>→</span>${statusLabel(entry.newStatus)}</div>`
    : `<div class="transition">${statusLabel(entry.newStatus)}</div>`;

  return `
    <article class="timeline-entry">
      <div class="timeline-marker">${statusDot(entry.newStatus)}</div>
      <div>
        <div class="timeline-head">
          <strong>${label}</strong>
          <time>${formatDate(entry.createdAt)}</time>
        </div>
        <div class="actor">Por ${escapeHtml(entry.user || "Usuario sin identificar")}</div>
        ${transition}
        ${entry.content ? `<p>${escapeHtml(entry.content)}</p>` : `<p class="muted">Sin comentario adicional.</p>`}
      </div>
    </article>
  `;
}

function buildCalendarEvents() {
  const reportEvents = state.reports
    .filter(matchesCategoryFilter)
    .flatMap((report) =>
      report.history.map((entry) => ({
        id: entry.id,
        kind: "report",
        reportId: report.id,
        reportTitle: report.title,
        reportCategory: report.category,
        reportIsUrgent: report.isUrgent,
        reportStatus: report.currentStatus,
        type: entry.type,
        content: entry.content,
        previousStatus: entry.previousStatus,
        newStatus: entry.newStatus,
        user: entry.user,
        createdAt: entry.createdAt,
      })),
    );

  const noteEvents = state.calendarNotes.map((note) => ({
    id: note.id,
    kind: "note",
    title: note.title,
    content: note.content,
    createdBy: note.createdBy,
    createdAt: `${note.noteDate}T12:00:00`,
    noteDate: note.noteDate,
  }));

  const preventiveEvents = buildPreventiveEvents(calendarRangeStart(), calendarRangeEnd());

  return [...reportEvents, ...noteEvents, ...preventiveEvents].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function calendarRangeStart() {
  if (state.calendarMode === "year") return new Date(state.calendarDate.getFullYear(), 0, 1);
  if (state.calendarMode === "month") return startOfWeek(startOfMonth(state.calendarDate));
  if (state.calendarMode === "week") return startOfWeek(state.calendarDate);
  return new Date(state.calendarDate);
}

function calendarRangeEnd() {
  if (state.calendarMode === "year") return new Date(state.calendarDate.getFullYear(), 11, 31);
  if (state.calendarMode === "month") return addDays(startOfWeek(endOfMonth(state.calendarDate)), 6);
  if (state.calendarMode === "week") return addDays(startOfWeek(state.calendarDate), 6);
  return new Date(state.calendarDate);
}

function addInterval(date, count, unit) {
  const next = new Date(date);
  if (unit === "days") next.setDate(next.getDate() + count);
  if (unit === "weeks") next.setDate(next.getDate() + count * 7);
  if (unit === "months") next.setMonth(next.getMonth() + count);
  return next;
}

function buildPreventiveEvents(rangeStart, rangeEnd) {
  return state.preventiveTasks
    .filter(matchesCategoryFilter)
    .flatMap((task) => {
      const events = [];
      let occurrence = new Date(`${task.startDate}T12:00:00`);
      const firstDate = new Date(occurrence);
      const maxIterations = task.repeatEnabled ? 400 : 1;

      for (let index = 0; index < maxIterations && occurrence <= rangeEnd; index += 1) {
        if (occurrence >= rangeStart) {
          events.push({
            id: `${task.id}-${dateKey(occurrence)}`,
            kind: "preventive",
            taskId: task.id,
            title: task.title,
            content: task.content,
            category: task.category,
            createdBy: task.createdBy,
            createdAt: `${dateKey(occurrence)}T09:00:00`,
            occurrenceDate: dateKey(occurrence),
            repeatEnabled: task.repeatEnabled,
            notifyEnabled: task.notifyEnabled,
          });
        }
        if (!task.repeatEnabled) break;
        occurrence = addInterval(occurrence, task.repeatEveryCount, task.repeatEveryUnit);
        if (occurrence <= firstDate) break;
      }

      return events;
    });
}

function eventLabel(type) {
  if (type === HistoryEntryType.CREATED) return "Parte creado";
  if (type === HistoryEntryType.STATUS_CHANGE) return "Cambio de estado";
  return "Actualización";
}

function noteIcon() {
  return "📝";
}

function renderCalendar() {
  if (state.loading) {
    renderShell(`<div class="empty">Cargando calendario...</div>`);
    return;
  }

  const events = buildCalendarEvents();
  const title = calendarTitle();

  renderShell(`
    <header class="page-header">
      <div>
        <p class="eyebrow">Calendario</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <button class="primary" data-open-note-form>Nueva nota</button>
    </header>
    <section class="toolbar calendar-toolbar">
      <div class="segmented">
        ${["year", "month", "week", "day"].map((mode) => `<button class="${state.calendarMode === mode ? "active" : ""}" data-calendar-mode="${mode}">${calendarModeLabel(mode)}</button>`).join("")}
      </div>
      <div class="calendar-nav">
        <label>Clase
          <select id="calendar-filter-category">
            ${categoryOptions(state.categoryFilter)}
          </select>
        </label>
        <button data-calendar-prev>Anterior</button>
        <button data-calendar-today>Hoy</button>
        <button data-calendar-next>Siguiente</button>
      </div>
    </section>
    ${renderCalendarNoteForm()}
    ${renderPreventiveForm()}
    ${renderSelectedCalendarNote()}
    ${renderSelectedPreventiveTask()}
    ${renderCalendarGrid(events)}
  `);

  document.querySelectorAll("[data-calendar-report]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedReportId = button.dataset.calendarReport;
      state.section = "reports";
      render();
    });
  });
  document.querySelectorAll("[data-calendar-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarMode = button.dataset.calendarMode;
      render();
    });
  });
  document.querySelector("#calendar-filter-category").addEventListener("change", (event) => {
    state.categoryFilter = event.target.value;
    render();
  });
  document.querySelector("[data-calendar-prev]").addEventListener("click", () => {
    moveCalendar(-1);
  });
  document.querySelector("[data-calendar-next]").addEventListener("click", () => {
    moveCalendar(1);
  });
  document.querySelector("[data-calendar-today]").addEventListener("click", () => {
    state.calendarDate = new Date();
    render();
  });
  document.querySelector("[data-open-note-form]").addEventListener("click", () => {
    document.querySelector("#calendar-note-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector("[name='noteDate']")?.focus();
  });
  document.querySelector("#calendar-note-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ensureActiveUser()) return;
    const form = new FormData(event.currentTarget);
    withReload(() =>
      supabaseClient.createCalendarNote({
        id: crypto.randomUUID(),
        title: String(form.get("title")).trim(),
        content: String(form.get("content") ?? "").trim(),
        note_date: form.get("noteDate"),
        created_by: state.activeUser,
      }),
    );
  });
  document.querySelector("#preventive-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ensureActiveUser()) return;
    const form = new FormData(event.currentTarget);
    withReload(() =>
      supabaseClient.createPreventiveTask({
        id: crypto.randomUUID(),
        title: String(form.get("title")).trim(),
        content: String(form.get("content") ?? "").trim(),
        category: form.get("category"),
        start_date: form.get("startDate"),
        repeat_enabled: form.get("repeatEnabled") === "yes",
        repeat_every_count: Number(form.get("repeatEveryCount") || 1),
        repeat_every_unit: form.get("repeatEveryUnit"),
        notify_enabled: form.get("notifyEnabled") === "yes",
        notify_lead_count: Number(form.get("notifyLeadCount") || 0),
        notify_lead_unit: form.get("notifyLeadUnit"),
        created_by: state.activeUser,
      }),
    );
  });
  document.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      askConfirmation({
        title: "Eliminar nota",
        message: "¿Eliminar esta nota del calendario?",
        action: () => supabaseClient.deleteCalendarNote(button.dataset.deleteNote),
      });
    });
  });
  document.querySelectorAll("[data-delete-preventive]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      askConfirmation({
        title: "Eliminar preventivo",
        message: "Se eliminará este preventivo y todas sus repeticiones vinculadas.",
        action: () => supabaseClient.deletePreventiveTask(button.dataset.deletePreventive),
      });
    });
  });
  document.querySelectorAll("[data-select-preventive]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPreventiveTaskId = button.dataset.selectPreventive;
      state.selectedCalendarNoteId = null;
      render();
    });
  });
  document.querySelectorAll("[data-select-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCalendarNoteId = button.dataset.selectNote;
      state.selectedPreventiveTaskId = null;
      render();
    });
  });
  document.querySelector("[data-close-note-detail]")?.addEventListener("click", () => {
    state.selectedCalendarNoteId = null;
    render();
  });
  document.querySelector("[data-close-preventive-detail]")?.addEventListener("click", () => {
    state.selectedPreventiveTaskId = null;
    render();
  });
  document.querySelector("#preventive-detail-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id"));
    withReload(() =>
      supabaseClient.updatePreventiveTask(id, {
        title: String(form.get("title")).trim(),
        content: String(form.get("content") ?? "").trim(),
        category: form.get("category"),
        start_date: form.get("startDate"),
        repeat_enabled: form.get("repeatEnabled") === "yes",
        repeat_every_count: Number(form.get("repeatEveryCount") || 1),
        repeat_every_unit: form.get("repeatEveryUnit"),
        notify_enabled: form.get("notifyEnabled") === "yes",
        notify_lead_count: Number(form.get("notifyLeadCount") || 0),
        notify_lead_unit: form.get("notifyLeadUnit"),
      }),
    );
  });
  document.querySelectorAll("[data-calendar-month]").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), Number(button.dataset.calendarMonth), 1);
      state.calendarMode = "month";
      render();
    });
  });
  document.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarDate = new Date(`${button.dataset.calendarDay}T12:00:00`);
      state.calendarMode = "day";
      render();
    });
  });
}

function calendarModeLabel(mode) {
  return {
    year: "Año",
    month: "Mes",
    week: "Semana",
    day: "Día",
  }[mode];
}

function calendarTitle() {
  if (state.calendarMode === "year") return String(state.calendarDate.getFullYear());
  if (state.calendarMode === "month") {
    return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(state.calendarDate);
  }
  if (state.calendarMode === "week") {
    const start = startOfWeek(state.calendarDate);
    const end = addDays(start, 6);
    return `${formatDay(start.toISOString())} - ${formatDay(end.toISOString())}`;
  }
  return formatDay(state.calendarDate.toISOString());
}

function moveCalendar(direction) {
  const current = new Date(state.calendarDate);
  if (state.calendarMode === "year") current.setFullYear(current.getFullYear() + direction);
  if (state.calendarMode === "month") current.setMonth(current.getMonth() + direction);
  if (state.calendarMode === "week") current.setDate(current.getDate() + direction * 7);
  if (state.calendarMode === "day") current.setDate(current.getDate() + direction);
  state.calendarDate = current;
  render();
}

function renderCalendarNoteForm() {
  return `
    <form class="calendar-note-form" id="calendar-note-form">
      <label>Fecha
        <input type="date" name="noteDate" required value="${dateKey(state.calendarDate)}" />
      </label>
      <label>Título de la nota
        <input name="title" required maxlength="120" placeholder="Ej. Revisión prevista" />
      </label>
      <label>Detalle opcional
        <input name="content" placeholder="Información adicional" />
      </label>
      <button type="submit">Guardar nota</button>
    </form>
  `;
}

function renderPreventiveForm() {
  return `
    <form class="preventive-form" id="preventive-form">
      <div class="form-heading">
        <div>
          <span class="eyebrow">Preventivos</span>
          <strong>Planificar preventivo</strong>
        </div>
      </div>
      <label>Fecha
        <input type="date" name="startDate" required value="${dateKey(state.calendarDate)}" />
      </label>
      <label>Clase
        <select name="category" required>
          ${categories.map((category) => `<option value="${category}">${CategoryMeta[category].label}</option>`).join("")}
        </select>
      </label>
      <label>Título
        <input name="title" required maxlength="120" placeholder="Ej. Revisión incubadora" />
      </label>
      <label>Detalle
        <input name="content" placeholder="Información adicional" />
      </label>
      <label class="check-field">
        <input name="repeatEnabled" type="checkbox" value="yes" />
        <span>Repetir</span>
      </label>
      <label>Cada
        <input name="repeatEveryCount" type="number" min="1" value="1" />
      </label>
      <label>Periodo
        <select name="repeatEveryUnit">
          <option value="days">Días</option>
          <option value="weeks" selected>Semanas</option>
          <option value="months">Meses</option>
        </select>
      </label>
      <label class="check-field">
        <input name="notifyEnabled" type="checkbox" value="yes" />
        <span>Avisar por correo</span>
      </label>
      <label>Antelación
        <input name="notifyLeadCount" type="number" min="0" value="1" />
      </label>
      <label>Unidad
        <select name="notifyLeadUnit">
          <option value="days" selected>Días antes</option>
          <option value="weeks">Semanas antes</option>
        </select>
      </label>
      <button type="submit">Guardar preventivo</button>
    </form>
  `;
}

function renderSelectedCalendarNote() {
  const note = state.calendarNotes.find((item) => item.id === state.selectedCalendarNoteId);
  if (!note) return "";

  return `
    <section class="note-detail">
      <div>
        <span>${noteIcon()} · ${escapeHtml(formatDay(`${note.noteDate}T12:00:00`))}</span>
        <h2>${escapeHtml(note.title)}</h2>
        ${note.content ? `<p>${escapeHtml(note.content)}</p>` : `<p class="muted">Sin detalle adicional.</p>`}
        <small>Creada por ${escapeHtml(note.createdBy || "Usuario sin identificar")}</small>
      </div>
      <div class="note-detail-actions">
        <button data-close-note-detail type="button">Cerrar</button>
        <button class="danger" data-delete-note="${note.id}" type="button">Eliminar</button>
      </div>
    </section>
  `;
}

function renderSelectedPreventiveTask() {
  const task = state.preventiveTasks.find((item) => item.id === state.selectedPreventiveTaskId);
  if (!task) return "";

  return `
    <section class="note-detail preventive-detail">
      <form id="preventive-detail-form" class="preventive-detail-form">
        <input type="hidden" name="id" value="${task.id}" />
        <div class="detail-heading compact-heading">
          <div>
            <span class="eyebrow">Preventivo</span>
            <h2>${escapeHtml(task.title)}</h2>
          </div>
          <button data-close-preventive-detail type="button">Cerrar</button>
        </div>
        <div class="edit-grid">
          <label>Fecha inicial
            <input type="date" name="startDate" required value="${escapeHtml(task.startDate)}" />
          </label>
          <label>Clase
            <select name="category" required>
              ${categories.map((category) => `<option value="${category}" ${task.category === category ? "selected" : ""}>${CategoryMeta[category].label}</option>`).join("")}
            </select>
          </label>
          <label>Título
            <input name="title" required maxlength="120" value="${escapeHtml(task.title)}" />
          </label>
          <label>Detalle
            <input name="content" value="${escapeHtml(task.content)}" />
          </label>
          <label class="check-field">
            <input name="repeatEnabled" type="checkbox" value="yes" ${task.repeatEnabled ? "checked" : ""} />
            <span>Repetir</span>
          </label>
          <label>Cada
            <input name="repeatEveryCount" type="number" min="1" value="${task.repeatEveryCount}" />
          </label>
          <label>Periodo
            <select name="repeatEveryUnit">
              <option value="days" ${task.repeatEveryUnit === "days" ? "selected" : ""}>Días</option>
              <option value="weeks" ${task.repeatEveryUnit === "weeks" ? "selected" : ""}>Semanas</option>
              <option value="months" ${task.repeatEveryUnit === "months" ? "selected" : ""}>Meses</option>
            </select>
          </label>
          <label class="check-field">
            <input name="notifyEnabled" type="checkbox" value="yes" ${task.notifyEnabled ? "checked" : ""} />
            <span>Avisar por correo</span>
          </label>
          <label>Antelación
            <input name="notifyLeadCount" type="number" min="0" value="${task.notifyLeadCount}" />
          </label>
          <label>Unidad
            <select name="notifyLeadUnit">
              <option value="days" ${task.notifyLeadUnit === "days" ? "selected" : ""}>Días antes</option>
              <option value="weeks" ${task.notifyLeadUnit === "weeks" ? "selected" : ""}>Semanas antes</option>
            </select>
          </label>
        </div>
        <div class="dialog-actions">
          <button type="submit">Guardar cambios</button>
          <button class="danger" data-delete-preventive="${task.id}" type="button">Eliminar bloque</button>
        </div>
      </form>
    </section>
  `;
}

function renderCalendarGrid(events) {
  if (state.calendarMode === "year") return renderYearCalendar(events);
  const days = calendarVisibleDays();
  return `
    <section class="calendar-grid ${state.calendarMode}">
      ${days.map((date) => renderCalendarCell(date, eventsForDate(events, date), state.calendarMode === "month" && date.getMonth() !== state.calendarDate.getMonth())).join("")}
    </section>
  `;
}

function calendarVisibleDays() {
  if (state.calendarMode === "day") return [state.calendarDate];
  if (state.calendarMode === "week") return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(state.calendarDate), index));

  const start = startOfWeek(startOfMonth(state.calendarDate));
  const monthEnd = endOfMonth(state.calendarDate);
  const end = addDays(startOfWeek(monthEnd), 6);
  const days = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(new Date(day));
  return days;
}

function renderYearCalendar(events) {
  return `
    <section class="year-grid">
      ${Array.from({ length: 12 }, (_, month) => {
        const date = new Date(state.calendarDate.getFullYear(), month, 1);
        const monthEvents = events.filter((event) => {
          const eventDate = new Date(event.createdAt);
          return eventDate.getFullYear() === date.getFullYear() && eventDate.getMonth() === month;
        });
        return `
          <button class="year-month" data-calendar-month="${month}">
            <strong>${new Intl.DateTimeFormat("es-ES", { month: "long" }).format(date)}</strong>
            <span>${monthEvents.length} evento(s)</span>
          </button>
        `;
      }).join("")}
    </section>
  `;
}

function renderCalendarCell(date, events, isMuted) {
  const isMonth = state.calendarMode === "month";
  const isWeek = state.calendarMode === "week";
  const visibleEvents = isMonth ? events.slice(0, 4) : isWeek ? events.slice(0, 5) : events;
  const hiddenCount = Math.max(events.length - visibleEvents.length, 0);

  return `
    <article class="calendar-cell ${isMuted ? "muted-cell" : ""}">
      <div class="calendar-cell-date">
        <strong>${date.getDate()}</strong>
        <span>${new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date)}</span>
      </div>
      <div class="calendar-cell-events">
        ${
          visibleEvents.length
            ? visibleEvents.map(isMonth ? renderCalendarMonthEvent : isWeek ? renderCalendarWeekEvent : renderCalendarEvent).join("")
            : `<span class="muted">Sin movimientos</span>`
        }
        ${hiddenCount ? `<button class="more-events" data-calendar-day="${dateKey(date)}">+${hiddenCount} más</button>` : ""}
      </div>
    </article>
  `;
}

function eventsForDate(events, date) {
  const key = dateKey(date);
  return events.filter((event) => dayKey(event.createdAt) === key);
}

function renderCalendarDay(key, events) {
  return `
    <article class="calendar-day">
      <div class="calendar-date">
        <strong>${escapeHtml(formatDay(`${key}T12:00:00`))}</strong>
        <span>${events.length} movimiento(s)</span>
      </div>
      <div class="calendar-events">
        ${events.map(renderCalendarEvent).join("")}
      </div>
    </article>
  `;
}

function renderCalendarEvent(event) {
  if (event.kind === "preventive") {
    return `
      <div class="calendar-event preventive-event" data-select-preventive="${event.taskId}" role="button" tabindex="0">
        <div class="calendar-event-body">
          <div class="calendar-event-head">
            <span class="calendar-event-time preventive-icon">P</span>
            <strong>${escapeHtml(event.title)}</strong>
          </div>
          <div class="card-tags">${categoryBadge(event.category)}${event.repeatEnabled ? `<span class="category-badge">Recurrente</span>` : ""}${event.notifyEnabled ? `<span class="category-badge teal">Aviso email</span>` : ""}</div>
          ${event.content ? `<p>${escapeHtml(event.content)}</p>` : `<p class="muted">Sin detalle adicional.</p>`}
          <span class="actor">Por ${escapeHtml(event.createdBy || "Usuario sin identificar")}</span>
        </div>
        <button class="danger subtle note-delete" data-delete-preventive="${event.taskId}" type="button">Eliminar bloque</button>
      </div>
    `;
  }

  if (event.kind === "note") {
    return `
      <div class="calendar-event note-event">
        <div class="calendar-event-body">
          <div class="calendar-event-head">
            <span class="calendar-event-time note-icon">${noteIcon()}</span>
            <strong>${escapeHtml(event.title)}</strong>
          </div>
          ${event.content ? `<p>${escapeHtml(event.content)}</p>` : `<p class="muted">Sin detalle adicional.</p>`}
          <span class="actor">Por ${escapeHtml(event.createdBy || "Usuario sin identificar")}</span>
        </div>
        <button class="danger subtle note-delete" data-delete-note="${event.id}" type="button">Eliminar</button>
      </div>
    `;
  }

  const transition =
    event.type === HistoryEntryType.STATUS_CHANGE
      ? `<div class="transition compact-transition">${statusLabel(event.previousStatus)}<span>→</span>${statusLabel(event.newStatus)}</div>`
      : `<div class="transition compact-transition">${statusLabel(event.newStatus)}</div>`;

  return `
    <button class="calendar-event ${event.reportIsUrgent ? "urgent-event" : ""}" data-calendar-report="${event.reportId}">
      <div class="calendar-event-body">
        <div class="calendar-event-head">
          ${statusDot(event.newStatus || event.reportStatus)}
          <strong>${escapeHtml(event.reportTitle)}</strong>
          <span class="calendar-event-time">${formatTime(event.createdAt)}</span>
          <span class="event-type">${escapeHtml(eventLabel(event.type))}</span>
        </div>
        ${transition}
        ${event.content ? `<p>${escapeHtml(event.content)}</p>` : `<p class="muted">Sin comentario adicional.</p>`}
        <span class="actor">Por ${escapeHtml(event.user || "Usuario sin identificar")}</span>
      </div>
    </button>
  `;
}

function renderCalendarMonthEvent(event) {
  if (event.kind === "preventive") {
    return `
      <div class="month-event preventive-month-event" data-select-preventive="${event.taskId}" role="button" tabindex="0">
        <span class="preventive-icon">P</span>
        <strong>${escapeHtml(event.title)}</strong>
        <button class="danger subtle compact-delete" data-delete-preventive="${event.taskId}" type="button">Eliminar</button>
      </div>
    `;
  }

  if (event.kind === "note") {
    return `
      <button class="month-event note-month-event" data-select-note="${event.id}" type="button">
        <span class="note-icon">${noteIcon()}</span>
        <strong>${escapeHtml(event.title)}</strong>
      </button>
    `;
  }

  return `
    <button class="month-event ${event.reportIsUrgent ? "urgent-event" : ""}" data-calendar-report="${event.reportId}">
      ${statusDot(event.newStatus || event.reportStatus)}
      <strong>${escapeHtml(event.reportTitle)}</strong>
      <small>${escapeHtml(StatusMeta[event.newStatus || event.reportStatus].label)}</small>
    </button>
  `;
}

function renderCalendarWeekEvent(event) {
  if (event.kind === "preventive") {
    return `
      <div class="week-event preventive-week-event" data-select-preventive="${event.taskId}" role="button" tabindex="0">
        <div class="week-event-title">
          <span class="calendar-event-time preventive-icon">P</span>
          <strong>${escapeHtml(event.title)}</strong>
        </div>
        <span class="week-event-status">${escapeHtml(CategoryMeta[event.category ?? ReportCategory.IT].label)}${event.repeatEnabled ? " · Recurrente" : ""}</span>
        ${event.content ? `<p>${escapeHtml(event.content)}</p>` : ""}
        <button class="danger subtle week-note-delete" data-delete-preventive="${event.taskId}" type="button">Eliminar bloque</button>
      </div>
    `;
  }

  if (event.kind === "note") {
    return `
      <div class="week-event note-week-event">
        <div class="week-event-title">
          <span class="calendar-event-time note-icon">${noteIcon()}</span>
          <strong>${escapeHtml(event.title)}</strong>
        </div>
        ${event.content ? `<p>${escapeHtml(event.content)}</p>` : ""}
        <button class="danger subtle week-note-delete" data-delete-note="${event.id}" type="button">Eliminar</button>
      </div>
    `;
  }

  return `
    <button class="week-event ${event.reportIsUrgent ? "urgent-event" : ""}" data-calendar-report="${event.reportId}">
      <div class="week-event-title">
        ${statusDot(event.newStatus || event.reportStatus)}
        <strong>${escapeHtml(event.reportTitle)}</strong>
      </div>
      <span class="week-event-status">${escapeHtml(StatusMeta[event.newStatus || event.reportStatus].label)}</span>
      ${event.content ? `<p>${escapeHtml(event.content)}</p>` : ""}
    </button>
  `;
}

function bindDetailActions() {
  const report = getSelectedReport();
  if (!report) return;

  document.querySelector("#progress-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ensureActiveUser()) return;
    const form = new FormData(event.currentTarget);
    withReload(() => reportService.updateProgress(report.id, form.get("status"), form.get("content") ?? "", state.activeUser));
  });

  document.querySelector("#urgency-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    withReload(() => reportService.setUrgency(report.id, form.get("isUrgent") === "yes"));
  });

  document.querySelector("[data-delete-report]")?.addEventListener("click", () => {
    askConfirmation({
      title: "Eliminar parte",
      message: "Esta acción eliminará también todo su historial de actualizaciones y no podrá recuperarse.",
      action: () => {
        state.selectedReportId = null;
        return reportService.deleteReport(report.id);
      },
    });
  });
}

function renderCreate() {
  renderShell(`
    <header class="page-header">
      <div>
        <p class="eyebrow">Generar parte</p>
        <h1>Nuevo report</h1>
      </div>
    </header>
    <form class="create-form" id="create-report-form">
      <label>Título
        <input name="title" required maxlength="120" placeholder="Ej. Problema con el servidor" />
      </label>
      <label>Estado inicial
        <select name="status" required>
          ${statuses.map((status) => `<option value="${status}">${StatusMeta[status].label}</option>`).join("")}
        </select>
      </label>
      <label>Clase
        <select name="category" required>
          ${categories.map((category) => `<option value="${category}">${CategoryMeta[category].label}</option>`).join("")}
        </select>
      </label>
      <label class="check-field">
        <input name="isUrgent" type="checkbox" value="yes" />
        <span>Marcar como urgente</span>
      </label>
      <label>Texto / contenido
        <textarea name="content" rows="9" required placeholder="Describe el parte inicial"></textarea>
      </label>
      <button class="primary" type="submit">Publicar parte</button>
    </form>
  `);

  document.querySelector("#create-report-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!ensureActiveUser()) return;
    withReload(async () => {
      const report = await reportService.createReport({
        title: form.get("title"),
        content: form.get("content"),
        status: form.get("status"),
        category: form.get("category"),
        isUrgent: form.get("isUrgent") === "yes",
        user: state.activeUser,
      });
      state.selectedReportId = report.id;
      state.section = "reports";
    });
  });
}

function renderSettings() {
  const recipients = state.recipients;
  const log = state.emailLog;

  renderShell(`
    <header class="page-header">
      <div>
        <p class="eyebrow">Configuración</p>
        <h1>Correos de notificación</h1>
      </div>
    </header>
    <section class="settings-grid">
      <div>
        <form class="inline-form" id="recipient-form">
          <label>Correo electrónico
            <input type="email" name="email" required placeholder="avisos@empresa.com" />
          </label>
          <button type="submit">Añadir</button>
        </form>
        <div class="recipient-list">
          ${recipients.map((recipient) => renderRecipient(recipient)).join("") || `<div class="empty">No hay destinatarios configurados.</div>`}
        </div>
      </div>
      <aside class="mail-log">
        <div class="section-title">Últimas notificaciones</div>
        ${log.slice(0, 5).map((entry) => `<p><strong>${escapeHtml(entry.subject)}</strong><span>${formatDate(entry.createdAt)} · ${entry.recipients.length} destinatario(s)</span></p>`).join("") || `<p class="muted">Se registrarán aquí los envíos de creación.</p>`}
      </aside>
    </section>
  `);

  document.querySelector("#recipient-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    withReload(() => recipientService.add(form.get("email")));
  });
  document.querySelectorAll("[data-delete-recipient]").forEach((button) => {
    button.addEventListener("click", () => {
      askConfirmation({
        title: "Eliminar destinatario",
        message: "Este correo dejará de recibir notificaciones de nuevos partes y preventivos.",
        action: () => recipientService.remove(button.dataset.deleteRecipient),
      });
    });
  });
  document.querySelectorAll("[data-edit-recipient]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.editRecipient;
      const recipient = state.recipients.find((item) => item.id === id);
      const email = window.prompt("Editar correo electrónico", recipient?.email ?? "");
      if (email) withReload(() => recipientService.update(id, email));
    });
  });
}

function renderRecipient(recipient) {
  return `
    <div class="recipient">
      <span>${escapeHtml(recipient.email)}</span>
      <div>
        <button data-edit-recipient="${recipient.id}">Editar</button>
        <button class="danger subtle" data-delete-recipient="${recipient.id}">Eliminar</button>
      </div>
    </div>
  `;
}

async function loadSharedData() {
  if (!hasAccessGranted() || !hasActiveUser()) return;
  state.loading = true;
  state.error = "";
  render();

  try {
    const sessionUserId = state.session?.user.id;
    const [reports, recipients, emailLog, calendarNotes, preventiveTasks] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
      supabaseClient.listCalendarNotes(),
      supabaseClient.listPreventiveTasks(),
    ]);
    if (!sessionUserId || sessionUserId !== state.session?.user.id) return;
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
    state.calendarNotes = normalizeCalendarNotes(calendarNotes);
    state.preventiveTasks = normalizePreventiveTasks(preventiveTasks);
  } catch (error) {
    state.error = "No se han podido cargar los datos compartidos. Revisa que las tablas de Supabase estén creadas.";
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshSharedData({ silent = true } = {}) {
  if (!hasAccessGranted() || !hasActiveUser() || state.loading || state.refreshing) return;
  if (state.section === "create") return;
  if (document.activeElement?.matches("input, textarea, select")) return;

  state.refreshing = true;
  if (!silent) render();

  try {
    const sessionUserId = state.session?.user.id;
    const [reports, recipients, emailLog, calendarNotes, preventiveTasks] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
      supabaseClient.listCalendarNotes(),
      supabaseClient.listPreventiveTasks(),
    ]);
    if (!sessionUserId || sessionUserId !== state.session?.user.id) return;
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
    state.calendarNotes = normalizeCalendarNotes(calendarNotes);
    state.preventiveTasks = normalizePreventiveTasks(preventiveTasks);
    state.error = "";
  } catch (error) {
    state.error = "No se han podido refrescar los datos compartidos.";
    console.error(error);
  } finally {
    state.refreshing = false;
    render();
  }
}

async function withReload(action) {
  state.error = "";
  state.loading = true;
  render();

  try {
    await action();
    const sessionUserId = state.session?.user.id;
    const [reports, recipients, emailLog, calendarNotes, preventiveTasks] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
      supabaseClient.listCalendarNotes(),
      supabaseClient.listPreventiveTasks(),
    ]);
    if (!sessionUserId || sessionUserId !== state.session?.user.id) return;
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
    state.calendarNotes = normalizeCalendarNotes(calendarNotes);
    state.preventiveTasks = normalizePreventiveTasks(preventiveTasks);
  } catch (error) {
    state.error = "No se ha podido guardar el cambio en Supabase.";
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

function ensureActiveUser() {
  return hasAccessGranted() && hasActiveUser();
}

function render() {
  if (!hasAccessGranted()) {
    renderAccessGate();
    return;
  }

  if (!hasActiveUser()) {
    renderAccessGate();
    return;
  }
  if (state.section === "create") renderCreate();
  else if (state.section === "calendar") renderCalendar();
  else if (state.section === "settings") renderSettings();
  else renderReports();
}

function startAutoRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    refreshSharedData({ silent: true });
  }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (!refreshTimer) return;
  window.clearInterval(refreshTimer);
  refreshTimer = null;
}

function renderAccessGate() {
  app.innerHTML = `
    <main class="entry-screen">
      <section class="entry-card">
        <div class="brand compact"><div class="brand-mark">F</div><div><strong>Fertilab</strong><span>Gestión de partes</span></div></div>
        <div><p class="eyebrow">Acceso</p><h1>Inicia sesión con Microsoft</h1><p>Utiliza tu cuenta de trabajo @fertilab.org.</p></div>
        ${state.error ? `<div class="error-banner" role="alert">${escapeHtml(state.error)}</div>` : ""}
        <button class="primary" id="microsoft-sign-in" type="button" ${state.authLoading || state.authBusy ? "disabled" : ""}>${state.authLoading ? "Comprobando sesión…" : state.authBusy ? "Conectando con Microsoft…" : "Continuar con Microsoft"}</button>
      </section>
    </main>
  `;
  document.querySelector("#microsoft-sign-in").addEventListener("click", async () => {
    state.authBusy = true;
    state.error = "";
    renderAccessGate();
    try { await authService.signIn(); }
    catch { state.error = "No se ha podido iniciar sesión con Microsoft. Inténtalo de nuevo o contacta con informática."; state.authBusy = false; renderAccessGate(); }
  });
}

function applySession(session) {
  const previousUserId = state.session?.user?.id;
  state.session = session && isFertilabUser(session.user) ? session : null;
  state.activeUser = state.session ? accountName(state.session.user) : "";
  state.authLoading = false;
  state.authBusy = false;
  if (!state.session || previousUserId !== state.session.user.id) {
    stopAutoRefresh();
    state.reports = [];
    state.recipients = [];
    state.emailLog = [];
    state.calendarNotes = [];
    state.preventiveTasks = [];
    state.selectedReportId = null;
    state.confirmDialog = null;
    state.section = "reports";
  }
  render();
  if (state.session && previousUserId !== state.session.user.id) {
    startAutoRefresh();
    loadSharedData();
  }
}

async function initializeAuth() {
  // Discard the former shared-password and manually entered identity flags.
  window.localStorage.removeItem("fertilab.accessGranted.v1");
  window.localStorage.removeItem("fertilab.activeUser.v1");
  try { applySession(await authService.getSession()); }
  catch (error) { state.error = error.message || "No se ha podido comprobar la sesión."; applySession(null); }
  authService.onChange((session) => {
    if (session && !isFertilabUser(session.user)) {
      state.error = "Solo pueden acceder cuentas Microsoft de Fertilab (@fertilab.org).";
      authService.signOut().catch(console.error);
    }
    applySession(session);
  });
}

render();
initializeAuth();
