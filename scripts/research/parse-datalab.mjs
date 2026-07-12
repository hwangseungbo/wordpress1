// Created: 2026-07-12 03:48:04
import fs from 'fs';
const h = fs.readFileSync('datalab-body.txt', 'utf8');
const start = h.indexOf('[{"title":');
if (start < 0) { console.log('no data'); process.exit(0); }
let depth = 0, end = -1, inStr = false, esc = false;
for (let i = start; i < h.length; i++) {
  const c = h[i];
  if (esc) { esc = false; continue; }
  if (c === '\\') { esc = true; continue; }
  if (c === '"') { inStr = !inStr; continue; }
  if (inStr) continue;
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const arr = JSON.parse(h.slice(start, end));
const fmt = d => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
const rows = [];
for (const g of arr) {
  const data = g.data || [];
  const ratios = data.map(x => x.value);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const max = Math.max(...ratios);
  const maxPt = data.find(x => x.value === max);
  const recent = data.slice(-5).map(x => fmt(x.period) + ':' + x.value.toFixed(1));
  rows.push({ title: g.title, avg: +avg.toFixed(1), max: +max.toFixed(1), maxDate: fmt(maxPt.period), n: ratios.length, recent });
}
rows.sort((a, b) => b.avg - a.avg);
for (const r of rows) {
  console.log(r.title.padEnd(9), 'avg=' + String(r.avg).padStart(5), 'max=' + String(r.max).padStart(5) + '(' + r.maxDate + ')', 'n=' + r.n);
  console.log('   최근5일:', r.recent.join('  '));
}
