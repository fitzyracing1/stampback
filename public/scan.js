const stamp = location.pathname.split('/').pop();
const $ = (id) => document.getElementById(id);
const r = await fetch(`/api/stamps/${stamp}`);
const info = await r.json();
if (!r.ok) {
  $('app').innerHTML = `<h1>Unknown stamp</h1><p>${info.error}</p>`;
} else {
  if (info.late) $('msg').textContent = 'The sender\'s deadline has passed, but a late reply still reaches them.';
  if (info.answered) $('msg').textContent = `Already answered: “${info.replies[info.answered.kind]}”. You can update it.`;
  $('choices').innerHTML = Object.entries(info.replies).map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('');
  $('choices').onclick = async (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const res = await fetch(`/api/stamps/${stamp}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: k, note: $('note').value }) });
    const j = await res.json();
    $('app').innerHTML = res.ok ? `<div class="done">✅</div><h1>Sent: “${j.label}”</h1><p>The sender will see it on their desk${j.late ? ' (marked late)' : ''}. You can close this page.</p>` : `<h1>Could not send</h1><p>${j.error}</p>`;
  };
}
