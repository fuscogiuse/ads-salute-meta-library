/* Filtri in query: q, cat, tema, angolo, formato, longevo=si, ordine.
   Scheda: #ad-<id>  Immagine intera: #foto-<id> */
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
  var SORTS = { recenti: 1, vecchie: 1, longevi: 1, nome: 1 };
  var MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var CTA = {
    "learn more": "Scopri di più",
    "send message": "Invia messaggio",
    "send whatsapp message": "WhatsApp",
    "visit instagram profile": "Profilo Instagram",
    "see details": "Vedi dettagli",
    "apply now": "Candidati",
    "call now": "Chiama ora",
    "contact us": "Contattaci",
    "get directions": "Indicazioni",
    "get offer": "Ottieni offerta",
    "book now": "Prenota",
    "sign up": "Iscriviti"
  };

  var state = { q: "", cat: "", tema: "", angolo: "", longevo: "", formato: "", ordine: "recenti" };
  var ads = [];
  var byId = new Map();
  var lastFocus = null;
  var searchTimer = 0;
  var scale = 1;
  var tx = 0;
  var ty = 0;
  var pointers = new Map();
  var gesture = null;
  var lastPointer = "";
  var suppressClick = false;

  var grid = document.getElementById("grid");
  var countEl = document.getElementById("count");
  var panelCount = document.getElementById("panel-count");
  var activeEl = document.getElementById("active");
  var qEl = document.getElementById("q");
  var ordineEl = document.getElementById("ordine");
  var temaEl = document.getElementById("tema");
  var angoloEl = document.getElementById("angolo");
  var longevoEl = document.getElementById("longevo");
  var filtriBtn = document.getElementById("filtri-btn");
  var panel = document.getElementById("panel");
  var backdrop = document.getElementById("backdrop");
  var detail = document.getElementById("detail");
  var detailBody = document.getElementById("detail-body");
  var detailTitle = document.getElementById("detail-title");
  var viewer = document.getElementById("viewer");
  var vimg = document.getElementById("vimg");
  var vstage = document.getElementById("vstage");
  var vcount = document.getElementById("vcount");
  var vprev = document.getElementById("vprev");
  var vnext = document.getElementById("vnext");
  var mobileMq = window.matchMedia("(max-width: 799px)");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function text(v) {
    return v && String(v).trim() ? String(v).trim() : "";
  }

  function catLabel(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === key) return CATS[i][1];
    return key || "Categoria mancante";
  }

  function mediaLabel(t) {
    return MEDIA[t] || (t ? String(t) : "Mancante");
  }

  function ctaLabel(raw) {
    var t = text(raw);
    if (!t) return "";
    return CTA[t.toLowerCase()] || t;
  }

  function initial(name) {
    var m = String(name || "").match(/[A-Za-zÀ-ÿ]/);
    return m ? m[0].toUpperCase() : "?";
  }

  function isStory(ad) {
    var s = ad.best_image_size || [1, 1];
    return s[1] / s[0] >= 1.6;
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
    return text(ad.started_running) || "Data mancante";
  }

  function readHash() {
    var m = /^#(ad|foto)-(.+)$/.exec(location.hash);
    if (!m) return { type: "", id: "" };
    try { return { type: m[1], id: decodeURIComponent(m[2]) }; }
    catch (e) { return { type: "", id: "" }; }
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    state.cat = p.get("cat") || "";
    state.tema = p.get("tema") || "";
    state.angolo = p.get("angolo") || "";
    state.longevo = p.get("longevo") === "si" ? "si" : "";
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

  function reflect() {
    qEl.value = state.q;
    ordineEl.value = state.ordine;
    longevoEl.checked = state.longevo === "si";
    document.querySelectorAll("[data-chip]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.value === state[btn.dataset.chip]));
    });
    if ([].some.call(temaEl.options, function (o) { return o.value === state.tema; })) temaEl.value = state.tema;
    if ([].some.call(angoloEl.options, function (o) { return o.value === state.angolo; })) angoloEl.value = state.angolo;
  }

  function fillSelect(el, values, current) {
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
    el.value = values.indexOf(current) === -1 ? "" : current;
    return el.value;
  }

  function enrich(ad) {
    ad._t = parseStarted(ad.started_running);
    ad._hay = norm([
      ad.advertiser_name, ad.primary_text, ad.headline, ad.description, ad.cta, ad.angle
    ].join("\n"));
    return ad;
  }

  function matches(ad) {
    if (state.cat && ad.category !== state.cat) return false;
    if (state.tema && ad.theme !== state.tema) return false;
    if (state.angolo && ad.angle !== state.angolo) return false;
    if (state.longevo === "si" && !ad.longevity_flag) return false;
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

  function currentList() {
    return ads.filter(matches).sort(compare);
  }

  function listIndex(id) {
    var list = currentList();
    var i = -1;
    for (var n = 0; n < list.length; n++) if (String(list[n].id) === String(id)) i = n;
    return { list: list, i: i };
  }

  function activeBits() {
    var bits = [];
    if (state.q.trim()) bits.push("«" + state.q.trim() + "»");
    if (state.cat) bits.push(catLabel(state.cat));
    if (state.tema) bits.push(state.tema);
    if (state.angolo) bits.push(state.angolo);
    if (state.longevo === "si") bits.push("Solo longevi");
    if (state.formato) bits.push(mediaLabel(state.formato));
    return bits;
  }

  function render() {
    var shown = currentList();
    if (!shown.length) {
      grid.innerHTML = '<p class="empty">Nessuna ad con questi filtri.</p>';
    } else {
      grid.innerHTML = shown.map(cardHtml).join("");
    }
    var label = shown.length === ads.length ? ads.length + " ads" : shown.length + " di " + ads.length;
    countEl.textContent = label;
    panelCount.textContent = label;
    var bits = activeBits();
    activeEl.hidden = bits.length === 0;
    activeEl.textContent = bits.length ? "Attivi: " + bits.join(" · ") : "";
    var extra = [state.tema, state.angolo, state.formato, state.longevo].filter(Boolean).length;
    filtriBtn.textContent = extra ? "Filtri · " + extra : "Filtri";
  }

  function videoFile(ad) {
    return ad.media && ad.media.video ? ad.media.video : "";
  }

  function cardFiles(ad) {
    return ad.media && ad.media.cards && ad.media.cards.length ? ad.media.cards : [];
  }

  function videoMissing(ad) {
    return ad.media_type === "video" && !videoFile(ad);
  }

  function cardHtml(ad, index) {
    var badges = '<span class="badge cat-' + esc(ad.category) + '">' + esc(catLabel(ad.category)) + "</span>";
    if (ad.longevity_flag) badges += '<span class="badge long">Longevo</span>';
    var why = text(ad.why_short) || text(ad.why_it_works);
    return '<article class="card">' +
      '<div class="card-head">' +
      '<h2 class="name">' + esc(ad.advertiser_name || "Inserzionista mancante") + "</h2>" +
      '<button type="button" class="open" data-open="' + esc(ad.id) + '">Apri scheda</button>' +
      "</div>" +
      creativeCard(ad, index) +
      (videoMissing(ad) ? '<p class="unavail">Video non disponibile su Meta</p>' : "") +
      '<div class="card-meta">' +
      '<p class="badges">' + badges + "</p>" +
      '<p class="angle">' + esc(text(ad.angle) || "Angolo mancante") + "</p>" +
      '<p class="date">' + esc(dateLabel(ad)) + " · " + esc(mediaLabel(ad.media_type)) + "</p>" +
      '<p class="why"><span>Perché funziona</span>' + esc(why) + "</p>" +
      "</div></article>";
  }

  function creativeCard(ad, index) {
    var wh = ad.best_image_size || [1, 1];
    var loading = index < 2 ? "eager" : "lazy";
    var pri = index === 0 ? ' fetchpriority="high"' : "";
    if (videoFile(ad)) {
      return '<div class="vidbox">' +
        '<img class="poster" src="' + esc(ad.card) + '" alt="" width="' + wh[0] + '" height="' + wh[1] + '" loading="' + loading + '" decoding="async"' + pri + ">" +
        '<video controls playsinline preload="none" poster="' + esc(ad.card) + '" data-full="' + esc(ad.best_image) + '" src="' + esc(videoFile(ad)) + '"></video>' +
        '<button type="button" class="play-btn" aria-label="Riproduci il video di ' + esc(ad.advertiser_name) + '"><span aria-hidden="true">▶</span></button>' +
        '<span class="vbadge">Video</span></div>';
    }
    var extra = cardFiles(ad).length > 1 ? '<span class="vbadge">Carosello</span>' : "";
    return '<button type="button" class="shot" data-zoom="' + esc(ad.id) + '" aria-label="Ingrandisci la creatività di ' + esc(ad.advertiser_name) + '">' +
      '<img src="' + esc(ad.card) + '" alt="" width="' + wh[0] + '" height="' + wh[1] + '" loading="' + loading + '" decoding="async"' + pri + ">" +
      '<span class="zoom-label" aria-hidden="true">Ingrandisci</span>' + extra + "</button>";
  }

  function truncHTML(value, limit) {
    var t = text(value);
    if (!t) return "";
    if (t.length <= limit) return "<p>" + esc(t) + "</p>";
    var cut = t.slice(0, limit);
    var sp = cut.lastIndexOf(" ");
    if (sp > limit * 0.55) cut = cut.slice(0, sp);
    return '<div class="trunc"><p class="trunc-short">' + esc(cut) + '… <button type="button" class="altro" data-altro>Altro</button></p>' +
      '<p class="trunc-full" hidden>' + esc(t) + ' <button type="button" class="altro" data-altro>Meno</button></p></div>';
  }

  function headerHTML(ad) {
    return '<div class="fb-top"><span class="avatar" aria-hidden="true">' + esc(initial(ad.advertiser_name)) + "</span><div>" +
      '<strong class="fb-name">' + esc(ad.advertiser_name || "Pagina") + "</strong>" +
      '<div class="fb-spon">Sponsorizzato</div></div></div>';
  }

  function imageButton(ad) {
    var wh = ad.best_image_size || [1, 1];
    return '<button type="button" class="mock-shot" data-zoom="' + esc(ad.id) + '" aria-label="Ingrandisci la creatività">' +
      '<img data-full="' + esc(ad.best_image) + '" data-id="' + esc(ad.id) + '" src="' + esc(ad.card) + '" alt="" width="' + wh[0] + '" height="' + wh[1] + '">' +
      "</button>";
  }

  function videoBox(ad, mode) {
    return '<div class="vidbox vidbox-' + mode + '">' +
      '<video controls playsinline preload="none" poster="' + esc(ad.best_image) + '" src="' + esc(videoFile(ad)) + '"></video>' +
      '<button type="button" class="play-btn" aria-label="Riproduci il video"><span aria-hidden="true">▶</span></button></div>';
  }

  function carouselHTML(cards) {
    var slides = cards.map(function (src, i) {
      return '<div class="car-slide"><img src="' + esc(src) + '" alt="Card ' + (i + 1) + " di " + cards.length + '" loading="' + (i === 0 ? "eager" : "lazy") + '" decoding="async" draggable="false"></div>';
    }).join("");
    return '<div class="carousel"><div class="car-track">' + slides + "</div>" +
      '<button type="button" class="car-nav car-prev" aria-label="Card precedente">‹</button>' +
      '<button type="button" class="car-nav car-next" aria-label="Card successiva">›</button>' +
      '<p class="car-count">1 / ' + cards.length + "</p></div>";
  }

  function creativeMock(ad, story) {
    if (videoFile(ad)) return videoBox(ad, story ? "story" : "detail");
    var cards = cardFiles(ad);
    if (ad.media_type === "carousel" && cards.length) return carouselHTML(cards);
    return imageButton(ad);
  }

  function mockHTML(ad) {
    var cards = cardFiles(ad);
    var story = !(ad.media_type === "carousel" && cards.length) && isStory(ad);
    var primary = truncHTML(ad.primary_text, story ? 90 : 160);
    var hl = text(ad.headline);
    var desc = text(ad.description);
    var cta = ctaLabel(ad.cta);
    var note = videoMissing(ad) ? '<p class="unavail">Video non disponibile su Meta</p>' : "";
    if (story) {
      return '<p class="caption">Come appare in una storia</p><article class="story">' +
        creativeMock(ad, true) +
        '<div class="story-top"><span class="avatar" aria-hidden="true">' + esc(initial(ad.advertiser_name)) + "</span><div>" +
        "<strong>" + esc(ad.advertiser_name || "Pagina") + "</strong><div class=\"fb-spon\">Sponsorizzato</div></div></div>" +
        '<div class="story-bottom">' + primary +
        (hl ? '<strong class="story-hl">' + esc(hl) + "</strong>" : "") +
        (cta ? '<span class="story-cta">' + esc(cta) + "</span>" : "") +
        "</div></article>" + note;
    }
    var bar = "";
    if (hl || desc || cta) {
      bar = '<div class="fb-bar"><div class="fb-links">' +
        (hl ? "<strong>" + esc(hl) + "</strong>" : "") +
        (desc ? "<span>" + esc(desc) + "</span>" : "") +
        "</div>" + (cta ? '<span class="fb-cta">' + esc(cta) + "</span>" : "") + "</div>";
    }
    return '<p class="caption">Come appare su Facebook</p><article class="fb">' +
      headerHTML(ad) +
      (primary ? '<div class="fb-text">' + primary + "</div>" : "") +
      creativeMock(ad, false) + bar + "</article>" + note;
  }

  function downloadHTML(ad) {
    var files = [];
    if (videoFile(ad)) files.push(videoFile(ad));
    else if (cardFiles(ad).length) files = cardFiles(ad).slice();
    else if (ad.best_image) files.push(ad.best_image);
    return files.map(function (href, i) {
      var label = files.length > 1 ? "Scarica originale " + (i + 1) : "Scarica originale";
      return '<a class="btn btn-ghost" href="' + esc(href) + '" download>' + label + "</a>";
    }).join("");
  }

  function bindCarousel(root) {
    var track = root.querySelector(".car-track");
    var label = root.querySelector(".car-count");
    var n = track.children.length;
    var drag = null;
    function update() {
      var w = track.clientWidth || 1;
      var i = Math.round(track.scrollLeft / w);
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;
      label.textContent = (i + 1) + " / " + n;
    }
    track.addEventListener("scroll", update, { passive: true });
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, id: e.pointerId, moved: false };
    });
    track.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) < 4) return;
      drag.moved = true;
      track.setPointerCapture(e.pointerId);
      track.scrollLeft = drag.left - dx;
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        var w = track.clientWidth || 1;
        var i = Math.round(track.scrollLeft / w);
        track.scrollTo({ left: i * w, behavior: "smooth" });
      }
      drag = null;
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
  }

  function field(label, value) {
    var v = text(value);
    return '<div class="field"><h3>' + esc(label) + "</h3>" +
      (v ? "<p>" + esc(v) + "</p>" : '<p class="missing">Mancante</p>') + "</div>";
  }

  function paintDetail(id) {
    var ad = byId.get(String(id));
    detailTitle.textContent = ad ? ad.advertiser_name : "Scheda non trovata";
    if (!ad) {
      detailBody.innerHTML = '<div class="detail-body"><p class="missing">Nessuna scheda con questo id.</p></div>';
      return;
    }
    var platforms = ad.platforms || [];
    var plat = platforms.length
      ? '<ul class="pills">' + platforms.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>"
      : '<p class="missing">Mancante</p>';
    var lib = text(ad.library_ad_url)
      ? '<a class="btn" href="' + esc(ad.library_ad_url) + '" target="_blank" rel="noopener">Apri nella Libreria inserzioni</a>'
      : '<p class="missing">Link Libreria: mancante</p>';
    var page = text(ad.page_url)
      ? '<a class="btn btn-ghost" href="' + esc(ad.page_url) + '" target="_blank" rel="noopener">Pagina inserzionista</a>'
      : '<p class="missing">Pagina inserzionista: mancante</p>';
    var note = text(ad.notes_on_longevity);
    detailBody.innerHTML = '<div class="detail-body"><div class="detail-grid"><div>' +
      mockHTML(ad) +
      '<button type="button" class="zoom-link" data-zoom="' + esc(ad.id) + '">Ingrandisci immagine</button>' +
      "</div><div>" +
      '<h3 class="info-title">Note</h3>' +
      '<p class="date">' + esc(catLabel(ad.category)) + " · " + esc(dateLabel(ad)) + " · " + esc(mediaLabel(ad.media_type)) +
      (ad.longevity_flag ? " · Longevo" : "") + "</p>" +
      field("Perché funziona", ad.why_it_works) +
      field("Perché è locale", ad.why_local_ok) +
      field("Angolo", ad.angle) +
      field("Tema", ad.theme) +
      '<div class="field"><h3>Longevità</h3><p>' + (ad.longevity_flag ? "Sì" : "No") + "</p>" +
      (note ? '<p class="note">' + esc(note) + "</p>" : '<p class="missing">Nota mancante</p>') + "</div>" +
      field("Testo primario", ad.primary_text) +
      field("Headline", ad.headline) +
      field("Descrizione", ad.description) +
      field("Pulsante", ctaLabel(ad.cta)) +
      '<div class="field"><h3>Piattaforme</h3>' + plat + "</div>" +
      '<div class="actions">' + downloadHTML(ad) + lib + page + "</div>" +
      '<p class="date">Scheda ' + String(ad.line_num).padStart(2, "0") + " · ID " + esc(ad.id) + "</p>" +
      "</div></div></div>";
    detailBody.querySelectorAll("img[data-full]").forEach(upgradeImage);
    detailBody.querySelectorAll(".carousel").forEach(bindCarousel);
  }

  function upgradeImage(img) {
    var full = new Image();
    var id = img.getAttribute("data-id");
    var src = img.getAttribute("data-full");
    full.onload = function () {
      if (img.isConnected && img.getAttribute("data-id") === id) img.src = src;
    };
    full.src = src;
  }

  function resetZoom() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyZoom();
  }

  function applyZoom() {
    vimg.style.transform = "translate3d(" + tx + "px," + ty + "px,0) scale(" + scale + ")";
  }

  function setScale(next) {
    scale = Math.min(5, Math.max(1, next));
    if (scale === 1) { tx = 0; ty = 0; }
    applyZoom();
  }

  function paintViewer(id) {
    var ad = byId.get(String(id));
    var found = listIndex(id);
    vprev.disabled = found.i <= 0;
    vnext.disabled = found.i < 0 || found.i >= found.list.length - 1;
    vcount.textContent = found.i >= 0 ? (found.i + 1) + " / " + found.list.length : "";
    if (!ad) {
      vimg.alt = "Immagine non trovata";
      vimg.removeAttribute("src");
      return;
    }
    resetZoom();
    vimg.alt = "Creatività di " + (ad.advertiser_name || "");
    vimg.src = ad.card;
    var full = new Image();
    full.onload = function () {
      if (readHash().id === String(id)) vimg.src = ad.best_image;
    };
    full.src = ad.best_image;
  }

  function syncDialogs() {
    var h = readHash();
    if (!ads.length) return;
    if (h.type === "foto") {
      if (detail.open) detail.close();
      var firstV = !viewer.open;
      paintViewer(h.id);
      if (!viewer.open) viewer.showModal();
      if (firstV) document.getElementById("vclose").focus();
      return;
    }
    if (h.type === "ad") {
      if (viewer.open) viewer.close();
      var firstD = !detail.open;
      paintDetail(h.id);
      if (!detail.open) detail.showModal();
      if (firstD) document.getElementById("dclose").focus();
      return;
    }
    if (viewer.open) viewer.close();
    if (detail.open) detail.close();
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
      lastFocus = null;
    }
  }

  function openView(view, id, mode) {
    pauseOthers(null);
    var hash = "#" + view + "-" + encodeURIComponent(id);
    var url = location.pathname + location.search + hash;
    if (location.hash === hash) {
      syncDialogs();
      return;
    }
    if (mode !== "replace") {
      if (!history.state || !history.state.view) lastFocus = document.activeElement;
      history.pushState({ view: view, id: id }, "", url);
    } else {
      history.replaceState({ view: view, id: id }, "", url);
    }
    syncDialogs();
  }

  function closeCurrent() {
    pauseOthers(null);
    if (history.state && history.state.view) {
      history.back();
      return;
    }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    syncDialogs();
  }

  function stepFoto(dir) {
    var h = readHash();
    if (h.type !== "foto") return;
    var found = listIndex(h.id);
    var next = found.list[found.i + dir];
    if (!next) return;
    openView("foto", next.id, "replace");
  }

  function setPanel(open) {
    panel.hidden = !open;
    var mobile = mobileMq.matches;
    backdrop.hidden = !open || !mobile;
    filtriBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("panel-open", open && mobile);
  }

  function resetAll() {
    state.q = "";
    state.cat = "";
    state.tema = "";
    state.angolo = "";
    state.longevo = "";
    state.formato = "";
    state.ordine = "recenti";
    reflect();
    writeUrl();
    render();
  }

  function pauseOthers(except) {
    document.querySelectorAll("video").forEach(function (v) {
      if (v !== except && !v.paused) v.pause();
    });
  }

  document.addEventListener("play", function (e) {
    var video = e.target;
    if (!video || video.tagName !== "VIDEO") return;
    pauseOthers(video);
    var box = video.closest(".vidbox");
    if (box) box.classList.add("is-playing");
  }, true);

  function showPlay(e) {
    var video = e.target;
    if (!video || video.tagName !== "VIDEO") return;
    var box = video.closest(".vidbox");
    if (box) box.classList.remove("is-playing");
  }

  document.addEventListener("pause", showPlay, true);
  document.addEventListener("ended", showPlay, true);

  document.addEventListener("click", function (e) {
    var playBtn = e.target.closest(".play-btn");
    if (playBtn) {
      var video = playBtn.parentElement.querySelector("video");
      if (video) {
        var full = video.getAttribute("data-full");
        if (full) video.poster = full;
        var pending = video.play();
        if (pending && pending.catch) pending.catch(function () {});
      }
      return;
    }
    var carBtn = e.target.closest(".car-nav");
    if (carBtn) {
      var track = carBtn.closest(".carousel").querySelector(".car-track");
      var dir = carBtn.classList.contains("car-next") ? 1 : -1;
      track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" });
      return;
    }
    var zoom = e.target.closest("[data-zoom]");
    if (zoom) {
      openView("foto", zoom.getAttribute("data-zoom"), "push");
      return;
    }
    var open = e.target.closest("[data-open]");
    if (open) {
      openView("ad", open.getAttribute("data-open"), "push");
      return;
    }
    var altro = e.target.closest("[data-altro]");
    if (altro) {
      var box = altro.closest(".trunc");
      var shortP = box.querySelector(".trunc-short");
      var fullP = box.querySelector(".trunc-full");
      var showFull = fullP.hidden;
      shortP.hidden = showFull;
      fullP.hidden = !showFull;
      return;
    }
    var chip = e.target.closest("[data-chip]");
    if (chip) {
      state[chip.dataset.chip] = chip.dataset.value;
      reflect();
      writeUrl();
      render();
    }
  });

  temaEl.addEventListener("change", function () {
    state.tema = temaEl.value;
    writeUrl();
    render();
  });
  angoloEl.addEventListener("change", function () {
    state.angolo = angoloEl.value;
    writeUrl();
    render();
  });
  ordineEl.addEventListener("change", function () {
    state.ordine = ordineEl.value;
    writeUrl();
    render();
  });
  longevoEl.addEventListener("change", function () {
    state.longevo = longevoEl.checked ? "si" : "";
    writeUrl();
    render();
  });
  qEl.addEventListener("input", function () {
    state.q = qEl.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      writeUrl();
      render();
    }, 140);
  });

  document.getElementById("azzera").addEventListener("click", resetAll);
  document.getElementById("azzera-panel").addEventListener("click", resetAll);
  filtriBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    setPanel(panel.hidden);
  });
  document.getElementById("panel-close").addEventListener("click", function () { setPanel(false); });
  backdrop.addEventListener("click", function () { setPanel(false); });
  document.addEventListener("click", function (e) {
    if (panel.hidden) return;
    if (e.target.closest("#panel") || e.target.closest("#filtri-btn")) return;
    setPanel(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden && !detail.open && !viewer.open) {
      setPanel(false);
      filtriBtn.focus();
    }
    if (!viewer.open) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stepFoto(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepFoto(-1); }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); setScale(scale * 1.35); }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); setScale(scale / 1.35); }
  });

  document.getElementById("dclose").addEventListener("click", closeCurrent);
  document.getElementById("vclose").addEventListener("click", closeCurrent);
  vprev.addEventListener("click", function () { stepFoto(-1); });
  vnext.addEventListener("click", function () { stepFoto(1); });
  document.getElementById("vzin").addEventListener("click", function () { setScale(scale * 1.4); });
  document.getElementById("vzout").addEventListener("click", function () { setScale(scale / 1.4); });

  detail.addEventListener("cancel", function (e) { e.preventDefault(); closeCurrent(); });
  viewer.addEventListener("cancel", function (e) { e.preventDefault(); closeCurrent(); });
  detail.addEventListener("click", function (e) { if (e.target === detail) closeCurrent(); });
  viewer.addEventListener("click", function (e) { if (e.target === viewer) closeCurrent(); });

  viewer.addEventListener("wheel", function (e) {
    if (!viewer.open) return;
    e.preventDefault();
    setScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });

  vstage.addEventListener("pointerdown", function (e) {
    vstage.setPointerCapture(e.pointerId);
    lastPointer = e.pointerType;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gesture = { x: e.clientX, y: e.clientY, type: e.pointerType, tx: tx, ty: ty, scale: scale, moved: false, pinching: false };
    } else if (pointers.size === 2 && gesture) {
      var both = Array.from(pointers.values());
      gesture.dist = Math.hypot(both[0].x - both[1].x, both[0].y - both[1].y);
      gesture.scale = scale;
      gesture.pinching = true;
    }
  });

  vstage.addEventListener("pointermove", function (e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && gesture.dist) {
      var both = Array.from(pointers.values());
      var d = Math.hypot(both[0].x - both[1].x, both[0].y - both[1].y);
      setScale(gesture.scale * (d / gesture.dist));
      gesture.moved = true;
      return;
    }
    if (pointers.size === 1 && scale > 1) {
      tx = gesture.tx + (e.clientX - gesture.x);
      ty = gesture.ty + (e.clientY - gesture.y);
      gesture.panned = true;
      applyZoom();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!gesture || pointers.size > 0) return;
    var dx = e.clientX - gesture.x;
    var dy = e.clientY - gesture.y;
    if (!gesture.pinching && gesture.type === "touch" && scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      stepFoto(dx < 0 ? 1 : -1);
    }
    if (gesture.panned || gesture.pinching) suppressClick = true;
    gesture = null;
  }
  vstage.addEventListener("pointerup", endPointer);
  vstage.addEventListener("pointercancel", endPointer);

  vstage.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    if (suppressClick) { suppressClick = false; return; }
    if (lastPointer === "touch") return;
    setScale(scale > 1.05 ? 1 : 2.4);
  });

  window.addEventListener("popstate", function () {
    readUrl();
    reflect();
    render();
    syncDialogs();
  });
  mobileMq.addEventListener("change", function () {
    if (!mobileMq.matches) setPanel(false);
  });

  readUrl();
  reflect();

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
      state.tema = fillSelect(temaEl, themes, state.tema);
      state.angolo = fillSelect(angoloEl, angles, state.angolo);
      reflect();
      writeUrl();
      render();
      syncDialogs();
    })
    .catch(function () {
      grid.innerHTML = '<p class="empty">Non riesco a caricare i dati. Ricarica la pagina.</p>';
      countEl.textContent = "Dati non disponibili";
    });
})();
