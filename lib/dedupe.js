/* Meglévő jelentkezők keresése e-mail és adószám alapján, hogy az id nélküli linkről érkező kitöltés ne duplikálja az ügyfelet.
   Csak olvas (GET), a MiniCRM-ben semmit nem módosít. A MiniCRM API-n kipróbált szűrők:
   Contact?Email=, Contact?VatNumber=, Project?CategoryId=&ContactId=, Project?CategoryId=&Adoszam2=. */
'use strict';

const enc = encodeURIComponent;
const rows = (j) => (Array.isArray(j && j.Results) ? j.Results : Object.values((j && j.Results) || {}));

/* Visszaadja a talált adatlapokat: [{ id, name, status, ownerId, via: Set('e-mail' | 'adószám') }].
   A kérések párhuzamosan futnak (két kör), hogy a Netlify 10 másodperces korlátján belül maradjon. */
async function findExisting({ minicrm, logError, categoryId, email, vat, max = 5 }) {
  const q = (route) => minicrm('GET', route).then(rows).catch((e) => { logError('duplikáció-keresés', e, { route }); return []; });
  const digits = vat ? vat.replace(/\D/g, '') : '';
  const proj = '/Project?CategoryId=' + categoryId;

  /* 1. kör: személyek e-mail alapján, cégek és adatlapok adószám alapján (kötőjeles és számjegyes alakban is) */
  const [persons, businesses, byVat, byVatPlain] = await Promise.all([
    email ? q('/Contact?Email=' + enc(email)) : [],
    vat ? q('/Contact?VatNumber=' + enc(vat)) : [],
    vat ? q(proj + '&Adoszam2=' + enc(vat)) : [],
    digits && digits !== vat ? q(proj + '&Adoszam2=' + enc(digits)) : []
  ]);

  const found = new Map();
  const add = (p, via) => {
    if (!p || !p.Id || Number(p.Deleted)) return;
    const c = found.get(p.Id) || { id: p.Id, name: p.Name, status: Number(p.StatusId), ownerId: Number(p.UserId) || 0, via: new Set() };
    c.via.add(via);
    found.set(p.Id, c);
  };
  byVat.concat(byVatPlain).forEach((p) => add(p, 'adószám'));

  /* 2. kör: a talált személyek és cégek adatlapjai (az adatlap a kontaktra szűrhető) */
  const jobs = persons.filter((c) => c.Type === 'Person').slice(0, max).map((c) => ['e-mail', c.Id])
    .concat(businesses.filter((c) => c.Type === 'Business').slice(0, max).map((c) => ['adószám', c.Id]));
  const lists = await Promise.all(jobs.map(([, id]) => q(proj + '&ContactId=' + id)));
  lists.forEach((list, i) => list.forEach((p) => add(p, jobs[i][0])));

  return [...found.values()];
}

/* A legjobb találat: előbb a még nem kitöltött (frissíthető) adatlap, aztán az, amelyik e-mail és adószám alapján is egyezik, aztán a legújabb. */
function pickMatch(list, updatableStatuses) {
  const upd = (c) => updatableStatuses.includes(c.status);
  return list
    .map((c) => ({ ...c, updatable: upd(c), via: [...c.via] }))
    .sort((a, b) => (b.updatable - a.updatable) || (b.via.length - a.via.length) || (Number(b.id) - Number(a.id)))[0] || null;
}

module.exports = { findExisting, pickMatch };
