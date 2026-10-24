# Voltie űrlapok

Két Typeform-stílusú űrlap. Források: a Voltie leadháló (Javasolt kérdéssorok), a `MiniCRM_mezospecifikacio_webes_urlapok_ellenorzott_v2.xlsx` és a `minicrm-69-mezok.json`.

| Fájl | Mire való | Mód |
| --- | --- | --- |
| `urlap/altalanos.html` | Mindenki tölti. Az első kérdés („Miben segíthetünk?”) dönti el az ágat: A otthoni, B cég, C társasház, D partner, E műszaki, F informálódó. | Demó (`endpoint` üres, nem küld sehova) |
| `urlap/viszontelado.html` | Csak viszonteladóknak (a D ág, belépő kérdés nélkül). | Éles (`/api/viszontelado` → MiniCRM 69) |

A kérdéssorok az `urlap/questions.js` fájlban vannak. Minden kérdésnél a `crm` tulajdonság a MiniCRM mező API kulcsa.

Mindkét végén az első lépések (https://www.voltie.eu/quickstart), a jutalékos kalkulátor (`urlap/Voltie-jutalekos-kalkulacio.xlsx`, közvetlen letöltés az űrlap mappájából) és a letölthető anyagok (SharePoint, Share oldal) linkje. A kalkulátor cseréjéhez egyszerűen írd felül ezt a fájlt, és töltsd fel újra Netlifyra. Az általános űrlapon a SharePoint-link csak a partner ágon jelenik meg.

## Szerkezet

- `lib/company.js`: cégnév az adószám alapján. Előbb a NAV Online Számla (`lib/nav.js`, ha a `NAV_*` változók be vannak állítva, lásd [NETLIFY.md](NETLIFY.md)), tartaléknak az EU VIES (ingyenes). Az űrlap az adószámot kérdezi előbb, a cégnevet előtöltve. Ha egyik sem ad nevet, a kitöltő kézzel adja meg. Próba: `node scripts/nav-teszt.js <adószám>`.
- `lib/known.js`: id-s linknél a jelentkező MiniCRM-beli adatainak megerősítése (részben elrejtve) és kitöltése beküldéskor.
- `lib/core.js`: a jelentkezés közös logikája (MiniCRM, meglévő adatlap kiegészítése, feladat, ajánlat).
- `server.js`: helyi szerver (`node server.js`), vékony burok a `lib/core.js` körül.
- `netlify/functions/`: ugyanez Netlify függvényként, lásd [NETLIFY.md](NETLIFY.md).

## Éles indítás (viszonteladói űrlap)

1. Hozd létre a `.env` fájlt a `.env.example` alapján (a `MINICRM_SYSTEM_ID` és `MINICRM_API_KEY` kell bele). A szerver csak a `.env`-et olvassa, a `.env.example` egy sablon, kulcs nem maradhat benne.
2. `node server.js`, majd `http://localhost:3000/viszontelado.html`.

API kulcs nélkül a szerver dry-run módban indul: kiírja, mit küldene a MiniCRM-nek, de nem küld semmit.

## Hogyan kerülnek a válaszok a MiniCRM-be

- `crm-mapping.json`: kérdés → technikai név (Cegforma, Tevekenyseg, DijmentesFelmeresMegyek…).
- **Élő séma:** a program a lehetséges listaértékeket beküldéskor az élő MiniCRM-ből olvassa (`Schema/Project/69`, tíz percig tárolva), a `minicrm-69-mezok.json` csak tartalék. Az értékeket tűrően párosítja (`lib/match.js`: ékezet-, kisbetű-független egyezés és egyetlen betűnyi elírás), így egy elírt vagy később kijavított listaérték (pl. „1-2 tötő") külön beavatkozás nélkül működik. Új lista- vagy szövegmezőt a `crm-mapping.json` `fields` részébe kell felvenni a kérdés azonosítójával.
- `minicrm-69-mezok.json`: a mezők típusa és a megengedett értékek. Lista és többválasztós mezőbe csak pontosan egyező érték megy, ami nem illik, az „Egyéb” lesz (ha van ilyen érték), különben kimarad.
- `valueMap` a `crm-mapping.json`-ban: a javított szöveget fordítja arra, ami a MiniCRM-ben most szerepel (pl. „Villanyszerelés” → „Villanyszereés”). Ha kijavítod a MiniCRM listát, töröld a `Tevekenyseg` sorokat.
- `OsszesValasz2`: minden válasz „Kérdés: válasz” sorokban, az űrlapverzióval és a rejtett mezőkkel az elején.
- Státusz (sorrendben az első egyező szabály; „kivitelez": kivitelezési formát jelölt vagy már telepített töltőt, „értékesít": „Töltőt értékesítek", vagy a „Mivel foglalkozol?" közül csak az „EV töltő értékesítés / Elektromos nagykereskedés"): „Már telepítettem Voltie töltőt" → **Voltie telepítő** (3638); kivitelez és értékesít is → **Telepítő / viszonteladó** (3604); értékesít vagy ajánl, de nem kivitelez (pl. egy bolt) → **Csak viszonteladó** (3694); különben a „Telepítettél már autótöltőt?" szerint Igen → Már telepített autótöltőt (3560), Nem → Nem telepített még (3550).
- Rejtett mezők: `utm_source` → Source2, `lang` → Nyelv3. Ha az URL-ben `id` van (a 137 korábbi jelentkező linkje), a program új adatlap helyett a meglévőt frissíti.
- Az egyedi mezők a projekt szintjén mennek a MiniCRM-nek (nem `Data` alatt).
- Többválasztós mezők küldési formája: `MINICRM_MULTI_FORMAT` (`comma`, `semicolon` vagy `array`, alapértelmezés: `comma`). Az első éles tesztnél nézd meg a megyéknél, hogy több érték is bekerül-e.
- **Meglévő jelentkezők (nem duplikálódnak):** az e-mailből a MiniCRM-be felvitt jelentkezőnek a MiniCRM-ből kiküldött levélben személyes linket kell adni: `.../viszontelado.html?id=<adatlap azonosító>`. Az űrlap ilyenkor nem hoz létre új adatlapot és ügyfelet, hanem a meglévőt egészíti ki: kitölti a kérdőív mezőit, a cég megkapja az adószámot (abból tölt a Céginfó), a személyhez a hiányzó e-mail és telefon kerül. A felelős nem változik, a „Kitöltötte a kérdőívet…" feladat a jelenlegi felelősnek készül. Védelem: csak a 69-es kategória adatlapja írható át, és csak „Régi jelentkező, kérdőív kiküldve” (3809) státusszal, vagy ha a linkben a `h` paraméter az adatlap Hash mezőjével egyezik. Aki már kitöltötte, azt a program nem írja át újra (409, barátságos üzenettel). Az `id` nélküli linknél a program e-mail és adószám alapján keres meglévő jelentkezőt (`lib/dedupe.js`, csak olvasó lekérdezések): kitöltetlen adatlapot kiegészít, kitöltött adatlapra csak feladatot ír a felelősnek, találat nélkül új adatlapot készít. `LINK_DEDUPE=0` kikapcsolja.
- Felelős: Tóth Bence (a MiniCRM felhasználói azonosítóját a `MINICRM_USER_ID` változó adja). Minden jelentkezéshez készül egy feladat holnapi határidővel: ha a kitöltő töltőt kért (3 fázisú -40% vagy 1 fázisú -25%), „Hívd fel, kért töltőt: …” (`MINICRM_TODO_CALL_TEXT`), a szöveg végén a kért töltővel és a dinamikus energiamenedzsmenttel (vagy annak hiányával). Ha nem kért ajánlatot, „Viszonteladói csatlakozó: nem kért ajánlatot, csak jelentkezett” (`MINICRM_TODO_TEXT`). A menedzsment kérdés csak töltő kérésekor jelenik meg.
- Ajánlat PDF: a `/api/ajanlat` a kitöltő választásaiból legenerálja (`offer.js`, Voltie arculat, Tóth Bence aláírásával). Az ajánlatkérő a cég neve, az ajánlat 1 hétig érvényes, az árak a Voltie kalkulátorból valók (22 kW 3 fázisú: 394 000 Ft, -40%; 7,4 kW 1 fázisú: 275 590 Ft, -25%; dinamikus energiamenedzsment több fázisra: 70 000 Ft, -35% (3 fázisú töltő mellé), egy fázisra: 50 000 Ft, -20% (1 fázisú töltő mellé); nettó árak, 27% ÁFA). Az árak és a kedvezmények az `offer.js` `PRODUCTS` blokkjában módosíthatók. Nem tárol semmit. Ehhez egyszer kell `npm install` (pdfkit).
- A MiniCRM adatlap neve a cég neve.
- Hibák: ha a MiniCRM elutasít egy kontaktot (pl. már létező cég vagy e-mail), a program cég nélkül, majd e-mail és telefon nélkül is megpróbálja, és a részleteket a `logs/crm-errors.log` fájlba írja. Az adatlap így nem vész el.
- Hibakereséshez `MINICRM_DEBUG=1` a `.env`-ben: a szerver kiírja a MiniCRM kéréseit és válaszait.
