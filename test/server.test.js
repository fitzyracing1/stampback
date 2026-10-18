import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

let base, app, clock = Date.parse('2026-10-01T12:00:00Z');
const dataFile = join(mkdtempSync(join(tmpdir(), 'stampback-')), 'db.json');
before(async () => { app = createApp({ dataFile, now: () => clock }); await new Promise((r) => app.server.listen(0, r)); base = `http://localhost:${app.server.address().port}`; });
after(() => app.server.close());
const j = async (path, o) => { const r = await fetch(base + path, o); return { status: r.status, body: await r.json() }; };
const post = (path, body) => j(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });

test('desk → piece → scan → reply round trip, with live event', async () => {
  const desk = (await post('/api/desks')).body;
  assert.match(desk.link, /\/desk\.html#\w+\.\w+$/);
  assert.equal((await j(`/api/desks/${desk.id}?key=wrong`)).status, 404);
  const bad = await post(`/api/desks/${desk.id}/pieces?key=${desk.key}`, { name: 'x@y.com', days: 7 });
  assert.equal(bad.status, 400);
  const piece = (await post(`/api/desks/${desk.id}/pieces?key=${desk.key}`, { name: 'Birthday card', days: 7 })).body;
  assert.equal(piece.status, 'waiting');
  assert.ok(piece.url.endsWith(`/s/${piece.stamp}`));

  // live events
  const ctrl = new AbortController();
  const es = await fetch(`${base}/api/desks/${desk.id}/events?key=${desk.key}`, { signal: ctrl.signal });
  const reader = es.body.getReader();
  const scan = await j(`/api/stamps/${piece.stamp}`);
  assert.equal(scan.status, 200);
  assert.equal(scan.body.replies['got-it'], 'Got it');
  assert.equal(JSON.stringify(scan.body).includes('Birthday'), false, 'scanner never sees the nickname');
  const reply = await post(`/api/stamps/${piece.stamp}/reply`, { kind: 'got-it', note: 'arrived!' });
  assert.equal(reply.body.label, 'Got it');
  let text = '';
  while (!text.includes('data:')) text += new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /"kind":"got-it"/);
  ctrl.abort();

  const view = (await j(`/api/desks/${desk.id}?key=${desk.key}`)).body;
  assert.equal(view.pieces[0].status, 'replied');
  assert.equal(view.pieces[0].scans, 1);
  assert.equal(view.summary.replied, 1);
  assert.ok(JSON.parse(readFileSync(dataFile, 'utf8')).desks[desk.id], 'persisted');
});

test('deadline passes with no scan → not received; late reply is marked late', async () => {
  const desk = (await post('/api/desks')).body;
  const piece = (await post(`/api/desks/${desk.id}/pieces?key=${desk.key}`, { name: 'Tax forms', days: 3 })).body;
  clock += 4 * 864e5;
  assert.equal((await j(`/api/desks/${desk.id}?key=${desk.key}`)).body.pieces[0].status, 'not-received');
  const r = await post(`/api/stamps/${piece.stamp}/reply`, { kind: 'returning' });
  assert.equal(r.body.late, true);
  assert.equal((await j(`/api/desks/${desk.id}?key=${desk.key}`)).body.pieces[0].status, 'late-reply');
});

test('pages, SEO files and noindex', async () => {
  const home = await fetch(base + '/');
  assert.match(await home.text(), /google-site-verification/);
  const scan = await fetch(base + '/s/abc');
  assert.equal(scan.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), new RegExp(`<loc>${base}/</loc>`));
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/desk\.html/);
  assert.equal((await fetch(base + '/google52ab61f0b5e00b30.html')).status, 200);
  assert.equal((await fetch(base + '/../server.js')).status, 404);
  assert.equal((await j('/api/stamps/nope')).status, 404);
});
