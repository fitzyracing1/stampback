#!/usr/bin/env node
// Stampback server: zero-dependency Node HTTP server + JSON file store.
// PORT (8080), DATA (./data/stampback.json), PUBLIC_URL (origin printed in QR codes; defaults to the request host).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { token, newPiece, addReply, describe, summary, REPLIES, WINDOWS, MAX_SHEET } from './lib/core.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

export function createApp({ dataFile = process.env.DATA ?? join(process.cwd(), 'data', 'stampback.json'), publicUrl = process.env.PUBLIC_URL, now = () => Date.now() } = {}) {
  const store = new Store(dataFile);
  const listeners = new Map(); // deskId -> Set(res)

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }); res.end(JSON.stringify(body)); };
  const body = (req) => new Promise((ok, bad) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); });
  const origin = (req) => publicUrl || `http://${req.headers.host}`;
  const view = (desk, req) => ({
    id: desk.id, created: desk.created, origin: origin(req),
    pieces: desk.pieces.map((p) => ({ ...p, ...describe(p, now()), url: `${origin(req)}/s/${p.stamp}` })),
    summary: summary(desk.pieces, now()),
  });
  const auth = (req, id) => { const d = store.desk(id); const key = new URL(req.url, 'http://x').searchParams.get('key') || req.headers['x-desk-key']; return d && key === d.key ? d : null; };
  const notify = (deskId, event) => { for (const res of listeners.get(deskId) || []) res.write(`data: ${JSON.stringify(event)}\n\n`); };

  async function api(req, res, path) {
    let m;
    if (req.method === 'POST' && path === '/api/desks') {
      const desk = { id: token(8), key: token(16), created: now(), pieces: [] };
      store.data.desks[desk.id] = desk; store.save();
      return json(res, 201, { id: desk.id, key: desk.key, link: `${origin(req)}/desk.html#${desk.id}.${desk.key}` });
    }
    if ((m = path.match(/^\/api\/desks\/(\w+)$/)) && req.method === 'GET') {
      const d = auth(req, m[1]); return d ? json(res, 200, view(d, req)) : json(res, 404, { error: 'No such desk (check the desk link).' });
    }
    if ((m = path.match(/^\/api\/desks\/(\w+)\/pieces$/)) && req.method === 'POST') {
      const d = auth(req, m[1]); if (!d) return json(res, 404, { error: 'No such desk.' });
      const b = await body(req);
      try { const p = newPiece(b.name, b.days, now()); d.pieces.unshift(p); store.save(); return json(res, 201, view(d, req).pieces[0]); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if ((m = path.match(/^\/api\/desks\/(\w+)\/pieces\/(\w+)$/)) && req.method === 'DELETE') {
      const d = auth(req, m[1]); if (!d) return json(res, 404, { error: 'No such desk.' });
      d.pieces = d.pieces.filter((p) => p.id !== m[2]); store.save(); return json(res, 200, { ok: true });
    }
    if ((m = path.match(/^\/api\/desks\/(\w+)\/events$/)) && req.method === 'GET') {
      const d = auth(req, m[1]); if (!d) return json(res, 404, { error: 'No such desk.' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': hello\n\n');
      if (!listeners.has(d.id)) listeners.set(d.id, new Set());
      listeners.get(d.id).add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); listeners.get(d.id)?.delete(res); });
      return;
    }
    if ((m = path.match(/^\/api\/stamps\/(\w+)$/)) && req.method === 'GET') {
      const f = store.findStamp(m[1]); if (!f) return json(res, 404, { error: 'This stamp is not on any desk.' });
      f.piece.scans++; store.save();
      const last = f.piece.replies[f.piece.replies.length - 1];
      return json(res, 200, { stamp: m[1], replies: REPLIES, answered: last ? { kind: last.kind, at: last.at } : null, late: now() > f.piece.due });
    }
    if ((m = path.match(/^\/api\/stamps\/(\w+)\/reply$/)) && req.method === 'POST') {
      const f = store.findStamp(m[1]); if (!f) return json(res, 404, { error: 'This stamp is not on any desk.' });
      const b = await body(req);
      try { addReply(f.piece, b.kind, now(), b.note); } catch (e) { return json(res, 400, { error: e.message }); }
      store.save();
      const event = { type: 'reply', piece: f.piece.id, name: f.piece.name, kind: b.kind, label: REPLIES[b.kind], late: f.piece.replies.at(-1).late };
      notify(f.desk.id, event);
      return json(res, 200, { ok: true, label: REPLIES[b.kind], late: event.late });
    }
    if (path === '/api/config') return json(res, 200, { windows: WINDOWS, replies: REPLIES, maxSheet: MAX_SHEET });
    return json(res, 404, { error: 'Not found' });
  }

  async function serveStatic(req, res, path) {
    if (/^\/s\/\w+$/.test(path)) path = '/scan.html';
    if (path === '/') path = '/index.html';
    const file = normalize(join(ROOT, decodeURIComponent(path)));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      const data = await readFile(file);
      const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream' };
      if (/desk|scan|print/.test(path)) headers['x-robots-tag'] = 'noindex, nofollow';
      res.writeHead(200, headers); res.end(data);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); }
  }

  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      if (path.startsWith('/api/')) return await api(req, res, path);
      if (path === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin(req)}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n  <url><loc>${origin(req)}/llms.txt</loc></url>\n</urlset>\n`); }
      if (path === '/robots.txt') { const txt = await readFile(join(ROOT, 'robots.txt'), 'utf8'); res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(txt.replace('Sitemap: /sitemap.xml', `Sitemap: ${origin(req)}/sitemap.xml`)); }
      return await serveStatic(req, res, path);
    }
    catch (e) { json(res, 500, { error: e.message }); }
  });
  return { server, store };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  createApp().server.listen(port, () => console.log(`Stampback on http://localhost:${port}`));
}
