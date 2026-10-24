/* Netlify függvény: cégnév az adószám alapján (EU VIES). Az űrlap ezzel tölti elő a cégnév mezőt. */
'use strict';
const core = require('../../lib/core');

exports.handler = async (event) => {
  const tax = (event.queryStringParameters || {}).adoszam || '';
  const result = await core.lookupCompany(tax);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(result) };
};
