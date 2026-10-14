import { categories, statuses, CategoryMeta, StatusMeta } from "./models.js";

const statusColors = { GREEN: "#1f9d55", YELLOW: "#b7790a", RED: "#d64545" };
const categoryColors = { IT: "#2563eb", INSTALLATIONS: "#0d9488", PURCHASES: "#8054c7" };

export function summarizeReports(reports) {
  const counts = Object.fromEntries(statuses.map(status => [status,
    Object.fromEntries(categories.map(category => [category, 0]))]));
  for (const report of reports) {
    // Older reports without a class are treated as IT throughout the app.
    const category = report.category ?? "IT";
    if (counts[report.currentStatus]?.[category] !== undefined) counts[report.currentStatus][category]++;
  }
  return counts;
}

function segment(start, count, total, radius, color, label) {
  if (!count) return "";
  return `<circle class="chart-segment" cx="180" cy="180" r="${radius}" fill="none"
    stroke="${color}" stroke-width="28" pathLength="${total}"
    stroke-dasharray="${count} ${total - count}" stroke-dashoffset="${-start}"
    transform="rotate(-90 180 180)"><title>${label}: ${count} (${Math.round(count / total * 100)} %)</title></circle>`;
}

export function summarizeStatistics(reports) {
  const counts = summarizeReports(reports);
  return categories.map(category => {
    const byStatus = Object.fromEntries(statuses.map(status => [status, counts[status][category]]));
    const total = statuses.reduce((sum, status) => sum + byStatus[status], 0);
    const urgent = reports.filter(report => (report.category ?? "IT") === category && statuses.includes(report.currentStatus) && report.isUrgent === true).length;
    return { category, total, urgent, byStatus };
  });
}

function renderStatistics(reports) {
  const statistics = summarizeStatistics(reports);
  const order = ["RED", "YELLOW", "GREEN"];
  const total = statistics.reduce((sum, category) => sum + category.total, 0);
  const urgentTotal = statistics.reduce((sum, category) => sum + category.urgent, 0);
  const bar = (label, count, denominator, color) => {
    const percent = denominator ? Math.round(count / denominator * 100) : 0;
    return `<div class="stat-row"><span>${label}</span><div class="stat-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${count} de ${denominator} partes (${percent} %)" style="--stat-color:${color}"><span style="width:${percent}%"></span></div><strong>${count}</strong></div>`;
  };
  return `<section class="statistics-grid" aria-label="Estadísticas por clase">
    ${statistics.map(item => `<article class="statistics-card">
      <h2><span class="chart-swatch" style="background:${categoryColors[item.category]}" aria-hidden="true"></span>${CategoryMeta[item.category].label}<span class="stat-category-total">${item.total} ${item.total === 1 ? "parte" : "partes"}</span></h2>
      <div class="stat-bars">${order.map(status => bar(StatusMeta[status].label, item.byStatus[status], item.total, statusColors[status])).join("")}</div>
      <div class="stat-urgency">${bar("Urgentes", item.urgent, item.total, "#b42318")}</div>
    </article>`).join("")}
    </section>
    <section class="statistics-summary" aria-labelledby="stats-summary-title">
      <h2 id="stats-summary-title">Resumen general <span class="stat-category-total">${total} ${total === 1 ? "parte" : "partes"}</span></h2>
      <div class="stat-totals">${order.map(status => `<div><strong style="color:${statusColors[status]}">${statistics.reduce((sum,item) => sum + item.byStatus[status],0)}</strong><span>${StatusMeta[status].label}</span></div>`).join("")}
        <div><strong style="color:#b42318">${urgentTotal}</strong><span>Urgentes</span></div></div>
      <p class="stat-footnote">Los urgentes son los partes marcados como urgentes y pueden estar en cualquiera de los estados.</p>
    </section>`;
}

export function renderReportCharts(reports) {
  const counts = summarizeReports(reports);
  const statusTotal = status => categories.reduce((sum, category) => sum + counts[status][category], 0);
  const classTotal = category => statuses.reduce((sum, status) => sum + counts[status][category], 0);
  const total = statuses.reduce((sum, status) => sum + statusTotal(status), 0);
  let offset = 0;
  const rings = statuses.map(status => {
    const inner = segment(offset, statusTotal(status), total, 100, statusColors[status], StatusMeta[status].label);
    const outer = categories.map(category => {
      const count = counts[status][category];
      const arc = segment(offset, count, total, 142, categoryColors[category], `${StatusMeta[status].label} · ${CategoryMeta[category].label}`);
      offset += count;
      return arc;
    }).join("");
    return inner + outer;
  }).join("");
  const legend = (keys, meta, colors, getCount) => keys.map(key => `<li><span class="chart-swatch" style="background:${colors[key]}" aria-hidden="true"></span><span>${meta[key].label}</span><strong>${getCount(key)}</strong><small>${total ? Math.round(getCount(key) / total * 100) : 0} %</small></li>`).join("");
  return `<div class="page-header"><div><p class="eyebrow">Partes</p><h1>Estadísticas</h1></div></div>
    <p class="muted">Todos los partes, según su estado actual y clase. Los filtros de las pestañas de partes no se aplican aquí.</p>
    ${renderStatistics(reports)}
    <h2 class="statistics-chart-heading">Distribución de partes</h2>
    ${!total ? `<div class="empty">Todavía no hay partes para mostrar en el gráfico.</div>` : `
    <section class="charts-panel">
      <figure class="radial-chart">
        <svg viewBox="0 0 360 360" role="img" aria-labelledby="report-chart-title report-chart-description">
          <title id="report-chart-title">Distribución de ${total} partes por estado y clase</title>
          <desc id="report-chart-description">El anillo interior representa los estados. El exterior divide cada estado por clase. Las cantidades se detallan en las leyendas y la tabla.</desc>
          ${rings}<text x="180" y="179" text-anchor="middle" class="chart-total">${total}</text>
          <text x="180" y="204" text-anchor="middle" class="chart-total-label">partes en total</text>
        </svg>
        <figcaption>Interior: estado · Exterior: clase dentro de cada estado</figcaption>
      </figure>
      <div class="chart-legends"><section><h2>Estado <span>Anillo interior</span></h2><ul>${legend(statuses, StatusMeta, statusColors, statusTotal)}</ul></section>
      <section><h2>Clase <span>Anillo exterior</span></h2><ul>${legend(categories, CategoryMeta, categoryColors, classTotal)}</ul></section></div>
    </section>
    <div class="chart-table-wrap"><table class="chart-table"><caption>Partes por estado y clase</caption><thead><tr><th scope="col">Estado</th>${categories.map(c => `<th scope="col">${CategoryMeta[c].label}</th>`).join("")}<th scope="col">Total</th></tr></thead>
      <tbody>${statuses.map(status => `<tr><th scope="row">${StatusMeta[status].label}</th>${categories.map(category => `<td>${counts[status][category]}</td>`).join("")}<td><strong>${statusTotal(status)}</strong></td></tr>`).join("")}</tbody>
      <tfoot><tr><th scope="row">Total</th>${categories.map(category => `<td>${classTotal(category)}</td>`).join("")}<td><strong>${total}</strong></td></tr></tfoot></table></div>`}`;
}
