/* Voltie űrlapmotor: Typeform-stílus, egy kérdés egy képernyőn.
   Használat: VoltieForm.start(config) – lásd az urlap-*.html fájlokat. */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var TAX_RE = /^\d{8}-?\d-?\d{2}$/;

  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* Kiemelés a címben: a *csillagok* közti szöveg kiemelten (<mark>) jelenik meg */
  function marked(text) {
    return String(text || '').split('*').map(function (part, i) {
      if (!part) return null;
      var n = i % 2 ? document.createElement('mark') : document.createTextNode(part);
      if (i % 2) n.textContent = part;
      return n;
    });
  }

  /* Országválasztó a telefonmezőhöz (Magyarország az alapértelmezés) */
  /* [név, hívószám, ISO-kód a zászlóhoz] */
  var COUNTRIES = [
    ['Magyarország', '36', 'hu'], ['Ausztria', '43', 'at'], ['Szlovákia', '421', 'sk'], ['Románia', '40', 'ro'], ['Szerbia', '381', 'rs'],
    ['Horvátország', '385', 'hr'], ['Szlovénia', '386', 'si'], ['Ukrajna', '380', 'ua'], ['Csehország', '420', 'cz'], ['Lengyelország', '48', 'pl'],
    ['Németország', '49', 'de'], ['Svájc', '41', 'ch'], ['Olaszország', '39', 'it'], ['Franciaország', '33', 'fr'], ['Spanyolország', '34', 'es'],
    ['Hollandia', '31', 'nl'], ['Belgium', '32', 'be'], ['Egyesült Királyság', '44', 'gb'], ['Svédország', '46', 'se'], ['Norvégia', '47', 'no'],
    ['Dánia', '45', 'dk'], ['Finnország', '358', 'fi'], ['Görögország', '30', 'gr'], ['Törökország', '90', 'tr'], ['Egyesült Államok', '1', 'us']
  ];
  function flag(iso) {
    var img = h('img', { class: 'flag', alt: iso.toUpperCase(), width: '24', height: '18', loading: 'lazy',
      src: 'https://flagcdn.com/w40/' + iso + '.png', srcset: 'https://flagcdn.com/w80/' + iso + '.png 2x' });
    img.addEventListener('error', function () { img.replaceWith(h('span', { class: 'flag-fallback', text: iso.toUpperCase() })); });
    return img;
  }
  /* adószám: 12345678-1-23, csak számjegy, a kötőjel automatikusan kerül be */
  /* A törzsszám 8. számjegye ellenőrző számjegy (az első 7 jegy súlyozott összegéből, 9,7,3,1,9,7,3). A MiniCRM-ben lévő 30 valódi adószámra 30/30 egyezett. */
  function taxCheckOk(digits) {
    var w = [9, 7, 3, 1, 9, 7, 3], s = 0;
    for (var i = 0; i < 7; i++) s += w[i] * Number(digits.charAt(i));
    return (10 - (s % 10)) % 10 === Number(digits.charAt(7));
  }
  function fmtTax(v) {
    var d = String(v).replace(/\D/g, '').slice(0, 11);
    return d.slice(0, 8) + (d.length > 8 ? '-' + d.slice(8, 9) : '') + (d.length > 9 ? '-' + d.slice(9, 11) : '');
  }
  function splitPhone(v) {
    var m = String(v || '').match(/^\+(\d+)\s?(\d*)$/);
    if (!m) return null;
    var all = m[1] + m[2];
    var best = COUNTRIES.filter(function (c) { return all.indexOf(c[1]) === 0; })
      .sort(function (a, b) { return b[1].length - a[1].length; })[0];
    return best ? { dial: best[1], national: all.slice(best[1].length) } : null;
  }
  function phoneDigitsOk(dial, national) {
    var n = national.replace(/^0+/, '').length;
    return dial === '36' ? n >= 8 && n <= 9 : n >= 6 && n <= 12;
  }

  function readHidden(cfg) {
    var out = {};
    var params = new URLSearchParams(location.search);
    var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    (cfg.hidden || []).forEach(function (k) {
      out[k] = params.get(k) || hash.get(k) || '';
    });
    if (out.id) { var idm = /(\d{1,12})\/?\s*$/.exec(out.id); out.id = idm ? idm[1] : ''; }
    if ('landing' in out && !out.landing) out.landing = location.origin + location.pathname;
    if ('lang' in out && !out.lang) out.lang = 'hu';
    if ('form_version' in out) out.form_version = cfg.formVersion;
    return out;
  }

  function validate(q, v, ans) {
    var empty = Array.isArray(v) ? !v.length : v == null || String(v).trim() === '';
    if (empty) return q.required ? 'Ezt a kérdést kötelező kitölteni.' : '';
    if (q.type === 'email' && !EMAIL_RE.test(v)) return 'Kérlek, valós e-mail címet adj meg.';
    if (q.type === 'phone') {
      var p = splitPhone(v);
      if (!p || !phoneDigitsOk(p.dial, p.national)) return 'Kérlek, valós telefonszámot adj meg (csak számjegyek).';
    }
    if (q.type === 'taxid') {
      var digits = String(v).replace(/\D/g, '');
      if (q.evMode && q.evMode(ans || {})) {
        if (digits.length !== 10 && digits.length !== 11) return 'Add meg az adószámot (11 számjegy) vagy az adóazonosító jelet (10 számjegy).';
      } else if (!TAX_RE.test(String(v).trim())) return 'Az adószám formátuma: 12345678-1-23';
    }
    if (q.type === 'taxid') {
      var all = String(v).replace(/\D/g, '');
      if (all.length === 11 && !taxCheckOk(all)) return '?Az adószám ellenőrző számjegye hibásnak tűnik, lehet, hogy elírtad. Ha biztosan jó, nyomd meg újra az Ok gombot.';
    }
    if (q.type === 'number' && !/^\d{1,6}$/.test(String(v).trim())) return 'Kérlek, egész számot adj meg.';
    if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'Kérlek, válassz dátumot.';
    return '';
  }

  function start(cfg) {
    var app = document.getElementById('app');
    var bar = document.getElementById('bar');
    var navUp = document.getElementById('nav-up');
    var navDown = document.getElementById('nav-down');
    var hidden = readHidden(cfg);
    var answers = cfg.init ? cfg.init(hidden) : {};
    var trail = [];          // már megtett kérdés-azonosítók (visszalépéshez)
    var current = null;      // aktuális kérdés
    var busy = false;
    /* Honeypot: láthatatlan mező (a CSS .hp osztálya elrejti). A valódi weboldal-válasz az answers.website-ban van;
       a szerver a payload.website mezőt figyeli, és kitöltés esetén botnak tekinti a kérést. */
    var honeypot = h('input', { class: 'hp', name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    document.body.appendChild(honeypot);

    function isShown(q) {
      if (answers._confirmed && answers._known && answers._known[q.id]) return false;   // a megerősített adatot nem kérdezzük újra
      return !q.showIf || q.showIf(answers, hidden);
    }
    function visible() {
      return cfg.questions.filter(isShown);
    }
    function progress() {
      var v = visible();
      var idx = current ? v.indexOf(current) : v.length;
      bar.style.width = Math.max(0, Math.min(100, (idx / Math.max(v.length, 1)) * 100)) + '%';
    }
    function swap(node) {
      app.innerHTML = '';
      node.classList.add('screen');
      app.appendChild(node);
      var f = node.querySelector('input,textarea,button.primary');
      if (f && window.matchMedia('(min-width: 700px)').matches) f.focus({ preventScroll: true });
    }

    /* ---------- üdvözlő ---------- */
    function welcome() {
      current = null; bar.style.width = '0%';
      navUp.disabled = navDown.disabled = true;
      var w = cfg.welcome;
      swap(h('div', { class: 'center' }, [
        w.promo ? h('div', { class: 'promo', text: w.promo }) : null,
        h('h1', {}, marked(w.title)),
        h('p', { class: 'lead', text: w.description }),
        h('button', { class: 'primary', text: w.button || 'Kitöltöm', onclick: begin }),
        h('div', { class: 'meta', text: '🕐 ' + (w.time || '1 percet vesz igénybe') }),
        w.terms ? h('p', { class: 'terms', text: w.terms }) : null
      ]));
    }

    /* ---------- kérdés ---------- */
    function go(q, back) {
      if (!q) return finish();
      if (!back && current) trail.push(current);
      current = q;
      navUp.disabled = false; navDown.disabled = false;
      progress();
      var num = visible().indexOf(q) + 1;
      var err = h('div', { class: 'err', role: 'alert' });
      var body = h('div', { class: 'field' });
      var ctl = buildControl(q, body, err);
      var head = h('div', { class: 'qhead' }, [
        h('span', { class: 'qnum', text: String(num) }),
        h('span', { class: 'qtitle', text: q.title + (q.required ? ' *' : '') })
      ]);
      var kids = [head];
      var descText = typeof q.description === 'function' ? q.description(answers) : q.description;
      if (descText) kids.push(h('div', { class: 'qdesc', text: descText }));
      if (q.link) kids.push(h('div', { class: 'qlink' }, [h('a', { class: 'secondary btn small', href: q.link.href, target: '_blank', rel: 'noopener', text: q.link.label })]));
      kids.push(body, err);
      if (q.type !== 'choice' || q.multi) {
        kids.push(h('button', { class: 'primary', text: q.type === 'statement' ? (q.button || 'Rendben') : 'Ok', onclick: next }));
        kids.push(h('span', { class: 'hint', text: 'nyomd meg az Enter ⏎ gombot' }));
      }
      swap(h('div', { class: 'q' }, kids));

      function next() {
        var v = ctl.get();
        var m = validate(q, v, answers);
        if (m && m.charAt(0) === '?') {   // puha figyelmeztetés: ugyanazzal az értékkel másodszorra továbbenged
          if (q._warned === v) m = '';
          else { q._warned = v; err.textContent = m.slice(1); return; }
        }
        if (m) { err.textContent = m; return; }
        answers[q.id] = v;
        advance();
      }
      current._next = next;
    }

    function advance() {
      var v = visible();
      var i = v.indexOf(current);
      /* Ha az aktuális kérdés már nem tartozik az ághoz (visszalépés után megváltozott egy elágazó válasz),
         a trail utolsó még látható kérdésétől folytatjuk, ne ugorjunk a lista elejére. */
      if (i < 0) {
        var start = 0;
        for (var t = trail.length - 1; t >= 0; t--) {
          var ti = v.indexOf(trail[t]);
          if (ti >= 0) { start = ti + 1; break; }
        }
        var resume = v[start];
        resume ? go(resume) : finish();
        return;
      }
      var nxt = v[i + 1];
      nxt ? go(nxt) : finish();
    }

    function buildControl(q, host, err) {
      var saved = answers[q.id];
      if (q.type === 'choice') return choiceControl(q, host, err, saved);
      if (q.type === 'phone') return phoneControl(q, host, err, saved);
      if (q.type === 'taxid') return taxControl(q, host, err, saved);
      var input;
      if (q.type === 'long') {
        input = h('textarea', { rows: '3', placeholder: q.placeholder || 'Ide írd a választ…' });
      } else {
        var type = q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : q.type === 'date' ? 'date' : 'text';
        input = h('input', { type: type, placeholder: q.placeholder || 'Ide írd a választ…', autocomplete: q.autocomplete || 'off', inputmode: q.type === 'phone' ? 'tel' : q.type === 'number' ? 'numeric' : '' });
      }
      if (saved) input.value = saved;
      input.addEventListener('input', function () { err.textContent = ''; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); current._next(); }
      });
      host.appendChild(input);
      /* előtöltés egy végpontból (pl. cégnév az adószám alapján); a kitöltő bármikor átírhatja, a hiba nem akadályoz.
         Ha a kitöltő visszalép és megváltoztatja a forrást (az adószámot), az automatikusan kitöltött értéket frissítjük,
         a kézzel beírtat nem bántjuk. */
      if (q.lookup) {
        var source = q.lookup.from(answers);
        var autoKey = '_auto_' + q.id;
        var auto = answers[autoKey];
        var current0 = input.value;
        var stale = auto && current0 === auto.name && auto.from !== source;   // a régi automatikus érték
        if (stale && !source) { input.value = ''; delete answers[autoKey]; }   // az új forrásra (pl. 10 jegyű azonosító) nincs keresés: a régi automatikus név ne maradjon
        if (source && (!current0 || stale)) {
          var note = h('div', { class: 'lookup-note', text: q.lookup.loading || 'Keresés…' });
          host.appendChild(note);
          var ctl = new AbortController();
          var timer = setTimeout(function () { ctl.abort(); }, 5500);
          fetch(q.lookup.endpoint + '?adoszam=' + encodeURIComponent(source), { cache: 'no-store', signal: ctl.signal })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
              var untouched = !input.value || (auto && input.value === auto.name);
              if (j && j.ok && j.name && untouched) {
                input.value = j.name; answers[autoKey] = { from: source, name: j.name };
                note.textContent = q.lookup.found || 'Kitöltöttük, ha nem pontos, javítsd.';
              } else {
                if (stale && untouched) { input.value = ''; delete answers[autoKey]; }   // a régi, téves név ne maradjon
                note.remove();
              }
            })
            .catch(function () { if (stale && input.value === auto.name) input.value = ''; note.remove(); })
            .then(function () { clearTimeout(timer); });
        }
      }
      return { get: function () { return input.value.trim(); } };
    }

    function taxControl(q, host, err, saved) {
      /* Egyéni vállalkozónál (evMode) nincs kényszerített kötőjel: az adószám (11 számjegy) és az adóazonosító jel (10 számjegy) is
         kötőjel nélkül adható meg. A 11 jegyűt a beküldéskor a megszokott 12345678-1-23 alakra hozzuk, a 10 jegyűt nem bántjuk. */
      var ev = !!(q.evMode && q.evMode(answers));
      var onlyDigits = function (s) { return String(s).replace(/\D/g, '').slice(0, 11); };
      var input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: ev ? '12345678123 vagy 8123456789' : (q.placeholder || '12345678-1-23'), maxlength: ev ? '11' : '13' });
      if (saved) input.value = ev ? onlyDigits(saved) : fmtTax(saved);
      input.addEventListener('input', function () { input.value = ev ? onlyDigits(input.value) : fmtTax(input.value); err.textContent = ''; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); current._next(); }
      });
      host.appendChild(input);
      return { get: function () { var d = onlyDigits(input.value); return ev && d.length === 11 ? fmtTax(d) : (ev ? d : input.value.trim()); } };
    }

    function phoneControl(q, host, err, saved) {
      var sp = splitPhone(saved);
      var dial = sp ? sp.dial : '36';
      /* saját legördülő: zászló + hívószám, nyitva zászlós országlista */
      var btn = h('button', { type: 'button', class: 'dial-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': 'Országhívószám' });
      var list = h('div', { class: 'dial-list', role: 'listbox', hidden: '' });
      var wrap = h('div', { class: 'dial' }, [btn, list]);
      function paint() {
        var c = COUNTRIES.filter(function (x) { return x[1] === dial; })[0];
        btn.innerHTML = '';
        btn.appendChild(flag(c[2]));
        btn.appendChild(h('span', { class: 'dial-code', text: '+' + c[1] }));
        btn.appendChild(h('span', { class: 'caret', text: '▾' }));
      }
      function close() { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); }
      function outside(e) { if (!wrap.contains(e.target)) close(); }
      COUNTRIES.forEach(function (c) {
        var opt = h('button', { type: 'button', class: 'dial-opt', role: 'option' }, [flag(c[2]), h('span', { class: 'dial-name', text: c[0] }), h('span', { class: 'dial-num', text: '+' + c[1] })]);
        opt.addEventListener('click', function () { dial = c[1]; paint(); close(); input.focus(); });
        list.appendChild(opt);
      });
      btn.addEventListener('click', function () {
        if (list.hidden) { list.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('click', outside, true); }
        else close();
      });
      wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); btn.focus(); } });
      var input = h('input', { type: 'tel', inputmode: 'numeric', autocomplete: 'tel-national', placeholder: '30 123 4567', maxlength: '16' });
      if (sp) input.value = sp.national;
      /* csak számjegy és szóköz mehet be, betű nem */
      input.addEventListener('input', function () {
        var clean = input.value.replace(/[^\d ]/g, '');
        if (clean !== input.value) input.value = clean;
        err.textContent = '';
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); current._next(); }
      });
      paint();
      host.appendChild(h('div', { class: 'phone' }, [wrap, input]));
      return {
        get: function () {
          var digits = input.value.replace(/\D/g, '').replace(/^0+/, '');
          return digits ? '+' + dial + digits : '';
        }
      };
    }

    function choiceControl(q, host, err, saved) {
      var sel = q.multi ? (saved || []).slice() : saved ? [saved] : [];
      var otherInput = null;
      var list = h('div', { class: 'choices' + (q.choices.length > 10 ? ' many' : '') });
      var btns = [];
      var opts = q.choices.slice();
      if (q.other) opts.push('Egyéb');
      opts.forEach(function (label, i) {
        var key = String.fromCharCode(65 + i);
        var b = h('button', { type: 'button', class: 'choice', 'data-key': key, 'aria-pressed': 'false' }, [
          h('span', { class: 'key', text: key }), h('span', { class: 'lbl', text: label })
        ]);
        b.addEventListener('click', function () { pick(label, b); });
        btns.push(b); list.appendChild(b);
        if (sel.indexOf(label) > -1) b.classList.add('on'), b.setAttribute('aria-pressed', 'true');
      });
      host.appendChild(list);
      if (q.other) {
        otherInput = h('input', { type: 'text', class: 'other', placeholder: 'Írd le, mi az…' });
        otherInput.style.display = 'none';
        if (saved && q.choices.indexOf(saved) === -1 && !q.multi) {
          otherInput.value = saved; otherInput.style.display = '';
          btns[btns.length - 1].classList.add('on'); sel = ['Egyéb'];
        }
        otherInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); current._next(); } });
        host.appendChild(otherInput);
      }
      function pick(label, b) {
        err.textContent = '';
        if (q.multi) {
          var i = sel.indexOf(label);
          i > -1 ? sel.splice(i, 1) : sel.push(label);
          b.classList.toggle('on'); b.setAttribute('aria-pressed', String(i === -1));
        } else {
          sel = [label];
          btns.forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
          b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
        }
        var isOther = q.other && label === 'Egyéb';
        if (otherInput) otherInput.style.display = sel.indexOf('Egyéb') > -1 ? '' : 'none';
        if (isOther && otherInput) { otherInput.focus(); return; }
        if (!q.multi) setTimeout(function () { current._next(); }, 280);
      }
      var ctl = {
        get: function () {
          var out = sel.map(function (s) { return s === 'Egyéb' && otherInput ? (otherInput.value.trim() || 'Egyéb') : s; });
          return q.multi ? out : out[0] || '';
        },
        key: function (k) {
          var b = btns.filter(function (x) { return x.dataset.key === k; })[0];
          if (b) pick(opts[btns.indexOf(b)], b);
        }
      };
      choiceCtl = ctl;
      return ctl;
    }
    var choiceCtl = null;

    /* ---------- billentyűk / navigáció ---------- */
    document.addEventListener('keydown', function (e) {
      if (!current || busy) return;
      var tag = (document.activeElement || {}).tagName;
      if (/INPUT|TEXTAREA/.test(tag)) return;
      if (e.key === 'Enter') { e.preventDefault(); current._next(); return; }
      if (current.type === 'choice' && /^[a-z]$/i.test(e.key) && choiceCtl) choiceCtl.key(e.key.toUpperCase());
    });
    navUp.addEventListener('click', function () {
      if (busy) return;
      /* A trailből kihagyjuk azokat a kérdéseket, amelyek a mostani válaszok szerint már nem látszanak
         (pl. „Telepítettél már?" Nem-re váltása után a márkák kérdését). */
      var prev = null;
      while (trail.length) {
        var cand = trail.pop();
        if (isShown(cand)) { prev = cand; break; }
      }
      prev ? go(prev, true) : welcome();
    });
    navDown.addEventListener('click', function () { if (current && !busy) current._next(); });

    /* ---------- beküldés ---------- */
    function finish() {
      current = null; busy = true; bar.style.width = '100%';
      navUp.disabled = navDown.disabled = true;
      swap(h('div', { class: 'center' }, [h('div', { class: 'spinner' }), h('p', { class: 'lead', text: 'Küldés…' })]));
      var payload = {
        form: cfg.formId, form_version: cfg.formVersion, hidden: hidden, role: answers.role || '',
        confirmed: answers._confirmed && answers._known ? Object.keys(answers._known).filter(function (k) { return answers._known[k]; }) : [],
        answers: visible().reduce(function (o, q) {
          if (q.type !== 'statement' && answers[q.id] != null) o[q.id] = { title: q.title, value: answers[q.id] };
          return o;
        }, {}),
        website: (honeypot && honeypot.value) || '' // honeypot: ha egy bot kitölti, a szerver eldobja
      };
      if (!cfg.endpoint) {
        console.info('[Voltie űrlap – DEMÓ, nem küldi sehova]', payload);
        return thanks();
      }
      fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) {
          if (r.ok) return r;
          return r.json().catch(function () { return {}; }).then(function (j) {
            var err = new Error('HTTP ' + r.status); err.status = r.status; err.userMessage = j.userMessage; throw err;
          });
        })
        .then(thanks)
        .catch(function (e) {
          busy = false;
          console.warn('[Voltie űrlap] a beküldés nem sikerült:', e && e.message);
          swap(h('div', { class: 'center' }, [
            h('h1', { text: (e && e.status === 409) ? 'Te már a rendszerünkben szerepelsz' : (e && e.status === 403) ? 'Ez a link nem érvényes' : 'Nem sikerült elküldeni' }),
            h('p', { class: 'lead', text: (e && e.userMessage) || ('Kérjük, próbáld újra, vagy írj nekünk: ' + (cfg.supportEmail || 'toth.bence@voltie.eu')) }),
            h('div', { class: 'meta', text: 'Hibakód: ' + ((e && e.message) || 'ismeretlen') }),
            (e && e.userMessage) ? null : h('button', { class: 'primary', text: 'Újrapróbálom', onclick: finish })
          ]));
        });
    }

    function thanks() {
      busy = false; current = null;
      var t = cfg.thanks(answers);
      var kids = [h('h1', { text: t.title }), h('p', { class: 'lead', text: t.text })];
      var row = h('div', { class: 'links' });
      (t.links || []).forEach(function (l, i) {
        var cls = (i === 0 ? 'primary' : 'secondary') + ' btn';
        if (l.download) { row.appendChild(downloadButton(l, cls)); return; }
        if (l.file) { row.appendChild(h('a', { class: cls, href: l.href, download: l.file, text: l.label })); return; }
        row.appendChild(h('a', { class: cls, href: l.href, target: '_blank', rel: 'noopener', text: l.label }));
      });
      if (t.links && t.links.length) kids.push(row);
      if (t.signature) kids.push(signatureCard(t.signature));
      swap(h('div', { class: 'center' }, kids));
    }

    /* letöltőgomb: a szerver legenerálja a fájlt a kitöltő válaszaiból.
       Hálózati hiba (pl. megszakadt kapcsolat) esetén egyszer automatikusan újrapróbáljuk. */
    function downloadButton(l, cls) {
      var b = h('button', { type: 'button', class: cls, text: l.label });
      function request(tries) {
        return fetch(l.download.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(l.download.body) })
          .then(function (r) { return r.ok ? r.blob().then(function (blob) { return { r: r, blob: blob }; }) : Promise.reject(new Error('HTTP ' + r.status)); })
          .catch(function (err) {
            if (tries > 1 && !/^HTTP /.test(err.message)) return new Promise(function (res) { setTimeout(res, 800); }).then(function () { return request(tries - 1); });
            throw err;
          });
      }
      b.addEventListener('click', function () {
        var old = b.textContent; b.disabled = true; b.textContent = 'Generálás…';
        request(2)
          .then(function (x) {
            var m = /filename="([^"]+)"/.exec(x.r.headers.get('Content-Disposition') || '');
            if (m) l.download.filename = m[1];
            var url = URL.createObjectURL(x.blob);
            var a = h('a', { href: url, download: l.download.filename || 'letoltes.pdf' });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            b.textContent = old; b.disabled = false;
          })
          .catch(function (err) {
            console.warn('[Voltie űrlap] az ajánlat letöltése nem sikerült:', err && err.message);
            b.textContent = 'Nem sikerült, próbáld újra'; b.disabled = false;
          });
      });
      return b;
    }

    /* Tóth Bence e-mail aláírása: fekete-türkiz kártya */
    function signatureCard(s) {
      var portrait = s.portrait ? h('img', { class: 'sig-portrait', src: s.portrait, alt: s.name, width: '80', height: '103' }) : null;
      if (portrait) portrait.addEventListener('error', function () { portrait.remove(); });
      var logo = s.logo ? h('img', { class: 'sig-logo', src: s.logo, alt: 'Voltie', width: '100', height: '30' }) : null;
      if (logo) logo.addEventListener('error', function () { logo.remove(); });
      return h('div', { class: 'signature' }, [
        h('p', { class: 'sig-hello', text: 'Üdvözlettel:' }),
        h('div', { class: 'sig-card' }, [
          portrait,
          h('div', { class: 'sig-text' }, [
            h('div', { class: 'sig-name', text: s.name }),
            h('div', { class: 'sig-title', text: s.title }),
            h('a', { href: 'mailto:' + s.email, text: s.email }),
            h('a', { href: 'tel:' + s.phone.replace(/\s/g, ''), text: s.phone }),
            h('div', { class: 'sig-addr', text: s.address })
          ]),
          h('div', { class: 'sig-side' }, [logo, h('a', { href: s.web, target: '_blank', rel: 'noopener', text: 'www.voltie.eu' })])
        ])
      ]);
    }

    /* ---------- ismert jelentkező: a MiniCRM-ben szereplő adatok megerősítése ---------- */
    var known = null;   // a /api/jelentkezo válasza (az e-mail és a telefon részlegesen elrejtve)

    function loadKnown() {
      if (!cfg.known || !hidden.id) return Promise.resolve();
      var request = fetch(cfg.known.endpoint + '?id=' + encodeURIComponent(hidden.id), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.ok) known = j; })
        .catch(function () {});
      /* ha a lekérdezés lassú, az űrlap betöltődik nélküle is */
      return Promise.race([request, new Promise(function (res) { setTimeout(res, 3500); })]);
    }

    function begin() {
      if (known && !answers._confirmed && answers._confirmed !== false) return confirmKnown();
      go(visible()[0]);
    }

    function confirmKnown() {
      var d = known.display, rows = [];
      function row(label, value) { if (value) rows.push(h('div', { class: 'known-row' }, [h('span', { class: 'known-label', text: label }), h('span', { class: 'known-value', text: value })])); }
      /* két blokk: a cég, majd a kapcsolattartó; a fejléc csak akkor jelenik meg, ha van a blokkban adat */
      var start0 = rows.length;
      row('Cégnév', d.company); row('Adószám', d.taxid); row('EU adószám', d.euVat); row('Cégjegyzékszám', d.registrationNumber);
      row('Weboldal', d.website); row('Cím', d.place); row('Cég e-mail címe', d.companyEmail); row('Cég telefonszáma', d.companyPhone);
      row('Alapítás éve', d.founded); row('Fő tevékenység', d.activity);
      if (rows.length > start0) rows.splice(start0, 0, h('div', { class: 'known-head', text: 'A cég' }));
      var start1 = rows.length;
      row('Név', d.name); row('E-mail', d.email); row('Telefonszám', d.phone);
      if (rows.length > start1) rows.splice(start1, 0, h('div', { class: 'known-head', text: 'Kapcsolattartó' }));
      navUp.disabled = navDown.disabled = true;
      swap(h('div', { class: 'center' }, [
        h('h1', { text: 'Ezek az adataid szerepelnek nálunk' }),
        h('p', { class: 'lead', text: 'Ha helyesek, nem kell újra beírnod őket. Az e-mail címeket és a telefonszámokat a biztonságod érdekében részben elrejtettük.' }),
        h('div', { class: 'known' }, rows),
        h('div', { class: 'links' }, [
          h('button', { type: 'button', class: 'primary btn', text: 'Rendben, tovább', onclick: function () {
            answers._known = known.has; answers._confirmed = true; answers._display = known.display;
            go(visible()[0]);
          } }),
          h('button', { type: 'button', class: 'secondary btn', text: 'Módosítom', onclick: function () {
            /* a név, a cég és az adószám előre kitöltve marad, az e-mailt és a telefont a kitöltő újra megadja */
            answers._confirmed = false; answers._display = known.display;
            Object.keys(known.prefill || {}).forEach(function (k) { if (known.prefill[k]) answers[k] = known.prefill[k]; });
            go(visible()[0]);
          } })
        ])
      ]));
    }

    loadKnown().then(welcome);
  }

  window.VoltieForm = { start: start };
})();
