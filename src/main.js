// Jokių priklausomybių: judesį daro CSS, o šitas failas tik laiku uždeda klases.
// Septyni judesiai ir nė vieno daugiau. Jei animacijos išjungtos (prefers-reduced-motion
// arba --motion-scale: 0), šitas failas nieko neanimuoja, o puslapis lieka galutinėje būsenoje.
(function () {
  "use strict";

  var motionOn = document.documentElement.classList.contains("js");

  // Skaitiklio trukmė imama iš tokens.css: perrašius temą pasikeičia ir ji.
  // Visos kitos trukmės ir greitėjimai liko CSS pusėje, todėl čia jų nebereikia.
  var css = getComputedStyle(document.documentElement);
  var countFor = (function () {
    var raw = css.getPropertyValue("--dur-count").trim();
    var n = parseFloat(raw);
    if (!isFinite(n)) return 1200;
    return /ms$/.test(raw) ? n : n * 1000;
  })();

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Vienas stebėtojas visai grupei: suveikia vieną kartą ir elementą paleidžia.
  // Apatinis kraštas patrauktas 10 %, kad blokas pasirodytų jau tikrai matomas.
  function onceSeen(threshold, act) {
    return new IntersectionObserver(function (entries, io) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        act(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: threshold });
  }

  // Eilės numeris: iš jo CSS pasidaro transition-delay, todėl nariai suplaukia vienas po kito.
  function order(items) {
    items.forEach(function (el, i) { el.style.setProperty("--i", i); });
  }

  /* --- 1. Hero: antraštė, sakinys ir mygtukai suplaukia pakrovus, vieną kartą. --- */

  function heroIn() {
    var lines = $$("[data-hero]");
    if (!lines.length) return;
    order(lines);
    // Du kadrai laukimo: klasė turi atsirasti po to, kai naršyklė jau nupiešė pradinę
    // būseną. Uždėta tame pačiame kadre ji perėjimo neduotų — tekstas tiesiog atsirastų.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        lines.forEach(function (el) { el.classList.add("is-in"); });
      });
    });
  }

  /* --- 2. Sekcijos ir tinklelių nariai: pasirodo įslinkę į ekraną, vieną kartą. --- */

  function reveals() {
    var show = onceSeen(0, function (el) { el.classList.add("is-in"); });
    $$(".reveal").forEach(function (el) { show.observe(el); });
    $$(".reveal-group").forEach(function (group) {
      order($$(":scope > *", group));
      show.observe(group);
    });
  }

  /* --- 3. Skaičiai: suskaičiuoja per 1,2 s, kai juostą pamato akis. --- */

  function counters() {
    var watch = onceSeen(0.5, countUp);
    $$("[data-count]").forEach(function (el) { watch.observe(el); });
  }

  function countUp(el) {
    var end = Number(el.getAttribute("data-count"));
    if (!isFinite(end)) return;
    // Galutinė reikšmė paimama iš paties puslapio: skaitiklis grįžta būtent į ją,
    // su tarpais tarp tūkstančių ir viskuo, ką parašė content.json.
    var final = el.textContent;
    var started = 0;
    var step = function (now) {
      if (!started) started = now;
      var t = Math.min(1, (now - started) / countFor);
      // Sulėtėjimas gale, kaip ir --ease-out: greitai pradeda, švelniai sustoja.
      el.textContent = t < 1 ? String(Math.round(end * (1 - Math.pow(1 - t, 3)))) : final;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* --- 4. Mygtukai: paspaudimą suspaudžia CSS (.js .btn:active). Čia nieko nereikia. --- */

  /* --- 5. Antraštė: po 24 px slinkties gauna foną ir apatinį plaukelį. --- */

  function masthead() {
    var bar = $("[data-masthead]");
    if (!bar) return;
    var stuck = false;
    var mark = function (y) {
      var next = y > 24;
      if (next === stuck) return;
      stuck = next;
      bar.classList.toggle("is-stuck", stuck);
    };
    addEventListener("scroll", function () { mark(window.scrollY); }, { passive: true });
    mark(window.scrollY);
  }

  /* --- 6. Hero nuotrauka: paralaksą suka CSS (view-timeline styles.css byloje).
     Čia lieka atsarginis kelias toms naršyklėms, kurios animation-timeline dar nemoka;
     sąlyga ta pati, kaip @supports taisyklėje, todėl abu keliai kartu nepasileidžia. --- */

  function parallax() {
    var photo = $("[data-parallax]");
    if (!photo || !matchMedia("(min-width: 760px)").matches) return;
    if (window.CSS && CSS.supports("animation-timeline: view()")) return;
    var frame = photo.parentElement;
    var shift = parseFloat(css.getPropertyValue("--hero-shift")) || 0;
    var top = 0, height = 0, queued = false;
    var measure = function () {
      var box = frame.getBoundingClientRect();
      top = box.top + window.scrollY;
      height = box.height;
    };
    var draw = function () {
      queued = false;
      var progress = height ? (window.scrollY - top) / height : 0;
      progress = progress < 0 ? 0 : progress > 1 ? 1 : progress;
      photo.style.transform = "translateY(" + (progress * shift).toFixed(1) + "px)";
    };
    measure();
    draw();
    addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    }, { passive: true });
    addEventListener("resize", function () { measure(); draw(); }, { passive: true });
  }

  /* --- 7. Galerijos langas: atsidaro iš 0,96 masto (CSS animacija .js .lightbox[open]). --- */

  function gallery() {
    var dialog = $("#darbo-langas");
    if (!dialog || typeof dialog.showModal !== "function") return;
    var slot = $(".lightbox-photo", dialog);
    var title = $(".lightbox-title", dialog);
    var credit = $(".lightbox-credit", dialog);
    var opener = null;

    $$(".work-shot").forEach(function (button) {
      button.addEventListener("click", function () {
        opener = button;
        // Didelė nuotrauka atsiranda tik atidarius, kad puslapis krautųsi lengvas.
        // data-full yra vardas be plėtinio: <picture> pati pasirenka AVIF, WebP arba JPEG.
        var base = button.getAttribute("data-full");
        var picture = document.createElement("picture");
        var avif = document.createElement("source");
        avif.type = "image/avif";
        avif.srcset = base + ".avif";
        var webpSource = document.createElement("source");
        webpSource.type = "image/webp";
        webpSource.srcset = base + ".webp";
        var full = document.createElement("img");
        full.src = base + ".jpg";
        full.alt = button.getAttribute("data-alt");
        full.width = 1200;
        full.height = 800;
        picture.append(avif, webpSource, full);
        slot.replaceChildren(picture);
        title.textContent = button.getAttribute("data-title");
        credit.textContent = button.getAttribute("data-credit");
        dialog.showModal();
      });
    });

    $(".lightbox-close", dialog).addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("close", function () { if (opener) opener.focus(); });
  }

  /* --- Meniu telefone --- */

  function menu() {
    var toggle = $(".nav-toggle");
    var nav = $("#pagrindinis-meniu");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.setAttribute("data-open", String(!open));
    });
    // Paspaudus inkarą viename puslapyje meniu užsidaro pats.
    nav.addEventListener("click", function (event) {
      if (event.target.tagName !== "A" || !matchMedia("(max-width: 759px)").matches) return;
      toggle.setAttribute("aria-expanded", "false");
      nav.setAttribute("data-open", "false");
    });
  }

  /* --- Vieno puslapio meniu: aria-current seka matomą sekciją --- */

  function spy() {
    var main = $("[data-onepage]");
    if (!main) return;
    var links = $$('#pagrindinis-meniu a[href^="#"]');
    if (!links.length) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var visible = [];

    var watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id;
        var at = visible.indexOf(id);
        if (entry.isIntersecting && at < 0) visible.push(id);
        if (!entry.isIntersecting && at >= 0) visible.splice(at, 1);
      });
      // Aukščiausia matoma sekcija laimi; jei nematyti nė vienos, žymė nenuimama.
      var order = Object.keys(byId);
      var current = order.filter(function (id) { return visible.indexOf(id) >= 0; })[0];
      if (!current) return;
      links.forEach(function (a) {
        var mine = a === byId[current];
        if (mine) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-20% 0px -60% 0px", threshold: 0 });

    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) watch.observe(section);
    });
  }

  /* --- Užklausos forma be serverio --- */

  function form() {
    var enquiry = $(".enquiry");
    if (!enquiry) return;
    enquiry.addEventListener("submit", function (event) {
      event.preventDefault();
      var done = document.createElement("p");
      done.className = "form-done";
      done.setAttribute("tabindex", "-1");
      done.setAttribute("role", "status");
      done.textContent = "Ačiū. Susisieksime per vieną darbo dieną.";
      enquiry.replaceWith(done);
      done.focus();
    });
  }

  function start() {
    menu();
    spy();
    form();
    gallery();
    masthead();
    if (!motionOn) return;
    heroIn();
    reveals();
    counters();
    parallax();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
