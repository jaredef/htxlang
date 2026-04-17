/**
 * htmx-derived.js — Drop-in htmx replacement derived from the HTMX Constraint Seed.
 * Same hx-* namespace. Same behavior. Derived from six essential constraints.
 *
 * Seed: https://htxlang.org/derivations/htmx/HTMX-SEED.md
 * Method: https://jaredfoy.com/doc/247-the-derivation-inversion
 *
 * MIT License — Jared Foy, htxlang.org
 */
(function () {
  "use strict";

  var VERBS = ["get", "post", "put", "patch", "delete"];
  var DEFAULT_SWAP = "innerHTML";
  var INDICATOR_CLASS = "htmx-request";

  // ── C5: Default triggers per element type ──
  function defaultTrigger(el) {
    var tag = el.tagName;
    if (tag === "FORM") return "submit";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "change";
    return "click";
  }

  // ── C3: Swap strategies ──
  function swap(target, html, strategy) {
    if (!target) return;
    switch (strategy) {
      case "outerHTML":    target.outerHTML = html; break;
      case "beforebegin":  target.insertAdjacentHTML("beforebegin", html); break;
      case "afterbegin":   target.insertAdjacentHTML("afterbegin", html); break;
      case "beforeend":    target.insertAdjacentHTML("beforeend", html); break;
      case "afterend":     target.insertAdjacentHTML("afterend", html); break;
      case "delete":       target.remove(); break;
      case "none":         break;
      default:             target.innerHTML = html; break; // innerHTML
    }
  }

  // ── C4: Resolve target element ──
  function resolveTarget(el) {
    var sel = el.getAttribute("hx-target");
    if (!sel) return el;
    if (sel === "this") return el;
    if (sel.startsWith("closest ")) return el.closest(sel.slice(8));
    if (sel.startsWith("find ")) return el.querySelector(sel.slice(5));
    return document.querySelector(sel);
  }

  // ── Collect form data if applicable ──
  function collectData(el) {
    var form = el.closest("form");
    if (el.tagName === "FORM") form = el;
    if (form) return new FormData(form);
    if (el.name && el.value !== undefined) {
      var fd = new FormData();
      fd.append(el.name, el.value);
      return fd;
    }
    return null;
  }

  // ── Parse hx-vals ──
  function parseVals(el) {
    var raw = el.getAttribute("hx-vals");
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  // ── Parse hx-headers ──
  function parseHeaders(el) {
    var raw = el.getAttribute("hx-headers");
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  // ── Fire custom event ──
  function fire(el, name, detail) {
    var evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail || {} });
    return el.dispatchEvent(evt);
  }

  // ── C1, C2: Issue request and swap response ──
  function issueRequest(el, verb, url) {
    // hx-confirm
    var confirmMsg = el.getAttribute("hx-confirm");
    if (confirmMsg && !confirm(confirmMsg)) return;

    // Event: beforeRequest
    if (!fire(el, "htmx:beforeRequest", { elt: el, verb: verb, url: url })) return;

    var target = resolveTarget(el);
    var swapStrategy = el.getAttribute("hx-swap") || DEFAULT_SWAP;
    var selectSel = el.getAttribute("hx-select");

    // Indicator
    var indicatorSel = el.getAttribute("hx-indicator");
    var indicator = indicatorSel ? document.querySelector(indicatorSel) : el;
    indicator.classList.add(INDICATOR_CLASS);

    // Disabled elements
    var disabledSel = el.getAttribute("hx-disabled-elt");
    var disabledEls = disabledSel ? document.querySelectorAll(disabledSel) : [];
    disabledEls.forEach(function (de) { de.disabled = true; });

    // Build request
    var isGet = verb.toUpperCase() === "GET";
    var data = collectData(el);
    var vals = parseVals(el);
    var extraHeaders = parseHeaders(el);

    // Merge vals into data
    if (data) {
      Object.keys(vals).forEach(function (k) { data.append(k, vals[k]); });
    }

    var fetchUrl = url;
    var fetchOpts = {
      method: verb.toUpperCase(),
      headers: Object.assign({
        "HX-Request": "true",
        "HX-Current-URL": window.location.href,
        "HX-Target": target && target.id ? target.id : "",
        "HX-Trigger": el.id || "",
      }, extraHeaders),
    };

    if (isGet && data) {
      var params = new URLSearchParams(data);
      var sep = url.includes("?") ? "&" : "?";
      fetchUrl = url + sep + params.toString();
    } else if (!isGet && data) {
      fetchOpts.body = data;
    }

    fetch(fetchUrl, fetchOpts)
      .then(function (resp) { return resp.text(); })
      .then(function (html) {
        fire(el, "htmx:afterRequest", { elt: el, xhr: null });

        // hx-select: extract portion of response
        if (selectSel) {
          var tmp = document.createElement("div");
          tmp.innerHTML = html;
          var selected = tmp.querySelector(selectSel);
          html = selected ? selected.innerHTML : html;
        }

        // Event: beforeSwap
        if (!fire(el, "htmx:beforeSwap", { elt: el, target: target })) return;

        // C3: Swap
        swap(target, html, swapStrategy);

        // hx-push-url
        var pushUrl = el.getAttribute("hx-push-url");
        if (pushUrl) {
          var histUrl = pushUrl === "true" ? url : pushUrl;
          history.pushState({}, "", histUrl);
        }

        // Process new content for hx-* attributes
        if (target && swapStrategy !== "delete" && swapStrategy !== "none") {
          process(target);
        }

        fire(el, "htmx:afterSwap", { elt: el, target: target });

        // afterSettle (next tick)
        setTimeout(function () {
          fire(el, "htmx:afterSettle", { elt: el, target: target });
        }, 0);
      })
      .catch(function (err) {
        fire(el, "htmx:afterRequest", { elt: el, error: err });
      })
      .finally(function () {
        indicator.classList.remove(INDICATOR_CLASS);
        disabledEls.forEach(function (de) { de.disabled = false; });
      });
  }

  // ── C5: Parse trigger string ──
  function parseTrigger(el) {
    var raw = el.getAttribute("hx-trigger") || defaultTrigger(el);
    var parts = raw.split(/\s+/);
    var event = parts[0];
    var mods = { once: false, changed: false, delay: 0, throttle: 0, from: null };

    for (var i = 1; i < parts.length; i++) {
      if (parts[i] === "once") mods.once = true;
      else if (parts[i] === "changed") mods.changed = true;
      else if (parts[i].startsWith("delay:")) mods.delay = parseInt(parts[i].slice(6)) || 0;
      else if (parts[i].startsWith("throttle:")) mods.throttle = parseInt(parts[i].slice(9)) || 0;
      else if (parts[i].startsWith("from:")) mods.from = parts[i].slice(5);
    }

    return { event: event, mods: mods };
  }

  // ── Attach listener to an element ──
  function attach(el, verb, url) {
    if (el._htmxProcessed) return;
    el._htmxProcessed = true;

    var trigger = parseTrigger(el);
    var listenTarget = trigger.mods.from ? document.querySelector(trigger.mods.from) : el;
    if (!listenTarget) return;

    // Special triggers
    if (trigger.event === "load") {
      issueRequest(el, verb, url);
      return;
    }

    if (trigger.event === "revealed") {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            issueRequest(el, verb, url);
            observer.unobserve(el);
          }
        });
      });
      observer.observe(el);
      return;
    }

    var lastVal = null;
    var throttleTimer = null;

    var handler = function (evt) {
      // Changed modifier
      if (trigger.mods.changed && el.value !== undefined) {
        if (el.value === lastVal) return;
        lastVal = el.value;
      }

      // Prevent default for forms
      if (trigger.event === "submit") evt.preventDefault();

      var doRequest = function () { issueRequest(el, verb, url); };

      // Delay (debounce)
      if (trigger.mods.delay) {
        clearTimeout(el._htmxDelay);
        el._htmxDelay = setTimeout(doRequest, trigger.mods.delay);
        return;
      }

      // Throttle
      if (trigger.mods.throttle) {
        if (throttleTimer) return;
        throttleTimer = setTimeout(function () { throttleTimer = null; }, trigger.mods.throttle);
      }

      doRequest();
    };

    var opts = trigger.mods.once ? { once: true } : undefined;
    listenTarget.addEventListener(trigger.event, handler, opts);
  }

  // ── hx-boost: Intercept links and forms ──
  function boost(container) {
    // Links
    container.querySelectorAll("a[href]").forEach(function (a) {
      if (a._htmxBoosted || a.getAttribute("hx-boost") === "false") return;
      a._htmxBoosted = true;
      a.addEventListener("click", function (evt) {
        if (evt.metaKey || evt.ctrlKey || evt.shiftKey) return; // respect modifier keys
        evt.preventDefault();
        var target = resolveTarget(a) || document.body;
        var swapStrategy = a.getAttribute("hx-swap") || "innerHTML";
        a.setAttribute("hx-get", a.href);
        a.setAttribute("hx-target", a.getAttribute("hx-target") || "body");
        issueRequest(a, "get", a.href);
      });
    });

    // Forms
    container.querySelectorAll("form[action]").forEach(function (form) {
      if (form._htmxBoosted || form.getAttribute("hx-boost") === "false") return;
      form._htmxBoosted = true;
      var verb = (form.method || "get").toLowerCase();
      form.addEventListener("submit", function (evt) {
        evt.preventDefault();
        form.setAttribute("hx-" + verb, form.action);
        issueRequest(form, verb, form.action);
      });
    });
  }

  // ── Process: scan element tree for hx-* attributes ──
  function process(root) {
    VERBS.forEach(function (verb) {
      root.querySelectorAll("[hx-" + verb + "]").forEach(function (el) {
        attach(el, verb, el.getAttribute("hx-" + verb));
      });
    });

    // hx-boost containers
    root.querySelectorAll("[hx-boost='true']").forEach(function (el) {
      boost(el);
    });

    // Process the root itself if it has hx-* attrs
    VERBS.forEach(function (verb) {
      if (root.getAttribute && root.getAttribute("hx-" + verb)) {
        attach(root, verb, root.getAttribute("hx-" + verb));
      }
    });
  }

  // ── Initialize on DOMContentLoaded ──
  function init() {
    process(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ── Public API (minimal, matching htmx) ──
  window.htmx = {
    process: process,
    version: "derived-1.0.0",
    _seed: "https://htxlang.org/derivations/htmx/HTMX-SEED.md",
  };
})();
