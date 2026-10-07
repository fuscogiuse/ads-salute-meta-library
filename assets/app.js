/* Parametri: q, cat, tema, angolo, longevo=si|no, formato=video|image|carousel,
   ordine=recenti|vecchie|longevi|nome. Scheda: #ad-<id> */
(function () {
  "use strict";

  var CATS = [
    ["osteopatia", "Osteopatia"],
    ["fisioterapia", "Fisioterapia"],
    ["chiropratica", "Chiropratica"],
    ["dentista", "Dentista"],
    ["shiatsu", "Shiatsu"],
    ["ottico", "Ottico"]
  ];

  var THEME_ORDER = [
    "Offerta prima visita",
    "Dolore / sintomo specifico",
    "Geo-local / community",
    "Autorità e metodo",
    "Social proof",
    "Educazione / lead magnet",
    "Tecnologia e innovazione",
    "Benessere olistico"
  ];

  var MEDIA = { video: "Video", image: "Immagine", carousel: "Carosello" };
  var SORTS = {
    recenti: "Data: più recenti",
    vecchie: "Data: più vecchie",
    longevi: "Longevi prima",
    nome: "Inserzionista A–Z"
  };
  var MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  var state = { q: "", cat: "", tema: "", angolo: "", longevo: "", formato: "", ordine: "recenti" };
  var ads = [];
  var byId = new Map();
  var openId = "";
  var lastFocus = null;
  var searchTimer = 0;

  var grid = document.getElementById("grid");
  var countEl = document.getElementById("count");
  var sheetCount = document.getElementById("sheet-count");
  var activeEl = document.getElementById("active");
  var qEl = document.getElementById("q");
  var ordineEl = document.getElementById("ordine");
  var temaEl = document.getElementById("tema");
  var angoloEl = document.getElementById("angolo");
  var filters = document.getElementById("filters");
  var backdrop = document.getElementById("backdrop");
  var toggle = document.getElementById("filter-toggle");
  var dlg = document.getElementById("detail");
  var mobileMq = window.matchMedia("(max-width: 899px)");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function catLabel(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === key) return CATS[i][1];
    return key || "Categoria mancante";
  }

  function mediaLabel(t) {
    return MEDIA[t] || (t ? String(t) : "Mancante");
  }

  function parseStarted(s) {
    var m = /([A-Za-z]{3,})\s+(\d{1,2}),\s+(\d{4})/.exec(s || "");
    if (!m) return null;
    var mo = MON[m[1].slice(0, 3).toLowerCase()];
    if (mo == null) return null;
    return Date.UTC(+m[3], mo, +m[2]);
  }

  function fmtDate(t) {
    if (t == null) return "Data mancante";
    var d = new Date(t);
    return d.getUTCDate() + " " + MESI[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  function dateLabel(ad) {
    if (ad._t != null) return fmtDate(ad._t);
    var raw = (ad.started_running || "").trim();
    return raw || "Data mancante";
  }

  function textOrEmpty(v) {
    return v && String(v).trim() ? String(v).trim() : "";
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    state.cat = p.get("cat") || "";
    state.tema = p.get("tema") || "";
    state.angolo = p.get("angolo") || "";
    var lon = p.get("longevo") || "";
    state.longevo = lon === "si" || lon === "no" ? lon : "";
    var fmt = p.get("formato") || "";
    state.formato = MEDIA[fmt] ? fmt : "";
    var ord = p.get("ordine") || "recenti";
    state.ordine = SORTS[ord] ? ord : "recenti";
    if (state.cat && !CATS.some(function (c) { return c[0] === state.cat; })) state.cat = "";
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (state.q.trim()) p.set("q", state.q.trim());
    if (state.cat) p.set("cat", state.cat);
    if (state.tema) p.set("tema", state.tema);
    if (state.angolo) p.set("angolo", state.angolo);
    if (state.longevo) p.set("longevo", state.longevo);
    if (state.formato) p.set("formato", state.formato);
    if (state.ordine !== "recenti") p.set("ordine", state.ordine);
    var qs = p.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  function reflectControls() {
    qEl.value = state.q;
    ordineEl.value = state.ordine;
    document.querySelectorAll("[data-chip]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.value === state[btn.dataset.chip]));
    });
    if ([].some.call(temaEl.options, function (o) { return o.value === state.tema; })) temaEl.value = state.tema;
    if ([].some.call(angoloEl.options, function (o) { return o.value === state.angolo; })) angoloEl.value = state.angolo;
  }

  function fillSelect(el, values) {
    var current = el === temaEl ? state.tema : state.angolo;
    el.replaceChildren();
    var all = document.createElement("option");
    all.value = "";
    all.textContent = el.getAttribute("data-all") || "Tutti";
    el.appendChild(all);
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
    if (values.indexOf(current) === -1) {
      if (el === temaEl) state.tema = "";
      else state.angolo = "";
      current = "";
    }
    el.value = current;
  }

  function enrich(ad) {
    ad._t = parseStarted(ad.started_running);
    ad._hay = norm([
      ad.advertiser_name,
      ad.primary_text,
      ad.headline,
      ad.description,
      ad.cta,
      ad.angle,
      ad.theme,
      ad.category,
      catLabel(ad.category),
      ad.why_it_works,
      ad.why_local_ok,
      ad.notes_on_longevity,
      (ad.platforms || []).join(" ")
    ].join("\n"));
    return ad;
  }

  function matches(ad) {
    if (state.cat && ad.category !== state.cat) return false;
    if (state.tema && ad.theme !== state.tema) return false;
    if (state.angolo && ad.angle !== state.angolo) return false;
    if (state.longevo === "si" && !ad.longevity_flag) return false;
    if (state.longevo === "no" && ad.longevity_flag) return false;
    if (state.formato && ad.media_type !== state.formato) return false;
    var tokens = norm(state.q).split(/\s+/).filter(Boolean);
    for (var i = 0; i < tokens.length; i++) {
      if (ad._hay.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  function byName(a, b) {
    return a.advertiser_name.localeCompare(b.advertiser_name, "it", { sensitivity: "base" });
  }

  function byDate(a, b, dir) {
    if (a._t == null && b._t == null) return 0;
    if (a._t == null) return 1;
    if (b._t == null) return -1;
    return (a._t - b._t) * dir;
  }

  function compare(a, b) {
    if (state.ordine === "nome") return byName(a, b);
    if (state.ordine === "longevi") {
      var lf = Number(!!b.longevity_flag) - Number(!!a.longevity_flag);
      if (lf) return lf;
      return byDate(a, b, -1) || byName(a, b);
    }
    if (state.ordine === "vecchie") return byDate(a, b, 1) || byName(a, b);
    return byDate(a, b, -1) || byName(a, b);
  }

  function risultati(n) {
    return n === 1 ? "1 risultato" : n + " risultati";
  }

  function activeBits() {
    var bits = [];
    if (state.q.trim()) bits.push("«" + state.q.trim() + "»");
    if (state.cat) bits.push(catLabel(state.cat));
    if (state.tema) bits.push(state.tema);
    if (state.angolo) bits.push(state.angolo);
    if (state.longevo === "si") bits.push("Longevi");
    if (state.longevo === "no") bits.push("Non longevi");
    if (state.formato) bits.push(mediaLabel(state.formato));
    if (state.ordine !== "recenti") bits.push(SORTS[state.ordine]);
    return bits;
  }

  function cardHtml(ad) {
    var longevo = ad.longevity_flag ? '<span class="badge badge-long">Longevo</span>' : "";
    var angle = textOrEmpty(ad.angle) || "Angolo mancante";
    return '<button type="button" class="card cat-' + esc(ad.category) + '" data-id="' + esc(ad.id) + '">' +
      '<span class="card-media"><img src="' + esc(ad.thumb) + '" alt="" width="480" height="360" loading="lazy" decoding="async"></span>' +
      '<span class="card-body">' +
      '<span class="badges"><span class="badge badge-cat">' + esc(catLabel(ad.category)) + "</span>" + longevo + "</span>" +
      '<span class="name">' + esc(ad.advertiser_name || "Inserzionista mancante") + "</span>" +
      '<span class="meta">' + esc(dateLabel(ad)) + " · " + esc(mediaLabel(ad.media_type)) + "</span>" +
      '<span class="angle">' + esc(angle) + "</span>" +
      "</span></button>";
  }

  function render() {
    var shown = ads.filter(matches).sort(compare);
    if (!shown.length) {
      grid.innerHTML = '<p class="empty">Nessuna inserzione con questi filtri.</p>';
    } else {
      grid.innerHTML = shown.map(cardHtml).join("");
    }
    var text = shown.length === ads.length ? risultati(shown.length) : risultati(shown.length) + " su " + ads.length;
    countEl.textContent = text;
    sheetCount.textContent = text;
    var bits = activeBits();
    activeEl.hidden = bits.length === 0;
    activeEl.textContent = bits.length ? "Attivi: " + bits.join(" · ") : "";
    var n = [state.cat, state.tema, state.angolo, state.longevo, state.formato].filter(Boolean).length + (state.q.trim() ? 1 : 0);
    toggle.textContent = n ? "Filtri · " + n : "Filtri";
  }

  function field(label, value) {
    var v = textOrEmpty(value);
    var body = v ? "<p>" + esc(v) + "</p>" : '<p class="missing">Mancante</p>';
    return '<div class="field"><h3>' + esc(label) + "</h3>" + body + "</div>";
  }

  function platformBlock(ad) {
    var list = ad.platforms || [];
    var body = list.length
      ? '<ul class="pills">' + list.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>"
      : '<p class="missing">Mancante</p>';
    return '<div class="field"><h3>Piattaforme</h3>' + body + "</div>";
  }

  function linkBlock(ad) {
    var lib = textOrEmpty(ad.library_ad_url)
      ? '<a class="btn" href="' + esc(ad.library_ad_url) + '" target="_blank" rel="noopener">Apri nella Libreria inserzioni</a>'
      : '<p class="missing">Link Libreria: mancante</p>';
    var page = textOrEmpty(ad.page_url)
      ? '<a class="btn btn-ghost" href="' + esc(ad.page_url) + '" target="_blank" rel="noopener">Pagina inserzionista</a>'
      : '<p class="missing">Pagina inserzionista: mancante</p>';
    return '<div class="actions">' + lib + page + "</div>";
  }

  function wireDetail() {
    var closeBtn = dlg.querySelector(".close");
    if (closeBtn) closeBtn.addEventListener("click", closeDetail);
    dlg.querySelectorAll("img").forEach(function (img) {
      img.addEventListener("error", function () {
        var p = document.createElement("p");
        p.className = "missing";
        p.textContent = "Immagine non disponibile";
        img.replaceWith(p);
      });
    });
  }

  function renderDetail(ad, id) {
    if (!ad) {
      dlg.innerHTML = '<div class="detail-bar"><p class="scheda">Scheda</p><button type="button" class="close">Chiudi</button></div>' +
        '<div class="detail-body"><h2 id="detail-title">Inserzione non trovata</h2><p class="missing">Nessuna scheda con id ' + esc(id) + ".</p></div>";
      wireDetail();
      return;
    }
    var scheda = String(ad.line_num).padStart(2, "0");
    var longevo = ad.longevity_flag ? '<span class="badge badge-long">Longevo</span>' : "";
    var note = textOrEmpty(ad.notes_on_longevity);
    var preview = ad.preview
      ? '<img class="preview" src="' + esc(ad.preview) + '" alt="Anteprima libreria di ' + esc(ad.advertiser_name) + '">'
      : '<p class="missing">Anteprima mancante</p>';
    dlg.innerHTML =
      '<div class="detail-bar"><p class="scheda">Scheda ' + esc(scheda) + '</p><button type="button" class="close">Chiudi</button></div>' +
      preview +
      '<div class="detail-body cat-' + esc(ad.category) + '">' +
      "<h2 id=\"detail-title\">" + esc(ad.advertiser_name || "Inserzionista mancante") + "</h2>" +
      '<p class="badges"><span class="badge badge-cat">' + esc(catLabel(ad.category)) + "</span>" +
      longevo + '<span class="badge">' + esc(mediaLabel(ad.media_type)) + "</span></p>" +
      '<p class="when">Attiva dal ' + esc(dateLabel(ad)) + "</p>" +
      '<section class="insight"><h3>Perché funziona</h3>' + (textOrEmpty(ad.why_it_works) ? "<p>" + esc(ad.why_it_works) + "</p>" : '<p class="missing">Mancante</p>') + "</section>" +
      '<section class="insight"><h3>Perché è locale</h3>' + (textOrEmpty(ad.why_local_ok) ? "<p>" + esc(ad.why_local_ok) + "</p>" : '<p class="missing">Mancante</p>') + "</section>" +
      field("Angolo", ad.angle) +
      field("Tema", ad.theme) +
      '<div class="field"><h3>Longevità</h3><p>' + (ad.longevity_flag ? "Sì" : "No") + "</p>" +
      (note ? '<p class="note">' + esc(note) + "</p>" : '<p class="missing">Nota mancante</p>') + "</div>" +
      field("Testo primario", ad.primary_text) +
      field("Headline", ad.headline) +
      field("Descrizione", ad.description) +
      field("Pulsante (CTA)", ad.cta) +
      platformBlock(ad) +
      '<div class="field"><h3>Creatività</h3>' +
      (ad.creative_preview
        ? '<img src="' + esc(ad.creative_preview) + '" alt="File creatività di ' + esc(ad.advertiser_name) + '" loading="lazy" decoding="async">'
        : '<p class="missing">Mancante</p>') +
      "</div>" +
      linkBlock(ad) +
      '<p class="idline">ID libreria ' + esc(ad.id) + "</p>" +
      "</div>";
    wireDetail();
    dlg.scrollTop = 0;
  }

  function hashId() {
    if (!location.hash.startsWith("#ad-")) return "";
    try { return decodeURIComponent(location.hash.slice(4)); }
    catch (e) { return ""; }
  }

  function applyHash() {
    var id = hashId();
    if (!id) {
      openId = "";
      if (dlg.open) dlg.close();
      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
        lastFocus = null;
      }
      return;
    }
    if (!ads.length) return;
    if (id === openId && dlg.open) return;
    openId = id;
    renderDetail(byId.get(id) || null, id);
    if (!dlg.open) dlg.showModal();
    var closeBtn = dlg.querySelector(".close");
    if (closeBtn) closeBtn.focus();
  }

  function openAd(id) {
    if (!id) return;
    var next = "#ad-" + encodeURIComponent(id);
    if (location.hash !== next) {
      lastFocus = document.activeElement;
      history.pushState({ ad: id }, "", location.pathname + location.search + next);
    }
    applyHash();
  }

  function closeDetail() {
    if (location.hash.startsWith("#ad-")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    applyHash();
  }

  function syncInert() {
    var mobile = mobileMq.matches;
    if (!mobile) {
      filters.classList.remove("is-open");
      backdrop.hidden = true;
      document.body.classList.remove("sheet-open");
      toggle.setAttribute("aria-expanded", "false");
      filters.inert = false;
      return;
    }
    var open = filters.classList.contains("is-open");
    filters.inert = !open;
    backdrop.hidden = !open;
  }

  function openSheet() {
    if (!mobileMq.matches) return;
    filters.classList.add("is-open");
    document.body.classList.add("sheet-open");
    toggle.setAttribute("aria-expanded", "true");
    syncInert();
    document.getElementById("sheet-close").focus();
  }

  function closeSheet() {
    filters.classList.remove("is-open");
    document.body.classList.remove("sheet-open");
    toggle.setAttribute("aria-expanded", "false");
    syncInert();
  }

  function applyAndRender() {
    writeUrl();
    render();
  }

  filters.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-chip]");
    if (!btn) return;
    state[btn.dataset.chip] = btn.dataset.value;
    reflectControls();
    applyAndRender();
  });

  temaEl.addEventListener("change", function () {
    state.tema = temaEl.value;
    applyAndRender();
  });

  angoloEl.addEventListener("change", function () {
    state.angolo = angoloEl.value;
    applyAndRender();
  });

  ordineEl.addEventListener("change", function () {
    state.ordine = ordineEl.value;
    applyAndRender();
  });

  qEl.addEventListener("input", function () {
    state.q = qEl.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyAndRender, 140);
  });

  function resetAll() {
    state.q = "";
    state.cat = "";
    state.tema = "";
    state.angolo = "";
    state.longevo = "";
    state.formato = "";
    state.ordine = "recenti";
    reflectControls();
    applyAndRender();
    qEl.focus();
  }

  document.getElementById("reset").addEventListener("click", resetAll);
  document.getElementById("reset-sheet").addEventListener("click", resetAll);

  toggle.addEventListener("click", function () {
    if (filters.classList.contains("is-open")) closeSheet();
    else openSheet();
  });
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && filters.classList.contains("is-open") && mobileMq.matches) {
      e.preventDefault();
      closeSheet();
      toggle.focus();
    }
  });

  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-ad]");
    if (!a) return;
    e.preventDefault();
    openAd(a.dataset.ad);
  });

  grid.addEventListener("click", function (e) {
    var btn = e.target.closest(".card");
    if (!btn) return;
    openAd(btn.dataset.id);
  });

  dlg.addEventListener("cancel", function (e) {
    e.preventDefault();
    closeDetail();
  });

  dlg.addEventListener("click", function (e) {
    if (e.target === dlg) closeDetail();
  });

  window.addEventListener("popstate", function () {
    readUrl();
    reflectControls();
    render();
    applyHash();
  });

  window.addEventListener("hashchange", applyHash);
  mobileMq.addEventListener("change", syncInert);

  readUrl();
  reflectControls();
  syncInert();

  fetch("data/ads.json")
    .then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then(function (data) {
      ads = data.map(enrich);
      byId = new Map(ads.map(function (a) { return [String(a.id), a]; }));
      var themes = THEME_ORDER.filter(function (t) {
        return ads.some(function (a) { return a.theme === t; });
      });
      ads.forEach(function (a) {
        if (a.theme && themes.indexOf(a.theme) === -1) themes.push(a.theme);
      });
      var angles = Array.from(new Set(ads.map(function (a) { return a.angle; }).filter(Boolean)));
      angles.sort(function (a, b) { return a.localeCompare(b, "it", { sensitivity: "base" }); });
      fillSelect(temaEl, themes);
      fillSelect(angoloEl, angles);
      reflectControls();
      writeUrl();
      render();
      applyHash();
    })
    .catch(function () {
      grid.innerHTML = '<p class="empty">Non riesco a caricare i dati. Ricarica la pagina.</p>';
      countEl.textContent = "Dati non disponibili";
    });
})();
