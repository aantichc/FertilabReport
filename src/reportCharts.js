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
  return `<div class="page-header"><div><p class="eyebrow">Gráficas</p><h1>Distribución de partes</h1></div></div>
    <p class="muted">Todos los partes, según su estado actual y clase. Los filtros de las pestañas de partes no se aplican aquí.</p>
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
