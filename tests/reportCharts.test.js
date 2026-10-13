import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeReports,renderReportCharts} from '../src/reportCharts.js';
test('radial chart counts current status and class, including legacy IT reports',()=>{
 const reports=[{currentStatus:'RED',category:'IT'},{currentStatus:'RED',category:'PURCHASES'},{currentStatus:'GREEN',category:'INSTALLATIONS'},{currentStatus:'YELLOW'}];
 const c=summarizeReports(reports);
 assert.equal(c.RED.IT,1);assert.equal(c.RED.PURCHASES,1);assert.equal(c.GREEN.INSTALLATIONS,1);assert.equal(c.YELLOW.IT,1);
 const html=renderReportCharts(reports);
 assert.match(html,/Distribución de 4 partes/);
 assert.equal((html.match(/class="chart-segment"/g)||[]).length,7);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('empty and single-segment charts avoid invalid geometry',()=>{
 assert.match(renderReportCharts([]),/Todavía no hay partes/);
 assert.doesNotMatch(renderReportCharts([]),/<svg/);
 const html=renderReportCharts([{currentStatus:'GREEN',category:'IT'}]);
 assert.equal((html.match(/class="chart-segment"/g)||[]).length,2);
 assert.match(html,/stroke-dasharray="1 0"/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
