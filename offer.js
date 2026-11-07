/* Személyre szabott Voltie ajánlat PDF.
   Kinézet: az "ajanlat-keszites" skill arculata (Inter betű, hivatalos logó, türkiz-fekete fejlécvonal),
   az aláírás pedig Tóth Bence e-mail aláírása. A tételek és az árak a Voltie kalkulátorból valók. */
'use strict';
const path = require('path');
const PDFDocument = require('pdfkit');

/* Netlify-on az "included_files" fájlok a függvény gyökerében (LAMBDA_TASK_ROOT) vannak, helyben a projekt mappában */
const ROOT = process.env.LAMBDA_TASK_ROOT && require('fs').existsSync(path.join(process.env.LAMBDA_TASK_ROOT, 'assets')) ? process.env.LAMBDA_TASK_ROOT : __dirname;
const A = (f) => path.join(ROOT, 'assets', f);
const INK = '#0A0B0D', TEXT = '#14171A', GREY = '#525A63', LIGHT = '#8A939D', LINE = '#E6E9EB', CARD = '#F4F5F6', TEAL = '#098F8F', TEAL_BG = '#E6FAFA';

const VAT_RATE = 27;          // %
const VALID_MONTHS = 1;       // az ajánlat érvényessége: 1 hónap (a kiállítás napjától, naptári hónapban számolva)

const PROVIDER = {
  name: 'Voltie Kft.', address: '2800 Tatabánya, Tarjáni út 1.', tax: '27997695-2-11',
  contact: 'Tóth Bence', title: 'Kiemelt ügyfélkapcsolati képviselő',
  email: 'toth.bence@voltie.eu', phone: '+36 20 287 7513',
  office: '1027 Budapest, Henger utca 2.C épület 2. emelet', web: 'www.voltie.eu'
};

/* Kalkulátor: nettó egységár (Ft) és kedvezmény (%) */
const PRODUCTS = {
  three: { name: 'VOLTIE 22kW Okos töltő 3x 32A, RFID, Display', unit: 394000, discount: 40 },
  one: { name: 'VOLTIE 7,4 kW T2 Charger, 1x 32A, RFID, Display, Smart', unit: 275590, discount: 25 },
  dlm: { name: 'Dinamikus energiamenedzsment/napelem integráció, több fázis (max 80A)', unit: 70000, discount: 35 },
  dlm1: { name: 'Dinamikus energiamenedzsment/napelem integráció, egy fázis', unit: 50000, discount: 20 }
};

const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
const DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const p2 = (n) => String(n).padStart(2, '0');
const dotted = (d) => d.getFullYear() + '. ' + p2(d.getMonth() + 1) + '. ' + p2(d.getDate()) + '.';
const long = (d) => d.getFullYear() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + '. ' + DAYS[d.getDay()];
const ft = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Ft';
/* Fájlnév: Voltie_elso_vasarlas_<cégnév>_<kiállítás dátuma>.pdf (ékezetek és szóközök nélkül, így minden rendszerben jó) */
function offerFileName(company, when) {
  const d = when || new Date();
  const date = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const slug = String(company || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'ajanlat';
  return 'Voltie_elso_vasarlas_' + slug + '_' + date + '.pdf';
}
/* a megadott számú naptári hónappal későbbi nap (január 31. + 1 hónap: február utolsó napja) */
function addMonths(d, n) {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setMonth(r.getMonth() + n);
  if (r.getDate() !== day) r.setDate(0);
  return r;
}
function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 120); }

/* a választásokból tételsorok, a kedvezményes ár kerekítve */
function itemsFor(offer, dlm) {
  const picks = [];
  if (/^40%/.test(offer)) picks.push(PRODUCTS.three);
  else if (/^25%/.test(offer)) picks.push(PRODUCTS.one);
  /* egy fázisú töltőhöz az egy fázisú, egyébként a több fázisú dinamikus energiamenedzsment jár */
  if (picks.length && /^Igen/.test(dlm)) picks.push(/^25%/.test(offer) ? PRODUCTS.dlm1 : PRODUCTS.dlm);
  return picks.map((p) => ({ ...p, qty: 1, final: Math.round(p.unit * (100 - p.discount) / 100) }));
}

function buildOffer(input) {
  return new Promise((resolve, reject) => {
    const company = clean(input.company), person = clean(input.name);
    const title = company || person || 'Ajánlatkérő';
    const email = clean(input.email), phone = clean(input.phone), taxid = clean(input.taxid, 30);
    const items = itemsFor(clean(input.offer), clean(input.dlm));
    const net = items.reduce((s, i) => s + i.final * i.qty, 0);
    const vat = Math.round(net * VAT_RATE / 100);
    const gross = net + vat;
    const now = new Date();
    const until = addMonths(now, VALID_MONTHS);

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Voltie ajánlat', Author: PROVIDER.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', A('fonts/Inter-Regular.ttf'));
    doc.registerFont('M', A('fonts/Inter-Medium.ttf'));
    doc.registerFont('S', A('fonts/Inter-SemiBold.ttf'));
    doc.registerFont('B', A('fonts/Inter-Bold.ttf'));

    const W = 595.28, M = 48, CW = W - 2 * M;

    /* fejléc: logó + egyetlen vonal (a logó szélességéig türkiz, onnan fekete) */
    const logoW = 112;
    doc.image(A('voltie_logo_2026_black.png'), M, 44, { width: logoW });
    doc.rect(M, 86, logoW, 2).fill('#00FFFF');
    doc.rect(M + logoW, 86, CW - logoW, 2).fill('#000000');
    doc.fillColor(LIGHT).font('S').fontSize(8).text('AJÁNLAT', M, 42, { width: CW, align: 'right', characterSpacing: 1.2 });
    doc.fillColor(GREY).font('R').fontSize(9).text('Kelt: ' + dotted(now), M, 56, { width: CW, align: 'right' });
    doc.text('Érvényes: ' + dotted(until).replace(/\.$/, '') + '-ig', M, 69, { width: CW, align: 'right' });

    /* cím */
    let y = 108;
    doc.fillColor(INK).font('B').fontSize(24).text('Voltie ajánlat', M, y, { width: CW });
    y += 32;
    doc.fillColor(GREY).font('R').fontSize(10.5).text('Kedvezményes ajánlat az első töltő vásárlásához, a megadott igényeid alapján.', M, y, { width: CW });
    y += 30;

    /* két kártya: ajánlatkérő (a cég neve) és ajánlattevő */
    const cw = (CW - 14) / 2, ch = 100;
    function card(x, cap, head, lines) {
      doc.roundedRect(x, y, cw, ch, 8).fill(CARD);
      doc.fillColor(LIGHT).font('S').fontSize(7.5).text(cap.toUpperCase(), x + 14, y + 11, { characterSpacing: 1 });
      doc.fillColor(INK).font('B').fontSize(12.5).text(head, x + 14, y + 24, { width: cw - 28, height: 18, ellipsis: true, lineBreak: false });
      let ly = y + 44;
      doc.font('R').fontSize(8.5).fillColor(TEXT);
      lines.filter(Boolean).forEach((l) => { doc.text(l, x + 14, ly, { width: cw - 28, lineBreak: false, ellipsis: true }); ly += 13; });
    }
    card(M, 'Ajánlatkérő', title, [person && company ? 'Kapcsolattartó: ' + person : '', taxid ? 'Adószám: ' + taxid : '', email, phone]);
    card(M + cw + 14, 'Ajánlattevő', PROVIDER.name, [PROVIDER.address, 'Adószám: ' + PROVIDER.tax, PROVIDER.contact + ', ' + PROVIDER.phone, PROVIDER.email]);
    y += ch + 24;

    /* tételek táblázata */
    const col = { name: [M, 200], qty: [M + 206, 36], unit: [M + 246, 74], disc: [M + 326, 50], fin: [M + 382, CW - 382] };
    doc.fillColor(LIGHT).font('S').fontSize(7);
    doc.text('TÉTEL', col.name[0], y, { width: col.name[1], characterSpacing: 0.8 });
    doc.text('DB', col.qty[0], y, { width: col.qty[1], align: 'right', characterSpacing: 0.8 });
    doc.text('EGYSÉGÁR', col.unit[0], y, { width: col.unit[1], align: 'right', characterSpacing: 0.8 });
    doc.text('KEDV.', col.disc[0], y, { width: col.disc[1], align: 'right', characterSpacing: 0.8 });
    doc.text('AJÁNLATI ÁR (NETTÓ)', col.fin[0] - 10, y, { width: col.fin[1] + 10, align: 'right', characterSpacing: 0.8 });
    y += 14;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(LINE).stroke();
    y += 9;
    items.forEach((it) => {
      doc.font('S').fontSize(9.5);
      const nh = doc.heightOfString(it.name, { width: col.name[1] });
      doc.fillColor(INK).text(it.name, col.name[0], y, { width: col.name[1] });
      doc.fillColor(TEXT).font('R').fontSize(9.5);
      doc.text(String(it.qty), col.qty[0], y, { width: col.qty[1], align: 'right' });
      doc.text(ft(it.unit), col.unit[0], y, { width: col.unit[1], align: 'right' });
      doc.fillColor(TEAL).font('B').text(it.discount + '%', col.disc[0], y, { width: col.disc[1], align: 'right' });
      doc.fillColor(INK).font('B').text(ft(it.final * it.qty), col.fin[0], y, { width: col.fin[1], align: 'right' });
      y += Math.max(nh, 14) + 12;
      doc.moveTo(M, y - 5).lineTo(W - M, y - 5).lineWidth(0.8).strokeColor(LINE).stroke();
    });
    y += 6;

    /* összesítés: nettó és ÁFA, alatta a sötét bruttó-sáv */
    doc.fillColor(GREY).font('R').fontSize(9.5);
    doc.text('Nettó összesen', M, y, { width: CW - 110 , align: 'right' });
    doc.fillColor(TEXT).font('M').text(ft(net), M, y, { width: CW, align: 'right' });
    y += 16;
    doc.fillColor(GREY).font('R').text('ÁFA (' + VAT_RATE + '%)', M, y, { width: CW - 110, align: 'right' });
    doc.fillColor(TEXT).font('M').text(ft(vat), M, y, { width: CW, align: 'right' });
    y += 20;
    doc.rect(M, y, CW, 34).fill('#0A0B0D');
    doc.fillColor('#FFFFFF').font('M').fontSize(10).text('Bruttó összesen', M + 14, y + 11);
    doc.font('B').fontSize(14).text(ft(gross), M, y + 9, { width: CW - 14, align: 'right' });
    y += 34 + 20;

    /* érvényesség: VALID_MONTHS naptári hónap (a feltételek szövege ezzel egyezik) */
    const pill = 'Az ajánlat érvényessége: ' + long(until);
    doc.font('M').fontSize(9.5);
    const pw = doc.widthOfString(pill) + 28;
    doc.roundedRect(M, y, pw, 24, 12).fill(TEAL_BG);
    doc.fillColor(TEAL).text(pill, M + 14, y + 7.5);
    y += 40;

    /* megjegyzések */
    function note(label, text) {
      doc.fillColor(INK).font('B').fontSize(9.5).text(label, M, y, { width: CW });
      y += 14;
      doc.fillColor(GREY).font('R').fontSize(9).text(text, M, y, { width: CW, lineGap: 1.5 });
      y = doc.y + 10;
    }
    note('Feltételek', 'A kedvezmények az első töltő vásárlásának árából vonhatók le, és csak 1 töltőre vehetők igénybe. A Voltie listaárából értendők. Az ajánlat a kiállítástól számított 1 hónapig érvényes (az érvényesség vége: ' + long(until) + '). Az árak nettó árak, az ÁFA külön szerepel az összesítésben.');
    note('Következő lépés', 'Munkatársunk a megadott telefonszámon felkeres, és egyeztetitek a részleteket.');

    /* aláírás: Tóth Bence e-mail aláírása */
    const cH = 92, cWd = 400, sy = 790 - 14 - cH - 20;
    doc.fillColor(TEXT).font('R').fontSize(9.5).text('Üdvözlettel:', M, sy);
    const cy = sy + 18;
    const grad = doc.linearGradient(M, cy, M + cWd, cy + cH * 0.6);
    grad.stop(0, '#000000').stop(0.4, '#000000').stop(1, '#00fff8');
    doc.roundedRect(M, cy, cWd, cH, 10).fill(grad);
    doc.fillColor('#FFFFFF').font('S').fontSize(14).text(PROVIDER.contact, M + 20, cy + 14);
    doc.font('R').fontSize(8.5).fillColor('#FFFFFF').text(PROVIDER.title, M + 20, cy + 32);
    doc.text(PROVIDER.email, M + 20, cy + 49);
    doc.text(PROVIDER.phone, M + 20, cy + 61);
    doc.text(PROVIDER.office, M + 20, cy + 73, { width: 260, lineBreak: false });
    doc.image(A('voltie_logo_2026_white.png'), M + cWd - 112, cy + 14, { width: 92 });
    doc.fillColor('#FFFFFF').font('R').fontSize(8.5).text(PROVIDER.web, M + cWd - 112, cy + 66, { width: 92, align: 'right', link: 'https://www.voltie.eu' });

    /* lábléc */
    doc.moveTo(M, 790).lineTo(W - M, 790).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.fillColor(LIGHT).font('R').fontSize(8).text(PROVIDER.name + ' | ' + PROVIDER.address + ' | ' + PROVIDER.web, M, 799, { width: CW });

    doc.end();
  });
}

module.exports = { buildOffer, offerFileName, itemsFor, PROVIDER, PRODUCTS };
