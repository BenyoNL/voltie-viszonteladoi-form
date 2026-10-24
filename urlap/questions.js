/* Kérdéssorok az A-F ágakra.
   Forrás: Voltie leadháló (Javasolt kérdéssorok) és MiniCRM_mezospecifikacio_webes_urlapok_ellenorzott_v2.xlsx.
   A `crm` tulajdonság a MiniCRM mező API kulcsa (Pilot 67 / Viszonteladók 69 / Felhasználók 71).
   Szabály: a listaértékek pontosan egyeznek a MiniCRM-beli értékekkel (szövegegyezéssel párosít). */
window.VOLTIE = (function () {
  var QUICKSTART = 'https://www.voltie.eu/quickstart';
  var DOWNLOADS = 'https://voltie.sharepoint.com/:f:/s/Share/IgBab9BG_PpOSrrTMLl9oihuAbpbGa9lNqvD10WomQ8xQjY?e=H6M5uk';
  /* a jutalékos kalkulátor közvetlenül az űrlap mappájából tölthető le, nincs a megosztott mappában */
  var CALCULATOR = { label: 'Jutalékos kalkuláció (Excel)', href: 'Voltie-jutalekos-kalkulacio.xlsx', file: 'Voltie-jutalekos-kalkulacio.xlsx' };

  /* Aláírás a záróképernyőn és az ajánlat PDF-en: Tóth Bence e-mail aláírása */
  var SIGNATURE = {
    name: 'Tóth Bence', title: 'Kiemelt ügyfélkapcsolati képviselő',
    email: 'toth.bence@voltie.eu', phone: '+36 20 287 7513',
    address: '1027 Budapest, Henger utca 2.C épület 2. emelet', web: 'https://www.voltie.eu',
    portrait: 'https://storage.googleapis.com/frontend_files/email_signatures/portraits/TothBence.png',
    logo: 'https://storage.googleapis.com/frontend_files/email_signatures/logo-3.png'
  };
  var PRIVACY = 'https://www.voltie.eu/documents';
  var TERMS = 'A kedvezmény az első töltő vásárlásának árából vonható le, és csak 1 töltőre vonatkozik. Az ajánlat a kiállításától számított 1 hónapig érvényes.';
  var PROMO = 'Töltsd ki a kérdőívünket, és az első töltő vásárlásakor *40% kedvezményt* kapsz a 3 fázisú Voltie okos töltő listaárából!';

  /* rejtett mezők: utm_*, landing, lang, form_version; ag (menüből előválasztott ág); id (137 korábbi jelentkező) */
  var HIDDEN = ['utm_source', 'utm_medium', 'utm_campaign', 'landing', 'lang', 'form_version', 'ag', 'id', 'h', 't'];

  var ROUTER = {
    home: 'Otthoni töltőt szeretnék',
    company: 'Cégnek, telephelyre, flottának',
    condo: 'Társasházba, lakóparkba, fejlesztéshez',
    partner: 'Viszonteladó vagy villanyszerelő partner lennék',
    tech: 'Van Voltie töltőm, műszaki kérdésem van',
    info: 'Csak informálódom'
  };
  var COUNTIES = ['Budapest', 'Bács-Kiskun', 'Baranya', 'Békés', 'Borsod-Abaúj-Zemplén', 'Csongrád-Csanád', 'Fejér', 'Győr-Moson-Sopron', 'Hajdú-Bihar', 'Heves', 'Jász-Nagykun-Szolnok', 'Komárom-Esztergom', 'Nógrád', 'Pest', 'Somogy', 'Szabolcs-Szatmár-Bereg', 'Tolna', 'Vas', 'Veszprém', 'Zala'];
  var WHEN_SHORT = ['1 hónapon belül', '1-3 hónap', '3 hónapnál később', 'Még nem tudom'];
  var NOT_SURE = 'Nem tudom';

  /* --- kis építőelemek --- */
  function T(id, title, o) { return merge({ id: id, type: 'text', required: true, title: title }, o); }
  function C(id, title, choices, o) { return merge({ id: id, type: 'choice', required: true, title: title, choices: choices }, o); }
  function M(id, title, choices, o) { return merge({ id: id, type: 'choice', multi: true, required: true, title: title, choices: choices }, o); }
  function N(id, title, o) { return merge({ id: id, type: 'number', required: true, title: title, placeholder: 'pl. 12' }, o); }
  function merge(a, b) { for (var k in (b || {})) a[k] = b[k]; return a; }
  function in_() { var s = Array.prototype.slice.call(arguments); return function (a) { return s.indexOf(a.role) > -1; }; }
  function has(v, x) { return Array.isArray(v) && v.indexOf(x) > -1; }

  var HEARD = M('heard', 'Hol hallottál rólunk?', ['Google kereső', 'Facebook', 'Instagram', 'YouTube', 'TikTok', 'LinkedIn', 'Ismerős ajánlotta', 'Villanyszerelő ajánlotta', 'Autókereskedés', 'Tartalomgyártó'], { other: true, required: false, description: 'Több is választható.', crm: 'HonnanHallott / HonnanHallottRolunk' });
  var NOTE = { id: 'note', type: 'long', required: false, title: 'Megjegyzés', description: 'Van még valami, amit tudnunk kell?', crm: 'Megjegyzes2 / Megjegyzes3' };
  var LEGAL = [
    M('privacy', 'Elfogadom az adatkezelési tájékoztatót', ['Elfogadom'], { description: 'A kitöltés feltétele. Az adatvédelmi tájékoztató itt tekinthető meg:', link: { label: 'itt', href: PRIVACY } }),
    C('marketing', 'Kérek hírlevelet, ajánlatokat', ['Igen, kérek', 'Nem kérek'], { description: 'Marketing célú megkeresés: hírlevél és ajánlatok.', crm: 'MarketingCeluMegkereses / MarketingHozzajarulas2' })
  ];

  /* Ajánlat a jelentkezés végén. Ha a kitöltő kér valamit, a MiniCRM-ben "Hívd fel, kért töltőt" feladat jön létre. */
  var OFFER = [
    C('offer', 'Mit szeretnél?', ['40% kedvezmény a 3 fázisú töltőből', '25% kedvezmény az 1 fázisú töltőből', 'Most nem kérek ajánlatot'], { description: 'Az első töltő vásárlásakor érvényes kedvezmény a Voltie okos töltők listaárából. ' + TERMS }),
    C('dlm', 'Szeretnél dinamikus energiamenedzsmentet most 35% kedvezménnyel?', ['Igen, kérem a 35% kedvezményt', 'Nem'], {
      description: 'Dinamikus energiamenedzsment és napelem integráció több fázisú rendszerhez (max 80A).',
      showIf: function (a) { return /^40%/.test(a.offer || ''); }
    }),
    C('dlm1', 'Szeretnél dinamikus energiamenedzsmentet most 20% kedvezménnyel?', ['Igen, kérem a 20% kedvezményt', 'Nem'], {
      description: 'Dinamikus energiamenedzsment és napelem integráció egy fázisú rendszerhez.',
      showIf: function (a) { return /^25%/.test(a.offer || ''); }
    })
  ];
  var CONTACT = [
    T('lastname', 'Vezetékneved', { autocomplete: 'family-name', crm: 'Kontakt: LastName' }),
    T('firstname', 'Keresztneved', { autocomplete: 'given-name', crm: 'Kontakt: FirstName' }),
    { id: 'email', type: 'email', required: true, title: 'E-mail címed', autocomplete: 'email', placeholder: 'nev@pelda.hu', crm: 'Kontakt: Email' },
    { id: 'phone', type: 'phone', required: true, title: 'Telefonszámod', autocomplete: 'tel', placeholder: '+36 30 123 4567', crm: 'Kontakt: Phone' }
  ];
  function TAX(o) { return merge({ id: 'taxid', type: 'taxid', required: true, title: 'Adószám', description: 'Formátum: 12345678-1-23. A cég adatait ebből kérjük le.', placeholder: '12345678-1-23', crm: 'Cég kontakt: VatNumber (Céginfó)' }, o); }
  function ADDRESS(label) {
    return [
      T('zip', 'Irányítószám', { autocomplete: 'postal-code', placeholder: '1157', crm: 'TelepitesiCim' }),
      T('city', 'Település', { autocomplete: 'address-level2', crm: 'TelepitesiVaros' }),
      T('street', 'Utca, házszám', { description: label, autocomplete: 'street-address', crm: 'TelepitesiCim' })
    ];
  }

  /* --- A · Otthoni töltő (Pilot 67) --- */
  var A = [
    C('a_count', 'Hány töltőt szeretnél?', ['1', '2', '3 vagy több'], { crm: 'TervezettTolto' }),
    C('a_when', 'Mikor szeretnéd, hogy működjön?', WHEN_SHORT, { crm: 'TervezettTelepites' }),
    C('a_billing', 'Kinek szóljon a számla?', ['Magánszemélynek', 'Cégnek vagy egyéni vállalkozónak'], { crm: 'Cegszemely' }),
    TAX({ id: 'a_taxid', description: 'A cég adatait ebből kérjük le.', showIf: function (a) { return a.a_billing === 'Cégnek vagy egyéni vállalkozónak'; } }),
    C('a_mount', 'Hova szerelnéd a töltőt?', ['Falra', 'Tartóoszlopra', 'Még nem tudom'], { crm: 'Faloszlop' }),
    C('a_distance', 'Milyen messze van a töltő helye a villanyórától?', ['0-10 m', '10-20 m', '20-30 m', '30 méter felett', NOT_SURE], { description: 'Lépésben is jó a becslés.', crm: 'TavolsagMerohelytol' }),
    C('a_cable', 'Merre menne a kábel?', ['Épületen belül', 'Falon kívül', 'Földben (udvaron át)', NOT_SURE], { crm: 'KabelNyomvonal' }),
    C('a_phases', 'Hány fázis van?', ['1 fázis', '3 fázis', NOT_SURE], { crm: 'AramFazisok' }),
    C('a_amp', 'Mekkora a főbiztosíték fázisonként?', ['16 A', '20 A', '25 A', '32 A', '40 A vagy több', NOT_SURE], { description: 'A biztosítéktáblán találod.', crm: 'Amperfazis' }),
    C('a_solar', 'Van napelemed?', ['Igen', 'Nincs', 'Hamarosan lesz'], { crm: 'Napelem' }),
    T('a_inverter', 'Milyen inverter van?', { required: false, description: 'Márka és típus, pl. Huawei SUN2000', crm: 'InverterTipus', showIf: function (a) { return a.a_solar === 'Igen'; } }),
    C('a_electrician', 'Van villanyszerelőd, aki telepíti?', ['Van saját villanyszerelő', 'Telepítést is kér'], { crm: 'Villanyszerelo' }),
    C('a_internet', 'Van internet a töltő helyén?', ['Erős wifi', 'Gyenge wifi', 'Kábeles net bevezethető', 'Nincs'], { crm: 'Internet' }),
    T('a_car', 'Milyen autót töltesz?', { required: false, description: 'Márka és típus, kihagyható.', crm: 'Auto' })
  ].concat(ADDRESS('Itt lesz a töltő.'));

  /* --- B · Cég, telephely, flotta (Pilot 67) --- */
  var B = [
    C('b_site', 'Milyen helyszínre kell a töltő?', ['Iroda, telephely', 'Szálláshely, vendéglátás', 'Kereskedelem, parkoló', 'Ipari, logisztikai', 'Önkormányzat, közintézmény', 'Munkavállalók otthona'], { crm: 'ProjektTipusa' }),
    M('b_who', 'Ki fog tölteni?', ['Céges flotta', 'Munkavállalók saját autója', 'Ügyfelek/vendégek', 'Nyilvános/Fizetős'], { description: 'Több is választható.', crm: 'ToltesCelja' }),
    N('b_now', 'Hány töltőpont kell most?', { crm: 'TervezettTolto' }),
    N('b_3y', 'És 3 éven belül?', { required: false, crm: 'Toltopontok3EvenBelul' }),
    N('b_spots', 'Hány parkolóhely van?', { crm: 'ParkolokSzama' }),
    M('b_billing', 'Kell elszámolás vagy fizetés?', ['Nem kell', 'Céges és magán töltés szétválasztása', 'Munkavállaló otthon töltésének elszámolása', 'Vendég fizet (RFID vagy App)', NOT_SURE], { crm: 'ElszamolasiIgeny' }),
    T('b_power', 'Ismert a rendelkezésre álló teljesítmény?', { description: 'Írd be: A vagy kW, vagy hogy nem tudod.', placeholder: 'pl. 63 A vagy Nem tudom', crm: 'RendelkezesreAlloTeljesitmeny' }),
    C('b_existing', 'Van már töltő a helyszínen?', ['Nincs', 'Bővítenénk', 'Cserélnénk'], { crm: 'MeglevoToltok' }),
    C('b_when', 'Mikor kell működnie?', ['1 hónapon belül', '1-3 hónap', '3-6 hónap', 'Később'], { crm: 'TervezettTelepites' }),
    TAX({ id: 'b_taxid' }),
    C('b_position', 'Mi a szereped a döntésben?', ['Döntéshozó', 'Előkészítő', 'Műszaki szakember', 'Kivitelező'], { crm: 'Kontakt: Position' })
  ].concat(ADDRESS('A helyszín címe, ha eltér a székhelytől.'));

  /* --- C · Társasház, lakópark, fejlesztés (Pilot 67) --- */
  var C_NOT_RESIDENT = function (a) { return a.c_role !== 'Lakó, tulajdonos'; };
  var Cb = [
    C('c_role', 'Mi a szereped?', ['Lakó, tulajdonos', 'Közös képviselő, társasházkezelő', 'Fejlesztő, beruházó', 'Generálkivitelező, villanyszerelő'], { crm: 'Szerepkor' }),
    TAX({ id: 'c_taxid', description: 'Csak ha nem lakóként érdeklődsz.', showIf: C_NOT_RESIDENT }),
    C('c_state', 'Meglévő vagy új építésű?', ['Meglévő', 'Épül', 'Tervezés alatt'], { crm: 'EpuletAllapota' }),
    { id: 'c_handover', type: 'date', required: false, title: 'Mikor lesz az átadás?', crm: 'TervezettAtadas', showIf: function (a) { return a.c_state === 'Épül' || a.c_state === 'Tervezés alatt'; } },
    N('c_flats', 'Hány lakás van?', { required: false, crm: 'ParkolokVagyLakasokSzamaBaudata' }),
    N('c_spots', 'Hány parkolóhely van?', { required: false, crm: 'ParkolokSzama' }),
    C('c_residents', 'Hány lakó szeretne most töltőt?', ['1', '2-5', '6-20', '20 felett', NOT_SURE], { crm: 'ErdeklodoLakok' }),
    C('c_garage', 'Milyen a parkolás?', ['Teremgarázs', 'Kültéri', 'Mindkettő'], { crm: 'GarazsTipus' }),
    C('c_meter', 'Honnan menne az áram?', ['Saját lakásóráról', 'Közös óráról', NOT_SURE], { crm: 'MeresiMod' }),
    C('c_decision', 'Hol tart a döntés?', ['Információgyűjtés', 'Közgyűlés előtt', 'Közgyűlés megszavazta', 'Beruházói döntés megvan'], { crm: 'DontesiAllapot' }),
    T('c_building', 'Az épület vagy projekt neve', { required: false, crm: 'Projekt2' })
  ].concat(ADDRESS('Az épület címe.')).concat([
    T('c_rep', 'Ki a közös képviselő?', { required: false, description: 'Név és elérhetőség, ha tudod.', crm: 'Megjegyzes2', showIf: function (a) { return a.c_role === 'Lakó, tulajdonos'; } })
  ]);

  /* --- D · Viszonteladó, villanyszerelő partner (Viszonteladók 69) --- */
  /* A MiniCRM "Villanyszerelő" (Villanyszerelo2) lista mind a 7 értéke, a MiniCRM sorrendjében */
  var COLLAB = ['Telepítést vállalok', 'Villamos biztonsági felülvizsgálatot (VBF) végzek', 'Már telepítettem Voltie töltőt', 'Töltőt értékesítek', 'Regisztrált villanyszerelő vagyok', 'Minősített regisztrált szerelő vagyok', 'Ajánlóként, jutalékért'];
  var INSTALL = COLLAB[0], VBF = COLLAB[1];
  /* Aki telepíthet (vállal telepítést, már telepített Voltie töltőt, regisztrált vagy minősített szerelő, vagy telepített már töltőt), annak megjelenik a kiszállási terület */
  function canInstall(a) {
    return has(a.collab, INSTALL) || has(a.collab, COLLAB[2]) || has(a.collab, COLLAB[4]) || has(a.collab, COLLAB[5]) || a.installed === 'Igen';
  }
  var Dq = [
    /* Csak az adószám formátumához kell (egyéni vállalkozónál nincs kötőjel). Ha az adószámot a MiniCRM-ből már ismerjük és a kitöltő megerősítette, nem kérdezzük, a szerver a cégnévből következteti ki (lib/known.js). */
    C('legalform', 'Vállalkozási forma', ['Kft., Bt.', 'Egyéni vállalkozó', 'Egyéb'], { crm: 'Cegforma',
      showIf: function (a) { return !(a._confirmed && a._known && a._known.taxid); } }),
    TAX({ id: 'taxid', crm: 'Adoszam2 + Cég kontakt: VatNumber (Céginfó)',
      evMode: function (a) { return a.legalform === 'Egyéni vállalkozó'; },
      description: function (a) { return a.legalform === 'Egyéni vállalkozó' ? 'Egyéni vállalkozóként add meg az adószámodat (11 számjegy) vagy az adóazonosító jeledet (10 számjegy), kötőjel nélkül is.' : 'Formátum: 12345678-1-23. A cég adatait ebből kérjük le.'; } }),
    T('company', 'Cégnév', { description: 'Egyéni vállalkozó esetén a vállalkozás neve.', autocomplete: 'organization', crm: 'Cég kontakt: Name + Ceg',
      lookup: { endpoint: '/api/cegnev', from: function (a) { var t = String(a.taxid || (a._display && a._display.taxid) || ''); return t.replace(/\D/g, '').length === 11 ? t : ''; },
        /* csak az adószámra (11 jegy) keresünk, az adóazonosító jelre (10 jegy) nem */
        loading: 'Cégnév keresése az adószám alapján…', found: 'A cégnevet az adószám alapján töltöttük ki. Ha nem pontos, javítsd.' } }),
    T('website', 'Weboldal', { required: false, placeholder: 'https://', crm: 'Weboldal' }),
    M('activity', 'Mivel foglalkozol?', ['Villanyszerelés', 'EV töltő értékesítés / Elektromos nagykereskedés', 'Napelem telepítés', 'Elektromos tervezés/kivitelezés', 'Autókereskedés', 'Generálkivitelezés', 'Egyéb'], { description: 'Több is választható.', crm: 'Tevekenyseg' }),
    M('collab', 'Milyen formában dolgoznál velünk?', COLLAB, { description: 'Több is választható.', crm: 'Villanyszerelo2' }),
    C('installed', 'Telepítettél már autótöltőt?', ['Igen', 'Nem'], { crm: 'TelepitettMarAutotoltot (+ státusz 3560 / 3550)' }),
    C('installed_count', 'Hány autótöltőt telepítettél eddig?', ['1-5', '6-20', '21-50', '50 felett'], { crm: 'TelepitesiTapasztalat', showIf: function (a) { return a.installed === 'Igen'; } }),
    M('brands', 'Milyen márkákat telepítettél?', ['Voltie', 'Wallbox', 'ABB', 'Schneider Electric', 'Zaptec', 'Easee', 'Tesla', 'Alfen', 'Egyéb'], { crm: 'TelepitettMarkak', showIf: function (a) { return a.installed === 'Igen'; } }),
    M('install_scale', 'Hány töltő telepítését vállalod egy projekten?', ['1-2 töltő', '3-5 töltő', '6-10 töltő', '11-20 töltő', 'Bármennyit'], { required: false, description: 'Több is választható.', crm: 'TelepitestVallal', showIf: canInstall }),
    M('counties', 'Melyik megyékben vállalsz díjmentes kiszállást, felmérést?', COUNTIES, { required: false, description: 'Több is választható. Ha nem vállalsz díjmentes kiszállást, hagyd üresen.', crm: 'DijmentesFelmeresMegyek', showIf: canInstall }),
    N('km', 'Hány km-ig mész ki?', { required: false, placeholder: 'pl. 60', crm: 'KiszallasKmhatar', showIf: canInstall }),
    T('meevet', 'Szerepelsz a MEE VET névjegyzékben?', { required: false, description: 'Ha igen, add meg a linket. Ha nem, hagyd üresen.', placeholder: 'https://', crm: 'MeeVetLink', showIf: function (a) { return has(a.collab, VBF); } }),
    N('team', 'Hány fős a csapatod?', { required: false, crm: 'Csapat' }),
    C('design', 'Vállalsz műszaki tervezést, hálózati igénybejelentést?', ['Igen', 'Nem'], { required: false, crm: 'MuszakiTervezes' }),
    N('yearly', 'Évente kb. hány töltőt tudnál értékesíteni vagy telepíteni?', { required: false, crm: 'N2026EvesRendelesiMennyiseg' })
  ];

  /* --- E · Meglévő töltő, műszaki kérdés (Felhasználók 71) --- */
  var E = [
    T('serial', 'Sorozatszám', { description: 'A töltő oldalán lévő címkén találod.', crm: 'Sorozatszam' }),
    C('problem', 'Miben kérsz segítséget?', ['Nem tölt', 'App és párosítás', 'Wifi és internet', 'Napelemes vezérlés', 'Számla és elszámolás', 'Egyéb'], { crm: 'ProblemaTipusa' }),
    C('urgency', 'Mennyire sürgős?', ['Nem tudok tölteni', 'Működik de hibás', 'Csak kérdés'], { crm: 'Surgosseg' }),
    { id: 'desc', type: 'long', required: true, title: 'Írd le a problémát', crm: 'HibaLeirasa' }
  ];

  /* --- F · Csak informálódom (Pilot 67) --- */
  var F = [
    M('interest', 'Mi érdekel?', ['Otthoni töltő', 'Céges', 'Társasházi', 'App', 'Napelemes töltés'], { description: 'Több is választható.', crm: 'ErdeklodesiTerulet' }),
    C('timing', 'Mikor lehet aktuális?', ['3 hónapon belül', 'Fél éven belül', 'Később'], { required: false, crm: 'TervezettTelepites; VasarloiCiklus = Felismerés' })
  ];

  /* A kérdéseket az adott ágra korlátozza (a saját feltételüket megtartja) */
  function scope(roleLabel, qs) {
    return qs.map(function (q) {
      var c = merge({}, q), own = q.showIf;
      c.showIf = function (a, h) { return a.role === roleLabel && (!own || own(a, h)); };
      return c;
    });
  }
  function onlyFor(roles, q) {
    var c = merge({}, q);
    c.showIf = function (a) { return roles.indexOf(a.role) > -1; };
    return c;
  }

  /* Záróképernyő a partner jelentkezéshez: ajánlat letöltése (ha kért), első lépések, anyagok, aláírás */
  function partnerThanks(a) {
    var d = a._display || {};
    var dlm = /^25%/.test(a.offer || '') ? a.dlm1 : /^40%/.test(a.offer || '') ? a.dlm : '';
    var wants = /^(40|25)%/.test(a.offer || '');
    var links = [];
    if (wants) {
      links.push({
        label: 'Letöltöm az ajánlatot',
        download: {
          endpoint: '/api/ajanlat', filename: 'Voltie-ajanlat.pdf',
          body: { company: a.company || d.company || '', taxid: a.taxid || d.taxid || '', name: ((a.lastname || '') + ' ' + (a.firstname || '')).trim() || d.name || '', email: a.email || '', phone: a.phone || '', offer: a.offer, dlm: dlm }
        }
      });
    }
    links.push({ label: 'Első lépések', href: QUICKSTART }, CALCULATOR, { label: 'Anyagok letöltése', href: DOWNLOADS });
    return {
      title: 'Köszönjük a jelentkezést!',
      text: wants
        ? 'Hamarosan felvesszük veled a kapcsolatot. Az ajánlati sablont csatolva küldöm.'
        : 'Hamarosan felvesszük veled a kapcsolatot. Addig nézd meg az első lépéseket, és töltsd le a partneri anyagokat.',
      links: links,
      signature: SIGNATURE
    };
  }

  return {
    partnerThanks: partnerThanks,
    QUICKSTART: QUICKSTART, DOWNLOADS: DOWNLOADS, PROMO: PROMO, TERMS: TERMS, HIDDEN: HIDDEN, ROUTER: ROUTER,
    CONTACT: CONTACT, HEARD: HEARD, NOTE: NOTE, LEGAL: LEGAL, OFFER: OFFER, SIGNATURE: SIGNATURE,
    A: A, B: B, C: Cb, D: Dq, E: E, F: F,
    scope: scope, onlyFor: onlyFor, in_: in_
  };
})();
