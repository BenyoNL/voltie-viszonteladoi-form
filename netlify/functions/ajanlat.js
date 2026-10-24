/* Netlify függvény: a személyre szabott ajánlat PDF legyártása a kitöltő választásaiból. Nem tárol semmit. */
'use strict';
const core = require('../../lib/core');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Csak POST' };
  if (event.body && event.body.length > 5000) return { statusCode: 413, body: 'Túl nagy kérés' };
  let d;
  try { d = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
  catch (_) { return { statusCode: 400, body: 'Hibás JSON' }; }
  try {
    const { buffer, fileName } = await core.makeOffer(d);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + fileName + '"',
        'Access-Control-Expose-Headers': 'Content-Disposition'
      },
      body: buffer.toString('base64')
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: 'Szerverhiba' };
  }
};
