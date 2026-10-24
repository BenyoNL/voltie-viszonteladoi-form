/* A NAV Online Számla beállításának kipróbálása a saját gépen (csak olvas, a MiniCRM-be nem ír).
   Használat:  node scripts/nav-teszt.js 27997695-2-11
   A .env fájlból olvassa a NAV_LOGIN, NAV_PASSWORD, NAV_SIGN_KEY, NAV_TAX_NUMBER változókat. */
'use strict';
require('../lib/core');   // betölti a .env fájlt
const nav = require('../lib/nav');
const { lookupCompany } = require('../lib/company');

(async () => {
  const tax = process.argv[2] || '27997695-2-11';
  const cfg = nav.config();
  if (!cfg) {
    console.log('A NAV-lekérdezés nincs beállítva. A .env fájlban kell: NAV_LOGIN, NAV_PASSWORD, NAV_SIGN_KEY, NAV_TAX_NUMBER.');
    process.exit(1);
  }
  console.log('Beállítás rendben (felhasználó: ' + cfg.login + ', cég törzsszáma: ' + cfg.taxNumber + ', szoftverazonosító: ' + cfg.software.id + ')');
  const digits = String(tax).replace(/\D/g, '');
  try {
    const r = await nav.queryTaxpayer(cfg, digits.slice(0, 8), fetch, 8000);
    console.log('NAV válasz: ' + (r.valid ? 'érvényes adózó, név: ' + r.name : 'a NAV szerint nincs ilyen érvényes adózó'));
  } catch (e) {
    console.log('NAV hiba: ' + e.message);
    process.exit(2);
  }
  console.log('Az űrlap ezt a nevet töltené elő: ', JSON.stringify(await lookupCompany(tax)));
})();
