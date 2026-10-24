/* NAV Online Számla (v3) adózó-lekérdezés: adószámból a hivatalos név.
   A queryTaxpayer művelet minden érvényes adószámra megadja a nevet (az alanyi adómentesekre és az egyéni vállalkozókra is),
   szemben a VIES-szel, amely a magyar adószámoknak csak a kétharmadát ismeri.
   Technikai felhasználó kell hozzá (lásd NETLIFY.md). A hitelesítő adatok csak környezeti változókból jönnek:
     NAV_LOGIN        a technikai felhasználó neve
     NAV_PASSWORD     a technikai felhasználó jelszava (vagy NAV_PASSWORD_HASH: a jelszó SHA-512 hash-e, nagybetűs hexában)
     NAV_SIGN_KEY     az aláírókulcs (a "cserekulcs" ehhez a művelethez nem kell)
     NAV_TAX_NUMBER   a cég adószáma (az első 8 számjegy, a törzsszám számít)
   Opcionális: NAV_BASE_URL (alapból az éles rendszer), NAV_SOFTWARE_ID (18 karakter, [0-9A-Z-]). */
'use strict';
const crypto = require('crypto');

const PROD = 'https://api.onlineszamla.nav.gov.hu/invoiceService/v3';
const NS_API = 'http://schemas.nav.gov.hu/OSA/3.0/api';
const NS_COMMON = 'http://schemas.nav.gov.hu/NTCA/1.0/common';

const sha512 = (s) => crypto.createHash('sha512').update(s, 'utf8').digest('hex').toUpperCase();
const sha3 = (s) => crypto.createHash('sha3-512').update(s, 'utf8').digest('hex').toUpperCase();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/* A beállítás, vagy null, ha nincs (teljesen) megadva: ilyenkor a NAV-lekérdezés ki van kapcsolva. */
function config(env) {
  const e = env || process.env;
  const taxNumber = String(e.NAV_TAX_NUMBER || '').replace(/\D/g, '').slice(0, 8);
  const passwordHash = e.NAV_PASSWORD_HASH ? String(e.NAV_PASSWORD_HASH).toUpperCase() : (e.NAV_PASSWORD ? sha512(e.NAV_PASSWORD) : '');
  if (!e.NAV_LOGIN || !passwordHash || !e.NAV_SIGN_KEY || taxNumber.length !== 8) return null;
  return {
    login: e.NAV_LOGIN, passwordHash, signKey: e.NAV_SIGN_KEY, taxNumber,
    baseUrl: (e.NAV_BASE_URL || PROD).replace(/\/+$/, ''),
    software: {
      id: e.NAV_SOFTWARE_ID || 'HU' + taxNumber + 'FORM0001',   // 18 karakter: ország + törzsszám + azonosító
      name: 'Voltie viszonteladoi urlap', operation: 'ONLINE_SERVICE', mainVersion: '1.0',
      devName: 'Voltie Kft.', devContact: 'toth.bence@voltie.eu', devCountryCode: 'HU'
    }
  };
}

/* Egyedi kérésazonosító: [+a-zA-Z0-9_], legfeljebb 30 karakter */
const newRequestId = () => ('VF' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex')).toUpperCase().slice(0, 30);

/* A kérés XML-je. Az aláírás: SHA3-512(kérésazonosító + időbélyeg ééééhhnnóópp'mm' (UTC, ezredmásodperc nélkül) + aláírókulcs), nagybetűs hexában. */
function buildRequest(cfg, taxNumber8, now, requestId) {
  const when = now || new Date();
  const id = requestId || newRequestId();
  const timestamp = when.toISOString();                       // 2026-10-24T12:00:00.000Z
  const stamp = timestamp.replace(/[^0-9]/g, '').slice(0, 14);  // 20261024120000
  const signature = sha3(id + stamp + cfg.signKey);
  const s = cfg.software;
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<QueryTaxpayerRequest xmlns="' + NS_API + '" xmlns:common="' + NS_COMMON + '">' +
    '<common:header><common:requestId>' + id + '</common:requestId><common:timestamp>' + timestamp + '</common:timestamp>' +
    '<common:requestVersion>3.0</common:requestVersion><common:headerVersion>1.0</common:headerVersion></common:header>' +
    '<common:user><common:login>' + esc(cfg.login) + '</common:login><common:passwordHash cryptoType="SHA-512">' + cfg.passwordHash + '</common:passwordHash>' +
    '<common:taxNumber>' + cfg.taxNumber + '</common:taxNumber><common:requestSignature cryptoType="SHA3-512">' + signature + '</common:requestSignature></common:user>' +
    '<software><softwareId>' + esc(s.id) + '</softwareId><softwareName>' + esc(s.name) + '</softwareName><softwareOperation>' + s.operation + '</softwareOperation>' +
    '<softwareMainVersion>' + esc(s.mainVersion) + '</softwareMainVersion><softwareDevName>' + esc(s.devName) + '</softwareDevName>' +
    '<softwareDevContact>' + esc(s.devContact) + '</softwareDevContact><softwareDevCountryCode>' + s.devCountryCode + '</softwareDevCountryCode></software>' +
    '<taxNumber>' + taxNumber8 + '</taxNumber></QueryTaxpayerRequest>';
}

const tag = (xml, name) => {
  const m = new RegExp('<(?:[A-Za-z0-9]+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?' + name + '>').exec(xml);
  return m ? unesc(m[1].trim()) : '';
};

/* A válasz értelmezése. Hibánál kivételt dob (a hívó tartalékra vált), a hibaüzenetben nincs titok. */
function parseResponse(xml) {
  const text = String(xml || '');
  if (!/^\s*<\?xml/.test(text)) throw new Error('a NAV nem XML-t adott vissza');
  if (/<(?:[A-Za-z0-9]+:)?General(Error|Exception)Response/.test(text) || tag(text, 'funcCode') !== 'OK') {
    const code = tag(text, 'errorCode') || tag(text, 'funcCode') || 'ismeretlen';
    throw new Error('NAV hiba: ' + code + (tag(text, 'message') ? ' (' + tag(text, 'message').slice(0, 160) + ')' : ''));
  }
  if (tag(text, 'taxpayerValidity') !== 'true') return { valid: false, name: '' };
  return { valid: true, name: tag(text, 'taxpayerName'), shortName: tag(text, 'taxpayerShortName') };
}

/* Az adózó neve az adószám (első 8 számjegy) alapján. */
async function queryTaxpayer(cfg, taxNumber8, fetchImpl, timeoutMs) {
  const body = buildRequest(cfg, taxNumber8);
  const r = await (fetchImpl || fetch)(cfg.baseUrl + '/queryTaxpayer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml;charset=UTF-8', Accept: 'application/xml' },
    body,
    signal: AbortSignal.timeout(timeoutMs || 3500)
  });
  return parseResponse(await r.text());
}

module.exports = { config, queryTaxpayer, buildRequest, parseResponse, sha3, sha512 };
