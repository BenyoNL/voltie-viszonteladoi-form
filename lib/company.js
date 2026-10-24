/* Cégnév az adószám alapján. Az űrlap ezzel előtölti a cégnév mezőt.
   Források, sorrendben:
   1. NAV Online Számla adózó-lekérdezés (lib/nav.js): minden érvényes adószámra megadja a nevet, de technikai felhasználó kell hozzá.
      Csak akkor használjuk, ha a NAV_* környezeti változók be vannak állítva.
   2. EU VIES: nyilvános, ingyenes, kulcs nélkül működik, de a magyar adószámoknak csak a kétharmadát ismeri.
   Ha egyik sem ad nevet (vagy nem elérhető), nincs előtöltés, és a kitöltő kézzel megadja a nevet, a jelentkezés ettől nem akad el. */
'use strict';
const nav = require('./nav');

const VIES = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/HU/vat/';

/* a hivatalos cégforma-szövegek rövid alakja */
const FORMS = [
  [/\bKORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG\b/i, 'Kft.'],
  [/\bNYILVÁNOSAN MŰKÖDŐ RÉSZVÉNYTÁRSASÁG\b/i, 'Nyrt.'],
  [/\bZÁRTKÖRŰEN MŰKÖDŐ RÉSZVÉNYTÁRSASÁG\b/i, 'Zrt.'],
  [/\bRÉSZVÉNYTÁRSASÁG\b/i, 'Zrt.'],
  [/\bBETÉTI TÁRSASÁG\b/i, 'Bt.'],
  [/\bKÖZKERESETI TÁRSASÁG\b/i, 'Kkt.'],
  [/\bKÖZHASZNÚ TÁRSASÁG\b/i, 'Kht.'],
  [/\bEGYÉNI VÁLLALKOZÓ(?![A-Za-zÀ-ž])/i, 'EV'],
  [/\bE\.\s?V\.?$/i, 'EV']
];

/* "VOLTIE KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG" -> "Voltie Kft.", "BOROS GYÖRGY EGYÉNI VÁLLALKOZÓ" -> "Boros György EV" */
function tidyName(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  let suffix = '';
  for (const [re, short] of FORMS) {
    if (re.test(s)) { s = s.replace(re, '').replace(/\s+/g, ' ').trim(); suffix = short; break; }
  }
  /* csupa nagybetűs nevet kisbetűsítünk, minden szó első betűje nagy marad; a vegyes írásmódot nem bántjuk */
  const isUpper = s === s.toLocaleUpperCase('hu') && s !== s.toLocaleLowerCase('hu');
  if (isUpper) {
    s = s.toLocaleLowerCase('hu').split(' ').map((w, i) => (i > 0 && w === 'és' ? w : w.split('-').map((p) => p.charAt(0).toLocaleUpperCase('hu') + p.slice(1)).join('-'))).join(' ');
  }
  s = s.replace(/ Ev$/, ' EV');   // a nagybetűs "EV" végződés maradjon "EV"
  return (s + (suffix ? ' ' + suffix : '')).trim();
}

/* kis memória-gyorsítótár: a cégnevek ritkán változnak, így a NAV és a VIES nem kap felesleges kérést */
const cache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000, CACHE_MAX = 500;

/* A magyar adószám első 8 számjegye az adóalany törzsszáma (12345678-1-23). Csak a 11 jegyű adószámra keresünk. */
async function lookupCompany(rawTax, fetchImpl, env) {
  const digits = String(rawTax || '').replace(/\D/g, '');
  /* a 10 jegyű adóazonosító jelből nem képezhető megbízhatóan az adószám törzsszáma */
  if (digits.length < 11) return { ok: false };
  const t8 = digits.slice(0, 8);
  const hit = cache.get(t8);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const doFetch = fetchImpl || fetch;
  let result = { ok: false };
  const cfg = nav.config(env);
  if (cfg) {
    try {
      const r = await nav.queryTaxpayer(cfg, t8, doFetch, 3500);
      const name = r.valid ? tidyName(r.name) : '';
      if (name) result = { ok: true, name, source: 'NAV' };
    } catch (e) { console.error('[NAV lekérdezés] ' + e.message); }
  }
  if (!result.ok) {
    try {
      const r = await doFetch(VIES + t8, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const j = await r.json();
        const name = tidyName(j && j.isValid ? j.name : '');
        if (name && name !== '---') result = { ok: true, name, source: 'VIES' };
      }
    } catch (_) { /* a VIES nem elérhető: nincs előtöltés */ }
  }
  /* csak a találatot tároljuk (a hibát nem), hogy egy átmeneti kimaradás ne maradjon meg */
  if (result.ok) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(t8, { at: Date.now(), result });
  }
  return result;
}

module.exports = { lookupCompany, tidyName, navConfigured: (env) => !!nav.config(env) };
