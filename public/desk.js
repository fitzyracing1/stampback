import { qrSvg } from '/qr.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const [id, key] = location.hash.slice(1).split('.');
const api = (p, o = {}) => fetch(`/api/desks/${id}${p}${p.includes('?') ? '&' : '?'}key=${key}`, o).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; });
const selected = new Set();
let desk;

function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 3500); }
const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function load() {
  try { desk = await api(''); } catch (e) { $('pieces').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const saved = JSON.parse(localStorage.getItem('stampback.desks') || '[]'); const ref = `${id}.${key}`;
  if (!saved.includes(ref)) localStorage.setItem('stampback.desks', JSON.stringify([ref, ...saved]));
  render();
}

function render() {
  const s = desk.summary;
  $('sum').innerHTML = [['waiting', 'waiting'], ['replied', 'replied'], ['late-reply', 'late'], ['not-received', 'not received']]
    .filter(([k]) => s[k]).map(([k, l]) => `<span class="chip ${k}">${s[k]} ${l}</span>`).join('');
  $('pieces').innerHTML = desk.pieces.length ? desk.pieces.map((p) => {
    const last = p.replies[p.replies.length - 1];
    return `<div class="piece ${p.status}">
      <input type="checkbox" data-sel="${p.id}" ${selected.has(p.id) ? 'checked' : ''} aria-label="Select for printing">
      <div class="qr">${qrSvg(p.url, 2, 1)}</div>
      <div><h3>${esc(p.name)}</h3><div class="st ${p.status}">${esc(p.label)}</div>
        <small>${p.days}-day window · due ${when(p.due)} · scanned ${p.scans}×${last ? ` · replied ${when(last.at)}` : ''}${last?.note ? ` · “${esc(last.note)}”` : ''}</small></div>
      <div class="acts"><button class="icon" data-print="${p.id}">Print</button><button class="icon" data-open="${esc(p.url)}">Scan page</button><button class="icon" data-del="${p.id}" title="Remove">✕</button></div>
    </div>`;
  }).join('') : '<p class="empty">No pieces yet. Name one above.</p>';
  $('nsel').textContent = selected.size; $('print').disabled = !selected.size;
}

$('new').onsubmit = async (e) => {
  e.preventDefault(); $('err').textContent = '';
  const f = new FormData(e.target);
  try { await api('/pieces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.get('name'), days: Number(f.get('days')) }) }); e.target.name.value = ''; await load(); }
  catch (err) { $('err').textContent = err.message; }
};

$('pieces').onclick = async (e) => {
  const t = e.target;
  if (t.dataset.sel) { if (t.checked) { if (selected.size >= 8) { t.checked = false; return toast('A sheet holds up to eight stamps.'); } selected.add(t.dataset.sel); } else selected.delete(t.dataset.sel); render(); }
  if (t.dataset.print) open(`/print.html#${id}.${key}.${t.dataset.print}`, '_blank');
  if (t.dataset.open) open(t.dataset.open, '_blank');
  if (t.dataset.del && confirm('Remove this piece from the desk?')) { await api(`/pieces/${t.dataset.del}`, { method: 'DELETE' }); selected.delete(t.dataset.del); load(); }
};
$('print').onclick = () => open(`/print.html#${id}.${key}.${[...selected].join(',')}`, '_blank');
$('copy').onclick = async () => { const link = `${desk?.origin || location.origin}/desk.html#${id}.${key}`; try { await navigator.clipboard.writeText(link); toast('Desk link copied. Open it on your phone.'); } catch { prompt('Desk link', link); } };

let alerts = false;
$('alert').onclick = async () => {
  if (!('Notification' in window)) return toast('This browser has no notifications; the desk still updates live.');
  const p = await Notification.requestPermission();
  alerts = p === 'granted'; $('alert').textContent = alerts ? 'Alerts on' : 'Alert me';
  toast(alerts ? 'You will be alerted while this desk is open.' : 'Notifications were blocked.');
};

const es = new EventSource(`/api/desks/${id}/events?key=${key}`);
es.onmessage = (m) => {
  const ev = JSON.parse(m.data);
  toast(`${ev.name}: ${ev.label}${ev.late ? ' (late)' : ''}`);
  if (alerts) new Notification('Stampback', { body: `${ev.name}: ${ev.label}`, icon: '/icon.svg' });
  load();
};
setInterval(load, 60000); // deadlines pass even without events
load();
