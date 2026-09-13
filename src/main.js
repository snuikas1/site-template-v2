// Motion (vendor/motion.js, MIT) prisistato kaip globalus `Motion`. Be paketų tvarkyklės, be CDN.
// Septyni judesiai ir nė vieno daugiau. Jei animacijos išjungtos (prefers-reduced-motion arba
// --motion-scale: 0), šitas failas nieko neanimuoja, o puslapis lieka galutinėje būsenoje.
(function () {
  "use strict";

  var motionOn = document.documentElement.classList.contains("js");
  var M = window.Motion || {};
  var animate = M.animate, inView = M.inView, scroll = M.scroll, stagger = M.stagger, press = M.press;

  // Trukmės ir greitėjimas imami iš tokens.css, kad viena vieta valdytų ir CSS, ir JS.
  // Perrašius temą animacijos pasikeičia kartu su ja, o ne lieka įrašytos čia.
  var css = getComputedStyle(document.documentElement);
  function seconds(name) {
    var raw = css.getPropertyValue(name).trim();
    var n = parseFloat(raw);
    if (!isFinite(n)) return 0.3;
    return /ms$/.test(raw) ? n / 1000 : n;
  }
  function easing(name) {
    var m = /cubic-bezier\(([^)]+)\)/.exec(css.getPropertyValue(name));
    return m ? m[1].split(",").map(Number) : "easeOut";
  }
  var quick = seconds("--dur-1"), mid = seconds("--dur-2"), slow = seconds("--dur-3");
  var countFor = seconds("--dur-count");
  var softOut = easing("--ease-out");

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* --- 1. Hero: antraštė, sakinys ir mygtukai suplaukia pakrovus, vieną kartą. --- */

  function heroIn() {
    var lines = $$("[data-hero]");
    if (!lines.length) return;
    animate(lines,
      { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] },
      { duration: slow, delay: stagger(quick / 2), ease: softOut });
  }

  /* --- 2. Sekcijos ir tinklelių nariai: pasirodo įslinkę į ekraną, vieną kartą. --- */

  function reveals() {
    $$(".reveal").forEach(function (el) {
      inView(el, function () {
        if (el.dataset.shown) return;
        el.dataset.shown = "1";
        animate(el, { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] },
          { duration: slow, ease: softOut });
      }, { amount: 0.15 });
    });

    $$(".reveal-group").forEach(function (group) {
      var kids = $$(":scope > *", group);
      if (!kids.length) return;
      inView(group, function () {
        if (group.dataset.shown) return;
        group.dataset.shown = "1";
        animate(kids, { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] },
          { duration: slow, delay: stagger(quick / 3), ease: softOut });
      }, { amount: 0.1 });
    });
  }

  /* --- 3. Skaičiai: suskaičiuoja per 1,2 s, kai juostą pamato akis. --- */

  function counters() {
    $$("[data-count]").forEach(function (el) {
      var end = Number(el.getAttribute("data-count"));
      if (!isFinite(end)) return;
      var final = el.textContent;
      inView(el, function () {
        if (el.dataset.counted) return;
        el.dataset.counted = "1";
        animate(0, end, {
          duration: countFor,
          ease: "easeOut",
          onUpdate: function (v) { el.textContent = String(Math.round(v)); },
          onComplete: function () { el.textContent = final; },
        });
      }, { amount: 0.5 });
    });
  }

  /* --- 4. Mygtukai: paspaudimas suspaudžia iki 0,97 ir atleidžia. Užvedimas — CSS. --- */

  function presses() {
    press(".btn, .work-shot, .nav-toggle, .lightbox-close", function (el) {
      animate(el, { scale: 0.97 }, { duration: quick, ease: softOut });
      return function () { animate(el, { scale: 1 }, { duration: mid, ease: softOut }); };
    });
  }

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
    if (motionOn && scroll) scroll(function (progress, info) { mark(info.y.current); });
    else {
      addEventListener("scroll", function () { mark(window.scrollY); }, { passive: true });
      mark(window.scrollY);
    }
  }

  /* --- 6. Hero nuotrauka: iki 40 px paralakso, susieto su slinktimi. Tik nuo 760 px. --- */

  function parallax() {
    var photo = $("[data-parallax]");
    var frame = photo && photo.parentElement;
    if (!photo || !matchMedia("(min-width: 760px)").matches) return;
    scroll(
      animate(photo, { transform: ["translateY(0px)", "translateY(40px)"] }, { ease: "linear" }),
      { target: frame, offset: ["start start", "end start"] }
    );
  }

  /* --- 7. Galerijos langas: atsidaro iš 0,96 masto. --- */

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
        // data-full yra vardas be plėtinio: <picture> pati pasirenka AVIF arba JPEG.
        var base = button.getAttribute("data-full");
        var picture = document.createElement("picture");
        var avif = document.createElement("source");
        avif.type = "image/avif";
        avif.srcset = base + ".avif";
        var full = document.createElement("img");
        full.src = base + ".jpg";
        full.alt = button.getAttribute("data-alt");
        full.width = 1200;
        full.height = 800;
        picture.append(avif, full);
        slot.replaceChildren(picture);
        title.textContent = button.getAttribute("data-title");
        credit.textContent = button.getAttribute("data-credit");
        dialog.showModal();
        if (motionOn) {
          animate(dialog, { opacity: [0, 1], transform: ["scale(0.96)", "scale(1)"] },
            { duration: mid, ease: softOut });
        }
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
    if (!motionOn || !animate) return;
    heroIn();
    reveals();
    counters();
    presses();
    parallax();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
