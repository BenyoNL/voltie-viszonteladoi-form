/* A viszonteladói jelentkezés közös logikája. Ezt használja a helyi szerver (server.js) és a Netlify függvények is.
   Az API kulcs csak a környezeti változókból (.env vagy a Netlify beállításai) jön, a böngésző sosem látja. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findExisting, pickMatch } = require('./dedupe');
const known = require('./known');
const { lookupCompany, navConfigured } = require('./company');
const { closest } = require('./match');
const { buildOffer, offerFileName } = require('../offer');
/* A JSON-ok require-ral töltődnek, így a Netlify csomagolója is beleteszi őket */
const schema = require('../minicrm-69-mezok.json');
const mapping = require('../crm-mapping.json');

/* ---- .env betöltése (csak helyben; Netlify-on a környezeti változók kellenek) ---- */
try {
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (_) { /* nincs .env */ }

const env = process.env;
const API_BASE = env.MINICRM_API_BASE || 'https://r3.minicrm.hu/Api/R3';
const SYSTEM_ID = env.MINICRM_SYSTEM_ID || '';
const API_KEY = env.MINICRM_API_KEY || '';
const NOTE_FIELD = env.MINICRM_NOTE_FIELD || 'OsszesValasz2';
const MULTI_FORMAT = env.MINICRM_MULTI_FORMAT || 'comma';   // comma | semicolon | array
const OWNER_ID = Number(env.MINICRM_USER_ID || 164978);      // felelős: Tóth Bence
const TODO_TEXT = env.MINICRM_TODO_TEXT || 'Viszonteladói csatlakozó';
const TODO_CALL_TEXT = env.MINICRM_TODO_CALL_TEXT || 'Hívd fel, kért töltőt';
/* Meglévő jelentkező linkjének titkos kulcsa: az adatlap Hash mezője, vagy egy saját mező (pl. UrlapToken) */
const TOKEN_FIELD = env.LINK_TOKEN_FIELD || '';
/* LINK_REQUIRE_TOKEN=1 esetén kulcs nélkül nem lehet meglévő adatlapot átírni */
const REQUIRE_TOKEN = env.LINK_REQUIRE_TOKEN === '1';
const DRY_RUN = !SYSTEM_ID || !API_KEY;
/* Id nélküli linkről érkező kitöltésnél a program e-mail és adószám alapján keres meglévő jelentkezőt (LINK_DEDUPE=0 kikapcsolja).
   Csak a még nem kitöltött státuszú adatlap frissíthető (alapból "Régi jelentkező, kérdőív kiküldve" és "Bejövő email"). */
const DEDUPE = env.LINK_DEDUPE !== '0';
/* A keresésre legfeljebb ennyi ideje van (ezredmásodperc): a Netlify függvények 10 másodperc után leállnak, ezért ha a MiniCRM lassú,
   a keresést kihagyjuk, és a jelentkezés inkább új adatlapot kap, mint hogy elvesszen. */
const DEDUPE_BUDGET_MS = Number(env.LINK_DEDUPE_TIMEOUT_MS) || 4000;
function withTimeout(promise, ms) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('időtúllépés (' + ms + ' ms)')), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
const CATEGORY_ID = Number(env.MINICRM_CATEGORY_ID || schema.CategoryId || 69);
const ST = mapping.statusIds;
const UPDATABLE = (env.LINK_UPDATE_STATUSES ? env.LINK_UPDATE_STATUSES.split(',').map(Number) : [ST.imported, ST.new]).filter(Boolean);

/* technikai név → { tipus, ertekek } a MiniCRM sémából */
const FIELD = {};
schema.mezok.forEach((m) => { if (m.ertekek || !FIELD[m.technikai_nev]) FIELD[m.technikai_nev] = m; });

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max || 500); }
function raw(a, id) { const x = a[id]; return x ? x.value : ''; }
function text(a, id) { const v = raw(a, id); return Array.isArray(v) ? v.join('; ') : clean(v, 2000); }
function has(v, x) { return (Array.isArray(v) ? v : [v]).indexOf(x) > -1; }
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Az adatlap azonosítója a linkből: a sima szám vagy a teljes adatlap URL (pl. https://r3.minicrm.hu/<rendszerazonosító>/#Project-69/<azonosító>) végéről */
function extractId(v) {
  const m = /(\d{1,12})\/?\s*$/.exec(String(v || ''));
  return m ? m[1] : '';
}

/* A MiniCRM mezőinek típusa és megengedett értékei. Az élő sémát (Schema/Project/<kategória>) tíz percig tároljuk, így a MiniCRM-ben
   átírt vagy új listaértékek (pl. egy kijavított elírás) külön beavatkozás nélkül működnek. Ha a lekérés nem sikerül, a
   minicrm-69-mezok.json másolat szolgál tartalékként. A többválasztós mezők lehetőségeinek azonosítója kettő hatványa (1, 2, 4, 8...). */
let liveSchema = null, liveAt = 0;
async function ensureSchema() {
  if (DRY_RUN || (liveSchema && Date.now() - liveAt < 10 * 60 * 1000)) return;
  try {
    const j = await withTimeout(minicrm('GET', '/Schema/Project/' + CATEGORY_ID), 3000);
    const map = {};
    Object.keys(j).forEach((k) => {
      const v = j[k];
      if (v && typeof v === 'object') {
        const ids = Object.keys(v).map(Number);
        const multi = ids.length > 0 && ids.every((n) => n > 0 && (n & (n - 1)) === 0);
        map[k] = { tipus: multi ? 'Többválasztós' : 'Lista (egy érték)', ertekek: Object.values(v).map(String) };
      } else if (/^(Int|Float)/.test(String(v))) map[k] = { tipus: 'Szám' };
      else map[k] = {};
    });
    liveSchema = map; liveAt = Date.now();
  } catch (e) {
    logError('séma lekérése (a tartalék másolatot használjuk)', e, {});
    if (!liveSchema) liveAt = Date.now() - 9 * 60 * 1000;   // egy perc múlva újra próbáljuk
  }
}
const fieldInfo = (tech) => (liveSchema && liveSchema[tech]) || FIELD[tech] || {};

/* Egy válasz átalakítása a MiniCRM mező típusa és megengedett értékei szerint.
   Lista és többválasztós mezőbe csak a MiniCRM listájában szereplő érték mehet (tűrő párosítással, lásd match.js);
   ami nem illik, az "Egyéb" (ha van ilyen érték), különben kimarad (az OsszesValasz2 mezőben úgyis benne lesz). */
function coerce(tech, value) {
  const f = fieldInfo(tech);
  const map = mapping.valueMap[tech] || {};
  const list = (Array.isArray(value) ? value : [value]).map((v) => clean(v, 300)).filter(Boolean).map((v) => map[v] || v);
  if (!list.length) return undefined;
  if (f.ertekek) {
    const ok = list.map((v) => closest(v, f.ertekek) || (f.ertekek.indexOf('Egyéb') > -1 ? 'Egyéb' : null)).filter(Boolean);
    const uniq = ok.filter((v, i) => ok.indexOf(v) === i);
    if (!uniq.length) return undefined;
    if (/Többválasztós/.test(f.tipus)) return MULTI_FORMAT === 'array' ? uniq : uniq.join(MULTI_FORMAT === 'semicolon' ? ';' : ',');
    return uniq[0];
  }
  if (/Szám/.test(f.tipus || '')) { const n = Number(list[0]); return Number.isFinite(n) ? n : undefined; }
  return list.join('; ');
}

/* A MiniCRM API percenként korlátozott számú kérést enged (HTTP 429). Egyszerre sok jelentkezőnél ezért a kérést röviden várakoztatva
   újrapróbáljuk (a Retry-After fejlécet követve). Írásnál csak a 429-et ismételjük (azt a MiniCRM nem dolgozta fel), így nem keletkezik duplikátum;
   olvasásnál az átmeneti 502/503/504 hibát is. */
const RETRY_WAIT_MS = Number(env.MINICRM_RETRY_WAIT_MS) || 500;
async function minicrm(method, route, body) {
  const retries = method === 'GET' ? 1 : 3;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_BASE + route, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(SYSTEM_ID + ':' + API_KEY).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const txt = await res.text();
    if (env.MINICRM_DEBUG) console.log('[MiniCRM]', method, route, '→', res.status, '\n  kérés:', JSON.stringify(body), '\n  válasz:', txt.slice(0, 500));
    const transient = res.status === 429 || (method === 'GET' && [502, 503, 504].includes(res.status));
    if (transient && attempt < retries) {
      const wait = Math.min((Number(res.headers.get('retry-after')) || 0) * 1000 || RETRY_WAIT_MS * 2 ** attempt, 3000) + Math.random() * 250;
      console.warn('[MiniCRM] ' + res.status + ' ' + method + ' ' + route + ', újrapróbálás ' + Math.round(wait) + ' ms múlva (' + (attempt + 1) + '/' + retries + ')');
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error('MiniCRM ' + method + ' ' + route + ' → HTTP ' + res.status + ' ' + txt.slice(0, 300));
    try { return JSON.parse(txt); } catch (_) { return {}; }
  }
}

/* Az adatlap státusza a válaszok szerint (sorrendben az első egyező szabály). "Kivitelez" az, aki valamelyik kivitelezési formát jelölte,
   vagy már telepített töltőt; "értékesít" az, aki a "Töltőt értékesítek" formát jelölte, vagy a "Mivel foglalkozol?" közül csak az
   "EV töltő értékesítés / Elektromos nagykereskedés" lehetőséget.
   1. "Már telepítettem Voltie töltőt" a "Milyen formában dolgoznál velünk?" válaszai között: Voltie telepítő
   2. kivitelez és értékesít is: Telepítő / viszonteladó
   3. értékesít vagy ajánl, de nem kivitelez (például egy bolt): Csak viszonteladó
   4. különben a "Telepítettél már autótöltőt?" válasza: Igen: Már telepített autótöltőt, Nem: Nem telepített még */
const INSTALL_FORMS = ['Telepítést vállalok', 'Villamos biztonsági felülvizsgálatot (VBF) végzek', 'Már telepítettem Voltie töltőt', 'Regisztrált villanyszerelő vagyok', 'Minősített regisztrált szerelő vagyok'];
const SALES_FORM = 'Töltőt értékesítek';
const RESELLER_ACTIVITY = 'EV töltő értékesítés / Elektromos nagykereskedés';   // a "Mivel foglalkozol?" egyik lehetősége
const REFERRAL_FORM = 'Ajánlóként, jutalékért';
function leadStatus(a) {
  const forms = [].concat(raw(a, 'collab') || []);
  const installed = text(a, 'installed');
  const installs = forms.some((f) => INSTALL_FORMS.includes(f)) || installed === 'Igen';
  const activity = [].concat(raw(a, 'activity') || []);
  /* aki a "Mivel foglalkozol?" közül csak az EV töltő értékesítést / nagykereskedést jelölte, az is értékesítő */
  const sells = forms.includes(SALES_FORM) || (activity.length === 1 && activity[0] === RESELLER_ACTIVITY);
  if (forms.includes('Már telepítettem Voltie töltőt')) return ST.voltieInstaller;
  if (sells && installs) return ST.installerReseller;
  if ((sells || forms.includes(REFERRAL_FORM)) && !installs) return ST.resellerOnly;
  return installed === 'Igen' ? ST.installed : installed === 'Nem' ? ST.notInstalled : ST.new;
}

/* A beküldésből Contact és Project törzs */
function build(payload) {
  const a = payload.answers || {};
  const h = payload.hidden || {};
  const data = {};
  const put = (tech, v) => { const c = coerce(tech, v); if (c !== undefined) data[tech] = c; };

  Object.keys(mapping.fields).forEach((id) => { if (a[id]) put(mapping.fields[id], raw(a, id)); });
  Object.keys(mapping.hidden).forEach((id) => { if (h[id]) put(mapping.hidden[id], h[id]); });

  put('Nyelv3', clean(h.lang || 'hu', 5).toUpperCase());
  put('Orszag3', 'HU');
  put('MarketingHozzajarulas2', /^Igen/.test(text(a, 'marketing')) ? 'Hozzájárulok a marketing célú megkereséshez' : 'Nem járulok hozzá');

  /* minden válasz egyben (az űrlapverzió az elején). A titkos kulcs (h, t) nem kerül bele. */
  const lines = Object.keys(a).map((id) => a[id].title + ': ' + text(a, id)).filter((l) => !/: $/.test(l));
  const hiddenLine = Object.keys(h).filter((k) => h[k] && !['form_version', 'h', 't'].includes(k)).map((k) => k + '=' + clean(h[k], 200)).join(' ');
  data[NOTE_FIELD] = [clean(payload.form_version, 100), hiddenLine].filter(Boolean).concat(lines).join('\n');

  const person = {
    Type: 'Person', LastName: clean(text(a, 'lastname'), 100), FirstName: clean(text(a, 'firstname'), 100),
    Email: clean(text(a, 'email'), 200), Phone: clean(text(a, 'phone'), 60)
  };
  const taxid = clean(text(a, 'taxid'), 30);
  /* A MiniCRM cég kontakthoz a név kötelező ('Cégnév kötelező'), ezért a kitöltő megadja; a Céginfó a többi adatot az adószámból tölti ki. */
  const company = clean(text(a, 'company'), 200);
  const business = taxid ? { Type: 'Business', Name: company || taxid, VatNumber: taxid, ...(text(a, 'website') ? { Url: clean(text(a, 'website'), 300) } : {}) } : null;

  const status = leadStatus(a);
  /* A MiniCRM az egyedi mezőket a projekt szintjén várja (nem külön "Data" alatt) */
  const project = { ...data, CategoryId: CATEGORY_ID, Name: company || taxid || (person.LastName + ' ' + person.FirstName).trim(), StatusId: status, UserId: OWNER_ID };
  return { person, business, project };
}

/* Hibanapló: a Netlify függvénynaplóba és (helyben) a logs/crm-errors.log fájlba. Az API kulcs nem kerül bele. */
function logError(what, err, data) {
  const line = new Date().toISOString() + ' [' + what + '] ' + err.message + '\n  adat: ' + JSON.stringify(data);
  console.error(line);
  try {
    const dir = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'crm-errors.log'), line + '\n');
  } catch (_) { /* csak olvasható fájlrendszer (Netlify): a konzolnapló elég */ }
}

/* Projekt mentése. Ha a MiniCRM egy lista értékét elutasítja ("Érvénytelen érték X a Y mezőhöz"), mert a MiniCRM lista közben
   változott, az értéket kihagyjuk és újrapróbáljuk. A teljes válasz az OsszesValasz2 mezőben így is megmarad. */
async function putProject(route, body) {
  for (let i = 0; i < 6; i++) {
    try { return await minicrm('PUT', route, body); }
    catch (e) {
      const m = /Érvénytelen érték (.+?) a (.+?) mezőhöz/.exec(e.message);
      if (!m) throw e;
      logError('elutasított listaérték, kihagyom: ' + m[1], e, {});
      body = dropValue(body, m[1]);
    }
  }
  return minicrm('PUT', route, body);
}
function dropValue(body, value) {
  const out = {};
  Object.keys(body).forEach((k) => {
    const v = body[k];
    if (k === NOTE_FIELD || typeof v !== 'string') { if (Array.isArray(v)) { const f = v.filter((x) => x !== value); if (f.length) out[k] = f; } else out[k] = v; return; }
    if (v === value) return;
    const parts = v.split(',');
    if (parts.length > 1 && parts.indexOf(value) > -1) { const f = parts.filter((x) => x !== value); if (f.length) out[k] = f.join(','); return; }
    out[k] = v;
  });
  return out;
}

/* Mit kért a kitöltő: töltő (3 fázisú -40% vagy 1 fázisú -25%), és mellé dinamikus energiamenedzsment
   (3 fázisú töltő mellé több fázisú -35%, 1 fázisú töltő mellé egy fázisú -20%). Töltő nélkül menedzsment nem kérhető. */
function offerSummary(a) {
  const offer = text(a, 'offer');
  const one = /^25%/.test(offer), three = /^40%/.test(offer);
  const dlm = (one || three) && /^Igen/.test(text(a, one ? 'dlm1' : 'dlm'));
  const charger = three ? '3 fázisú töltő (-40%)' : one ? '1 fázisú töltő (-25%)' : '';
  const mgmt = dlm ? (one ? 'egy fázisú dinamikus energiamenedzsment (-20%)' : 'több fázisú dinamikus energiamenedzsment (-35%)') : '';
  return { charger, mgmt, requested: !!charger };
}

/* A MiniCRM feladat szövege: mindig kiírja, mit kért (vagy hogy csak jelentkezett) */
function todoText(a) {
  const o = offerSummary(a);
  if (o.charger && o.mgmt) return TODO_CALL_TEXT + ': ' + o.charger + ' + ' + o.mgmt;
  if (o.charger) return TODO_CALL_TEXT + ': ' + o.charger + ', dinamikus energiamenedzsment nélkül';
  return TODO_TEXT + ': nem kért ajánlatot, csak jelentkezett';
}

function httpError(status, userMessage, detail) {
  const e = new Error(detail || userMessage);
  e.status = status; e.userMessage = userMessage;
  return e;
}

/* Meglévő (például e-mailből felvitt) jelentkező kiegészítése: nem készül új adatlap és nem készül új ügyfél.
   Védelem: csak a 69-es kategória adatlapja írható át, és csak ha a linkben lévő titkos kulcs egyezik az adatlap kulcsával
   (Hash vagy LINK_TOKEN_FIELD mező), vagy ha nincs kulcs, de még "Régi jelentkező, kérdőív kiküldve" státuszú (LINK_REQUIRE_TOKEN=1 esetén
   kulcs nélkül nem). A felelős nem változik, így a kollégák nem látják, hogy valaki elvette tőlük a jelentkezőt. */
/* A MiniCRM két módon ad vissza egy adatlapot, és a kettő nem egyforma:
   - a listás lekérdezés (Project?CategoryId=69&Id=...) számokat ad: StatusId, UserId, ContactId (személy), BusinessId (cég)
   - az egyedi lekérdezés (Project/{id}) neveket ad ("Bejövő email", "Tóth Bence"), és itt van a titkos kulcs (ProjectHash)
   A döntésekhez a számokat használjuk. */
const rowsOf = (j) => (Array.isArray(j && j.Results) ? j.Results : Object.values((j && j.Results) || {}));

const ALREADY = 'A jelentkezésedet korábban már rögzítettük, így nem kell újra kitöltened. Ha valamit módosítanál, írj nekünk: toth.bence@voltie.eu';

async function updateExistingLead(id, token, project, person, business, viaMatch) {
  const found = rowsOf(await minicrm('GET', '/Project?CategoryId=' + CATEGORY_ID + '&Id=' + id)).find((x) => String(x.Id) === String(id));
  if (!found || Number(found.Deleted)) throw httpError(403, 'Ez a link nem érvényes.', 'a ' + id + ' nem a ' + CATEGORY_ID + '-es kategória adatlapja, vagy törölt');
  const invited = UPDATABLE.includes(Number(found.StatusId));
  if (viaMatch) {
    /* e-mail vagy adószám alapján talált adatlap: csak akkor írható át, ha még nem töltötte ki */
    if (!invited) throw httpError(409, ALREADY, 'a találat (' + id + ') már nem frissíthető, státusz ' + found.StatusId);
  } else {
    let tokenOk = false;
    if (token) {
      const full = await minicrm('GET', '/Project/' + id);
      const secrets = [full.ProjectHash, full.Hash, TOKEN_FIELD ? full[TOKEN_FIELD] : ''].filter(Boolean);
      tokenOk = secrets.some((x) => safeEq(token, x));
      if (!tokenOk) throw httpError(403, 'Ez a link nem érvényes.', 'hibás kulcs az ' + id + ' adatlaphoz');
    }
    if (!tokenOk && (REQUIRE_TOKEN || !invited)) {
      throw httpError(REQUIRE_TOKEN && invited ? 403 : 409,
        REQUIRE_TOKEN && invited ? 'Ez a link nem érvényes.' : ALREADY,
        'az ' + id + ' adatlap nem írható át (státusz ' + found.StatusId + ', kulcs: ' + (token ? 'van' : 'nincs') + ')');
    }
  }
  const { CategoryId, UserId, ...upd } = project;   // a kategória és a felelős marad
  await putProject('/Project/' + id, upd);
  await mergeContacts({ id, personId: found.ContactId, businessId: found.BusinessId }, person, business);
  return { projectId: id, ownerId: Number(found.UserId) || OWNER_ID };
}

/* A meglévő kontaktok kiegészítése (a hibájuk nem akadályozza meg a jelentkezés rögzítését):
   a cég kapja az adószámot (abból tölt a Céginfó), a személyhez a hiányzó e-mail, telefon és név kerül. */
async function mergeContacts(ctx, person, business) {
  try {
    const personId = ctx.personId;
    const businessId = ctx.businessId && String(ctx.businessId) !== String(personId) ? ctx.businessId : 0;
    if (business) {
      if (businessId) {
        await minicrm('PUT', '/Contact/' + businessId, { VatNumber: business.VatNumber, ...(business.Url ? { Url: business.Url } : {}) });
      } else {
        const b = await minicrm('PUT', '/Contact', business);
        const bid = b.Id || b.ContactId;
        if (bid && personId) await minicrm('PUT', '/Contact/' + personId, { BusinessId: bid });
      }
    }
    if (personId) {
      const c = await minicrm('GET', '/Contact/' + personId);
      const fill = {};
      if (!c.Email && person.Email) fill.Email = person.Email;
      if (!c.Phone && person.Phone) fill.Phone = person.Phone;
      if (!c.FirstName && person.FirstName) fill.FirstName = person.FirstName;
      if (!c.LastName && person.LastName) fill.LastName = person.LastName;
      if (Object.keys(fill).length) await minicrm('PUT', '/Contact/' + personId, fill);
    }
  } catch (e) { logError('meglévő kontaktok kiegészítése', e, { adatlap: ctx.id }); }
}

const knownDeps = () => ({ minicrm, categoryId: CATEGORY_ID, updatable: UPDATABLE, extractId });

/* A jelentkező ismert adatai az űrlap előtöltéséhez (id-s link). Az e-mail és a telefon csak részlegesen elrejtve kerül ki. */
async function lookupKnown(rawId) {
  if (DRY_RUN) return { ok: false };
  try { return await known.lookupKnown(knownDeps(), rawId); }
  catch (e) { logError('ismert adatok lekérése', e, {}); return { ok: false }; }
}

/* Ismételt kitöltés már kitöltött adatlapra: feladat a felelősnek, az adatlap mezői nem változnak. */
async function noteRepeat(m, a, person, business, deadline) {
  const who = [
    'Név: ' + (person.LastName + ' ' + person.FirstName).trim(), 'E-mail: ' + person.Email, 'Telefon: ' + person.Phone,
    business ? 'Cég: ' + business.Name + ' (' + business.VatNumber + ')' : ''
  ].filter(Boolean).join(', ');
  const comment = 'Ismételt kitöltés érkezett (egyezés: ' + m.via.join(' és ') + '), új adatlap nem készült. ' + todoText(a) + '. ' + who;
  await minicrm('PUT', '/ToDo', { ProjectId: Number(m.id), UserId: m.ownerId || OWNER_ID, Comment: comment.slice(0, 1500), Deadline: deadline });
}

/* A jelentkezés feldolgozása. Visszaadja: { status, body } */
async function submit(payload) {
  if (payload.website) return { status: 200, body: { ok: true } };          // honeypot: botnak is "siker"
  /* A megerősítő képernyőn elfogadott adatokat (név, cég, e-mail, telefon, adószám) a MiniCRM-ből töltjük ki. */
  if (!DRY_RUN && payload.confirmed) {
    try { await known.hydrateAnswers(knownDeps(), payload); } catch (e) { logError('az ismert adatok betöltése', e, {}); }
  }
  const a = payload.answers || {};
  const missing = ['lastname', 'firstname', 'phone', 'taxid'].filter((id) => !text(a, id));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text(a, 'email'))) missing.push('email');
  if (!has(raw(a, 'privacy'), 'Elfogadom')) missing.push('privacy');
  if (missing.length) {
    logError('hiányzó kötelező mező', new Error(missing.join(', ')), { answers: Object.keys(a) });
    return { status: 422, body: {
      error: 'Hiányzó kötelező mező: ' + missing.join(', '),
      userMessage: 'Néhány kötelező adat hiányzik. Lépj vissza az űrlapon, és ellenőrizd a válaszokat, majd próbáld újra.'
    } };
  }
  await ensureSchema();
  const { person, business, project } = build(payload);
  const hidden = payload.hidden || {};
  let existingId = extractId(hidden.id);
  let viaMatch = false;                    // meglévő adatlap frissítése (személyes link)
  const linkToken = clean(hidden.h || hidden.t, 80);

  /* feladat a felelősnek, holnapi határidővel; szövege mutatja, mit kért */
  const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const todo = (projectId, ownerId, existing) => ({
    ProjectId: Number(projectId), UserId: ownerId || OWNER_ID,
    Comment: (existing ? 'Kitöltötte a kérdőívet. ' : '') + todoText(a), Deadline: deadline
  });

  if (DRY_RUN) {
    console.log('[DRY RUN] nincs MINICRM_SYSTEM_ID / MINICRM_API_KEY, ezt küldenénk:\n', JSON.stringify({ existingProjectId: existingId || null, business, person, project, todo: todo(existingId || 0, null, !!existingId) }, null, 2));
    return { status: 200, body: { ok: true, dryRun: true } };
  }
  /* Id nélküli link: meglévő jelentkező keresése e-mail és adószám alapján, hogy ne duplikálódjon az ügyfél. */
  if (!existingId && DEDUPE) {
    try {
      const m = pickMatch(await withTimeout(findExisting({ minicrm, logError, categoryId: CATEGORY_ID, email: person.Email, vat: business && business.VatNumber }), DEDUPE_BUDGET_MS), UPDATABLE);
      if (m && m.updatable && !REQUIRE_TOKEN) {
        existingId = String(m.id); viaMatch = true;
        console.log('Meglévő jelentkező (' + m.via.join(' és ') + ' egyezik): ' + m.id + ', a kitöltés ezt egészíti ki');
      } else if (m) {
        /* már kitöltött vagy folyamatban lévő adatlap: nem készül új, a felelős feladatot kap az ismételt kitöltésről */
        try {
          await noteRepeat(m, a, person, business, deadline);
          console.log('Ismételt kitöltés (' + m.via.join(' és ') + ' egyezik), feladat a ' + m.id + ' adatlapra');
          return { status: 200, body: { ok: true, duplicate: true } };
        } catch (e) { logError('ismételt kitöltés feladata', e, { adatlap: m.id }); }   // hiba esetén inkább új adatlap, mint elveszett jelentkezés
      }
    } catch (e) { logError('duplikáció-figyelés', e, {}); }
  }
  const created = {};   // a már létrehozott kontaktok azonosítói, hogy hiba esetén kézzel törölhetők legyenek
  try {
    let projectId, ownerId = OWNER_ID;
    if (existingId) {
      const r = await updateExistingLead(existingId, linkToken, project, person, business, viaMatch);
      projectId = r.projectId; ownerId = r.ownerId;
      console.log('MiniCRM meglévő adatlap kiegészítve:', existingId);
    } else {
      /* A kontaktok hibája (pl. már létező e-mail) nem veszítheti el a jelentkezést:
         szükség esetén e-mail és telefon nélkül is megpróbáljuk, a teljes válasz úgyis az OsszesValasz2 mezőben van. */
      let biz = null;
      if (business) {
        try { const b = await minicrm('PUT', '/Contact', business); biz = b.Id || b.ContactId; created.biz = biz; }
        catch (e) { logError('cég kontakt', e, business); }
      }
      let p;
      try { p = await minicrm('PUT', '/Contact', biz ? { ...person, BusinessId: biz } : person); }
      catch (e) {
        logError('személy kontakt', e, person);
        const { Email, Phone, ...bare } = person;
        p = await minicrm('PUT', '/Contact', biz ? { ...bare, BusinessId: biz } : bare);
      }
      const personId = p.Id || p.ContactId;
      created.person = personId;
      /* Elsődleges kapcsolattartó a személy (ContactId); a cég (MainContactId) a személy céghez kötéséből adódik */
      const pr = await putProject('/Project', { ...project, ContactId: personId });
      projectId = pr.Id || pr.ProjectId;
      console.log('MiniCRM projekt létrejött:', projectId || JSON.stringify(pr));
    }
    /* a feladat hibája nem akadályozza meg a jelentkezés rögzítését */
    try { await minicrm('PUT', '/ToDo', todo(projectId, ownerId, !!existingId)); } catch (e) { console.error('Feladat létrehozása nem sikerült:', e.message); }
    return { status: 200, body: { ok: true } };
  } catch (e) {
    logError('jelentkezés', e, { létrehozott_kontaktok: created, person, business, adatlap: existingId || null });
    return { status: e.status || 502, body: { error: e.userMessage ? 'Elutasítva' : 'CRM hiba', userMessage: e.userMessage } };
  }
}

/* Személyre szabott ajánlat PDF a kitöltő választásai alapján. Nem tárol semmit.
   Id-s (megerősített) kitöltésnél az e-mail és a telefon a böngészőben csak maszkolva van,
   ezért ha hiányoznak, a MiniCRM-ből egészítjük ki a PDF-et. */
async function makeOffer(d) {
  const data = {
    company: d.company, name: d.name, email: d.email, phone: d.phone,
    taxid: d.taxid, offer: d.offer, dlm: d.dlm
  };
  const leadId = extractId(d.id);
  if (!DRY_RUN && leadId && (!clean(data.email) || !clean(data.phone) || !clean(data.company) || !clean(data.name) || !clean(data.taxid, 30))) {
    try {
      const c = await known.offerContact(knownDeps(), leadId);
      if (c) {
        if (!clean(data.email) && c.email) data.email = c.email;
        if (!clean(data.phone) && c.phone) data.phone = c.phone;
        if (!clean(data.company) && c.company) data.company = c.company;
        if (!clean(data.name) && c.name) data.name = c.name;
        if (!clean(data.taxid, 30) && c.taxid) data.taxid = c.taxid;
      }
    } catch (e) { logError('ajánlat kapcsolati adatok', e, { id: leadId }); }
  }
  const buffer = await buildOffer(data);
  const fileName = offerFileName(clean(data.company, 120) || clean(data.name, 120));
  return { buffer, fileName };
}

/* Melyik kódverzió fut és milyen beállításokkal (titkot nem tartalmaz). A /api/verzio címen olvasható, ellenőrzéshez. */
const VERSION = '2026-11-07-fixes';
function info() {
  return { version: VERSION, dryRun: DRY_RUN, category: CATEGORY_ID, dedupe: DEDUPE, requireToken: REQUIRE_TOKEN, updatableStatuses: UPDATABLE, statusIds: ST, navConfigured: navConfigured() };
}

module.exports = { info, lookupKnown, lookupCompany, submit, makeOffer, extractId, offerSummary, todoText, leadStatus, DRY_RUN, CATEGORY_ID, clean };
