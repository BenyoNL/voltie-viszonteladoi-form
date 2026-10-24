/* Egy meglévő jelentkező ismert adatai az űrlap előtöltéséhez (id-s link).
   A MiniCRM-ben szereplő adatokat a kitöltő megerősítheti vagy módosíthatja.
   Adatvédelem: az azonosító sorszám, tehát kitalálható, ezért az e-mail címet és a telefonszámot csak részlegesen elrejtve adjuk
   vissza ("b***@yahoo.com"). A teljes értéket a szerver a MiniCRM-ből tölti be a beküldéskor, a böngésző sosem kapja meg.
   Adatot csak olyan adatlapról adunk, amely a 69-es kategóriában van, nincs törölve, és még nem töltötte ki (frissíthető státuszú). */
'use strict';

const rowsOf = (j) => (Array.isArray(j && j.Results) ? j.Results : Object.values((j && j.Results) || {}));
const TAX_RE = /^\d{8}-?\d-?\d{2}$/;
const FIELDS = ['lastname', 'firstname', 'email', 'phone', 'company', 'taxid', 'website'];
const TITLES = { lastname: 'Vezetékneved', firstname: 'Keresztneved', email: 'E-mail címed', phone: 'Telefonszámod', company: 'Cégnév', taxid: 'Adószám', website: 'Weboldal' };
const isCompany = (c) => !!c && /^(Cég|Business)$/.test(String(c.Type));
const str = (v) => (v == null ? '' : String(v).trim());

function maskEmail(email) {
  const parts = str(email).split('@');
  return parts.length === 2 && parts[0] ? parts[0].slice(0, 1) + '***@' + parts[1] : '';
}

/* a számjegyekből csak az utolsó hármat hagyja meg */
function maskPhone(phone) {
  const s = str(phone);
  const total = s.replace(/\D/g, '').length;
  if (total < 7) return '';
  let seen = 0;
  return s.replace(/\d/g, (d) => (++seen > total - 3 ? d : '•'));
}

function formatTax(v) {
  const d = str(v).replace(/\D/g, '');
  return d.length === 11 ? d.slice(0, 8) + '-' + d.slice(8, 9) + '-' + d.slice(9) : '';
}

/* A cég címe: a MiniCRM külön címrekordokat tart (AddressList/<kontakt> -> Address/<id>). Az alapértelmezett, irányítószámos címet vesszük. */
async function fetchAddress(minicrm, contactId) {
  if (!contactId) return null;
  try {
    const ids = Object.keys(((await minicrm('GET', '/AddressList/' + contactId)) || {}).Results || {}).slice(0, 3);
    const all = (await Promise.all(ids.map((i) => minicrm('GET', '/Address/' + i).catch(() => null)))).filter(Boolean);
    return all.find((a) => Number(a.Default) && (a.PostalCode || a.City)) || all.find((a) => a.PostalCode && a.City) || all[0] || null;
  } catch (_) { return null; }
}

/* Az adatlap sora (számokkal) és a hozzá tartozó személy és cég kontakt (kérésre a cég címével) */
async function fetchLead({ minicrm, categoryId }, id, withAddress) {
  const row = rowsOf(await minicrm('GET', '/Project?CategoryId=' + categoryId + '&Id=' + id)).find((x) => String(x.Id) === String(id));
  if (!row || Number(row.Deleted)) return null;
  const get = (cid) => (cid ? minicrm('GET', '/Contact/' + cid).catch(() => null) : null);
  const businessId = row.BusinessId && String(row.BusinessId) !== String(row.ContactId) ? row.BusinessId : 0;
  /* a cím lekérdezése a kontaktokkal párhuzamosan indul (a cég azonosítója: a BusinessId, régi adatlapon a fő kontakt) */
  const [first, second, address] = await Promise.all([get(row.ContactId), get(businessId), withAddress ? fetchAddress(minicrm, businessId || row.ContactId) : null]);
  /* régebbi adatlapokon a fő kontakt maga a cég */
  const person = isCompany(first) ? null : first;
  const business = second || (isCompany(first) ? first : null);
  return { row, person, business, address: business ? address : null };
}

/* A kontaktokból az űrlap mezői. A cégnév, ha csak az adószám (korábbi ideiglenes név), nem számít cégnévnek. */
function valuesOf(lead) {
  const p = lead.person || {}, b = lead.business || {};
  const company = str(b.Name);
  return {
    lastname: str(p.LastName), firstname: str(p.FirstName), email: str(p.Email), phone: str(p.Phone),
    company: TAX_RE.test(company) ? '' : company, taxid: formatTax(b.VatNumber), website: str(b.Url)
  };
}

/* A cégről ismert, megjeleníthető adatok. Az éves árbevételt, a létszámot és a bankszámlaadatokat nem adjuk ki. A székhelycím nyilvános
   cégadat, ezért teljes egészében látszik. Az e-mail és a telefon részben elrejtve látszik. */
function companyDisplay(lead) {
  const b = lead.business;
  if (!b) return {};
  const a = lead.address || {};
  /* "9231 Máriakálnok, TSZ major 094/14."; ha a város hiányzik: "8000 Vágújhelyi u 18." */
  const head = [str(a.PostalCode), str(a.City)].filter(Boolean).join(' ');
  const place = str(a.Address) ? head + (str(a.City) ? ', ' : ' ') + str(a.Address) : head;
  const country = str(a.CountryId);
  return {
    website: str(b.Url),
    companyEmail: maskEmail(b.Email),
    companyPhone: maskPhone(b.Phone),
    place: place ? place + (country && country !== 'Magyarország' ? ', ' + country : '') : '',
    registrationNumber: str(b.RegistrationNumber),
    euVat: str(b.EUVatNumber),
    founded: str(b.FoundingYear) && str(b.FoundingYear) !== '0' ? str(b.FoundingYear) : '',
    /* "4100 '25 Lakó- és nem lakóépület építése" -> a TEÁOR-kód nélkül */
    activity: str(b.MainActivity).replace(/^\d{4}\s*('\d+\s*)?/, '').trim()
  };
}

/* GET /api/jelentkezo?id=...: mit tudunk a jelentkezőről (részben elrejtve) */
async function lookupKnown(deps, rawId) {
  const id = deps.extractId(rawId);
  if (!id) return { ok: false };
  const lead = await fetchLead(deps, id, true);
  if (!lead || !deps.updatable.includes(Number(lead.row.StatusId))) return { ok: false };
  const v = valuesOf(lead);
  const has = {};
  FIELDS.forEach((k) => { has[k] = !!v[k]; });
  if (!FIELDS.some((k) => has[k])) return { ok: false };
  return {
    ok: true,
    has,
    display: {
      name: (v.lastname + ' ' + v.firstname).trim(), company: v.company, taxid: v.taxid,
      email: maskEmail(v.email), phone: maskPhone(v.phone),
      ...companyDisplay(lead)
    },
    /* a "Módosítom" gombhoz: a nem személyes adatok előtöltve, az e-mailt és a telefont a kitöltő újra beírja */
    prefill: { lastname: v.lastname, firstname: v.firstname, company: v.company, taxid: v.taxid, website: v.website }
  };
}

/* A "Vállalkozási forma" választ a cégnévből következtetjük ki, ha a kitöltőt nem kérdeztük (az adószám már ismert). Ha a név nem árulja el, üresen marad. */
function legalFormOf(name) {
  const s = str(name);
  if (/\bkft\b|\bbt\b|korlátolt felelősségű|betéti társaság/i.test(s)) return 'Kft., Bt.';
  if (/egyéni vállalkozó|(^|\s)(ev|e\.\s?v)\.?\s*$/i.test(s)) return 'Egyéni vállalkozó';
  if (/\b(zrt|nyrt|kkt|kht)\b|részvénytársaság|szövetkezet|egyesület|alapítvány/i.test(s)) return 'Egyéb';
  return '';
}

/* Beküldéskor: azokat a mezőket, amelyeket a kitöltő a megerősítő képernyőn elfogadott (payload.confirmed), a MiniCRM-ből töltjük ki. */
async function hydrateAnswers(deps, payload) {
  const id = deps.extractId((payload.hidden || {}).id);
  const wanted = (Array.isArray(payload.confirmed) ? payload.confirmed : []).filter((k) => FIELDS.includes(k));
  if (!id || !wanted.length) return;
  const lead = await fetchLead(deps, id);
  if (!lead) return;
  const v = valuesOf(lead);
  const a = (payload.answers = payload.answers || {});
  wanted.forEach((k) => {
    const have = a[k] && str(Array.isArray(a[k].value) ? a[k].value.join('') : a[k].value);
    if (!have && v[k]) a[k] = { title: TITLES[k], value: v[k] };
  });
  if (wanted.includes('taxid') && !a.legalform) {
    const form = legalFormOf(str(a.company && a.company.value) || v.company);
    if (form) a.legalform = { title: 'Vállalkozási forma', value: form };
  }
}

module.exports = { lookupKnown, hydrateAnswers, legalFormOf };
