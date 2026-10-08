import { HistoryEntryType, StatusMeta, statuses } from "./models.js";
import { recipientService } from "./recipientService.js";
import { reportService } from "./reportService.js";
import { storage } from "./storage.js";
import { supabaseClient } from "./supabaseClient.js";

const ACCESS_KEY = "fertilab";
const REFRESH_INTERVAL_MS = 30000;

const state = {
  section: "reports",
  filter: "ALL",
  sortBy: "updatedAt",
  listLimit: window.matchMedia("(max-width: 640px)").matches ? "3" : "ALL",
  selectedReportId: null,
  activeUser: storage.getActiveUser(),
  accessGranted: storage.hasAccessGranted(),
  reports: [],
  recipients: [],
  emailLog: [],
  calendarNotes: [],
  calendarMode: "month",
  calendarDate: new Date(),
  selectedCalendarNoteId: null,
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

function getSortedReports() {
  const reports = state.reports;
  const filtered = state.filter === "ALL" ? reports : reports.filter((report) => report.currentStatus === state.filter);

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
  return state.accessGranted === true;
}

function setActiveUser(name) {
  state.activeUser = name.trim();
  storage.saveActiveUser(state.activeUser);
}

function setAccessGranted(granted) {
  state.accessGranted = Boolean(granted);
  storage.saveAccessGranted(state.accessGranted);
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
            <button data-change-user type="button">${hasActiveUser() ? "Cambiar nombre" : "Indicar nombre"}</button>
            <button class="subtle" data-lock-access type="button">Salir</button>
          </div>
        </div>
        ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ""}
        ${content}
      </main>
    </div>
  `;

  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      render();
    });
  });
  document.querySelector("[data-change-user]").addEventListener("click", () => {
    openUserDialog();
  });
  document.querySelector("[data-refresh]").addEventListener("click", () => {
    refreshSharedData({ silent: true });
  });
  document.querySelector("[data-lock-access]").addEventListener("click", () => {
    setAccessGranted(false);
    stopAutoRefresh();
    render();
  });
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
        <button class="report-card ${report.id === selectedReport?.id ? "selected" : ""}" data-select-report="${report.id}">
          <div class="card-title">${statusDot(report.currentStatus)}<strong>${escapeHtml(report.title)}</strong></div>
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
          <h2>${escapeHtml(report.title)}</h2>
        </div>
        <button class="danger" data-delete-report="${report.id}">Eliminar</button>
      </div>
      <p class="report-body">${escapeHtml(report.content)}</p>
      <dl class="detail-dates">
        <div><dt>Publicado</dt><dd>${formatDate(report.publishedAt)}</dd></div>
        <div><dt>Última actualización</dt><dd>${formatDate(report.updatedAt)}</dd></div>
      </dl>
      <form class="inline-form" id="status-form">
        <label>Cambiar estado
          <select name="status">
            ${statuses.map((status) => `<option value="${status}" ${status === report.currentStatus ? "selected" : ""}>${StatusMeta[status].label}</option>`).join("")}
          </select>
        </label>
        <label>Comentario opcional
          <input name="comment" placeholder="Motivo del cambio" />
        </label>
        <button type="submit">Guardar estado</button>
      </form>
      <form class="stack-form" id="update-form">
        <label>Añadir actualización
          <textarea name="content" rows="4" required placeholder="Describe la nueva información sin sobrescribir el historial anterior"></textarea>
        </label>
        <button type="submit">Añadir al historial</button>
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
    .flatMap((report) =>
      report.history.map((entry) => ({
        id: entry.id,
        kind: "report",
        reportId: report.id,
        reportTitle: report.title,
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

  return [...reportEvents, ...noteEvents].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
        <button data-calendar-prev>Anterior</button>
        <button data-calendar-today>Hoy</button>
        <button data-calendar-next>Siguiente</button>
      </div>
    </section>
    ${renderCalendarNoteForm()}
    ${renderSelectedCalendarNote()}
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
  document.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const confirmed = window.confirm("¿Eliminar esta nota del calendario?");
      if (!confirmed) return;
      withReload(() => supabaseClient.deleteCalendarNote(button.dataset.deleteNote));
    });
  });
  document.querySelectorAll("[data-select-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCalendarNoteId = button.dataset.selectNote;
      render();
    });
  });
  document.querySelector("[data-close-note-detail]")?.addEventListener("click", () => {
    state.selectedCalendarNoteId = null;
    render();
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
    <button class="calendar-event" data-calendar-report="${event.reportId}">
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
  if (event.kind === "note") {
    return `
      <button class="month-event note-month-event" data-select-note="${event.id}" type="button">
        <span class="note-icon">${noteIcon()}</span>
        <strong>${escapeHtml(event.title)}</strong>
      </button>
    `;
  }

  return `
    <button class="month-event" data-calendar-report="${event.reportId}">
      ${statusDot(event.newStatus || event.reportStatus)}
      <strong>${escapeHtml(event.reportTitle)}</strong>
      <small>${escapeHtml(StatusMeta[event.newStatus || event.reportStatus].label)}</small>
    </button>
  `;
}

function renderCalendarWeekEvent(event) {
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
    <button class="week-event" data-calendar-report="${event.reportId}">
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

  document.querySelector("#status-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ensureActiveUser()) return;
    const form = new FormData(event.currentTarget);
    withReload(() => reportService.changeStatus(report.id, form.get("status"), form.get("comment") ?? "", state.activeUser));
  });

  document.querySelector("#update-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ensureActiveUser()) return;
    const form = new FormData(event.currentTarget);
    withReload(() => reportService.addUpdate(report.id, form.get("content"), state.activeUser));
  });

  document.querySelector("[data-delete-report]")?.addEventListener("click", () => {
    const confirmed = window.confirm(
      "¿Estás seguro de que quieres eliminar este parte?\n\nEsta acción eliminará también todo su historial de actualizaciones y no podrá recuperarse.",
    );
    if (!confirmed) return;
    state.selectedReportId = null;
    withReload(() => reportService.deleteReport(report.id));
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
      withReload(() => recipientService.remove(button.dataset.deleteRecipient));
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
    await reportService.seedIfEmpty();
    const [reports, recipients, emailLog, calendarNotes] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
      supabaseClient.listCalendarNotes(),
    ]);
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
    state.calendarNotes = normalizeCalendarNotes(calendarNotes);
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
    const [reports, recipients, emailLog, calendarNotes] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
      supabaseClient.listCalendarNotes(),
    ]);
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
    state.calendarNotes = normalizeCalendarNotes(calendarNotes);
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
    const [reports, recipients, emailLog, calendarNotes] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
      supabaseClient.listCalendarNotes(),
    ]);
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
    state.calendarNotes = normalizeCalendarNotes(calendarNotes);
  } catch (error) {
    state.error = "No se ha podido guardar el cambio en Supabase.";
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

function openUserDialog() {
  const name = window.prompt("Indica tu nombre para registrar tus acciones", state.activeUser);
  if (!name || !name.trim()) return false;
  setActiveUser(name);
  render();
  return true;
}

function ensureActiveUser() {
  if (hasActiveUser()) return true;
  return openUserDialog();
}

function render() {
  if (!hasAccessGranted()) {
    renderAccessGate();
    return;
  }

  if (!hasActiveUser()) {
    renderUserGate();
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
      <form class="entry-card" id="access-entry-form">
        <div class="brand compact">
          <div class="brand-mark">F</div>
          <div>
            <strong>Fertilab</strong>
            <span>Gestión de partes</span>
          </div>
        </div>
        <div>
          <p class="eyebrow">Acceso</p>
          <h1>Introduce la clave</h1>
        </div>
        ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ""}
        <label>Clave de acceso
          <input name="accessKey" type="password" required autocomplete="current-password" autofocus />
        </label>
        <button class="primary" type="submit">Entrar</button>
      </form>
    </main>
  `;

  document.querySelector("#access-entry-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedKey = String(form.get("accessKey") ?? "").trim();

    if (submittedKey !== ACCESS_KEY) {
      state.error = "Clave de acceso incorrecta.";
      renderAccessGate();
      return;
    }

    state.error = "";
    setAccessGranted(true);
    render();
    startAutoRefresh();
    loadSharedData();
  });
}

function renderUserGate() {
  app.innerHTML = `
    <main class="entry-screen">
      <form class="entry-card" id="user-entry-form">
        <div class="brand compact">
          <div class="brand-mark">F</div>
          <div>
            <strong>Fertilab</strong>
            <span>Gestión de partes</span>
          </div>
        </div>
        <div>
          <p class="eyebrow">Identificación</p>
          <h1>¿Quién está usando la app?</h1>
        </div>
        <label>Tu nombre
          <input name="name" required autocomplete="name" placeholder="Ej. Alan" autofocus />
        </label>
        <button class="primary" type="submit">Entrar</button>
      </form>
    </main>
  `;

  document.querySelector("#user-entry-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setActiveUser(form.get("name"));
    startAutoRefresh();
    loadSharedData();
  });
}

render();
if (hasAccessGranted() && hasActiveUser()) startAutoRefresh();
loadSharedData();
