/* Netlify függvény: a viszonteladói jelentkezés fogadása és továbbítása a MiniCRM-be.
   Az API kulcs a Netlify környezeti változóiban van (MINICRM_SYSTEM_ID, MINICRM_API_KEY), a böngésző sosem látja. */
'use strict';
const core = require('../../lib/core');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') return json(200, core.info());   // /api/verzio: melyik kód fut
  if (event.httpMethod !== 'POST') return json(405, { error: 'Csak POST' });
  if (event.body && event.body.length > 60000) return json(413, { error: 'Túl nagy kérés' });
  let payload;
  try { payload = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
  catch (_) { return json(400, { error: 'Hibás JSON' }); }
  try {
    const r = await core.submit(payload);
    return json(r.status, r.body);
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Szerverhiba' });
  }
};
