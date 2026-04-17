(function() {
"use strict";
// C11: config
var config = {
  defaultSwapStyle: "innerHTML", defaultSwapDelay: 0, defaultSettleDelay: 20,
  indicatorClass: "htmx-request", addedClass: "htmx-added",
  settlingClass: "htmx-settling", swappingClass: "htmx-swapping",
  includeIndicatorStyles: true, historyEnabled: true, historyCacheSize: 10,
  refreshOnHistoryMiss: false, allowEval: true, allowScriptTags: true,
  inlineScriptNonce: "", selfRequestsOnly: true, withCredentials: false,
  timeout: 0, scrollBehavior: "instant", defaultFocusScroll: false,
  getCacheBusterParam: false, globalViewTransitions: false,
  methodsThatUseUrlParams: ["get"], scrollIntoViewOnBoost: true
};

var extensions = {};
var historyCache = [];
var VERBS = ["get", "post", "put", "patch", "delete"];

// C11: meta config
function loadMetaConfig() {
  var meta = document.querySelector('meta[name="htmx-config"]');
  if (meta) {
    try {
      var c = JSON.parse(meta.getAttribute("content"));
      for (var k in c) { if (c.hasOwnProperty(k)) config[k] = c[k]; }
    } catch(e) {}
  }
}

function parseInterval(str) {
  if (!str) return 0;
  if (typeof str === "number") return str;
  str = String(str).trim();
  if (/ms$/.test(str)) return parseFloat(str);
  if (/s$/.test(str)) return parseFloat(str) * 1000;
  if (/m$/.test(str)) return parseFloat(str) * 60000;
  return parseFloat(str);
}

function getAttr(elt, name) {
  if (!elt || !elt.getAttribute) return null;
  return elt.getAttribute(name);
}

// C18: attribute inheritance with disinherit
function getClosestAttr(elt, name) {
  var node = elt;
  while (node) {
    var val = getAttr(node, name);
    if (val !== null) return val;
    var parent = node.parentElement;
    if (parent) {
      var dis = getAttr(parent, "hx-disinherit");
      if (dis) {
        if (dis === "*" || dis.split(/\s+/).indexOf(name) >= 0) return null;
      }
    }
    node = parent;
  }
  return null;
}

// C14: events
function fire(elt, name, detail) {
  detail = detail || {};
  var evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
  // C16: extension onEvent - only for active extensions on this element
  var active = getActiveExtensions(elt);
  for (var i = 0; i < active.length; i++) {
    if (active[i].onEvent) {
      try { active[i].onEvent(name, evt); } catch(e) {}
    }
  }
  if (htmx.logger) {
    htmx.logger(elt, name, detail);
  }
  return elt.dispatchEvent(evt);
}

// C16: resolve active extensions for an element
function getActiveExtensions(elt) {
  var result = [];
  var ignored = {};
  var node = elt;
  while (node) {
    var ext = getAttr(node, "hx-ext");
    if (ext) {
      var parts = ext.split(",");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p.indexOf("ignore:") === 0) {
          ignored[p.substring(7).trim()] = true;
        } else if (!ignored[p] && extensions[p]) {
          result.push(extensions[p]);
        }
      }
    }
    node = node.parentElement;
  }
  return result;
}

// C4: target resolution (inlined per style, but used in multiple places)
function resolveTarget(elt, val) {
  if (!val || val === "this") return elt;
  if (val.indexOf("closest ") === 0) return elt.closest(val.substring(8));
  if (val.indexOf("find ") === 0) return elt.querySelector(val.substring(5));
  if (val.indexOf("next ") === 0) {
    var sel = val.substring(5).trim();
    if (!sel) return elt.nextElementSibling;
    var n = elt.nextElementSibling;
    while (n) { if (n.matches(sel)) return n; n = n.nextElementSibling; }
    return null;
  }
  if (val.indexOf("previous ") === 0) {
    var sel2 = val.substring(9).trim();
    if (!sel2) return elt.previousElementSibling;
    var p = elt.previousElementSibling;
    while (p) { if (p.matches(sel2)) return p; p = p.previousElementSibling; }
    return null;
  }
  if (val === "next") return elt.nextElementSibling;
  if (val === "previous") return elt.previousElementSibling;
  return document.querySelector(val);
}

// C3: swap spec parsing
function parseSwapSpec(str) {
  var spec = { swapStyle: config.defaultSwapStyle, swapDelay: config.defaultSwapDelay,
    settleDelay: config.defaultSettleDelay, scroll: null, show: null,
    focusScroll: config.defaultFocusScroll, transition: config.globalViewTransitions };
  if (!str) return spec;
  var parts = str.split(/\s+/);
  spec.swapStyle = parts[0];
  for (var i = 1; i < parts.length; i++) {
    var p = parts[i];
    if (p.indexOf("swap:") === 0) spec.swapDelay = parseInterval(p.substring(5));
    else if (p.indexOf("settle:") === 0) spec.settleDelay = parseInterval(p.substring(7));
    else if (p.indexOf("scroll:") === 0) spec.scroll = p.substring(7);
    else if (p.indexOf("show:") === 0) spec.show = p.substring(5);
    else if (p.indexOf("focus-scroll:") === 0) spec.focusScroll = p.substring(13) === "true";
    else if (p.indexOf("transition:") === 0) spec.transition = p.substring(11) === "true";
  }
  return spec;
}

// C3: doSwap - simple switch
function doSwap(target, html, swapStyle) {
  if (!target) return;
  switch (swapStyle) {
    case "innerHTML": target.innerHTML = html; break;
    case "outerHTML": target.outerHTML = html; break;
    case "beforebegin": target.insertAdjacentHTML("beforebegin", html); break;
    case "afterbegin": target.insertAdjacentHTML("afterbegin", html); break;
    case "beforeend": target.insertAdjacentHTML("beforeend", html); break;
    case "afterend": target.insertAdjacentHTML("afterend", html); break;
    case "delete": target.remove(); break;
    case "none": break;
    default: target.innerHTML = html;
  }
}

// C8: OOB swap processing
function processOob(html) {
  var tmp = document.createElement("div");
  tmp.innerHTML = html;
  var oobs = tmp.querySelectorAll("[hx-swap-oob]");
  for (var i = oobs.length - 1; i >= 0; i--) {
    var el = oobs[i];
    var attr = el.getAttribute("hx-swap-oob");
    el.removeAttribute("hx-swap-oob");
    var strategy = "outerHTML", selector = null;
    if (attr && attr !== "true") {
      var ci = attr.indexOf(":");
      if (ci >= 0) {
        strategy = attr.substring(0, ci);
        selector = attr.substring(ci + 1);
      } else {
        strategy = attr;
      }
    }
    var oobTarget = selector ? document.querySelector(selector) : (el.id ? document.getElementById(el.id) : null);
    if (oobTarget) {
      fire(oobTarget, "htmx:oobBeforeSwap", { fragment: el });
      if (strategy === "outerHTML") {
        doSwap(oobTarget, el.outerHTML, "outerHTML");
      } else {
        doSwap(oobTarget, el.innerHTML, strategy);
      }
      fire(oobTarget, "htmx:oobAfterSwap", { fragment: el });
    } else {
      fire(document.body, "htmx:oobErrorNoTarget", { fragment: el });
    }
    el.parentNode.removeChild(el);
  }
  return tmp.innerHTML;
}

// C8: select-oob processing
function processSelectOob(html, selectOob) {
  if (!selectOob) return html;
  var tmp = document.createElement("div");
  tmp.innerHTML = html;
  var entries = selectOob.split(",");
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i].trim();
    var parts = entry.split(":");
    var srcSel, tgtSel;
    if (parts.length > 1) {
      srcSel = parts[0].trim();
      tgtSel = parts.slice(1).join(":").trim();
    } else {
      srcSel = tgtSel = parts[0].trim();
    }
    var srcEl = tmp.querySelector(srcSel);
    var tgtEl = document.querySelector(tgtSel);
    if (srcEl && tgtEl) {
      doSwap(tgtEl, srcEl.outerHTML, "outerHTML");
      srcEl.parentNode.removeChild(srcEl);
    }
  }
  return tmp.innerHTML;
}

// C9: script evaluation
function processScripts(elt) {
  if (!config.allowScriptTags) return;
  var scripts = elt.querySelectorAll("script");
  for (var i = 0; i < scripts.length; i++) {
    var old = scripts[i];
    var nw = document.createElement("script");
    for (var j = 0; j < old.attributes.length; j++) {
      nw.setAttribute(old.attributes[j].name, old.attributes[j].value);
    }
    if (config.inlineScriptNonce) nw.nonce = config.inlineScriptNonce;
    nw.textContent = old.textContent;
    old.parentNode.replaceChild(nw, old);
  }
}

// C7: parse HX-Trigger headers
function parseAndFireTriggerHeader(elt, headerVal) {
  if (!headerVal) return;
  headerVal = headerVal.trim();
  if (headerVal.charAt(0) === "{") {
    try {
      var obj = JSON.parse(headerVal);
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) fire(elt, k, obj[k]);
      }
    } catch(e) {}
  } else {
    var names = headerVal.split(",");
    for (var i = 0; i < names.length; i++) {
      var n = names[i].trim();
      if (n) fire(elt, n, {});
    }
  }
}

// C7: HX-Location
function handleLocation(val) {
  var path, target, verb;
  if (val.trim().charAt(0) === "{") {
    var obj = JSON.parse(val);
    path = obj.path;
    target = obj.target || "body";
    verb = (obj.verb || "get").toUpperCase();
  } else {
    path = val;
    target = "body";
    verb = "GET";
  }
  htmx.ajax(verb, path, { target: target });
}

// C5: trigger parsing
function parseTriggers(elt, triggerAttr) {
  var triggers = [];
  if (!triggerAttr) {
    var tag = elt.tagName;
    if (tag === "FORM") return [{ event: "submit", modifiers: {} }];
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return [{ event: "change", modifiers: {} }];
    return [{ event: "click", modifiers: {} }];
  }
  var specs = triggerAttr.split(",");
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i].trim();
    if (!spec) continue;
    // C5: polling
    if (spec.indexOf("every ") === 0) {
      triggers.push({ event: "every", interval: parseInterval(spec.substring(6).trim()), modifiers: {} });
      continue;
    }
    // C5: filter expression
    var event, filter = null, modifiers = {};
    var bracketIdx = spec.indexOf("[");
    var firstSpace;
    if (bracketIdx >= 0) {
      event = spec.substring(0, bracketIdx);
      var closeBracket = spec.indexOf("]", bracketIdx);
      filter = spec.substring(bracketIdx + 1, closeBracket);
      spec = event + spec.substring(closeBracket + 1);
    }
    var tokens = spec.split(/\s+/);
    event = event || tokens[0];
    var j = 1;
    while (j < tokens.length) {
      var tok = tokens[j];
      if (tok === "once") { modifiers.once = true; j++; }
      else if (tok === "changed") { modifiers.changed = true; j++; }
      else if (tok === "consume") { modifiers.consume = true; j++; }
      else if (tok.indexOf("delay:") === 0) { modifiers.delay = parseInterval(tok.substring(6)); j++; }
      else if (tok.indexOf("throttle:") === 0) { modifiers.throttle = parseInterval(tok.substring(9)); j++; }
      else if (tok.indexOf("from:") === 0) {
        var fromVal = tok.substring(5);
        j++;
        var recognized = ["once","changed","consume","delay:","throttle:","from:","target:","queue:"];
        while (j < tokens.length) {
          var isModifier = false;
          for (var r = 0; r < recognized.length; r++) {
            if (tokens[j] === recognized[r].replace(":", "") || tokens[j].indexOf(recognized[r]) === 0) { isModifier = true; break; }
          }
          if (isModifier) break;
          fromVal += " " + tokens[j];
          j++;
        }
        modifiers.from = fromVal;
      }
      else if (tok.indexOf("target:") === 0) { modifiers.target = tok.substring(7); j++; }
      else if (tok.indexOf("queue:") === 0) { modifiers.queue = tok.substring(6); j++; }
      else if (tok.indexOf("root:") === 0) { modifiers.root = tok.substring(5); j++; }
      else if (tok.indexOf("threshold:") === 0) { modifiers.threshold = tok.substring(10); j++; }
      else { j++; }
    }
    if (filter) modifiers.filter = filter;
    triggers.push({ event: event, modifiers: modifiers });
  }
  return triggers;
}

// C5: resolve from: selector
function resolveFromTarget(elt, from) {
  if (!from) return elt;
  if (from === "document") return document;
  if (from === "window") return window;
  if (from === "body") return document.body;
  if (from.indexOf("closest ") === 0) return elt.closest(from.substring(8));
  if (from.indexOf("find ") === 0) return elt.querySelector(from.substring(5));
  if (from.indexOf("next ") === 0) {
    var sel = from.substring(5).trim();
    if (!sel) return elt.nextElementSibling;
    var n = elt.nextElementSibling;
    while (n) { if (n.matches(sel)) return n; n = n.nextElementSibling; }
    return null;
  }
  if (from.indexOf("previous ") === 0) {
    var sel2 = from.substring(9).trim();
    if (!sel2) return elt.previousElementSibling;
    var p = elt.previousElementSibling;
    while (p) { if (p.matches(sel2)) return p; p = p.previousElementSibling; }
    return null;
  }
  return document.querySelector(from);
}

// C13: collect parameters
function collectParams(elt, verb) {
  var fd = new FormData();
  var form = elt.closest("form");
  if (elt.tagName === "FORM") form = elt;
  if (form) {
    var formData = new FormData(form);
    formData.forEach(function(val, key) { fd.append(key, val); });
  }
  if (elt.name && elt.value !== undefined && elt.tagName !== "FORM") {
    fd.set(elt.name, elt.value);
  }
  // C13: hx-include
  var include = getClosestAttr(elt, "hx-include");
  if (include) {
    var incTarget = resolveTarget(elt, include);
    if (incTarget) {
      var targets = [incTarget];
      if (include.indexOf("closest ") !== 0 && include.indexOf("find ") !== 0 &&
          include.indexOf("next") !== 0 && include.indexOf("previous") !== 0 &&
          include !== "this") {
        targets = Array.prototype.slice.call(document.querySelectorAll(include));
      }
      for (var t = 0; t < targets.length; t++) {
        var el = targets[t];
        if (el.tagName === "FORM") {
          var ifd = new FormData(el);
          ifd.forEach(function(v, k) { fd.append(k, v); });
        } else if (el.name) {
          fd.set(el.name, el.value);
        } else {
          var inputs = el.querySelectorAll("[name]");
          for (var ii = 0; ii < inputs.length; ii++) {
            var inp = inputs[ii];
            if (inp.tagName === "INPUT" || inp.tagName === "SELECT" || inp.tagName === "TEXTAREA") {
              if (inp.type === "checkbox" || inp.type === "radio") {
                if (inp.checked) fd.append(inp.name, inp.value);
              } else {
                fd.append(inp.name, inp.value);
              }
            }
          }
        }
      }
    }
  }
  // C13: hx-vals
  var vals = getClosestAttr(elt, "hx-vals");
  if (vals) {
    if (config.allowEval && vals.indexOf("js:") === 0) {
      try {
        var obj = new Function("return (" + vals.substring(3) + ")")();
        for (var k in obj) { if (obj.hasOwnProperty(k)) fd.append(k, obj[k]); }
      } catch(e) {}
    } else {
      try {
        var obj2 = JSON.parse(vals);
        for (var k2 in obj2) { if (obj2.hasOwnProperty(k2)) fd.append(k2, obj2[k2]); }
      } catch(e) {}
    }
  }
  // C13: hx-params filtering
  var hxParams = getClosestAttr(elt, "hx-params");
  if (hxParams && hxParams !== "*") {
    if (hxParams === "none") {
      var allKeys = [];
      fd.forEach(function(v, k) { if (allKeys.indexOf(k) < 0) allKeys.push(k); });
      for (var d = 0; d < allKeys.length; d++) fd.delete(allKeys[d]);
    } else if (hxParams.indexOf("not ") === 0) {
      var excluded = hxParams.substring(4).split(",").map(function(s) { return s.trim(); });
      for (var e = 0; e < excluded.length; e++) fd.delete(excluded[e]);
    } else {
      var allowed = hxParams.split(",").map(function(s) { return s.trim(); });
      var existingKeys = [];
      fd.forEach(function(v, k) { if (existingKeys.indexOf(k) < 0) existingKeys.push(k); });
      for (var f = 0; f < existingKeys.length; f++) {
        if (allowed.indexOf(existingKeys[f]) < 0) fd.delete(existingKeys[f]);
      }
    }
  }
  return fd;
}

// C12: history
function saveToHistoryCache(url, content, title, scroll) {
  for (var i = 0; i < historyCache.length; i++) {
    if (historyCache[i].url === url) { historyCache.splice(i, 1); break; }
  }
  historyCache.push({ url: url, content: content, title: title, scroll: scroll });
  while (historyCache.length > config.historyCacheSize) historyCache.shift();
}

function getFromHistoryCache(url) {
  for (var i = 0; i < historyCache.length; i++) {
    if (historyCache[i].url === url) return historyCache[i];
  }
  return null;
}

function snapshotAndSave(url) {
  var histElt = document.querySelector("[hx-history-elt]") || document.body;
  fire(histElt, "htmx:beforeHistorySave");
  saveToHistoryCache(url, histElt.innerHTML, document.title, window.scrollY);
}

// C12: push/replace URL - two branches
function pushUrl(url) {
  snapshotAndSave(window.location.href);
  history.pushState({ htmx: true }, "", url);
  fire(document.body, "htmx:pushedIntoHistory", { path: url });
}

function replaceUrl(url) {
  snapshotAndSave(window.location.href);
  history.replaceState({ htmx: true }, "", url);
  fire(document.body, "htmx:replacedInHistory", { path: url });
}

// C3: handle scroll/show modifiers
function handleScrolling(spec, target) {
  if (spec.scroll) {
    var scrollParts = spec.scroll.split(":");
    var scrollDir = scrollParts[0];
    var scrollElt = target;
    if (scrollParts.length > 1 && scrollParts[0] !== "top" && scrollParts[0] !== "bottom") {
      scrollDir = scrollParts[0];
      scrollElt = document.querySelector(scrollParts[1]) || target;
    } else if (scrollParts.length > 1) {
      scrollElt = document.querySelector(scrollParts[1]) || target;
    }
    if (scrollDir === "top") scrollElt.scrollTo({ top: 0, behavior: config.scrollBehavior });
    else if (scrollDir === "bottom") scrollElt.scrollTo({ top: scrollElt.scrollHeight, behavior: config.scrollBehavior });
  }
  if (spec.show) {
    var showParts = spec.show.split(":");
    var showDir = showParts[0];
    var showElt = target;
    if (showParts.length > 1 && showParts[0] !== "top" && showParts[0] !== "bottom") {
      showElt = document.querySelector(showParts[1]) || target;
    } else if (showParts.length > 1) {
      showElt = document.querySelector(showParts[1]) || target;
    }
    showElt.scrollIntoView({ block: showDir === "bottom" ? "end" : "start", behavior: config.scrollBehavior });
  }
}

// Core request issuer
function issueRequest(elt, verb, url, triggerEvt, options) {
  options = options || {};
  verb = verb.toUpperCase();
  var source = options.source || elt;

  // C19: hx-disable checked at processing time, not here
  // C13: hx-confirm
  var confirmMsg = getClosestAttr(elt, "hx-confirm");
  if (confirmMsg) {
    if (!fire(elt, "htmx:confirm", { question: confirmMsg, triggerEvent: triggerEvt })) return;
    if (!confirm(confirmMsg)) return;
  }

  // C13: hx-prompt
  var promptMsg = getClosestAttr(elt, "hx-prompt");
  var promptVal = null;
  if (promptMsg) {
    promptVal = prompt(promptMsg);
    if (promptVal === null) return;
  }

  // C17: validation
  var validate = getClosestAttr(elt, "hx-validate");
  if (validate === "true") {
    var vform = elt.closest("form") || (elt.tagName === "FORM" ? elt : null);
    if (vform) {
      fire(vform, "htmx:validation:validate");
      if (!vform.checkValidity()) {
        vform.reportValidity();
        fire(vform, "htmx:validation:failed");
        fire(vform, "htmx:validation:halted");
        return;
      }
    }
  }

  // C13: collect params
  var fd = collectParams(source, verb);

  // C4: resolve target
  var targetAttr = getClosestAttr(elt, "hx-target");
  var target = targetAttr ? resolveTarget(elt, targetAttr) : (options.target || elt);
  if (typeof target === "string") target = document.querySelector(target);
  if (!target) target = elt;

  // C3: swap spec
  var swapAttr = getClosestAttr(elt, "hx-swap");
  var swapSpec = parseSwapSpec(swapAttr);

  // Sync: inlined check
  var syncAttr = getClosestAttr(elt, "hx-sync");
  var syncElt = elt, syncMode = null;
  if (syncAttr) {
    var colonIdx = syncAttr.indexOf(":");
    if (colonIdx >= 0) {
      var syncSel = syncAttr.substring(0, colonIdx).trim();
      syncMode = syncAttr.substring(colonIdx + 1).trim();
      syncElt = resolveTarget(elt, syncSel) || elt;
    } else {
      syncMode = syncAttr.trim();
    }
    if (syncMode === "drop" && syncElt._htmxInFlight) return;
    if ((syncMode === "abort" || syncMode === "replace") && syncElt._htmxInFlight) {
      if (syncElt._htmxAbort) syncElt._htmxAbort.abort();
    }
  }

  // C13: hx-headers
  var extraHeaders = {};
  var headersAttr = getClosestAttr(elt, "hx-headers");
  if (headersAttr) {
    try { extraHeaders = JSON.parse(headersAttr); } catch(e) {}
  }

  // C14: configRequest event - passes FormData directly
  var reqHeaders = {
    "HX-Request": "true",
    "HX-Current-URL": window.location.href,
    "HX-Target": target.id || "",
    "HX-Trigger": elt.id || "",
    "HX-Trigger-Name": elt.name || ""
  };
  if (options.boosted) reqHeaders["HX-Boosted"] = "true";
  if (promptVal !== null) reqHeaders["HX-Prompt"] = promptVal;
  if (options.historyRestore) reqHeaders["HX-History-Restore-Request"] = "true";

  for (var hk in extraHeaders) {
    if (extraHeaders.hasOwnProperty(hk)) reqHeaders[hk] = extraHeaders[hk];
  }

  var configEvt = { parameters: fd, headers: reqHeaders, verb: verb, path: url, target: target, elt: elt };
  if (!fire(elt, "htmx:configRequest", configEvt)) return;
  fd = configEvt.parameters;
  reqHeaders = configEvt.headers;
  url = configEvt.path;
  verb = configEvt.verb;
  target = configEvt.target;

  // C16: transformRequest
  var activeExts = getActiveExtensions(elt);
  for (var ei = 0; ei < activeExts.length; ei++) {
    if (activeExts[ei].transformRequest) {
      activeExts[ei].transformRequest(reqHeaders, fd, elt);
    }
  }

  // C19: selfRequestsOnly
  if (config.selfRequestsOnly) {
    try {
      var reqUrl = new URL(url, window.location.href);
      if (reqUrl.origin !== window.location.origin) {
        fire(elt, "htmx:sendError", { error: "Cross-origin request blocked" });
        return;
      }
    } catch(e) {}
  }

  if (!fire(elt, "htmx:beforeRequest", { elt: elt, target: target, requestConfig: configEvt })) return;

  // C19: hx-request options
  var reqOpts = {};
  var reqAttr = getClosestAttr(elt, "hx-request");
  if (reqAttr) { try { reqOpts = JSON.parse(reqAttr); } catch(e) {} }
  var reqTimeout = reqOpts.timeout || config.timeout;
  var reqCreds = reqOpts.credentials === "include" || reqOpts.credentials === true || config.withCredentials;

  // Indicator: inlined
  var indicatorAttr = getClosestAttr(elt, "hx-indicator");
  var indicators = [];
  if (indicatorAttr) {
    indicators = Array.prototype.slice.call(document.querySelectorAll(indicatorAttr));
  } else {
    indicators = [elt];
  }
  for (var ii = 0; ii < indicators.length; ii++) indicators[ii].classList.add(config.indicatorClass);

  // C13: hx-disabled-elt
  var disabledElt = getClosestAttr(elt, "hx-disabled-elt");
  var disabledElts = [];
  if (disabledElt) {
    disabledElts = Array.prototype.slice.call(document.querySelectorAll(disabledElt));
    for (var di = 0; di < disabledElts.length; di++) disabledElts[di].disabled = true;
  }

  // Build fetch options
  var fetchOpts = { method: verb, headers: reqHeaders };
  if (reqCreds) fetchOpts.credentials = "include";

  // C19: cache buster
  if (config.getCacheBusterParam && verb === "GET") {
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    url += sep + "org.htmx.cache-buster=" + encodeURIComponent(target.id || "true");
  }

  // C2: encode params
  var hasFiles = false;
  fd.forEach(function(v) { if (v instanceof File) hasFiles = true; });
  var encoding = getClosestAttr(elt, "hx-encoding");

  if (config.methodsThatUseUrlParams.indexOf(verb.toLowerCase()) >= 0) {
    var qs = new URLSearchParams(fd).toString();
    if (qs) url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
  } else {
    if (hasFiles || encoding === "multipart/form-data") {
      fetchOpts.body = fd;
    } else {
      fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      fetchOpts.body = new URLSearchParams(fd).toString();
    }
  }

  // AbortController for sync and timeout
  var controller = new AbortController();
  fetchOpts.signal = controller.signal;
  syncElt._htmxInFlight = true;
  syncElt._htmxAbort = controller;

  // Abort event listener
  var abortHandler = function() { controller.abort(); fire(elt, "htmx:xhr:abort"); };
  elt.addEventListener("htmx:abort", abortHandler, { once: true });

  var timeoutId = null;
  if (reqTimeout > 0) {
    timeoutId = setTimeout(function() {
      controller.abort();
      fire(elt, "htmx:timeout", { elt: elt });
    }, reqTimeout);
  }

  fire(elt, "htmx:beforeSend", { elt: elt, requestConfig: configEvt });

  fetch(url, fetchOpts).then(function(response) {
    if (timeoutId) clearTimeout(timeoutId);

    fire(elt, "htmx:afterRequest", { elt: elt, target: target, successful: response.ok, xhr: response });

    // C7: redirect/refresh
    var redirectUrl = response.headers.get("HX-Redirect");
    if (redirectUrl) { window.location.href = redirectUrl; return; }
    var refresh = response.headers.get("HX-Refresh");
    if (refresh === "true") { window.location.reload(); return; }
    var location = response.headers.get("HX-Location");
    if (location) { handleLocation(location); return; }

    if (!response.ok) {
      fire(elt, "htmx:responseError", { elt: elt, target: target, response: response });
    }

    return response.text().then(function(html) {
      // C7: HX-Retarget
      var retarget = response.headers.get("HX-Retarget");
      if (retarget) target = document.querySelector(retarget) || target;

      // C7: HX-Reswap
      var reswap = response.headers.get("HX-Reswap");
      if (reswap) swapSpec = parseSwapSpec(reswap);

      // C2: check if should swap
      var shouldSwap = response.ok && response.status !== 204;
      var beforeSwapEvt = { elt: elt, target: target, shouldSwap: shouldSwap, serverResponse: html, response: response };
      fire(elt, "htmx:beforeSwap", beforeSwapEvt);
      shouldSwap = beforeSwapEvt.shouldSwap;
      html = beforeSwapEvt.serverResponse;
      target = beforeSwapEvt.target;

      if (!shouldSwap) return;

      // C16: transformResponse
      for (var ei2 = 0; ei2 < activeExts.length; ei2++) {
        if (activeExts[ei2].transformResponse) {
          html = activeExts[ei2].transformResponse(html, response, elt);
        }
      }

      // C7: title extraction
      var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) document.title = titleMatch[1].trim();

      // C7: URL history - two branches
      var pushUrlHeader = response.headers.get("HX-Push-Url");
      var replaceUrlHeader = response.headers.get("HX-Replace-Url");
      var pushUrlAttr = getClosestAttr(elt, "hx-push-url");
      var replaceUrlAttr = getClosestAttr(elt, "hx-replace-url");

      if (pushUrlHeader && pushUrlHeader !== "false") {
        pushUrl(pushUrlHeader);
      } else if (replaceUrlHeader && replaceUrlHeader !== "false") {
        replaceUrl(replaceUrlHeader);
      } else if (pushUrlAttr && pushUrlAttr !== "false") {
        pushUrl(pushUrlAttr === "true" ? url : pushUrlAttr);
      } else if (replaceUrlAttr && replaceUrlAttr !== "false") {
        replaceUrl(replaceUrlAttr === "true" ? url : replaceUrlAttr);
      } else if (options.boosted) {
        pushUrl(url);
      }

      // C8: select-oob
      var selectOob = getAttr(elt, "hx-select-oob");
      html = processSelectOob(html, selectOob);

      // C8: OOB swaps
      html = processOob(html);

      // C3: hx-select
      var selectAttr = getAttr(elt, "hx-select");
      if (selectAttr) {
        var selTmp = document.createElement("div");
        selTmp.innerHTML = html;
        var selected = selTmp.querySelector(selectAttr);
        html = selected ? selected.outerHTML : "";
      }

      // C8: hx-preserve - save preserved elements
      var preserved = [];
      if (target && target.querySelectorAll) {
        var preserveElts = target.querySelectorAll("[hx-preserve][id]");
        for (var pi = 0; pi < preserveElts.length; pi++) {
          preserved.push({ id: preserveElts[pi].id, node: preserveElts[pi].cloneNode(true) });
        }
      }

      // C3: swap with lifecycle classes
      var performSwap = function() {
        target.classList.add(config.swappingClass);
        setTimeout(function() {
          // Swap
          doSwap(target, html, swapSpec.swapStyle);
          target.classList.remove(config.swappingClass);

          // C8: restore preserved
          for (var ri = 0; ri < preserved.length; ri++) {
            var placeholder = document.getElementById(preserved[ri].id);
            if (placeholder) placeholder.parentNode.replaceChild(preserved[ri].node, placeholder);
          }

          // C7: HX-Trigger + HX-Trigger-After-Swap
          parseAndFireTriggerHeader(elt, response.headers.get("HX-Trigger"));
          parseAndFireTriggerHeader(elt, response.headers.get("HX-Trigger-After-Swap"));

          fire(elt, "htmx:afterSwap", { elt: elt, target: target });

          // C9: scripts
          var swapTarget = swapSpec.swapStyle === "outerHTML" ? (document.getElementById(target.id) || target.parentElement || document.body) : target;
          processScripts(swapTarget);

          // Settle phase
          target.classList.add(config.settlingClass);
          // Track newly added children for htmx-added
          var newChildren = swapTarget.querySelectorAll ? Array.prototype.slice.call(swapTarget.children) : [];
          for (var nc = 0; nc < newChildren.length; nc++) newChildren[nc].classList.add(config.addedClass);

          setTimeout(function() {
            target.classList.remove(config.settlingClass);
            for (var rc = 0; rc < newChildren.length; rc++) newChildren[rc].classList.remove(config.addedClass);
            // C7: HX-Trigger-After-Settle
            parseAndFireTriggerHeader(elt, response.headers.get("HX-Trigger-After-Settle"));
            fire(elt, "htmx:afterSettle", { elt: elt, target: target });
            handleScrolling(swapSpec, target);
            // Process new content
            htmx.process(swapTarget);
            fire(swapTarget, "htmx:load", { elt: swapTarget });
          }, swapSpec.settleDelay);
        }, swapSpec.swapDelay);
      };

      // C9: view transitions
      if (swapSpec.transition && document.startViewTransition) {
        document.startViewTransition(performSwap);
      } else {
        performSwap();
      }
    });
  }).catch(function(err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err.name !== "AbortError") {
      fire(elt, "htmx:sendError", { error: err, elt: elt });
      fire(elt, "htmx:afterRequest", { elt: elt, target: target, successful: false, error: err });
    }
  }).finally(function() {
    syncElt._htmxInFlight = false;
    syncElt._htmxAbort = null;
    elt.removeEventListener("htmx:abort", abortHandler);
    for (var fi = 0; fi < indicators.length; fi++) indicators[fi].classList.remove(config.indicatorClass);
    for (var fdi = 0; fdi < disabledElts.length; fdi++) disabledElts[fdi].disabled = false;
  });
}

// C9: processHxOn - iterate *, check attributes
function processHxOn(container) {
  if (!config.allowEval) return;
  var all = container.querySelectorAll("*");
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var attrs = el.attributes;
    for (var j = 0; j < attrs.length; j++) {
      var name = attrs[j].name;
      if (name.indexOf("hx-on:") === 0 || name.indexOf("hx-on::") === 0) {
        var eventName;
        if (name.indexOf("hx-on::") === 0) {
          eventName = "htmx:" + name.substring(7);
        } else {
          eventName = name.substring(6);
        }
        if (!el._htmxOnHandlers) el._htmxOnHandlers = {};
        var handlerKey = name;
        if (!el._htmxOnHandlers[handlerKey]) {
          var code = attrs[j].value;
          var handler = new Function("event", code);
          el.addEventListener(eventName, handler.bind(el));
          el._htmxOnHandlers[handlerKey] = true;
        }
      }
    }
  }
  // Also check the container itself
  if (container.attributes) {
    var cattrs = container.attributes;
    for (var ci = 0; ci < cattrs.length; ci++) {
      var cname = cattrs[ci].name;
      if (cname.indexOf("hx-on:") === 0 || cname.indexOf("hx-on::") === 0) {
        var cevt;
        if (cname.indexOf("hx-on::") === 0) {
          cevt = "htmx:" + cname.substring(7);
        } else {
          cevt = cname.substring(6);
        }
        if (!container._htmxOnHandlers) container._htmxOnHandlers = {};
        if (!container._htmxOnHandlers[cname]) {
          var ccode = cattrs[ci].value;
          var chandler = new Function("event", ccode);
          container.addEventListener(cevt, chandler.bind(container));
          container._htmxOnHandlers[cname] = true;
        }
      }
    }
  }
}

// C6: boost - single function for links and forms
function boost(container) {
  var links = container.querySelectorAll("a");
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    if (link._htmxBoosted) continue;
    if (getClosestAttr(link, "hx-boost") !== "true") continue;
    if (getAttr(link, "hx-boost") === "false") continue;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("javascript:") === 0) continue;
    link._htmxBoosted = true;
    link.addEventListener("click", function(evt) {
      if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
      evt.preventDefault();
      var url = this.href;
      var tgt = getClosestAttr(this, "hx-target");
      var target = tgt ? resolveTarget(this, tgt) : document.body;
      issueRequest(this, "GET", url, evt, { boosted: true, target: target });
      if (config.scrollIntoViewOnBoost) window.scrollTo({ top: 0, behavior: config.scrollBehavior });
    });
  }
  var forms = container.querySelectorAll("form");
  for (var j = 0; j < forms.length; j++) {
    var form = forms[j];
    if (form._htmxBoosted) continue;
    if (getClosestAttr(form, "hx-boost") !== "true") continue;
    if (getAttr(form, "hx-boost") === "false") continue;
    form._htmxBoosted = true;
    form.addEventListener("submit", function(evt) {
      evt.preventDefault();
      var method = (this.method || "GET").toUpperCase();
      var url = this.action;
      var tgt = getClosestAttr(this, "hx-target");
      var target = tgt ? resolveTarget(this, tgt) : document.body;
      issueRequest(this, method, url, evt, { boosted: true, target: target, source: this });
      if (config.scrollIntoViewOnBoost) window.scrollTo({ top: 0, behavior: config.scrollBehavior });
    });
  }
}

// C15: SSE
function initSSE(elt) {
  if (elt._htmxSSE) return;
  var url = getAttr(elt, "sse-connect");
  if (!url) return;
  var es = new EventSource(url);
  elt._htmxSSE = es;
  es.onopen = function() { fire(elt, "htmx:sseOpen"); };
  es.onerror = function() { fire(elt, "htmx:sseError"); };
  // Find sse-swap descendants
  var swapElts = elt.querySelectorAll("[sse-swap]");
  for (var i = 0; i < swapElts.length; i++) {
    (function(swapElt) {
      var eventName = getAttr(swapElt, "sse-swap");
      es.addEventListener(eventName, function(event) {
        var html = event.data;
        html = processOob(html);
        var sseTarget = swapElt;
        var tgtAttr = getClosestAttr(swapElt, "hx-target");
        if (tgtAttr) sseTarget = resolveTarget(swapElt, tgtAttr) || swapElt;
        var swapAttr = getClosestAttr(swapElt, "hx-swap");
        var spec = parseSwapSpec(swapAttr);
        doSwap(sseTarget, html, spec.swapStyle);
        processScripts(sseTarget);
        htmx.process(sseTarget);
        fire(sseTarget, "htmx:load", { elt: sseTarget });
      });
    })(swapElts[i]);
  }
  // sse-close
  var closeAttr = getAttr(elt, "sse-close");
  if (closeAttr) {
    es.addEventListener(closeAttr, function() { es.close(); elt._htmxSSE = null; });
  }
  // Cleanup poll
  var cleanupInterval = setInterval(function() {
    if (!document.contains(elt)) { es.close(); clearInterval(cleanupInterval); }
  }, 1000);
}

// C15: WebSocket
function initWS(elt) {
  if (elt._htmxWS) return;
  var url = getAttr(elt, "ws-connect");
  if (!url) return;
  var backoff = 1000;
  function connect() {
    var ws = new WebSocket(url);
    elt._htmxWS = ws;
    ws.onopen = function() { backoff = 1000; };
    ws.onmessage = function(event) {
      var html = event.data;
      html = processOob(html);
      doSwap(elt, html, "innerHTML");
      processScripts(elt);
      htmx.process(elt);
      fire(elt, "htmx:load", { elt: elt });
    };
    ws.onclose = function() {
      elt._htmxWS = null;
      if (document.contains(elt)) {
        setTimeout(function() {
          backoff = Math.min(backoff * 2, 30000);
          connect();
        }, backoff);
      }
    };
    ws.onerror = function() { ws.close(); };
  }
  connect();
  // ws-send elements
  var sendElts = elt.querySelectorAll("[ws-send]");
  for (var i = 0; i < sendElts.length; i++) {
    (function(sendElt) {
      if (sendElt._htmxWsSend) return;
      sendElt._htmxWsSend = true;
      var trigger = sendElt.tagName === "FORM" ? "submit" : "click";
      sendElt.addEventListener(trigger, function(evt) {
        if (trigger === "submit") evt.preventDefault();
        var fd = collectParams(sendElt, "POST");
        var obj = {};
        fd.forEach(function(v, k) { obj[k] = v; });
        if (elt._htmxWS && elt._htmxWS.readyState === WebSocket.OPEN) {
          elt._htmxWS.send(JSON.stringify(obj));
        }
      });
    })(sendElts[i]);
  }
  // Cleanup poll
  var cleanupInterval = setInterval(function() {
    if (!document.contains(elt)) {
      if (elt._htmxWS) elt._htmxWS.close();
      clearInterval(cleanupInterval);
    }
  }, 1000);
}

// Main process function
function process(elt) {
  if (!elt || !elt.querySelectorAll) return;

  fire(elt, "htmx:beforeProcessNode", { elt: elt });

  // C19: hx-disable
  if (elt.hasAttribute && elt.hasAttribute("hx-disable")) return;
  if (elt.closest && elt.closest("[hx-disable]")) return;

  // Process by verb-specific selectors
  for (var vi = 0; vi < VERBS.length; vi++) {
    var verb = VERBS[vi];
    var attr = "hx-" + verb;
    // Process elt itself
    if (elt.hasAttribute && elt.hasAttribute(attr)) attachTrigger(elt, verb, elt.getAttribute(attr));
    // Process descendants
    var elts = elt.querySelectorAll("[" + attr + "]");
    for (var ei = 0; ei < elts.length; ei++) {
      if (elts[ei].closest && elts[ei].closest("[hx-disable]")) continue;
      attachTrigger(elts[ei], verb, elts[ei].getAttribute(attr));
    }
  }

  // C6: boost scanning inline
  boost(elt);

  // C9: hx-on processing
  processHxOn(elt);

  // C15: SSE/WS
  var sseElts = elt.querySelectorAll("[sse-connect]");
  for (var si = 0; si < sseElts.length; si++) initSSE(sseElts[si]);
  if (elt.hasAttribute && elt.hasAttribute("sse-connect")) initSSE(elt);

  var wsElts = elt.querySelectorAll("[ws-connect]");
  for (var wi = 0; wi < wsElts.length; wi++) initWS(wsElts[wi]);
  if (elt.hasAttribute && elt.hasAttribute("ws-connect")) initWS(elt);

  fire(elt, "htmx:afterProcessNode", { elt: elt });
}

// Attach trigger to element
function attachTrigger(elt, verb, url) {
  if (elt._htmxProcessed) return;
  elt._htmxProcessed = true;

  var triggerAttr = getClosestAttr(elt, "hx-trigger");
  var triggers = parseTriggers(elt, triggerAttr);

  for (var i = 0; i < triggers.length; i++) {
    (function(spec) {
      if (spec.event === "every") {
        // C5: polling
        var pollId = setInterval(function() {
          if (!document.contains(elt)) { clearInterval(pollId); return; }
          issueRequest(elt, verb, url);
        }, spec.interval);
        return;
      }

      if (spec.event === "load") {
        setTimeout(function() { issueRequest(elt, verb, url); }, 0);
        return;
      }

      if (spec.event === "revealed") {
        var observer = new IntersectionObserver(function(entries) {
          for (var e = 0; e < entries.length; e++) {
            if (entries[e].isIntersecting) {
              observer.disconnect();
              issueRequest(elt, verb, url);
            }
          }
        });
        observer.observe(elt);
        return;
      }

      if (spec.event === "intersect") {
        var ioOpts = {};
        if (spec.modifiers.root) ioOpts.root = document.querySelector(spec.modifiers.root);
        if (spec.modifiers.threshold) ioOpts.threshold = parseFloat(spec.modifiers.threshold);
        var io = new IntersectionObserver(function(entries) {
          for (var e = 0; e < entries.length; e++) {
            if (entries[e].isIntersecting) issueRequest(elt, verb, url);
          }
        }, ioOpts);
        io.observe(elt);
        return;
      }

      var listenTarget = resolveFromTarget(elt, spec.modifiers.from);
      if (!listenTarget) return;

      var fired = false;
      var lastThrottle = 0;
      var delayTimer = null;
      var lastValue = null;

      var handler = function(evt) {
        // C5: target filter
        if (spec.modifiers.target) {
          if (!evt.target.matches(spec.modifiers.target)) return;
        }
        // C5: filter expression
        if (spec.modifiers.filter && config.allowEval) {
          try {
            var filterFn = new Function("event", "with(event){return (" + spec.modifiers.filter + ")}");
            if (!filterFn.call(elt, evt)) return;
          } catch(e) { return; }
        }
        // C5: once
        if (spec.modifiers.once) {
          if (fired) return;
          fired = true;
        }
        // C5: changed
        if (spec.modifiers.changed) {
          var curVal = elt.value;
          if (curVal === lastValue) return;
          lastValue = curVal;
        }
        // C5: consume
        if (spec.modifiers.consume) {
          evt.preventDefault();
          evt.stopPropagation();
        }
        // C5: submit must preventDefault
        if (spec.event === "submit") evt.preventDefault();
        // C5: throttle
        if (spec.modifiers.throttle) {
          var now = Date.now();
          if (now - lastThrottle < spec.modifiers.throttle) return;
          lastThrottle = now;
        }
        // C5: delay (debounce)
        if (spec.modifiers.delay) {
          if (delayTimer) clearTimeout(delayTimer);
          delayTimer = setTimeout(function() { issueRequest(elt, verb, url, evt); }, spec.modifiers.delay);
          return;
        }
        // C5: queue
        if (spec.modifiers.queue === "none" && elt._htmxInFlight) return;
        issueRequest(elt, verb, url, evt);
      };

      listenTarget.addEventListener(spec.event, handler);
    })(triggers[i]);
  }
}

// C12: popstate handler
function initHistory() {
  window.addEventListener("popstate", function(evt) {
    var url = window.location.href;
    fire(document.body, "htmx:historyRestore", { path: url });
    var cached = getFromHistoryCache(url);
    var histElt = document.querySelector("[hx-history-elt]") || document.body;
    if (cached) {
      histElt.innerHTML = cached.content;
      document.title = cached.title;
      window.scrollTo(0, cached.scroll || 0);
      htmx.process(histElt);
    } else {
      fire(document.body, "htmx:historyCacheMiss", { path: url });
      if (config.refreshOnHistoryMiss) {
        window.location.reload();
        return;
      }
      // Fetch from server
      fetch(url, { headers: { "HX-Request": "true", "HX-History-Restore-Request": "true" } })
        .then(function(resp) { return resp.text(); })
        .then(function(html) {
          fire(document.body, "htmx:historyCacheMissLoad", { path: url });
          // Extract body if full document
          var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          if (bodyMatch) html = bodyMatch[1];
          var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) document.title = titleMatch[1].trim();
          histElt.innerHTML = html;
          htmx.process(histElt);
        })
        .catch(function(err) {
          fire(document.body, "htmx:historyCacheMissError", { path: url, error: err });
        });
    }
  });
}

// Indicator styles: inlined injection
function injectIndicatorStyles() {
  if (!config.includeIndicatorStyles) return;
  var style = document.createElement("style");
  style.textContent = ".htmx-indicator{opacity:0;transition:opacity 200ms ease-in;}.htmx-request .htmx-indicator,.htmx-request.htmx-indicator{opacity:1;}";
  document.head.appendChild(style);
}

// Init
function init() {
  loadMetaConfig();
  initHistory();
  injectIndicatorStyles();
  process(document.body);
}

// C10: public API
var htmx = {
  version: "2.0.0",
  config: config,
  logger: null,

  ajax: function(verb, url, spec) {
    var target = document.body;
    var source = document.body;
    if (typeof spec === "string") {
      target = document.querySelector(spec) || document.body;
      source = target;
    } else if (spec instanceof Element) {
      target = spec;
      source = spec;
    } else if (spec && typeof spec === "object") {
      if (spec.target) target = typeof spec.target === "string" ? document.querySelector(spec.target) : spec.target;
      if (spec.source) source = typeof spec.source === "string" ? document.querySelector(spec.source) : spec.source;
      target = target || document.body;
      source = source || document.body;
    }
    issueRequest(source, verb, url, null, { target: target, source: source });
  },

  process: process,

  find: function(eltOrSel, sel) {
    if (typeof eltOrSel === "string") return document.querySelector(eltOrSel);
    return eltOrSel.querySelector(sel);
  },

  findAll: function(eltOrSel, sel) {
    if (typeof eltOrSel === "string") return Array.prototype.slice.call(document.querySelectorAll(eltOrSel));
    return Array.prototype.slice.call(eltOrSel.querySelectorAll(sel));
  },

  closest: function(elt, sel) { return elt.closest(sel); },
  remove: function(elt) { elt.remove(); },

  addClass: function(elt, cls, delay) {
    if (delay) { setTimeout(function() { elt.classList.add(cls); }, parseInterval(delay)); }
    else { elt.classList.add(cls); }
  },

  removeClass: function(elt, cls, delay) {
    if (delay) { setTimeout(function() { elt.classList.remove(cls); }, parseInterval(delay)); }
    else { elt.classList.remove(cls); }
  },

  toggleClass: function(elt, cls) { elt.classList.toggle(cls); },

  takeClass: function(elt, cls) {
    var siblings = elt.parentElement ? elt.parentElement.children : [];
    for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove(cls);
    elt.classList.add(cls);
  },

  trigger: function(elt, event, detail) { fire(elt, event, detail); },

  swap: function(target, html, swapSpec) {
    if (typeof target === "string") target = document.querySelector(target);
    var spec = parseSwapSpec(typeof swapSpec === "string" ? swapSpec : null);
    html = processOob(html);
    doSwap(target, html, spec.swapStyle);
    processScripts(target);
    process(target);
  },

  values: function(elt) {
    var fd = collectParams(elt, "GET");
    var obj = {};
    fd.forEach(function(v, k) { obj[k] = v; });
    return obj;
  },

  on: function(eltOrEvt, evtOrHandler, handler) {
    if (typeof eltOrEvt === "string") {
      document.addEventListener(eltOrEvt, evtOrHandler);
    } else {
      eltOrEvt.addEventListener(evtOrHandler, handler);
    }
  },

  off: function(eltOrEvt, evtOrHandler, handler) {
    if (typeof eltOrEvt === "string") {
      document.removeEventListener(eltOrEvt, evtOrHandler);
    } else {
      eltOrEvt.removeEventListener(evtOrHandler, handler);
    }
  },

  defineExtension: function(name, def) {
    extensions[name] = def;
    if (def.init) def.init({ config: config });
  },

  removeExtension: function(name) { delete extensions[name]; },
  parseInterval: parseInterval,
  logAll: function() { htmx.logger = function(elt, evt, detail) { console.log(evt, elt, detail); }; },
  logNone: function() { htmx.logger = null; },

  _: {
    fire: fire,
    getAttr: getAttr,
    resolveTarget: resolveTarget,
    doSwap: doSwap,
    processScripts: processScripts
  }
};

window.htmx = htmx;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();
