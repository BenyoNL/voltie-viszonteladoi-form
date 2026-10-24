/* A kitöltő által látott felirat és a MiniCRM listaértéke közti egyeztetés.
   A MiniCRM listák szövege idővel változhat vagy elírás lehet benne (pl. "1-2 tötő", "Villanyszereés"), ezért az értéket tűrően párosítjuk:
   1. pontos egyezés
   2. ékezet-, kis- és nagybetű-, írásjel-független egyezés
   3. (legalább 6 karakternél) egyetlen betűnyi eltérés, ha pontosan egy lehetőség van ilyen közel */
'use strict';

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* szerkesztési távolság (beszúrás, törlés, csere) */
function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = keep;
    }
  }
  return prev[b.length];
}

function closest(value, allowed) {
  if (allowed.includes(value)) return value;
  const n = norm(value);
  const same = allowed.filter((a) => norm(a) === n);
  if (same.length === 1) return same[0];
  if (n.length >= 6) {
    const near = allowed.filter((a) => distance(norm(a), n) <= 1);
    if (near.length === 1) return near[0];
  }
  return null;
}

module.exports = { closest, norm, distance };
