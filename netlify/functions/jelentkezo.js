/* Netlify függvény: egy meglévő jelentkező ismert adatai az űrlap előtöltéséhez (az e-mail és a telefon részlegesen elrejtve). */
'use strict';
const core = require('../../lib/core');

exports.handler = async (event) => {
  const id = (event.queryStringParameters || {}).id || '';
  const result = await core.lookupKnown(id);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(result) };
};
