import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeReports,renderReportCharts,summarizeStatistics} from '../src/reportCharts.js';
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

test('statistics count urgency independently of state and preserve empty classes',()=>{
 const reports=[{category:'IT',currentStatus:'RED',isUrgent:true},{category:'IT',currentStatus:'GREEN',isUrgent:true},{currentStatus:'YELLOW',isUrgent:false},{category:'PURCHASES',currentStatus:'RED'}];
 const stats=summarizeStatistics(reports);
 assert.deepEqual(stats[0],{category:'IT',total:3,urgent:2,byStatus:{GREEN:1,YELLOW:1,RED:1}});
 assert.equal(stats[1].total,0);assert.equal(stats[1].urgent,0);
 assert.equal(stats[2].total,1);assert.equal(stats[2].urgent,0);
 const html=renderReportCharts(reports);
 assert.match(html,/Estadísticas/);assert.match(html,/Urgentes/);
 assert.match(html,/2 de 3 partes \(67 %\)/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
