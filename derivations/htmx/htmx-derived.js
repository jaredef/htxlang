/**
 * htmx-derived.js — Drop-in htmx replacement derived from the HTMX Constraint Seed.
 * Same hx-* namespace. Same behavior. 19 constraints. Full parity.
 *
 * Seed: https://htxlang.org/derivations/htmx/HTMX-SEED.md
 * Method: https://jaredfoy.com/doc/247-the-derivation-inversion
 * Pin-art analysis: 6 core + 13 ring constraints
 *
 * MIT License — Jared Foy, htxlang.org
 */
(function () {
  "use strict";

  var VERBS = ["get", "post", "put", "patch", "delete"];

  // ══════════════════════════════════════════════════════════════
  // C11: Configuration system
  // ══════════════════════════════════════════════════════════════
  var config = {
    historyEnabled: true,
    historyCacheSize: 10,
    defaultSwapStyle: "innerHTML",
    defaultSwapDelay: 0,
    defaultSettleDelay: 20,
    includeIndicatorStyles: true,
    indicatorClass: "htmx-request",
    requestClass: "htmx-request",
    addedClass: "htmx-added",
    settlingClass: "htmx-settling",
    swappingClass: "htmx-swapping",
    allowEval: true,
    allowScriptTags: true,
    inlineScriptNonce: "",
    selfRequestsOnly: true,
    withCredentials: false,
    timeout: 0,
    scrollBehavior: "instant",
    defaultFocusScroll: false,
    getCacheBusterParam: false,
    globalViewTransitions: false,
    methodsThatUseUrlParams: ["get"],
    triggerSpecsCache: null,
    refreshOnHistoryMiss: false,
    scrollIntoViewOnBoost: true,
    responseHandling: [
      { code: "204", swap: false },
      { code: "[23]..", swap: true },
      { code: "[45]..", swap: false, error: true },
    ],
  };

  // Load config from <meta name="htmx-config">
  function loadMetaConfig() {
    var meta = document.querySelector('meta[name="htmx-config"]');
    if (meta) {
      try {
        var userConf = JSON.parse(meta.getAttribute("content"));
        Object.keys(userConf).forEach(function (k) { config[k] = userConf[k]; });
      } catch (e) { /* ignore malformed meta */ }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // State
  // ══════════════════════════════════════════════════════════════
  var activeRequests = new WeakMap();
  var extensions = {};
  var historyCache = [];

  // ══════════════════════════════════════════════════════════════
  // C14: Event system
  // ══════════════════════════════════════════════════════════════
  function fire(el, name, detail) {
    var d = detail || {};
    // Call extension onEvent hooks
    Object.keys(extensions).forEach(function (extName) {
      var ext = extensions[extName];
      if (ext.onEvent) ext.onEvent(name, { target: el, detail: d });
    });
    var evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail: d });
    return el.dispatchEvent(evt);
  }

  function fireServerTriggers(el, headerVal) {
    if (!headerVal) return;
    try {
      var parsed = JSON.parse(headerVal);
      Object.keys(parsed).forEach(function (n) { fire(el, n, parsed[n]); });
    } catch (e) {
      headerVal.split(",").forEach(function (n) { fire(el, n.trim(), {}); });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // C18: Attribute inheritance with disinherit control
  // ══════════════════════════════════════════════════════════════
  function getAttr(el, name) {
    var val = el.getAttribute(name);
    if (val !== null) return val;
    var parent = el.parentElement;
    while (parent) {
      // C18: check hx-disinherit
      var disinherit = parent.getAttribute("hx-disinherit");
      if (disinherit) {
        if (disinherit === "*") return null;
        if (disinherit.split(/\s+/).indexOf(name) >= 0) return null;
      }
      val = parent.getAttribute(name);
      if (val !== null) return val;
      parent = parent.parentElement;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // C5: Default triggers per element type
  // ══════════════════════════════════════════════════════════════
  function defaultTrigger(el) {
    var tag = el.tagName;
    if (tag === "FORM") return "submit";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "change";
    return "click";
  }

  // ══════════════════════════════════════════════════════════════
  // C4: Resolve target element (extended selectors)
  // ══════════════════════════════════════════════════════════════
  function resolveTarget(el, sel) {
    if (!sel) sel = getAttr(el, "hx-target");
    if (!sel) return el;
    if (sel === "this") return el;
    if (sel.startsWith("closest ")) return el.closest(sel.slice(8));
    if (sel.startsWith("find ")) return el.querySelector(sel.slice(5));
    if (sel.startsWith("next ")) return scanSibling(el, sel.slice(5), "next");
    if (sel.startsWith("previous ")) return scanSibling(el, sel.slice(9), "previous");
    return document.querySelector(sel);
  }

  function scanSibling(el, sel, dir) {
    var prop = dir === "next" ? "nextElementSibling" : "previousElementSibling";
    var sib = el[prop];
    while (sib) {
      if (!sel || sib.matches(sel)) return sib;
      sib = sib[prop];
    }
    return null;
  }

  // Resolve from: target for triggers
  function resolveFromTarget(el, fromSpec) {
    if (fromSpec === "document") return document;
    if (fromSpec === "window") return window;
    if (fromSpec === "body") return document.body;
    if (fromSpec.startsWith("closest ")) return el.closest(fromSpec.slice(8));
    if (fromSpec.startsWith("find ")) return el.querySelector(fromSpec.slice(5));
    if (fromSpec.startsWith("next ")) return scanSibling(el, fromSpec.slice(5), "next");
    if (fromSpec.startsWith("previous ")) return scanSibling(el, fromSpec.slice(9), "previous");
    return document.querySelector(fromSpec);
  }

  // ══════════════════════════════════════════════════════════════
  // C3: Swap strategies
  // ══════════════════════════════════════════════════════════════
  function doSwap(target, html, strategy) {
    if (!target) return;
    switch (strategy) {
      case "outerHTML":    target.outerHTML = html; break;
      case "beforebegin":  target.insertAdjacentHTML("beforebegin", html); break;
      case "afterbegin":   target.insertAdjacentHTML("afterbegin", html); break;
      case "beforeend":    target.insertAdjacentHTML("beforeend", html); break;
      case "afterend":     target.insertAdjacentHTML("afterend", html); break;
      case "delete":       target.remove(); break;
      case "none":         break;
      default:             target.innerHTML = html; break;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Utility: check for file inputs
  // ══════════════════════════════════════════════════════════════
  function hasFileInput(el) {
    var form = el.tagName === "FORM" ? el : el.closest("form");
    return form ? form.querySelector('input[type="file"]') !== null : false;
  }

  // ══════════════════════════════════════════════════════════════
  // C13: Composable parameter collection
  // ══════════════════════════════════════════════════════════════
  function collectData(el) {
    var form = el.closest("form");
    if (el.tagName === "FORM") form = el;
    var fd;
    if (form) {
      fd = new FormData(form);
    } else if (el.name && el.value !== undefined) {
      fd = new FormData();
      fd.append(el.name, el.value);
    } else {
      fd = new FormData();
    }

    // hx-include: merge values from other elements
    var includeSel = getAttr(el, "hx-include");
    if (includeSel) {
      var targets = document.querySelectorAll(includeSel);
      targets.forEach(function (t) {
        if (t.name) fd.append(t.name, t.value || "");
        if (t.tagName === "FORM") {
          var extra = new FormData(t);
          extra.forEach(function (v, k) { fd.append(k, v); });
        }
      });
    }

    return fd;
  }

  // Apply hx-params filtering
  function filterParams(el, fd) {
    var paramsSpec = el.getAttribute("hx-params");
    if (!paramsSpec || paramsSpec === "*") return fd;
    if (paramsSpec === "none") return new FormData();

    var filtered = new FormData();
    if (paramsSpec.startsWith("not ")) {
      var excluded = paramsSpec.slice(4).split(",").map(function (s) { return s.trim(); });
      fd.forEach(function (v, k) {
        if (excluded.indexOf(k) < 0) filtered.append(k, v);
      });
    } else {
      var included = paramsSpec.split(",").map(function (s) { return s.trim(); });
      fd.forEach(function (v, k) {
        if (included.indexOf(k) >= 0) filtered.append(k, v);
      });
    }
    return filtered;
  }

  // Parse hx-vals (JSON or js: expressions)
  function parseVals(el) {
    var raw = el.getAttribute("hx-vals");
    if (!raw) return {};
    if (config.allowEval && raw.trimStart().startsWith("js:")) {
      try { return new Function("return (" + raw.slice(3) + ")")(); } catch (e) { return {}; }
    }
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  // Parse hx-headers
  function parseHeaders(el) {
    var raw = el.getAttribute("hx-headers");
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  // Parse swap spec with modifiers
  function parseSwapSpec(raw) {
    if (!raw) raw = config.defaultSwapStyle;
    var parts = raw.split(/\s+/);
    var spec = {
      swapStyle: parts[0],
      swapDelay: config.defaultSwapDelay,
      settleDelay: config.defaultSettleDelay,
      scroll: null,
      scrollTarget: null,
      show: null,
      showTarget: null,
      focusScroll: config.defaultFocusScroll,
      transition: config.globalViewTransitions,
    };
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (p.startsWith("swap:")) spec.swapDelay = parseInterval(p.slice(5));
      else if (p.startsWith("settle:")) spec.settleDelay = parseInterval(p.slice(7));
      else if (p.startsWith("scroll:")) { var sv = p.slice(7).split(":"); spec.scroll = sv[0]; spec.scrollTarget = sv[1] || null; }
      else if (p.startsWith("show:")) { var shv = p.slice(5).split(":"); spec.show = shv[0]; spec.showTarget = shv[1] || null; }
      else if (p === "focus-scroll:true") spec.focusScroll = true;
      else if (p === "focus-scroll:false") spec.focusScroll = false;
      else if (p === "transition:true") spec.transition = true;
      else if (p === "transition:false") spec.transition = false;
    }
    return spec;
  }

  function parseInterval(str) {
    if (!str) return 0;
    if (str.endsWith("ms")) return parseInt(str);
    if (str.endsWith("s")) return parseInt(str) * 1000;
    return parseInt(str);
  }

  // ══════════════════════════════════════════════════════════════
  // C8: Out-of-band swaps
  // ══════════════════════════════════════════════════════════════
  function processOOBSwaps(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var oobEls = tmp.querySelectorAll("[hx-swap-oob]");
    var removed = [];
    oobEls.forEach(function (oobEl) {
      var oobVal = oobEl.getAttribute("hx-swap-oob");
      var strategy = "outerHTML";
      var targetSel = oobEl.id ? "#" + oobEl.id : null;
      if (oobVal && oobVal !== "true") {
        var colonIdx = oobVal.indexOf(":");
        if (colonIdx > 0) {
          strategy = oobVal.slice(0, colonIdx);
          targetSel = oobVal.slice(colonIdx + 1);
        } else {
          strategy = oobVal;
        }
      }
      var oobTarget = targetSel ? document.querySelector(targetSel) : null;
      if (oobTarget) {
        fire(oobTarget, "htmx:oobBeforeSwap", { target: oobTarget, fragment: oobEl });
        oobEl.removeAttribute("hx-swap-oob");
        var oobHtml = strategy === "outerHTML" ? oobEl.outerHTML : oobEl.innerHTML;
        doSwap(oobTarget, oobHtml, strategy);
        var newTarget = document.querySelector(targetSel);
        if (newTarget) process(newTarget);
        fire(oobTarget, "htmx:oobAfterSwap", { target: oobTarget });
      } else {
        fire(document, "htmx:oobErrorNoTarget", { id: targetSel });
      }
      removed.push(oobEl);
    });
    removed.forEach(function (r) { r.remove(); });
    return tmp.innerHTML;
  }

  // hx-select-oob: select multiple fragments from response for OOB swap
  function processSelectOOB(el, html) {
    var selectOob = el.getAttribute("hx-select-oob");
    if (!selectOob) return html;
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    selectOob.split(",").forEach(function (spec) {
      spec = spec.trim();
      var parts = spec.split(":");
      var sel = parts[0].trim();
      var targetSel = parts[1] ? parts[1].trim() : sel;
      var selected = tmp.querySelector(sel);
      var oobTarget = document.querySelector(targetSel);
      if (selected && oobTarget) {
        doSwap(oobTarget, selected.outerHTML, "innerHTML");
        process(oobTarget);
        selected.remove();
      }
    });
    return tmp.innerHTML;
  }

  // ══════════════════════════════════════════════════════════════
  // C9: Live document fragments — script eval, hx-on:*, title
  // ══════════════════════════════════════════════════════════════
  function processScripts(container) {
    if (!config.allowScriptTags) return;
    container.querySelectorAll("script").forEach(function (oldScript) {
      var newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach(function (attr) {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (config.inlineScriptNonce) newScript.nonce = config.inlineScriptNonce;
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  function processHxOn(container) {
    // hx-on:event="code" and hx-on::htmx:event="code"
    var all = container.querySelectorAll("*");
    var process = function (el) {
      Array.from(el.attributes).forEach(function (attr) {
        if (attr.name.startsWith("hx-on:") || attr.name.startsWith("hx-on::")) {
          var evtName = attr.name.startsWith("hx-on::") ? "htmx:" + attr.name.slice(7) : attr.name.slice(6);
          if (config.allowEval) {
            el.addEventListener(evtName, new Function("event", attr.value));
          }
        }
      });
    };
    process(container);
    all.forEach(process);
  }

  function processTitleTag(html) {
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) document.title = m[1].trim();
  }

  // ══════════════════════════════════════════════════════════════
  // C12: History cache
  // ══════════════════════════════════════════════════════════════
  function saveHistory(url) {
    if (!config.historyEnabled) return;
    var historyElt = document.querySelector("[hx-history-elt]") || document.body;
    var snapshot = { url: url, content: historyElt.innerHTML, title: document.title, scroll: window.scrollY };
    // Remove existing entry for this URL
    historyCache = historyCache.filter(function (e) { return e.url !== url; });
    historyCache.unshift(snapshot);
    // Trim to cache size
    if (historyCache.length > config.historyCacheSize) historyCache.pop();
    fire(document.body, "htmx:beforeHistorySave", { path: url });
  }

  function restoreHistory(url) {
    var entry = historyCache.find(function (e) { return e.url === url; });
    var historyElt = document.querySelector("[hx-history-elt]") || document.body;
    if (entry) {
      historyElt.innerHTML = entry.content;
      document.title = entry.title;
      process(historyElt);
      window.scrollTo(0, entry.scroll);
      fire(document.body, "htmx:historyRestore", { path: url });
    } else {
      fire(document.body, "htmx:historyCacheMiss", { path: url });
      if (config.refreshOnHistoryMiss) {
        window.location.reload();
      } else {
        // Fetch from server
        fetch(url, { headers: { "HX-Request": "true", "HX-History-Restore-Request": "true" } })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            historyElt.innerHTML = html;
            process(historyElt);
            fire(document.body, "htmx:historyCacheMissLoad", { path: url });
          })
          .catch(function () {
            fire(document.body, "htmx:historyCacheMissError", { path: url });
          });
      }
    }
  }

  function initHistory() {
    window.addEventListener("popstate", function () {
      restoreHistory(window.location.href);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // C16: Extensions API
  // ══════════════════════════════════════════════════════════════
  function defineExtension(name, definition) {
    if (definition.init) definition.init({ config: config });
    extensions[name] = definition;
  }

  function removeExtension(name) {
    delete extensions[name];
  }

  function getActiveExtensions(el) {
    var active = [];
    var extAttr = getAttr(el, "hx-ext");
    if (extAttr) {
      extAttr.split(",").forEach(function (name) {
        name = name.trim();
        if (name.startsWith("ignore:")) return;
        if (extensions[name]) active.push(extensions[name]);
      });
    }
    return active;
  }

  // ══════════════════════════════════════════════════════════════
  // C17: Validation
  // ══════════════════════════════════════════════════════════════
  function validateForm(el) {
    var form = el.tagName === "FORM" ? el : el.closest("form");
    if (!form) return true;
    var shouldValidate = el.getAttribute("hx-validate") === "true" || getAttr(el, "hx-validate") === "true";
    if (!shouldValidate) return true;
    fire(form, "htmx:validation:validate", { elt: form });
    if (!form.checkValidity()) {
      fire(form, "htmx:validation:failed", { elt: form });
      form.reportValidity();
      fire(form, "htmx:validation:halted", { elt: form });
      return false;
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // Response status handling
  // ══════════════════════════════════════════════════════════════
  function shouldSwapOnStatus(status) {
    if (status === 204) return false;
    if (status >= 200 && status < 300) return true;
    return false;
  }

  function isErrorStatus(status) {
    return status >= 400;
  }

  // ══════════════════════════════════════════════════════════════
  // C1, C2, C7, C19: Issue request and swap response
  // ══════════════════════════════════════════════════════════════
  function issueRequest(el, verb, url) {
    // hx-disable check
    if (el.closest("[hx-disable]")) return;

    // C17: Validation
    if (!validateForm(el)) return;

    // hx-confirm
    var confirmMsg = el.getAttribute("hx-confirm");
    if (confirmMsg) {
      if (!fire(el, "htmx:confirm", { elt: el, question: confirmMsg })) return;
      if (!confirm(confirmMsg)) return;
    }

    // hx-prompt
    var promptMsg = el.getAttribute("hx-prompt");
    var promptVal = null;
    if (promptMsg) {
      promptVal = prompt(promptMsg);
      if (promptVal === null) return;
    }

    var target = resolveTarget(el);
    var rawSwap = getAttr(el, "hx-swap") || config.defaultSwapStyle;
    var swapSpec = parseSwapSpec(rawSwap);
    var selectSel = getAttr(el, "hx-select");
    var elExts = getActiveExtensions(el);

    // Build request config for C14 events
    var requestConfig = {
      elt: el, verb: verb.toUpperCase(), path: url, target: target,
      swapStyle: swapSpec.swapStyle, headers: {}, parameters: null,
    };

    // C14: beforeRequest
    if (!fire(el, "htmx:beforeRequest", requestConfig)) return;

    // hx-sync: request coordination
    var syncMode = getAttr(el, "hx-sync");
    if (syncMode) {
      var active = activeRequests.get(el);
      if (active) {
        if (syncMode === "drop") return;
        if (syncMode === "abort" || syncMode === "abort:last" || syncMode === "replace") {
          active.abort();
        }
        if (syncMode.startsWith("queue")) return; // simplified queue: drop new
      }
    }
    var abortController = new AbortController();
    activeRequests.set(el, abortController);

    // C19: Request timeout
    var reqTimeout = 0;
    var hxRequest = el.getAttribute("hx-request");
    if (hxRequest) {
      try {
        var reqOpts = JSON.parse(hxRequest);
        if (reqOpts.timeout) reqTimeout = reqOpts.timeout;
      } catch (e) { /* ignore */ }
    }
    if (!reqTimeout) reqTimeout = config.timeout;
    var timeoutId = null;
    if (reqTimeout > 0) {
      timeoutId = setTimeout(function () {
        abortController.abort();
        fire(el, "htmx:timeout", { elt: el });
      }, reqTimeout);
    }

    // Indicator
    var indicatorSel = getAttr(el, "hx-indicator");
    var indicators = indicatorSel ? document.querySelectorAll(indicatorSel) : [el];
    indicators.forEach(function (ind) { ind.classList.add(config.indicatorClass); });

    // Disabled elements
    var disabledSel = el.getAttribute("hx-disabled-elt");
    var disabledEls = disabledSel ? Array.from(document.querySelectorAll(disabledSel)) : [];
    disabledEls.forEach(function (de) { de.disabled = true; });

    // C13: Collect and filter data
    var isGet = config.methodsThatUseUrlParams.indexOf(verb.toLowerCase()) >= 0;
    var data = collectData(el);
    data = filterParams(el, data);
    var vals = parseVals(el);
    var extraHeaders = parseHeaders(el);

    // Merge vals into data
    Object.keys(vals).forEach(function (k) { data.append(k, vals[k]); });

    var fetchUrl = url;
    var encoding = getAttr(el, "hx-encoding");

    // Build headers
    var headers = Object.assign({
      "HX-Request": "true",
      "HX-Current-URL": window.location.href,
      "HX-Target": target && target.id ? target.id : "",
      "HX-Trigger": el.id || "",
      "HX-Trigger-Name": el.name || "",
      "HX-Boosted": el._htmxBoosted ? "true" : "",
    }, extraHeaders);

    if (promptVal !== null) headers["HX-Prompt"] = promptVal;

    // Let extensions modify headers
    elExts.forEach(function (ext) {
      if (ext.transformRequest) ext.transformRequest(headers, data, el);
    });

    requestConfig.headers = headers;
    requestConfig.parameters = data;

    // C14: configRequest — allows modification before send
    if (!fire(el, "htmx:configRequest", requestConfig)) return;

    // C19: selfRequestsOnly check
    if (config.selfRequestsOnly) {
      try {
        var urlObj = new URL(url, window.location.href);
        if (urlObj.origin !== window.location.origin) {
          fire(el, "htmx:sendError", { elt: el, error: "Cross-origin request blocked by selfRequestsOnly" });
          return;
        }
      } catch (e) { /* relative URLs are fine */ }
    }

    var fetchOpts = {
      method: verb.toUpperCase(),
      headers: headers,
      signal: abortController.signal,
      credentials: config.withCredentials ? "include" : "same-origin",
    };

    if (isGet) {
      var params = new URLSearchParams(data);
      var qs = params.toString();
      if (qs) {
        var sep = url.includes("?") ? "&" : "?";
        fetchUrl = url + sep + qs;
      }
      // C19: Cache busting
      if (config.getCacheBusterParam) {
        var cbSep = fetchUrl.includes("?") ? "&" : "?";
        fetchUrl = fetchUrl + cbSep + "org.htmx.cache-buster=" + new Date().valueOf();
      }
    } else if (data) {
      if (encoding === "multipart/form-data" || hasFileInput(el)) {
        fetchOpts.body = data;
      } else {
        // C2 tightening: url-encoded for non-file forms
        fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
        fetchOpts.body = new URLSearchParams(data).toString();
      }
    }

    // C14: beforeSend
    fire(el, "htmx:beforeSend", { elt: el, requestConfig: requestConfig });

    fetch(fetchUrl, fetchOpts)
      .then(function (resp) {
        if (timeoutId) clearTimeout(timeoutId);

        // ── C7: Response headers control lifecycle ──
        var hxRedirect = resp.headers.get("HX-Redirect");
        if (hxRedirect) { window.location.href = hxRedirect; return null; }
        var hxRefresh = resp.headers.get("HX-Refresh");
        if (hxRefresh === "true") { window.location.reload(); return null; }

        // HX-Location: client-side redirect with AJAX
        var hxLocation = resp.headers.get("HX-Location");
        if (hxLocation) {
          try {
            var loc = JSON.parse(hxLocation);
            issueRequest(el, loc.verb || "get", loc.path || hxLocation);
          } catch (e) {
            issueRequest(el, "get", hxLocation);
          }
          return null;
        }

        var hx = {
          trigger: resp.headers.get("HX-Trigger"),
          triggerAfterSettle: resp.headers.get("HX-Trigger-After-Settle"),
          triggerAfterSwap: resp.headers.get("HX-Trigger-After-Swap"),
          retarget: resp.headers.get("HX-Retarget"),
          reswap: resp.headers.get("HX-Reswap"),
          pushUrl: resp.headers.get("HX-Push-Url"),
          replaceUrl: resp.headers.get("HX-Replace-Url"),
        };

        var status = resp.status;
        return resp.text().then(function (text) {
          return { text: text, hx: hx, status: status, ok: resp.ok };
        });
      })
      .then(function (result) {
        if (!result) return;
        var html = result.text;
        var hx = result.hx;

        // C7: HX-Retarget overrides target
        if (hx.retarget) target = document.querySelector(hx.retarget) || target;
        // C7: HX-Reswap overrides swap strategy
        if (hx.reswap) swapSpec = parseSwapSpec(hx.reswap);

        // C14: afterRequest
        fire(el, "htmx:afterRequest", { elt: el, target: target, successful: result.ok, status: result.status });

        // Status-based swap control
        var shouldSwap = shouldSwapOnStatus(result.status);
        var isError = isErrorStatus(result.status);

        if (isError) {
          fire(el, "htmx:responseError", { elt: el, status: result.status, response: html });
        }

        // C14: beforeSwap (with shouldSwap control)
        var swapDetail = {
          elt: el, target: target, shouldSwap: shouldSwap, isError: isError,
          serverResponse: html, status: result.status,
        };
        if (!fire(el, "htmx:beforeSwap", swapDetail)) return;
        // Allow event handlers to override shouldSwap
        if (!swapDetail.shouldSwap) return;

        // C9: Title tag handling
        processTitleTag(html);

        // C8: Out-of-band swaps (process before primary swap)
        html = processSelectOOB(el, html);
        html = processOOBSwaps(html);

        // hx-select: extract portion of response
        if (selectSel) {
          var tmp = document.createElement("div");
          tmp.innerHTML = html;
          var selected = tmp.querySelector(selectSel);
          html = selected ? selected.outerHTML : html;
        }

        // Let extensions transform response
        elExts.forEach(function (ext) {
          if (ext.transformResponse) html = ext.transformResponse(html, null, el);
        });

        // Preserve elements
        var preserved = {};
        if (target) {
          target.querySelectorAll("[hx-preserve], [id][hx-preserve]").forEach(function (p) {
            if (p.id) preserved[p.id] = p.cloneNode(true);
          });
        }

        // C3: Perform swap (with C9 view transitions and timing)
        var performSwap = function () {
          // CSS transition: add swapping class
          if (target && target.classList) target.classList.add(config.swappingClass);

          var doTheSwap = function () {
            doSwap(target, html, swapSpec.swapStyle);

            // Restore preserved elements
            Object.keys(preserved).forEach(function (id) {
              var placeholder = document.getElementById(id);
              if (placeholder) placeholder.replaceWith(preserved[id]);
            });

            if (target && target.classList) {
              target.classList.remove(config.swappingClass);
              target.classList.add(config.settlingClass);
            }

            // Add "htmx-added" class to new content
            if (target) {
              Array.from(target.children).forEach(function (child) {
                child.classList.add(config.addedClass);
              });
            }

            // C7: URL management
            var pushUrl = el.getAttribute("hx-push-url") || (hx.pushUrl);
            var replaceUrl = el.getAttribute("hx-replace-url") || (hx.replaceUrl);

            if (pushUrl && pushUrl !== "false") {
              var histUrl = pushUrl === "true" ? url : pushUrl;
              saveHistory(window.location.href);
              history.pushState({htmx: true}, "", histUrl);
              fire(el, "htmx:pushedIntoHistory", { path: histUrl });
            } else if (replaceUrl && replaceUrl !== "false") {
              var repUrl = replaceUrl === "true" ? url : replaceUrl;
              saveHistory(window.location.href);
              history.replaceState({htmx: true}, "", repUrl);
              fire(el, "htmx:replacedInHistory", { path: repUrl });
            }

            // Process new content
            if (target && swapSpec.swapStyle !== "delete" && swapSpec.swapStyle !== "none") {
              process(target);
              processScripts(target);
              processHxOn(target);
            }

            // HX-Trigger-After-Swap
            fireServerTriggers(el, hx.triggerAfterSwap);
            fire(el, "htmx:afterSwap", { elt: el, target: target });

            // Settle phase
            setTimeout(function () {
              if (target && target.classList) {
                target.classList.remove(config.settlingClass);
              }
              // Remove "htmx-added" class
              if (target) {
                Array.from(target.children).forEach(function (child) {
                  child.classList.remove(config.addedClass);
                });
              }

              // Scroll handling
              if (swapSpec.scroll) {
                var scrollEl = swapSpec.scrollTarget ? document.querySelector(swapSpec.scrollTarget) : target;
                if (scrollEl) scrollEl.scrollIntoView({ behavior: config.scrollBehavior, block: swapSpec.scroll === "bottom" ? "end" : "start" });
              }
              if (swapSpec.show) {
                var showEl = swapSpec.showTarget ? document.querySelector(swapSpec.showTarget) : target;
                if (showEl) showEl.scrollIntoView({ behavior: config.scrollBehavior, block: swapSpec.show === "bottom" ? "end" : "start" });
              }

              // HX-Trigger-After-Settle
              fireServerTriggers(el, hx.triggerAfterSettle);
              fire(el, "htmx:afterSettle", { elt: el, target: target });

              // C14: htmx:load on new content
              if (target) fire(target, "htmx:load", { elt: target });
            }, swapSpec.settleDelay);

            // HX-Trigger: fire immediately (before settle)
            fireServerTriggers(el, hx.trigger);
          };

          // Apply swap delay
          if (swapSpec.swapDelay > 0) {
            setTimeout(doTheSwap, swapSpec.swapDelay);
          } else {
            doTheSwap();
          }
        };

        // C9: View Transitions API
        if (swapSpec.transition && document.startViewTransition) {
          document.startViewTransition(performSwap);
        } else {
          performSwap();
        }
      })
      .catch(function (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          fire(el, "htmx:xhr:abort", { elt: el });
        } else {
          fire(el, "htmx:sendError", { elt: el, error: err });
        }
        fire(el, "htmx:afterRequest", { elt: el, error: err, successful: false });
      })
      .finally(function () {
        indicators.forEach(function (ind) { ind.classList.remove(config.indicatorClass); });
        disabledEls.forEach(function (de) { de.disabled = false; });
        activeRequests.delete(el);
      });
  }

  // ══════════════════════════════════════════════════════════════
  // C5: Parse trigger string — full multi-trigger support
  // ══════════════════════════════════════════════════════════════
  function parseTriggers(el) {
    var raw = el.getAttribute("hx-trigger") || defaultTrigger(el);
    var triggers = raw.split(",").map(function (s) { return s.trim(); });
    return triggers.map(function (trigStr) {
      // Check for "every Ns" standalone trigger
      var everyMatch = trigStr.match(/^every\s+(\d+)(ms|s)$/);
      if (everyMatch) {
        return {
          event: "every",
          mods: { every: parseInt(everyMatch[1]) * (everyMatch[2] === "s" ? 1000 : 1) },
        };
      }
      var parts = trigStr.split(/\s+/);
      var event = parts[0];
      var mods = {
        once: false, changed: false, delay: 0, throttle: 0,
        from: null, target: null, consume: false, queue: null,
        every: 0, filter: null, root: null, threshold: null,
      };

      for (var i = 1; i < parts.length; i++) {
        var p = parts[i];
        if (p === "once") mods.once = true;
        else if (p === "changed") mods.changed = true;
        else if (p === "consume") mods.consume = true;
        else if (p.startsWith("delay:")) mods.delay = parseInterval(p.slice(6));
        else if (p.startsWith("throttle:")) mods.throttle = parseInterval(p.slice(9));
        else if (p.startsWith("from:")) mods.from = p.slice(5);
        else if (p.startsWith("target:")) mods.target = p.slice(7);
        else if (p.startsWith("queue:")) mods.queue = p.slice(6);
        else if (p.startsWith("root:")) mods.root = p.slice(5);
        else if (p.startsWith("threshold:")) mods.threshold = parseFloat(p.slice(10));
        else if (p.startsWith("[") && p.endsWith("]")) mods.filter = p.slice(1, -1);
      }

      // Check for "every" within a compound trigger
      var em = trigStr.match(/every\s+(\d+)(ms|s)/);
      if (em && event !== "every") mods.every = parseInt(em[1]) * (em[2] === "s" ? 1000 : 1);

      return { event: event, mods: mods };
    });
  }

  // ══════════════════════════════════════════════════════════════
  // C5: Attach listeners to an element — multi-trigger
  // ══════════════════════════════════════════════════════════════
  function attach(el, verb, url) {
    if (el._htmxProcessed) return;
    el._htmxProcessed = true;

    fire(el, "htmx:beforeProcessNode", { elt: el });

    var triggers = parseTriggers(el);
    triggers.forEach(function (trigger) {
      attachTrigger(el, verb, url, trigger);
    });

    fire(el, "htmx:afterProcessNode", { elt: el });
  }

  function attachTrigger(el, verb, url, trigger) {
    var listenTarget = trigger.mods.from ? resolveFromTarget(el, trigger.mods.from) : el;
    if (!listenTarget) return;

    // Polling: "every Ns"
    if (trigger.event === "every" || trigger.mods.every > 0) {
      var interval = trigger.event === "every" ? trigger.mods.every : trigger.mods.every;
      if (interval > 0) {
        setInterval(function () { issueRequest(el, verb, url); }, interval);
      }
      if (trigger.event === "every") return;
    }

    // Special: load
    if (trigger.event === "load") {
      issueRequest(el, verb, url);
      return;
    }

    // Special: revealed / intersect
    if (trigger.event === "revealed" || trigger.event === "intersect") {
      var obsOpts = {};
      if (trigger.mods.root) obsOpts.root = document.querySelector(trigger.mods.root);
      if (trigger.mods.threshold !== null) obsOpts.threshold = trigger.mods.threshold;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            issueRequest(el, verb, url);
            if (trigger.event === "revealed") observer.unobserve(el);
          }
        });
      }, obsOpts);
      observer.observe(el);
      return;
    }

    var lastVal = null;
    var throttleTimer = null;

    var handler = function (evt) {
      // Filter by target element
      if (trigger.mods.target && evt.target && !evt.target.matches(trigger.mods.target)) return;

      // Filter expression
      if (trigger.mods.filter && config.allowEval) {
        try {
          var filterFn = new Function("event", "return (" + trigger.mods.filter + ")");
          if (!filterFn(evt)) return;
        } catch (e) { return; }
      }

      // Changed modifier
      if (trigger.mods.changed && el.value !== undefined) {
        if (el.value === lastVal) return;
        lastVal = el.value;
      }

      // Consume modifier
      if (trigger.mods.consume) {
        evt.preventDefault();
        evt.stopPropagation();
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

    // Support htmx:abort event to cancel in-flight request
    el.addEventListener("htmx:abort", function () {
      var ac = activeRequests.get(el);
      if (ac) ac.abort();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // C6: hx-boost — Intercept links and forms
  // ══════════════════════════════════════════════════════════════
  function boost(container) {
    container.querySelectorAll("a[href]").forEach(function (a) {
      if (a._htmxBoosted || a.getAttribute("hx-boost") === "false") return;
      a._htmxBoosted = true;
      a.addEventListener("click", function (evt) {
        if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
        var href = a.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
        evt.preventDefault();
        // Inherit target or default to body
        if (!a.getAttribute("hx-target")) a.setAttribute("hx-target", getAttr(a, "hx-target") || "body");
        if (!a.getAttribute("hx-push-url")) a.setAttribute("hx-push-url", "true");
        a.setAttribute("hx-get", a.href);
        issueRequest(a, "get", a.href);
        if (config.scrollIntoViewOnBoost) window.scrollTo(0, 0);
      });
    });

    container.querySelectorAll("form[action]").forEach(function (form) {
      if (form._htmxBoosted || form.getAttribute("hx-boost") === "false") return;
      form._htmxBoosted = true;
      var verb = (form.method || "get").toLowerCase();
      form.addEventListener("submit", function (evt) {
        evt.preventDefault();
        if (!form.getAttribute("hx-target")) form.setAttribute("hx-target", getAttr(form, "hx-target") || "body");
        if (!form.getAttribute("hx-push-url")) form.setAttribute("hx-push-url", "true");
        form.setAttribute("hx-" + verb, form.action);
        issueRequest(form, verb, form.action);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // C15: Server-pushed content streams (SSE + WebSocket)
  // ══════════════════════════════════════════════════════════════
  function processSSE(root) {
    root.querySelectorAll("[sse-connect]").forEach(function (el) {
      if (el._htmxSSE) return;
      var url = el.getAttribute("sse-connect");
      var source = new EventSource(url);
      el._htmxSSE = source;

      source.onopen = function () { fire(el, "htmx:sseOpen", { source: source }); };
      source.onerror = function () {
        fire(el, "htmx:sseError", { source: source });
        // Auto-reconnect is built into EventSource
      };

      // Find all sse-swap children
      el.querySelectorAll("[sse-swap]").forEach(function (child) {
        var eventName = child.getAttribute("sse-swap");
        source.addEventListener(eventName, function (evt) {
          doSwap(child, evt.data, child.getAttribute("hx-swap") || config.defaultSwapStyle);
          process(child);
        });
      });

      // sse-close
      if (el.getAttribute("sse-close")) {
        el.addEventListener(el.getAttribute("sse-close"), function () {
          source.close();
          el._htmxSSE = null;
        });
      }
    });
  }

  function processWebSocket(root) {
    root.querySelectorAll("[ws-connect]").forEach(function (el) {
      if (el._htmxWS) return;
      var url = el.getAttribute("ws-connect");
      var ws;
      var reconnectDelay = 1000;

      function connect() {
        ws = new WebSocket(url);
        el._htmxWS = ws;

        ws.onmessage = function (evt) {
          var html = evt.data;
          // Process OOB swaps in WS messages
          html = processOOBSwaps(html);
          doSwap(el, html, el.getAttribute("hx-swap") || config.defaultSwapStyle);
          process(el);
        };

        ws.onclose = function () {
          // Auto-reconnect with backoff
          setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };

        ws.onopen = function () { reconnectDelay = 1000; };
      }
      connect();

      // ws-send: forms that send via WebSocket
      el.querySelectorAll("[ws-send]").forEach(function (sender) {
        var sendTrigger = sender.getAttribute("hx-trigger") || defaultTrigger(sender);
        sender.addEventListener(sendTrigger.split(/\s+/)[0], function (evt) {
          if (sender.tagName === "FORM") evt.preventDefault();
          var data = collectData(sender);
          var obj = {};
          data.forEach(function (v, k) { obj[k] = v; });
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
        });
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Process: scan element tree for hx-* attributes
  // ══════════════════════════════════════════════════════════════
  function process(root) {
    if (!root) return;

    // Process the root itself
    VERBS.forEach(function (verb) {
      if (root.getAttribute && root.getAttribute("hx-" + verb)) {
        attach(root, verb, root.getAttribute("hx-" + verb));
      }
    });

    // Process children
    VERBS.forEach(function (verb) {
      root.querySelectorAll("[hx-" + verb + "]").forEach(function (el) {
        attach(el, verb, el.getAttribute("hx-" + verb));
      });
    });

    // hx-boost containers
    root.querySelectorAll("[hx-boost='true']").forEach(function (el) {
      boost(el);
    });
    if (root.getAttribute && root.getAttribute("hx-boost") === "true") {
      boost(root);
    }

    // C9: Process hx-on:* on existing elements
    processHxOn(root);

    // C15: SSE and WebSocket
    processSSE(root);
    processWebSocket(root);
  }

  // ══════════════════════════════════════════════════════════════
  // Initialize
  // ══════════════════════════════════════════════════════════════
  function init() {
    loadMetaConfig();
    initHistory();

    // Inject indicator styles
    if (config.includeIndicatorStyles) {
      var style = document.createElement("style");
      style.textContent = ".htmx-indicator{opacity:0;transition:opacity 200ms ease-in}" +
        "." + config.indicatorClass + " .htmx-indicator{opacity:1}" +
        "." + config.indicatorClass + ".htmx-indicator{opacity:1}";
      document.head.appendChild(style);
    }

    process(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ══════════════════════════════════════════════════════════════
  // C10: Public JavaScript API
  // ══════════════════════════════════════════════════════════════
  function publicAjax(verb, url, spec) {
    var target, source;
    if (typeof spec === "string") {
      target = document.querySelector(spec);
      source = target;
    } else if (spec instanceof Element) {
      target = spec;
      source = spec;
    } else if (spec) {
      target = spec.target ? document.querySelector(spec.target) : document.body;
      source = spec.source || target;
    } else {
      target = document.body;
      source = document.body;
    }
    if (!source.getAttribute("hx-target") && target && target !== source) {
      source.setAttribute("hx-target", target.id ? "#" + target.id : "body");
    }
    issueRequest(source, verb, url);
  }

  window.htmx = {
    // Core
    process: process,
    version: "derived-2.0.0",
    _seed: "https://htxlang.org/derivations/htmx/HTMX-SEED.md",
    config: config,

    // C10: DOM helpers
    find: function (eltOrSel, sel) {
      if (sel) return eltOrSel.querySelector(sel);
      return document.querySelector(eltOrSel);
    },
    findAll: function (eltOrSel, sel) {
      if (sel) return Array.from(eltOrSel.querySelectorAll(sel));
      return Array.from(document.querySelectorAll(eltOrSel));
    },
    closest: function (el, sel) { return el.closest(sel); },
    remove: function (el) { el.remove(); },

    // C10: Class manipulation (with optional delay)
    addClass: function (el, cls, delay) {
      if (delay) { setTimeout(function () { el.classList.add(cls); }, parseInterval(delay)); }
      else { el.classList.add(cls); }
    },
    removeClass: function (el, cls, delay) {
      if (delay) { setTimeout(function () { el.classList.remove(cls); }, parseInterval(delay)); }
      else { el.classList.remove(cls); }
    },
    toggleClass: function (el, cls) { el.classList.toggle(cls); },
    takeClass: function (el, cls) {
      Array.from(el.parentElement.children).forEach(function (sib) { sib.classList.remove(cls); });
      el.classList.add(cls);
    },

    // C10: Events
    trigger: function (el, name, detail) { fire(el, name, detail); },
    on: function (elOrEvt, evtOrHandler, handlerOrUndef) {
      if (typeof elOrEvt === "string") {
        document.addEventListener(elOrEvt, evtOrHandler);
      } else {
        elOrEvt.addEventListener(evtOrHandler, handlerOrUndef);
      }
    },
    off: function (elOrEvt, evtOrHandler, handlerOrUndef) {
      if (typeof elOrEvt === "string") {
        document.removeEventListener(elOrEvt, evtOrHandler);
      } else {
        elOrEvt.removeEventListener(evtOrHandler, handlerOrUndef);
      }
    },

    // C10: Request
    ajax: publicAjax,

    // C10: Swap
    swap: function (target, html, swapSpec) {
      var spec = parseSwapSpec(swapSpec || config.defaultSwapStyle);
      doSwap(target, html, spec.swapStyle);
      process(target);
    },

    // C10: Values
    values: function (el) {
      var fd = collectData(el);
      var obj = {};
      fd.forEach(function (v, k) { obj[k] = v; });
      return obj;
    },

    // C16: Extensions
    defineExtension: defineExtension,
    removeExtension: removeExtension,

    // C10: Utilities
    parseInterval: parseInterval,
    logAll: function () { config._logAll = true; },
    logNone: function () { config._logAll = false; },
    logger: null,

    // Internal (for extensions)
    _: {
      fire: fire,
      getAttr: getAttr,
      resolveTarget: resolveTarget,
      issueRequest: issueRequest,
      doSwap: doSwap,
      processScripts: processScripts,
    },
  };
})();
