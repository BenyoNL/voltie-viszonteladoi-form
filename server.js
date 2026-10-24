/* Voltie űrlapszerver (helyi futtatáshoz): kiszolgálja az urlap/ mappát, és a jelentkezést a közös logikának (lib/core.js)
   adja át. Netlify-on ezt a netlify/functions mappa függvényei helyettesítik. Futtatás: node server.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('./lib/core');

const PORT = Number(process.env.PORT) || 3000;
const WEB_DIR = path.join(__dirname, 'urlap');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

/* ---- egyszerű IP-korlát: 10 beküldés / perc ---- */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now); hits.set(ip, list);
  return list.length > 10;
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readJson(req, res, limit) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > limit) { send(res, 413, { error: 'Túl nagy kérés' }); return null; } }
  try { return JSON.parse(body); } catch (_) { send(res, 400, { error: 'Hibás JSON' }); return null; }
}

async function handleReseller(req, res) {
  if (limited(req.socket.remoteAddress || '')) return send(res, 429, { error: 'Túl sok kérés' });
  const payload = await readJson(req, res, 60000);
  if (!payload) return;
  const r = await core.submit(payload);
  send(res, r.status, r.body);
}

async function handleOffer(req, res) {
  const d = await readJson(req, res, 5000);
  if (!d) return;
  const { buffer, fileName } = await core.makeOffer(d);
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + fileName + '"', 'Access-Control-Expose-Headers': 'Content-Disposition', 'Content-Length': buffer.length });
  res.end(buffer);
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/viszontelado.html';
  const file = path.join(WEB_DIR, path.normalize(rel));
  if (!file.startsWith(WEB_DIR + path.sep) || !TYPES[path.extname(file)]) { res.writeHead(404); return res.end('Nincs ilyen oldal'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Nincs ilyen oldal'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

const fail = (res) => (e) => { console.error(e); send(res, 500, { error: 'Szerverhiba' }); };

http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (req.method === 'POST' && route === '/api/viszontelado') return handleReseller(req, res).catch(fail(res));
  if (req.method === 'POST' && route === '/api/ajanlat') return handleOffer(req, res).catch(fail(res));
  if (req.method === 'GET' && route === '/api/verzio') return send(res, 200, core.info());
  if (req.method === 'GET' && route === '/api/cegnev') {
    if (limited(req.socket.remoteAddress || '')) return send(res, 429, { ok: false });
    return core.lookupCompany(new URL(req.url, 'http://x').searchParams.get('adoszam')).then((r) => send(res, 200, r)).catch(fail(res));
  }
  if (req.method === 'GET' && route === '/api/jelentkezo') {
    if (limited(req.socket.remoteAddress || '')) return send(res, 429, { ok: false });
    return core.lookupKnown(new URL(req.url, 'http://x').searchParams.get('id')).then((r) => send(res, 200, r)).catch(fail(res));
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => {
  console.log('Voltie űrlapok: http://localhost:' + PORT + '/viszontelado.html  és  /altalanos.html');
  console.log(core.DRY_RUN ? 'MÓD: DRY RUN (nincs API kulcs, a CRM-be nem megy semmi)' : 'MÓD: ÉLES, MiniCRM kategória ' + core.CATEGORY_ID);
});
