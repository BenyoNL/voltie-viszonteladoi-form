voltie.eu űrlapok → MiniCRM · állapot: 2026. október 21.

# Voltie leadháló

Ez a térkép megmutatja, hogyan jut el egy kitöltés a weboldalról a MiniCRM-be. Látszik, melyik kérdés melyik mezőbe kerül, mi vész el útközben, és hogyan nézne ki egy átszervezett, mindenre kiterjedő űrlaprendszer. Az adatok a három élő Typeformból, a MiniCRM sémából, 43 webes adatlapból és a Pilot automatizmusaiból származnak.

**3**Typeform űrlap élesben

**1**MiniCRM natív űrlap (hírlevél)

**3**kérdés, aminek a válasza nem jut be a CRM-be

**137**viszonteladói jelentkező várakozik (Wolf Mátyás 10.21-i levele)

**0**viszonteladói kitöltés kerül be automatikusan

## A legfontosabb megállapítások

1. **Az ajánlatkérés, az érdeklődés és a műszaki infó ugyanabba a Pilot státuszba fut** (Ajánlatkérő). Az Érdeklődés és a Műszaki információ ág a telefonszám után rögtön a „Hol hallottál rólunk?" kérdésre ugrik, így ezekről semmilyen minősítő adat nem keletkezik.
2. **A műszaki pontosító űrlap csak 1 vagy 2 töltőnél jön elő.** Aki 3-at, „Több"-et vagy „Még nem tudom"-ot jelöl (tipikusan céges és társasházi lead), az egyetlen műszaki kérdést sem kap.
3. **A pontosító űrlap 3 válasza elvész:** a fázisszám, a napelem és a villanyszerelő mezője minden vizsgált adatlapon üres. Közben az amper, a fal/oszlop, az internet, az autó és a cím bekerül.
4. **A viszonteladói űrlap csak e-mailt küld** (Zapier → Magyar Zoltán, másolat Egressy András). A 69-es kategória („Viszonteladók + villanyszerelők") kész, a „Villanyszerelői jelentkezés (Typeform)" mezőblokk is megvan, de semmi nem tölti.
5. **Apróbb hibák:** az egyéni vállalkozó nem kapja meg a Cégnév kérdést. A Google Ads leadeknél a source és a medium fel van cserélve (source = cpc, medium = google). A „Projekt típusa" lista nem töltődik ki automatikusan, ezért cég és magánszemély szerint nem lehet szűrni.

Belépési pont Űrlap Űrlaplogika Integráció MiniCRM Automatizmus Zsákutca / kézi munka

A „Minősítve" státuszt a pontosító űrlap kitöltése után láttam az adatlapokon, a felelős pedig a beérkezéskor már ki van osztva. Hogy ezt a Typeform integráció vagy egy külső zap állítja, az a MiniCRM-ből nem látszik. Érdemes megkérdezni attól, aki az integrációt beállította.

## Az elv

Egy belépő kérdés dönti el, ki tölti ki az űrlapot. Mindenki csak a saját ágának kérdéseit kapja, és minden ág a saját MiniCRM kategóriájába, a saját státuszába és a saját felelőséhez fut. A válaszok fix választós kérdésekből jönnek, így a CRM-ben szűrhetők lesznek.

- Egy Typeform (HU + EN), egy zap útvonalakkal (Paths), egy helyen karbantartható
- A „Projekt típusa" mindig kitöltődik, ebből lesz a leadkiosztás és a riport
- A viszonteladó a 69-es kategóriába kerül, azonnali automata válasszal
- A műszaki kérdés nem sales lead: supportba megy, nem terheli a Pilotot

### Rejtett mezők minden ágon

A Typeform beágyazásnál a weboldal adja át, a zap pedig változtatás nélkül beírja őket.

| Rejtett mező | MiniCRM mező |
| --- | --- |
| utm_source | Source |
| utm_medium | Medium |
| utm_campaign | Campaign |
| landing (oldal URL) | Landing |
| lang (hu / en) | Nyelv |
| form_version | Form |

## Kérdés → MiniCRM mező

A jelenlegi három űrlap minden kérdése, és hogy hova kerül (vagy hova nem). Az állapotot a legutóbbi 43 webes Pilot adatlap tényleges tartalma alapján jelöltem.

| Űrlap | Kérdés | Válasz típusa | MiniCRM mező | Állapot | Megjegyzés |
| --- | --- | --- | --- | --- | --- |

Bekerül rendben eljut a mezőbe Gyenge bekerül, de szabad szöveg vagy pontatlan Elvész megkérdezzük, de a mező üres marad

## Javasolt kérdéssorok, teljes sorrendben

Ágonként a teljes kitöltés, ahogy a kitöltő látja: a közös képernyőkkel (szürke), a feltételes vagy kihagyható képernyőkkel (szaggatott keret) együtt. A kérdéscsoport egy képernyőn több kérdést mutat, ezért a képernyők száma a mérvadó, nem a mezőké. Minden kérdés mellett ott a cél mező: Meglévő már ott van a kategóriában, Javítandó megvan, de át kell állítani, Hiányzik még nem jött létre a MiniCRM-ben. (Állapot: 2026.10.22., 2. ellenőrzés: minden mező létrejött.)

### Adószámból cég

A MiniCRM Céginfó szolgáltatása új cég létrehozásakor (űrlapból és API-ból is) az adószám alapján kitölti a cégnevet, a székhelyet, a cégjegyzékszámot, a létszámot, az árbevételt és a tevékenységi kört, egyéni vállalkozónál is. Így a kérdőívben elég az adószámot kérni. A kitöltés közben a Typeform nem tudja megmutatni a cég nevét, a felismerés a mentés után történik. Feltétel: Professional előfizetés, bekapcsolás a Beállítások, Előfizetés, Céginfó beállítások alatt; az első 2000 lekérdezés 8 EUR + ÁFA.

### Kapcsolat célja mindig kitöltve

A webes leadekre teendőt és automata levelet adó automatizmusok (304, 296, 329) csak akkor indulnak, ha a Kapcsolat célja nem üres. Ezért a zap minden Pilot ágon beírja: „Ajánlatkérés: otthoni”, „Ajánlatkérés: céges”, „Ajánlatkérés: társasház” vagy „Érdeklődés”. Az eltérő érték a riportban is szétválasztja az ágakat.

## Gyors javítások

Ezekhez nem kell az új űrlap, a mostani rendszeren is megcsinálhatók.

## Az átszervezés lépései

Ebben a sorrendben érdemes haladni, mert a mezőknek a zap bekötése előtt létezniük kell.

### MiniCRM mezők: ellenőrzés az élő séma alapján (2026.10.22., 2. kör)

A MiniCRM a listaértékekből kiveszi a vesszőt, a helyén dupla szóköz marad. Ezért a listaértékekbe ne kerüljön vessző, és a Typeformban pontosan ugyanaz a szöveg legyen.

A részletes, kipipálható specifikáció (értékek, dobozok, módosítások, Typeform leképezés) a MiniCRM_mezospecifikacio_webes_urlapok.xlsx munkafüzetben van.

| Kategória | Technikai név | Típus | Állapot 10.22. | Megjegyzés |
| --- | --- | --- | --- | --- |

### Forrás

Typeform: Ajánlatkérés & kapcsolatfelvétel (XBpeGrxP, utolsó módosítás 2026.10.07), Ajánlatkérés pontosítás (pXtom8hN, 2026.06.26), Viszonteladói csatlakozás (Zsp8p4UA, 2026.06.26) voltie.eu főoldal: Kapcsolat blokk (#contact-crm), lábléc hírlevél (MiniCRM natív űrlap), help@voltie.eu MiniCRM: Pilot (67), Viszonteladók + villanyszerelők (69) és Felhasználók (71) kategória sémája; a „Webről érkezett vásárló" és a „Weblap érdeklődők" szűrő adatlapjai; a Pilot automatizmusai (329, 304, 296, 290, 487) Outlook: „Viszonteladói csatlakozás" Zapier értesítő (zap 321097352), „Viszonteladói jelentkezés" levélszál, 2026.10.21.