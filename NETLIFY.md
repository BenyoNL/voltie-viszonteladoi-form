# Telepítés Netlify-ra

Az űrlap két részből áll: a statikus oldal (`urlap/`) és két háttérfüggvény (`netlify/functions/`), amelyek a MiniCRM-mel beszélnek és az ajánlat PDF-et készítik. Az API kulcs csak a függvényekben van, a böngésző sosem látja.

## 1. Feltöltés

A függvények miatt a "húzd be a mappát" módszer nem jó (a függvények csomagjait nem telepíti). Két út:

- **GitHub:** tedd a mappát egy privát tárolóba, és a Netlify-ban "Add new site, Import from Git". A `.gitignore` már kizárja a `.env` fájlt, a `logs` és a `node_modules` mappát. A `.env`-et soha ne töltsd fel.
- **Netlify CLI:** `npm install -g netlify-cli`, majd a projekt mappában `netlify deploy --prod`.

A build beállítások a `netlify.toml`-ban vannak (publish: `urlap`, a főoldal a viszonteladói űrlap), nem kell kézzel megadni.

## 2. Környezeti változók (Site configuration, Environment variables)

| Változó | Érték |
| --- | --- |
| `MINICRM_SYSTEM_ID` | a MiniCRM rendszerazonosító |
| `MINICRM_API_KEY` | az API kulcs |
| `MINICRM_CATEGORY_ID` | 69 |
| `MINICRM_USER_ID` | a felelős (Tóth Bence) MiniCRM felhasználói azonosítója (a neve pontosan `MINICRM_USER_ID`, nem `MINICRM_USER`) |
| `MINICRM_NOTE_FIELD` | OsszesValasz2 |
| `MINICRM_MULTI_FORMAT` | comma |

Opcionális:

| Változó | Mire jó |
| --- | --- |
| `LINK_TOKEN_FIELD` | egy saját mező technikai neve az adatlapon (pl. `UrlapToken`), amelynek értéke a link titkos kulcsa (`t` paraméter) |
| `LINK_REQUIRE_TOKEN` | `1` esetén meglévő adatlapot csak titkos kulccsal lehet átírni |
| `LINK_DEDUPE` | `0` esetén kikapcsolja a duplikáció-figyelést (teszteléshez hasznos, lásd a 4. pontot) |
| `LINK_UPDATE_STATUSES` | azok a státuszazonosítók vesszővel, amelyeknél az adatlap még frissíthető (alapból a "Régi jelentkező, kérdőív kiküldve" és a "Bejövő email") |
| `MINICRM_DEBUG` | `1` esetén a függvénynapló kiírja a MiniCRM kéréseit és válaszait (teszthez; utána töröld) |

A hibák a Netlify "Functions" részének naplójában látszanak.

A `netlify.toml` `SECRETS_SCAN_OMIT_KEYS` beállítása miatt a Netlify titokvédelme nem akad fenn a MiniCRM rendszer- és felhasználói azonosítón (ezek nem titkok, minden MiniCRM címben szerepelnek). Az **API kulcsot** továbbra is védi: ha az valahol a fájlokban szerepelne, a build leáll. Az API kulcs nincs a fájlokban, csak a Netlify beállításai között.

## 3. A link az e-mailben

Az e-mailből felvitt jelentkezőket vidd a "Régi jelentkező, kérdőív kiküldve" státuszba, és a MiniCRM levélsablonban a link végére tedd az adatlap azonosítóját:

```
https://<oldalad>.netlify.app/?id={%Other.ProjectUrl%}
```

Az `id` lehet a teljes adatlap URL is, az oldal kiszedi belőle a számot. Aki nyitja a linket, a saját adatlapját egészíti ki, nem készül új adatlap és új ügyfél.

**Biztonság.** Az azonosító sorszám, ezért kitalálható. Védelem:
- Alapból csak a "kérdőív kiküldve" státuszú adatlap írható át, és a kitöltés után a státusz megváltozik, így másodszor nem.
- Erősebb védelem: hozz létre egy "Űrlap token" szöveges mezőt a 69-es kategóriában, töltsd fel véletlen értékekkel (importtal), add meg a technikai nevét a `LINK_TOKEN_FIELD` változóban, és tedd a linkbe: `...?id={%Other.ProjectUrl%}&t={%Project.UrlapToken%}`. Ezután a `LINK_REQUIRE_TOKEN=1` mellett kulcs nélkül senki nem írhat át adatlapot.

Küldj tesztlevelet magadnak, és nézd meg, pontosan mi kerül a linkbe, mielőtt kiküldöd a többieknek.

### Adatok előtöltése az id-s linknél

Ha a linkben ott az `id`, és az adatlap még nem kitöltött (frissíthető státuszú), az űrlap a "Kitöltöm" gomb után megmutatja, mit tud a jelentkezőről a MiniCRM-ből (cégnév, név, e-mail, telefonszám, adószám), két gombbal:

- **Rendben, tovább:** ezeket az adatokat nem kérdezi újra, a beküldéskor a szerver a MiniCRM-ből tölti ki őket. Ami hiányzik az adatlapon (például a telefonszám), azt továbbra is megkérdezi.
- **Módosítom:** a teljes űrlap megjelenik. A név, a cégnév és az adószám előre kitöltve marad, az e-mail címet és a telefonszámot újra be kell írni.

**Adatvédelem:** az `id` sorszám, tehát kitalálható. Ezért az e-mail címet és a telefonszámot a képernyőn részben elrejtve mutatjuk ("b***@ceg.hu", "+•• •• ••• •567"), a teljes érték sosem kerül a böngészőbe. Kitöltött vagy törölt adatlapról, illetve másik kategória adatlapjáról semmit nem adunk ki. A `/api/jelentkezo?id=...` végpont adja az adatokat.

### Cégnév az adószám alapján

**A VIES lefedettsége korlátozott.** A MiniCRM-ben lévő 30 adószámból 20-at ismert a VIES (ezekre megadja a nevet), 10-et nem, pedig mind formailag érvényes volt (főleg az alanyi adómentesek). Ilyenkor a cégnév üresen marad, és kézzel kitölthető. Ezt oldja meg a NAV Online Számla adószám-lekérdezése (`queryTaxpayer`): minden érvényes adószámra megadja a hivatalos nevet (egyéni vállalkozóra és alanyi adómentesre is). A program előbb a NAV-ot kérdezi, és csak ha az nem ad nevet vagy nem elérhető, próbálkozik a VIES-szel. A NAV-lekérdezés csak akkor aktív, ha az alábbi `NAV_*` változók mind be vannak állítva, különben az űrlap a VIES-t használja, ahogy eddig.

**NAV Online Számla beállítása**

1. A NAV Online Számla felületén (https://onlineszamla.nav.gov.hu) a cég **elsődleges felhasználójával** lépj be (az Ügyfélkapus/KAÜ azonosítóddal).
2. Hozz létre egy **technikai felhasználót** ehhez az integrációhoz. Adj neki nevet és jelszót, a jelszót jegyezd fel.
3. A technikai felhasználónál generáld le az **aláírókulcsot** (kulcsgenerálás gomb). A kulcsot a felület csak egyszer mutatja, ezért azonnal mentsd el. A cserekulcsra ehhez a művelethez nincs szükség.
4. A jogosultságoknál az adószám-lekérdezéshez általában nem kell számlalekérdezési jog. Ha a próba hitelesítési hibát ad, kapcsold be a számlák lekérdezését is.
5. Állítsd be a változókat (Netlify: Site configuration, Environment variables; helyben: `.env`):

| Változó | Érték | Titok? |
| --- | --- | --- |
| `NAV_LOGIN` | a technikai felhasználó neve | nem |
| `NAV_PASSWORD` | a technikai felhasználó jelszava | **igen**, Netlifyban jelöld Secret-nek |
| `NAV_SIGN_KEY` | az aláírókulcs | **igen**, Netlifyban jelöld Secret-nek |
| `NAV_TAX_NUMBER` | a Voltie adószáma (az első 8 számjegy számít) | nem |
| `NAV_BASE_URL` | opcionális, alapból az éles NAV (`https://api.onlineszamla.nav.gov.hu/invoiceService/v3`); tesztrendszerhez `https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3` | nem |
| `NAV_SOFTWARE_ID` | opcionális, 18 karakter, `[0-9A-Z-]` | nem |

A jelszó és az aláírókulcs ne kerüljön fájlba (se README, se kód), csak a `.env`-be vagy a Netlify beállításai közé.

6. Próba a saját gépen (csak olvas): `node scripts/nav-teszt.js 12345678-1-23` (a saját adószámoddal). Kiírja, hogy a beállítás rendben van-e, mit válaszol a NAV, és milyen nevet töltene elő az űrlap.
7. Netlifyon a változók felvétele után indíts új deployt, majd a `/api/verzio` címen a `navConfigured` értéke legyen `true`.

A NAV hibái (hibás felhasználó, lejárt kulcs, nem elérhető) nem akasztják el a jelentkezést: a program a naplóba írja őket (`[NAV lekérdezés] ...`), és a VIES-re vált. A talált neveket 6 óráig memóriában tárolja.

**Elírás-figyelmeztetés:** a 11 jegyű adószám törzsszámának 8. számjegye ellenőrző számjegy. Ha az nem stimmel, az űrlap egyszer figyelmeztet („lehet, hogy elírtad"), és ugyanazzal az értékkel másodszorra továbbenged, így egy esetleges tévedés sem veszít el jelentkezőt.

**Egyéni vállalkozó:** ha a "Vállalkozási forma" kérdésnél az "Egyéni vállalkozó" választ jelölik, az adószám mezőben nincs kényszerített kötőjel. Megadható az adószám (11 számjegy) és az adóazonosító jel (10 számjegy) is. A 11 jegyű adószámot a program a MiniCRM-nek a megszokott 12345678-1-23 alakban küldi, és erre keresi a cégnevet. A 10 jegyű adóazonosító jelre nem keres nevet (abból nem képezhető megbízhatóan az adószám törzsszáma), azt a kitöltő kézzel adja meg. Ha a MiniCRM a 10 jegyű értéket nem fogadja el cég adószámaként, a cég kontakt nem jön létre, a jelentkezés viszont rögzül, és a hibát a napló mutatja.

Az űrlap előbb az adószámot kérdezi, majd a cégnevet előre kitöltve mutatja, amit a kitöltő átírhat. A nevet a NAV Online Számla adja (ha be van állítva), tartaléknak az EU VIES szolgáltatása (ingyenes, kulcs nélkül), a program rövidíti és szépen írja ("VOLTIE KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG" → "Voltie Kft."). A `/api/cegnev` végpont végzi. Ha a VIES nem elérhető, vagy a cég nem ÁFA-alany (egyéni vállalkozónál is előfordul), a mező üres marad, és kézzel kitölthető, a jelentkezés ettől nem akad el.

## 4. Duplikáció-figyelés (id nélküli link)

Ha a linkben nincs `id`, a program a beküldés előtt megkeresi a MiniCRM-ben a meglévő jelentkezőt az **e-mail cím** és az **adószám** alapján (csak olvasó lekérdezésekkel):

- **Kitöltetlen adatlapot talál** ("Régi jelentkező, kérdőív kiküldve" vagy "Bejövő email" státusz): nem készül új adatlap és ügyfél, a program a meglévőt egészíti ki, ugyanúgy, mint az `id`-s linknél.
- **Már kitöltött vagy folyamatban lévő adatlapot talál:** új adatlap nem készül, az adatlap mezői nem változnak. A felelős feladatot kap: "Ismételt kitöltés érkezett (egyezés: e-mail / adószám) ...", benne a kitöltő neve, e-mail címe, telefonszáma, cége és hogy mit kért.
- **Nem talál semmit:** új adatlap készül.
- Ha a keresés hibára fut, a program inkább új adatlapot hoz létre, mint hogy elveszítse a jelentkezést.

**Tesztelésnél vigyázz:** ha ugyanazzal az e-mail címmel vagy adószámmal töltöd ki újra, mint egy korábbi teszt, a program a meglévő adatlapot találja meg, és nem készít újat. Tesztelj új e-mail címmel és adószámmal, vagy állítsd be ideiglenesen a `LINK_DEDUPE=0` változót.

## 5. Tudnivalók

- Az `id` nélküli link esetén a program e-mail és adószám alapján keres meglévő jelentkezőt (lásd a 4. pontot). Ha valaki másik e-mail címmel és más adószámmal tölti ki, mint amit felvittél, új adatlap készül.
- A Netlify függvények alapból 10 másodpercig futhatnak. A jelentkezés feldolgozása néhány MiniCRM hívás, ez általában belefér.
- Az oldalon nincs IP-korlát, csak egy rejtett csapdamező (honeypot). Ha botok kezdenék tölteni, szólj.
- Az `urlap/altalanos.html` egy demó, nem küld sehova. Ha nem akarod publikálni, töröld a mappából.
