import { HistoryEntryType, StatusMeta, statuses } from "./models.js";
import { recipientService } from "./recipientService.js";
import { reportService } from "./reportService.js";
import { storage } from "./storage.js";
import { supabaseClient } from "./supabaseClient.js";

const ACCESS_KEY = "fertilab";

const state = {
  section: "reports",
  filter: "ALL",
  sortBy: "updatedAt",
  selectedReportId: null,
  activeUser: storage.getActiveUser(),
  accessGranted: storage.hasAccessGranted(),
  reports: [],
  recipients: [],
  emailLog: [],
  loading: false,
  error: "",
};

const app = document.querySelector("#app");
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
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

  return filtered.sort((a, b) => {
    if (state.sortBy === "status") return StatusMeta[b.currentStatus].rank - StatusMeta[a.currentStatus].rank;
    return new Date(b[state.sortBy]).getTime() - new Date(a[state.sortBy]).getTime();
  });
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
          <button class="${state.section === "settings" ? "active" : ""}" data-section="settings">Correos de notificación</button>
        </nav>
      </aside>
      <main class="main">
        <div class="user-bar">
          <div>
            <span>Usuario activo</span>
            <strong>${hasActiveUser() ? escapeHtml(state.activeUser) : "Sin identificar"}</strong>
          </div>
          <button data-change-user>${hasActiveUser() ? "Cambiar nombre" : "Indicar nombre"}</button>
          <button class="subtle" data-lock-access>Salir</button>
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
  document.querySelector("[data-lock-access]").addEventListener("click", () => {
    setAccessGranted(false);
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
    const [reports, recipients, emailLog] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
    ]);
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
  } catch (error) {
    state.error = "No se han podido cargar los datos compartidos. Revisa que las tablas de Supabase estén creadas.";
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function withReload(action) {
  state.error = "";
  state.loading = true;
  render();

  try {
    await action();
    const [reports, recipients, emailLog] = await Promise.all([
      reportService.getReports(),
      recipientService.getRecipients(),
      supabaseClient.listEmailLog(),
    ]);
    state.reports = reports;
    state.recipients = recipients;
    state.emailLog = normalizeEmailLog(emailLog);
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
  else if (state.section === "settings") renderSettings();
  else renderReports();
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
    loadSharedData();
  });
}

render();
loadSharedData();
