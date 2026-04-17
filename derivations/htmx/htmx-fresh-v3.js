(function() {
var VERBS = ["get","post","put","patch","delete"];
var registry = {};
var historyCache = [];
var logger = null;
var version = "3.0.0";

// Config (C11)
var config = {
  defaultSwapStyle: "innerHTML",
  defaultSwapDelay: 0,
  defaultSettleDelay: 20,
  indicatorClass: "htmx-request",
  addedClass: "htmx-added",
  settlingClass: "htmx-settling",
  swappingClass: "htmx-swapping",
  includeIndicatorStyles: true,
  historyEnabled: true,
  historyCacheSize: 10,
  refreshOnHistoryMiss: false,
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
  scrollIntoViewOnBoost: true
};

// Utility
function parseInterval(str) {
  if (!str) return 0;
  if (typeof str === "number") return str;
  str = String(str).trim();
  if (str.match(/\d+ms$/)) return parseInt(str);
  if (str.match(/\d+s$/)) return parseFloat(str) * 1000;
  return parseInt(str) || 0;
}

function getAttr(elt, attr) {
  if (!elt || !elt.getAttribute) return null;
  return elt.getAttribute(attr);
}

function fire(elt, name, detail) {
  detail = detail || {};
  var evt = new CustomEvent(name, {bubbles: true, cancelable: true, detail: detail});
  if (logger) logger(elt, name, detail);
  return elt.dispatchEvent(evt);
}

function getInheritedAttr(elt, attr) {
  var cur = elt;
  while (cur) {
    var dis = getAttr(cur, "hx-disinherit");
    if (cur !== elt && dis) {
      if (dis === "*") return null;
      var parts = dis.split(/\s+/);
      if (parts.indexOf(attr) >= 0) return null;
    }
    var val = getAttr(cur, attr);
    if (val !== null) return val;
    cur = cur.parentElement;
  }
  return null;
}

function resolveTarget(elt, spec) {
  if (!spec || spec === "this") return elt;
  if (spec.indexOf("closest ") === 0) return elt.closest(spec.slice(8));
  if (spec.indexOf("find ") === 0) return elt.querySelector(spec.slice(5));
  if (spec === "next") return elt.nextElementSibling;
  if (spec.indexOf("next ") === 0) {
    var sel = spec.slice(5);
    var sib = elt.nextElementSibling;
    while (sib) { if (sib.matches(sel)) return sib; sib = sib.nextElementSibling; }
    return null;
  }
  if (spec === "previous") return elt.previousElementSibling;
  if (spec.indexOf("previous ") === 0) {
    var sel2 = spec.slice(9);
    var sib2 = elt.previousElementSibling;
    while (sib2) { if (sib2.matches(sel2)) return sib2; sib2 = sib2.previousElementSibling; }
    return null;
  }
  return document.querySelector(spec);
}

function getTarget(elt) {
  var spec = getInheritedAttr(elt, "hx-target");
  if (spec) return resolveTarget(elt, spec);
  return elt;
}

function parseSwapSpec(str) {
  var spec = {
    swapStyle: config.defaultSwapStyle,
    swapDelay: config.defaultSwapDelay,
    settleDelay: config.defaultSettleDelay,
    scroll: null, scrollTarget: null,
    show: null, showTarget: null,
    focusScroll: config.defaultFocusScroll,
    transition: config.globalViewTransitions
  };
  if (!str) return spec;
  var parts = str.trim().split(/\s+/);
  spec.swapStyle = parts[0];
  for (var i = 1; i < parts.length; i++) {
    var p = parts[i];
    if (p.indexOf("swap:") === 0) spec.swapDelay = parseInterval(p.slice(5));
    else if (p.indexOf("settle:") === 0) spec.settleDelay = parseInterval(p.slice(7));
    else if (p.indexOf("scroll:") === 0) {
      var sv = p.slice(7);
      var sc = sv.split(":");
      if (sc.length > 1) { spec.scroll = sc[0]; spec.scrollTarget = sc.slice(1).join(":"); }
      else spec.scroll = sv;
    }
    else if (p.indexOf("show:") === 0) {
      var shv = p.slice(5);
      var shc = shv.split(":");
      if (shc.length > 1) { spec.show = shc[0]; spec.showTarget = shc.slice(1).join(":"); }
      else spec.show = shv;
    }
    else if (p.indexOf("focus-scroll:") === 0) spec.focusScroll = p.slice(13) === "true";
    else if (p.indexOf("transition:") === 0) spec.transition = p.slice(11) === "true";
  }
  return spec;
}

// Swap (C3)
function doSwap(target, html, swapStyle) {
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

function processOOB(html) {
  var tmp = document.createElement("div");
  tmp.innerHTML = html;
  var oobs = tmp.querySelectorAll("[hx-swap-oob]");
  for (var i = oobs.length - 1; i >= 0; i--) {
    var el = oobs[i];
    var val = getAttr(el, "hx-swap-oob");
    el.removeAttribute("hx-swap-oob");
    var strategy = "outerHTML", targetSel = null;
    if (val && val !== "true") {
      var ci = val.indexOf(":");
      if (ci >= 0) { strategy = val.slice(0, ci); targetSel = val.slice(ci + 1); }
      else strategy = val;
    }
    var oobTarget = targetSel ? document.querySelector(targetSel) : (el.id ? document.getElementById(el.id) : null);
    if (!oobTarget) {
      fire(document.body, "htmx:oobErrorNoTarget", {content: el});
      el.parentNode.removeChild(el);
      continue;
    }
    fire(oobTarget, "htmx:oobBeforeSwap", {target: oobTarget, fragment: el});
    if (strategy === "outerHTML") {
      doSwap(oobTarget, el.outerHTML, "outerHTML");
    } else {
      doSwap(oobTarget, el.innerHTML, strategy);
    }
    fire(oobTarget, "htmx:oobAfterSwap", {target: oobTarget, fragment: el});
    el.parentNode.removeChild(el);
  }
  return tmp.innerHTML;
}

function processSelectOOB(html, selectOobVal) {
  if (!selectOobVal) return html;
  var tmp = document.createElement("div");
  tmp.innerHTML = html;
  var entries = selectOobVal.split(",");
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i].trim();
    var ci = entry.indexOf(":");
    var srcSel, tgtSel;
    if (ci >= 0) { srcSel = entry.slice(0, ci).trim(); tgtSel = entry.slice(ci + 1).trim(); }
    else { srcSel = entry; tgtSel = entry; }
    var srcEl = tmp.querySelector(srcSel);
    var tgtEl = document.querySelector(tgtSel);
    if (srcEl && tgtEl) {
      fire(tgtEl, "htmx:oobBeforeSwap", {target: tgtEl, fragment: srcEl});
      tgtEl.innerHTML = srcEl.innerHTML;
      fire(tgtEl, "htmx:oobAfterSwap", {target: tgtEl, fragment: srcEl});
      srcEl.parentNode.removeChild(srcEl);
    }
  }
  return tmp.innerHTML;
}

function processScripts(elt) {
  if (!config.allowScriptTags) return;
  var scripts = elt.querySelectorAll("script");
  for (var i = 0; i < scripts.length; i++) {
    var old = scripts[i];
    var ns = document.createElement("script");
    for (var j = 0; j < old.attributes.length; j++) {
      ns.setAttribute(old.attributes[j].name, old.attributes[j].value);
    }
    if (config.inlineScriptNonce) ns.nonce = config.inlineScriptNonce;
    ns.textContent = old.textContent;
    old.parentNode.replaceChild(ns, old);
  }
}

function updateTitle(html) {
  var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) document.title = m[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"');
}

function getActiveExtensions(elt) {
  var exts = [];
  var ignored = [];
  var cur = elt;
  while (cur) {
    var val = getAttr(cur, "hx-ext");
    if (val) {
      var parts = val.split(",");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p.indexOf("ignore:") === 0) {
          ignored.push(p.slice(7).trim());
        } else if (ignored.indexOf(p) < 0 && exts.indexOf(p) < 0 && registry[p]) {
          exts.push(p);
        }
      }
    }
    cur = cur.parentElement;
  }
  return exts;
}

function fireExtEvent(elt, name, evt) {
  var exts = getActiveExtensions(elt);
  for (var i = 0; i < exts.length; i++) {
    var ext = registry[exts[i]];
    if (ext && ext.onEvent) ext.onEvent(name, evt);
  }
}

function fireWithExt(elt, name, detail) {
  var r = fire(elt, name, detail);
  fireExtEvent(elt, name, {detail: detail, target: elt});
  return r;
}

// Parse trigger spec (C5)
function parseTriggers(elt, triggerStr) {
  if (!triggerStr) {
    var tag = elt.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return [{event:"change",modifiers:{}}];
    if (tag === "FORM") return [{event:"submit",modifiers:{}}];
    return [{event:"click",modifiers:{}}];
  }
  var triggers = [];
  var parts = triggerStr.split(",");
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    // check for every Ns/Nms polling
    var everyMatch = p.match(/^every\s+(\d+(?:ms|s))/);
    if (everyMatch) {
      triggers.push({event:"every", interval: parseInterval(everyMatch[1]), modifiers:{}});
      continue;
    }
    var tokens = p.split(/\s+/);
    var eventPart = tokens[0];
    // parse filter expression
    var filter = null;
    var bi = eventPart.indexOf("[");
    if (bi >= 0) {
      filter = eventPart.slice(bi + 1, eventPart.lastIndexOf("]"));
      eventPart = eventPart.slice(0, bi);
    }
    var mods = {filter: filter};
    var j = 1;
    while (j < tokens.length) {
      var t = tokens[j];
      if (t === "once") mods.once = true;
      else if (t === "changed") mods.changed = true;
      else if (t === "consume") mods.consume = true;
      else if (t.indexOf("delay:") === 0) mods.delay = parseInterval(t.slice(6));
      else if (t.indexOf("throttle:") === 0) mods.throttle = parseInterval(t.slice(9));
      else if (t.indexOf("queue:") === 0) mods.queue = t.slice(6);
      else if (t.indexOf("target:") === 0) mods.target = t.slice(7);
      else if (t.indexOf("from:") === 0) {
        // consume remaining tokens until next known modifier
        var fromVal = t.slice(5);
        var knownMods = ["once","changed","consume","delay:","throttle:","queue:","target:","from:"];
        for (var k = j + 1; k < tokens.length; k++) {
          var isKnown = false;
          for (var m = 0; m < knownMods.length; m++) {
            if (tokens[k] === knownMods[m] || tokens[k].indexOf(knownMods[m]) === 0) { isKnown = true; break; }
          }
          if (isKnown) break;
          fromVal += " " + tokens[k];
          j = k;
        }
        mods.from = fromVal;
      }
      else if (t.indexOf("root:") === 0) mods.root = t.slice(5);
      else if (t.indexOf("threshold:") === 0) mods.threshold = parseFloat(t.slice(10));
      j++;
    }
    triggers.push({event: eventPart, modifiers: mods});
  }
  return triggers;
}

function resolveFromSelector(elt, from) {
  if (!from) return elt;
  if (from === "document") return document;
  if (from === "window") return window;
  if (from === "body") return document.body;
  if (from.indexOf("closest ") === 0) return elt.closest(from.slice(8));
  if (from.indexOf("find ") === 0) return elt.querySelector(from.slice(5));
  if (from === "next") return elt.nextElementSibling;
  if (from.indexOf("next ") === 0) {
    var sel = from.slice(5);
    var sib = elt.nextElementSibling;
    while (sib) { if (sib.matches(sel)) return sib; sib = sib.nextElementSibling; }
    return null;
  }
  if (from === "previous") return elt.previousElementSibling;
  if (from.indexOf("previous ") === 0) {
    var sel2 = from.slice(9);
    var sib2 = elt.previousElementSibling;
    while (sib2) { if (sib2.matches(sel2)) return sib2; sib2 = sib2.previousElementSibling; }
    return null;
  }
  return document.querySelector(from);
}

// Collect parameters (C13)
function collectParams(elt, verb) {
  var fd = new FormData();
  var form = elt.closest("form");
  if (elt.tagName === "FORM") form = elt;
  if (form) {
    var formFd = new FormData(form);
    var iter = formFd.entries ? formFd.entries() : [];
    var entry;
    if (formFd.forEach) {
      formFd.forEach(function(v, k) { fd.append(k, v); });
    }
  }
  if (elt.name && elt.value !== undefined && elt.tagName !== "FORM") {
    fd.set(elt.name, elt.value);
  }
  // hx-include
  var inc = getInheritedAttr(elt, "hx-include");
  if (inc) {
    var targets;
    if (inc === "this") targets = [elt];
    else if (inc.indexOf("closest ") === 0) targets = [elt.closest(inc.slice(8))];
    else if (inc.indexOf("find ") === 0) targets = [elt.querySelector(inc.slice(5))];
    else if (inc === "next") targets = [elt.nextElementSibling];
    else if (inc.indexOf("next ") === 0) {
      var sel = inc.slice(5), sib = elt.nextElementSibling;
      while (sib) { if (sib.matches(sel)) { targets = [sib]; break; } sib = sib.nextElementSibling; }
      if (!targets) targets = [];
    }
    else if (inc === "previous") targets = [elt.previousElementSibling];
    else if (inc.indexOf("previous ") === 0) {
      var sel2 = inc.slice(9), sib2 = elt.previousElementSibling;
      while (sib2) { if (sib2.matches(sel2)) { targets = [sib2]; break; } sib2 = sib2.previousElementSibling; }
      if (!targets) targets = [];
    }
    else targets = Array.prototype.slice.call(document.querySelectorAll(inc));
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t) continue;
      if (t.tagName === "FORM") {
        var incFd = new FormData(t);
        incFd.forEach(function(v, k) { fd.append(k, v); });
      } else if (t.name && t.value !== undefined) {
        fd.append(t.name, t.value);
      } else {
        // container: gather named descendants
        var inputs = t.querySelectorAll("input[name],select[name],textarea[name]");
        for (var j = 0; j < inputs.length; j++) {
          var inp = inputs[j];
          if (inp.type === "checkbox" || inp.type === "radio") {
            if (inp.checked) fd.append(inp.name, inp.value);
          } else {
            fd.append(inp.name, inp.value);
          }
        }
      }
    }
  }
  // hx-vals
  var vals = getInheritedAttr(elt, "hx-vals");
  if (vals) {
    if (config.allowEval && vals.indexOf("js:") === 0) {
      try {
        var obj = new Function("return (" + vals.slice(3) + ")")();
        for (var key in obj) { if (obj.hasOwnProperty(key)) fd.append(key, obj[key]); }
      } catch(e) { /* ignore */ }
    } else {
      try {
        var parsed = JSON.parse(vals);
        for (var key2 in parsed) { if (parsed.hasOwnProperty(key2)) fd.append(key2, parsed[key2]); }
      } catch(e2) { /* ignore */ }
    }
  }
  // hx-params filter
  var params = getInheritedAttr(elt, "hx-params");
  if (params && params !== "*") {
    if (params === "none") {
      var keys = [];
      fd.forEach(function(v, k) { keys.push(k); });
      for (var ki = 0; ki < keys.length; ki++) fd.delete(keys[ki]);
    } else if (params.indexOf("not ") === 0) {
      var exclude = params.slice(4).split(",").map(function(s) { return s.trim(); });
      for (var ei = 0; ei < exclude.length; ei++) fd.delete(exclude[ei]);
    } else {
      var include = params.split(",").map(function(s) { return s.trim(); });
      var allKeys = [];
      fd.forEach(function(v, k) { if (allKeys.indexOf(k) < 0) allKeys.push(k); });
      for (var ai = 0; ai < allKeys.length; ai++) {
        if (include.indexOf(allKeys[ai]) < 0) fd.delete(allKeys[ai]);
      }
    }
  }
  return fd;
}

function hasFileInput(elt) {
  var form = elt.closest("form");
  if (elt.tagName === "FORM") form = elt;
  if (!form) return false;
  return form.querySelector("input[type=file]") !== null;
}

// Sync tracking
var syncMap = new WeakMap();

function resolveSync(elt) {
  var syncVal = getInheritedAttr(elt, "hx-sync");
  if (!syncVal) return {scope: elt, mode: null};
  var ci = syncVal.indexOf(":");
  if (ci >= 0) {
    var selPart = syncVal.slice(0, ci).trim();
    var modePart = syncVal.slice(ci + 1).trim();
    var scope = resolveTarget(elt, selPart);
    return {scope: scope || elt, mode: modePart};
  }
  return {scope: elt, mode: syncVal.trim()};
}

// Fire HX-Trigger events
function fireServerEvents(elt, headerVal) {
  if (!headerVal) return;
  try {
    var obj = JSON.parse(headerVal);
    for (var name in obj) {
      if (obj.hasOwnProperty(name)) fire(elt, name, obj[name]);
    }
  } catch(e) {
    var names = headerVal.split(",");
    for (var i = 0; i < names.length; i++) {
      var n = names[i].trim();
      if (n) fire(elt, n, {});
    }
  }
}

// History (C12)
function getHistoryElt() {
  return document.querySelector("[hx-history-elt]") || document.body;
}

function saveHistory(url) {
  if (!config.historyEnabled) return;
  fire(document.body, "htmx:beforeHistorySave", {});
  var he = getHistoryElt();
  var entry = {url: url, content: he.innerHTML, title: document.title, scroll: window.scrollY};
  // LRU
  for (var i = 0; i < historyCache.length; i++) {
    if (historyCache[i].url === url) { historyCache.splice(i, 1); break; }
  }
  historyCache.push(entry);
  while (historyCache.length > config.historyCacheSize) historyCache.shift();
}

function restoreHistory(url) {
  fire(document.body, "htmx:historyRestore", {path: url});
  for (var i = 0; i < historyCache.length; i++) {
    if (historyCache[i].url === url) {
      var entry = historyCache[i];
      var he = getHistoryElt();
      he.innerHTML = entry.content;
      document.title = entry.title;
      processNode(he);
      setTimeout(function() { window.scrollTo(0, entry.scroll); }, 0);
      return;
    }
  }
  fire(document.body, "htmx:historyCacheMiss", {path: url});
  if (config.refreshOnHistoryMiss) {
    window.location.reload();
    return;
  }
  // fetch from server
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.setRequestHeader("HX-Request", "true");
  xhr.setRequestHeader("HX-History-Restore-Request", "true");
  xhr.setRequestHeader("HX-Current-URL", window.location.href);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var html = xhr.responseText;
      var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch) html = bodyMatch[1];
      fire(document.body, "htmx:historyCacheMissLoad", {path: url, xhr: xhr});
      var he = getHistoryElt();
      he.innerHTML = html;
      processNode(he);
      processScripts(he);
      updateTitle(xhr.responseText);
    } else {
      fire(document.body, "htmx:historyCacheMissError", {path: url, xhr: xhr});
    }
  };
  xhr.onerror = function() {
    fire(document.body, "htmx:historyCacheMissError", {path: url, xhr: xhr});
  };
  xhr.send();
}

// Core request (C1, C2, C14)
function issueRequest(elt, verb, url, extraParams, extraTarget, isBoosted) {
  verb = verb.toUpperCase();
  // hx-confirm (C13)
  var confirmMsg = getInheritedAttr(elt, "hx-confirm");
  if (confirmMsg) {
    if (!fire(elt, "htmx:confirm", {question: confirmMsg, elt: elt})) return;
    if (!confirm(confirmMsg)) return;
  }
  // hx-prompt
  var promptMsg = getInheritedAttr(elt, "hx-prompt");
  var promptVal = null;
  if (promptMsg) {
    promptVal = prompt(promptMsg);
    if (promptVal === null) return;
  }
  // hx-validate (C17)
  var validate = getInheritedAttr(elt, "hx-validate");
  if (validate === "true") {
    var form = elt.closest("form");
    if (elt.tagName === "FORM") form = elt;
    if (form) {
      fire(form, "htmx:validation:validate", {});
      if (!form.checkValidity()) {
        form.reportValidity();
        fire(form, "htmx:validation:failed", {});
        fire(form, "htmx:validation:halted", {});
        return;
      }
    }
  }
  // Sync (resolve)
  var syncInfo = resolveSync(elt);
  var scope = syncInfo.scope;
  var mode = syncInfo.mode;
  if (mode) {
    var existing = syncMap.get(scope);
    if (existing) {
      if (mode === "drop") return;
      if (mode === "abort" || mode === "replace") {
        existing.abort();
      }
    }
  }
  var abortController = new AbortController();
  syncMap.set(scope, abortController);

  // Collect params
  var fd = extraParams || collectParams(elt, verb);
  var target = extraTarget || getTarget(elt);

  // Resolve headers
  var headers = {
    "HX-Request": "true",
    "HX-Current-URL": window.location.href,
    "HX-Target": target && target.id ? target.id : "",
    "HX-Trigger": elt.id || "",
    "HX-Trigger-Name": elt.name || ""
  };
  if (isBoosted) headers["HX-Boosted"] = "true";
  if (promptVal !== null) headers["HX-Prompt"] = promptVal;
  // hx-headers
  var hdrStr = getInheritedAttr(elt, "hx-headers");
  if (hdrStr) {
    try {
      var custom = JSON.parse(hdrStr);
      for (var k in custom) { if (custom.hasOwnProperty(k)) headers[k] = custom[k]; }
    } catch(e) { /* ignore */ }
  }
  // hx-request config
  var reqConf = getInheritedAttr(elt, "hx-request");
  var reqTimeout = config.timeout;
  var reqCreds = config.withCredentials;
  if (reqConf) {
    try {
      var rc = JSON.parse(reqConf);
      if (rc.timeout !== undefined) reqTimeout = rc.timeout;
      if (rc.credentials !== undefined) reqCreds = rc.credentials === "include" || rc.credentials === true;
    } catch(e3) { /* ignore */ }
  }

  // selfRequestsOnly check
  if (config.selfRequestsOnly) {
    try {
      var urlObj = new URL(url, window.location.href);
      if (urlObj.origin !== window.location.origin) {
        fire(elt, "htmx:sendError", {});
        return;
      }
    } catch(e4) { /* ignore */ }
  }

  var isGet = config.methodsThatUseUrlParams.indexOf(verb.toLowerCase()) >= 0;
  var encoding = getInheritedAttr(elt, "hx-encoding");
  var useMultipart = encoding === "multipart/form-data" || (!isGet && hasFileInput(elt));

  // configRequest event
  var cfgDetail = {verb: verb, path: url, headers: headers, parameters: {}, target: target, elt: elt};
  // convert fd to object for event
  fd.forEach(function(v, k) {
    if (cfgDetail.parameters[k] !== undefined) {
      if (!Array.isArray(cfgDetail.parameters[k])) cfgDetail.parameters[k] = [cfgDetail.parameters[k]];
      cfgDetail.parameters[k].push(v);
    } else {
      cfgDetail.parameters[k] = v;
    }
  });
  if (!fireWithExt(elt, "htmx:configRequest", cfgDetail)) return;
  // apply changes from configRequest
  headers = cfgDetail.headers;
  url = cfgDetail.path;
  verb = cfgDetail.verb;
  // Rebuild fd from parameters
  fd = new FormData();
  for (var pk in cfgDetail.parameters) {
    if (cfgDetail.parameters.hasOwnProperty(pk)) {
      var pv = cfgDetail.parameters[pk];
      if (Array.isArray(pv)) { for (var pi = 0; pi < pv.length; pi++) fd.append(pk, pv[pi]); }
      else fd.append(pk, pv);
    }
  }

  // Transform request via extensions
  var extNames = getActiveExtensions(elt);
  for (var ei = 0; ei < extNames.length; ei++) {
    var ext = registry[extNames[ei]];
    if (ext && ext.transformRequest) ext.transformRequest(headers, fd, elt);
  }

  // beforeRequest
  if (!fireWithExt(elt, "htmx:beforeRequest", {elt: elt, xhr: null, target: target, requestConfig: cfgDetail})) return;

  // Indicators
  var indicatorSel = getInheritedAttr(elt, "hx-indicator");
  var indicators = [];
  if (indicatorSel) {
    indicators = Array.prototype.slice.call(document.querySelectorAll(indicatorSel));
  } else {
    indicators = [elt];
  }
  for (var ii = 0; ii < indicators.length; ii++) indicators[ii].classList.add(config.indicatorClass);

  // hx-disabled-elt
  var disabledEltSel = getInheritedAttr(elt, "hx-disabled-elt");
  var disabledElts = [];
  if (disabledEltSel) {
    disabledElts = Array.prototype.slice.call(document.querySelectorAll(disabledEltSel));
    for (var di = 0; di < disabledElts.length; di++) disabledElts[di].disabled = true;
  }

  // Build URL
  if (isGet) {
    var qs = new URLSearchParams(fd).toString();
    if (qs) url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
    if (config.getCacheBusterParam) url += (url.indexOf("?") >= 0 ? "&" : "?") + "org.htmx.cache-buster=" + encodeURIComponent(new Date().valueOf());
  }

  // Swap spec
  var swapStr = getInheritedAttr(elt, "hx-swap") || config.defaultSwapStyle;
  var swapSpec = parseSwapSpec(swapStr);

  // Push/Replace URL
  var pushUrl = getInheritedAttr(elt, "hx-push-url");
  var replaceUrl = getInheritedAttr(elt, "hx-replace-url");

  // abort listener
  var abortHandler = function() { abortController.abort(); fire(elt, "htmx:xhr:abort", {}); };
  elt.addEventListener("htmx:abort", abortHandler, {once: true});

  // beforeSend
  fireWithExt(elt, "htmx:beforeSend", {elt: elt, xhr: null, target: target, requestConfig: cfgDetail});

  // Fetch
  var fetchOpts = {
    method: verb,
    headers: headers,
    signal: abortController.signal
  };
  if (reqCreds) fetchOpts.credentials = "include";
  if (!isGet) {
    if (useMultipart) {
      fetchOpts.body = fd;
    } else {
      fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      fetchOpts.body = new URLSearchParams(fd).toString();
    }
  }

  var timeoutId = null;
  if (reqTimeout > 0) {
    timeoutId = setTimeout(function() {
      abortController.abort();
      fire(elt, "htmx:timeout", {elt: elt});
    }, reqTimeout);
  }

  fetch(url, fetchOpts).then(function(resp) {
    if (timeoutId) clearTimeout(timeoutId);
    return resp.text().then(function(text) { return {status: resp.status, text: text, headers: resp.headers}; });
  }).then(function(result) {
    var status = result.status;
    var responseText = result.text;
    var respHeaders = result.headers;

    fireWithExt(elt, "htmx:afterRequest", {elt: elt, target: target, successful: status >= 200 && status < 300, xhr: {status: status, responseText: responseText}});

    // Check response headers for redirect/refresh first
    var hxRedirect = respHeaders.get("HX-Redirect");
    if (hxRedirect) { window.location.href = hxRedirect; return; }
    var hxRefresh = respHeaders.get("HX-Refresh");
    if (hxRefresh === "true") { window.location.reload(); return; }

    // HX-Location
    var hxLocation = respHeaders.get("HX-Location");
    if (hxLocation) {
      var locSpec;
      try { locSpec = JSON.parse(hxLocation); }
      catch(e) { locSpec = {path: hxLocation}; }
      var locTarget = locSpec.target ? document.querySelector(locSpec.target) : document.body;
      var locVerb = (locSpec.verb || "GET").toUpperCase();
      issueRequest(elt, locVerb, locSpec.path, null, locTarget, false);
      return;
    }

    // Response error
    if (status >= 400) {
      fire(elt, "htmx:responseError", {elt: elt, xhr: {status: status, responseText: responseText}});
    }

    // HX-Push-Url / HX-Replace-Url from server
    var serverPush = respHeaders.get("HX-Push-Url");
    var serverReplace = respHeaders.get("HX-Replace-Url");

    // HX-Retarget
    var retarget = respHeaders.get("HX-Retarget");
    if (retarget) target = document.querySelector(retarget) || target;

    // HX-Reswap
    var reswap = respHeaders.get("HX-Reswap");
    if (reswap) swapSpec = parseSwapSpec(reswap);

    // beforeSwap
    var shouldSwap = (status >= 200 && status < 300 && status !== 204);
    var bsDetail = {elt: elt, target: target, shouldSwap: shouldSwap, serverResponse: responseText, xhr: {status: status, responseText: responseText}};
    fire(elt, "htmx:beforeSwap", bsDetail);
    shouldSwap = bsDetail.shouldSwap;
    target = bsDetail.target || target;

    if (!shouldSwap) return;
    if (status === 204) return;

    // Transform response via extensions
    var html = responseText;
    var extNames2 = getActiveExtensions(elt);
    for (var ei2 = 0; ei2 < extNames2.length; ei2++) {
      var ext2 = registry[extNames2[ei2]];
      if (ext2 && ext2.transformResponse) html = ext2.transformResponse(html, null, elt);
    }

    updateTitle(html);

    // History
    var actualUrl = url.split("?")[0] || url;
    if (serverPush && serverPush !== "false") {
      saveHistory(window.location.href);
      history.pushState({htmx: true}, "", serverPush);
      fire(document.body, "htmx:pushedIntoHistory", {path: serverPush});
    } else if (serverReplace && serverReplace !== "false") {
      saveHistory(window.location.href);
      history.replaceState({htmx: true}, "", serverReplace);
      fire(document.body, "htmx:replacedInHistory", {path: serverReplace});
    } else if (pushUrl === "true" || (isBoosted && pushUrl !== "false")) {
      saveHistory(window.location.href);
      var pushPath = (pushUrl && pushUrl !== "true") ? pushUrl : url;
      history.pushState({htmx: true}, "", pushPath);
      fire(document.body, "htmx:pushedIntoHistory", {path: pushPath});
    } else if (pushUrl && pushUrl !== "false" && pushUrl !== "true") {
      saveHistory(window.location.href);
      history.pushState({htmx: true}, "", pushUrl);
      fire(document.body, "htmx:pushedIntoHistory", {path: pushUrl});
    } else if (replaceUrl === "true") {
      saveHistory(window.location.href);
      history.replaceState({htmx: true}, "", url);
      fire(document.body, "htmx:replacedInHistory", {path: url});
    } else if (replaceUrl && replaceUrl !== "false" && replaceUrl !== "true") {
      saveHistory(window.location.href);
      history.replaceState({htmx: true}, "", replaceUrl);
      fire(document.body, "htmx:replacedInHistory", {path: replaceUrl});
    }

    // Process select-oob
    var selectOob = getAttr(elt, "hx-select-oob");
    html = processSelectOOB(html, selectOob);

    // Process OOB swaps
    html = processOOB(html);

    // hx-select
    var selectSel = getAttr(elt, "hx-select");
    if (selectSel) {
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      var selected = tmp.querySelector(selectSel);
      html = selected ? selected.outerHTML : "";
    }

    // hx-preserve: save preserved elements
    var preserved = [];
    if (target) {
      var preserveElts = target.querySelectorAll("[hx-preserve][id]");
      for (var pi2 = 0; pi2 < preserveElts.length; pi2++) {
        preserved.push({id: preserveElts[pi2].id, node: preserveElts[pi2].cloneNode(true)});
      }
    }

    // Perform swap with optional transition
    var doActualSwap = function() {
      // track existing children for htmx-added
      var existingIds = new Set();
      if (target && swapSpec.swapStyle === "innerHTML") {
        for (var ci2 = 0; ci2 < target.children.length; ci2++) {
          existingIds.add(target.children[ci2]);
        }
      }

      target.classList.add(config.swappingClass);
      setTimeout(function() {
        doSwap(target, html, swapSpec.swapStyle);

        // Restore preserved elements
        for (var ri = 0; ri < preserved.length; ri++) {
          var placeholder = document.getElementById(preserved[ri].id);
          if (placeholder) placeholder.parentNode.replaceChild(preserved[ri].node, placeholder);
        }

        target.classList.remove(config.swappingClass);
        fireWithExt(elt, "htmx:afterSwap", {elt: elt, target: target});

        // HX-Trigger and HX-Trigger-After-Swap
        fireServerEvents(elt, respHeaders.get("HX-Trigger"));
        fireServerEvents(elt, respHeaders.get("HX-Trigger-After-Swap"));

        // Process new content
        processScripts(target);
        processNode(target);

        // Settle
        target.classList.add(config.settlingClass);
        // Add htmx-added to newly inserted children
        var newChildren = [];
        if (swapSpec.swapStyle === "innerHTML") {
          for (var nc = 0; nc < target.children.length; nc++) {
            if (!existingIds.has(target.children[nc])) {
              target.children[nc].classList.add(config.addedClass);
              newChildren.push(target.children[nc]);
            }
          }
        }

        setTimeout(function() {
          target.classList.remove(config.settlingClass);
          for (var rc = 0; rc < newChildren.length; rc++) newChildren[rc].classList.remove(config.addedClass);
          fireWithExt(elt, "htmx:afterSettle", {elt: elt, target: target});
          fireServerEvents(elt, respHeaders.get("HX-Trigger-After-Settle"));
          fire(target, "htmx:load", {elt: target});
          // Scroll
          if (swapSpec.scroll) {
            var scrollElt = swapSpec.scrollTarget ? document.querySelector(swapSpec.scrollTarget) : target;
            if (scrollElt) scrollElt.scrollTo({top: swapSpec.scroll === "top" ? 0 : scrollElt.scrollHeight, behavior: config.scrollBehavior});
          }
          if (swapSpec.show) {
            var showElt = swapSpec.showTarget ? document.querySelector(swapSpec.showTarget) : target;
            if (showElt) showElt.scrollIntoView({block: swapSpec.show === "top" ? "start" : "end", behavior: config.scrollBehavior});
          }
          if (isBoosted && config.scrollIntoViewOnBoost) {
            window.scrollTo({top: 0, behavior: config.scrollBehavior});
          }
          if (swapSpec.focusScroll) {
            var focused = target.querySelector("[autofocus]");
            if (focused) focused.focus();
          }
        }, swapSpec.settleDelay);
      }, swapSpec.swapDelay);
    };

    if (swapSpec.transition && document.startViewTransition) {
      document.startViewTransition(doActualSwap);
    } else {
      doActualSwap();
    }
  }).catch(function(err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err.name !== "AbortError") {
      fire(elt, "htmx:sendError", {elt: elt, error: err});
      fireWithExt(elt, "htmx:afterRequest", {elt: elt, target: target, successful: false});
    }
  }).finally(function() {
    // Clean up indicators
    for (var ii2 = 0; ii2 < indicators.length; ii2++) indicators[ii2].classList.remove(config.indicatorClass);
    // Re-enable disabled elements
    for (var di2 = 0; di2 < disabledElts.length; di2++) disabledElts[di2].disabled = false;
    // Clear sync
    if (syncMap.get(scope) === abortController) syncMap.delete(scope);
    elt.removeEventListener("htmx:abort", abortHandler);
  });
}

// Process node (C5, C9, Initialization)
function processNode(elt) {
  if (!elt || !elt.querySelectorAll) return;
  fire(elt, "htmx:beforeProcessNode", {elt: elt});
  // Check hx-disable
  if (elt.closest && elt.closest("[hx-disable]")) {
    fire(elt, "htmx:afterProcessNode", {elt: elt});
    return;
  }
  // Process each verb
  for (var vi = 0; vi < VERBS.length; vi++) {
    var verb = VERBS[vi];
    var sel = "[hx-" + verb + "]";
    // process elt itself if it has the attr
    if (elt.matches && elt.matches(sel)) attachTriggers(elt, verb);
    var elts = elt.querySelectorAll(sel);
    for (var i = 0; i < elts.length; i++) {
      if (!elts[i].closest("[hx-disable]")) attachTriggers(elts[i], verb);
    }
  }
  // Boost (C6)
  processBoost(elt);
  // hx-on (C9)
  processHxOn(elt);
  // SSE (C15)
  processSSE(elt);
  // WS (C15)
  processWS(elt);
  fire(elt, "htmx:afterProcessNode", {elt: elt});
}

function attachTriggers(elt, verb) {
  if (elt._htmxProcessed && elt._htmxProcessed[verb]) return;
  if (!elt._htmxProcessed) elt._htmxProcessed = {};
  elt._htmxProcessed[verb] = true;
  var url = getAttr(elt, "hx-" + verb);
  var triggerStr = getInheritedAttr(elt, "hx-trigger");
  var triggers = parseTriggers(elt, triggerStr);
  for (var i = 0; i < triggers.length; i++) {
    attachSingleTrigger(elt, verb, url, triggers[i]);
  }
}

function attachSingleTrigger(elt, verb, url, trigger) {
  var ev = trigger.event;
  var mods = trigger.modifiers;
  // Polling
  if (ev === "every") {
    var interval = setInterval(function() {
      if (!document.contains(elt)) { clearInterval(interval); return; }
      issueRequest(elt, verb, url);
    }, trigger.interval);
    return;
  }
  // Load
  if (ev === "load") {
    setTimeout(function() { issueRequest(elt, verb, url); }, mods.delay || 0);
    return;
  }
  // Revealed (IntersectionObserver)
  if (ev === "revealed") {
    var obs = new IntersectionObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          obs.unobserve(elt);
          issueRequest(elt, verb, url);
        }
      }
    });
    obs.observe(elt);
    return;
  }
  // Intersect
  if (ev === "intersect") {
    var opts = {};
    if (mods.root) opts.root = document.querySelector(mods.root);
    if (mods.threshold !== undefined) opts.threshold = mods.threshold;
    var obs2 = new IntersectionObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) issueRequest(elt, verb, url);
      }
    }, opts);
    obs2.observe(elt);
    return;
  }
  // Normal event
  var listenOn = mods.from ? resolveFromSelector(elt, mods.from) : elt;
  if (!listenOn) return;
  var fired = false;
  var lastVal = null;
  var throttleTimer = null;
  var delayTimer = null;
  var handler = function(evt) {
    // target filter
    if (mods.target && evt.target && !evt.target.matches(mods.target)) return;
    // filter expression
    if (mods.filter && config.allowEval) {
      try {
        var fn = new Function("event", "return (" + mods.filter + ")");
        if (!fn.call(elt, evt)) return;
      } catch(e) { return; }
    }
    // once
    if (mods.once && fired) return;
    // changed
    if (mods.changed) {
      var curVal = elt.value;
      if (curVal === lastVal) return;
      lastVal = curVal;
    }
    // consume
    if (mods.consume) { evt.preventDefault(); evt.stopPropagation(); }
    // submit -> preventDefault
    if (ev === "submit" || (elt.tagName === "FORM" && evt.type === "submit")) evt.preventDefault();

    var doRequest = function() {
      fired = true;
      issueRequest(elt, verb, url);
    };
    // throttle
    if (mods.throttle) {
      if (throttleTimer) return;
      doRequest();
      throttleTimer = setTimeout(function() { throttleTimer = null; }, mods.throttle);
      return;
    }
    // delay (debounce)
    if (mods.delay) {
      if (delayTimer) clearTimeout(delayTimer);
      delayTimer = setTimeout(doRequest, mods.delay);
      return;
    }
    // queue
    if (mods.queue) {
      var syncData = syncMap.get(elt);
      if (syncData) {
        if (mods.queue === "none") return;
        if (mods.queue === "first") return;
        // last and all: drop behave as replace
      }
    }
    doRequest();
  };
  listenOn.addEventListener(ev, handler);
}

// Boost (C6)
function processBoost(elt) {
  var boostElts = [];
  if (elt.matches && elt.matches("[hx-boost='true']")) boostElts.push(elt);
  var found = elt.querySelectorAll("[hx-boost='true']");
  for (var i = 0; i < found.length; i++) boostElts.push(found[i]);
  for (var b = 0; b < boostElts.length; b++) {
    boostLinks(boostElts[b]);
    boostForms(boostElts[b]);
  }
}

function boostLinks(container) {
  var links = container.tagName === "A" ? [container] : Array.prototype.slice.call(container.querySelectorAll("a"));
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    if (link._htmxBoosted) continue;
    // Check opt-out
    if (getInheritedAttr(link, "hx-boost") === "false") continue;
    link._htmxBoosted = true;
    link.addEventListener("click", function(evt) {
      // modifier keys bypass
      if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
      var href = this.getAttribute("href");
      if (!href || href === "" || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("javascript:") === 0) return;
      evt.preventDefault();
      var target = getTarget(this);
      if (!target) target = document.body;
      issueRequest(this, "GET", href, null, target, true);
    });
  }
}

function boostForms(container) {
  var forms = container.tagName === "FORM" ? [container] : Array.prototype.slice.call(container.querySelectorAll("form"));
  for (var i = 0; i < forms.length; i++) {
    var form = forms[i];
    if (form._htmxBoosted) continue;
    if (getInheritedAttr(form, "hx-boost") === "false") continue;
    form._htmxBoosted = true;
    form.addEventListener("submit", function(evt) {
      evt.preventDefault();
      var method = (this.method || "GET").toUpperCase();
      var action = this.action || window.location.href;
      var target = getTarget(this);
      if (!target) target = document.body;
      issueRequest(this, method, action, null, target, true);
    });
  }
}

// hx-on (C9)
function processHxOn(elt) {
  var processEl = function(el) {
    if (!el.attributes) return;
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr.name;
      if (name.indexOf("hx-on:") !== 0 && name.indexOf("hx-on::") !== 0) continue;
      if (!config.allowEval) continue;
      // Prevent duplicates
      if (!el._htmxOnHandlers) el._htmxOnHandlers = {};
      var key = name + "=" + attr.value;
      if (el._htmxOnHandlers[key]) continue;
      el._htmxOnHandlers[key] = true;
      var eventName;
      if (name.indexOf("hx-on::") === 0) {
        eventName = "htmx:" + name.slice(7);
      } else {
        eventName = name.slice(6);
      }
      var code = attr.value;
      (function(en, c, e) {
        e.addEventListener(en, function(event) {
          new Function("event", c).call(e, event);
        });
      })(eventName, code, el);
    }
  };
  processEl(elt);
  if (elt.querySelectorAll) {
    // query for elements with hx-on: prefix
    var all = elt.querySelectorAll("[hx-on\\:]");
    for (var i = 0; i < all.length; i++) processEl(all[i]);
    // Also check hx-on:: specifically
    var all2 = elt.querySelectorAll("[hx-on\\:\\:]");
    for (var j = 0; j < all2.length; j++) processEl(all2[j]);
  }
}

// SSE (C15)
function processSSE(elt) {
  var processEl = function(el) {
    if (el._htmxSSE) return;
    var url = getAttr(el, "sse-connect");
    if (!url) return;
    el._htmxSSE = true;
    var es = new EventSource(url);
    es.onopen = function() { fire(el, "htmx:sseOpen", {source: es}); };
    es.onerror = function() { fire(el, "htmx:sseError", {source: es}); };
    // close event
    var closeEvt = getAttr(el, "sse-close");
    if (closeEvt) {
      es.addEventListener(closeEvt, function() { es.close(); });
    }
    // Find sse-swap descendants
    var bindSwaps = function(container) {
      var swapElts = container.querySelectorAll("[sse-swap]");
      for (var i = 0; i < swapElts.length; i++) {
        (function(swapEl) {
          var eventName = getAttr(swapEl, "sse-swap");
          if (swapEl._htmxSSEBound && swapEl._htmxSSEBound[eventName]) return;
          if (!swapEl._htmxSSEBound) swapEl._htmxSSEBound = {};
          swapEl._htmxSSEBound[eventName] = true;
          es.addEventListener(eventName, function(e) {
            var html = e.data;
            html = processOOB(html);
            var target = getTarget(swapEl);
            if (!target) target = swapEl;
            var swapStr = getInheritedAttr(swapEl, "hx-swap") || config.defaultSwapStyle;
            var swapSpec = parseSwapSpec(swapStr);
            doSwap(target, html, swapSpec.swapStyle);
            processScripts(target);
            processNode(target);
          });
        })(swapElts[i]);
      }
    };
    bindSwaps(el);
    // MutationObserver for cleanup
    var mo = new MutationObserver(function() {
      if (!document.contains(el)) { es.close(); mo.disconnect(); }
    });
    mo.observe(document.body, {childList: true, subtree: true});
  };
  if (elt.matches && elt.matches("[sse-connect]")) processEl(elt);
  var sseElts = elt.querySelectorAll("[sse-connect]");
  for (var i = 0; i < sseElts.length; i++) processEl(sseElts[i]);
}

// WebSocket (C15)
function processWS(elt) {
  var processEl = function(el) {
    if (el._htmxWS) return;
    var url = getAttr(el, "ws-connect");
    if (!url) return;
    el._htmxWS = true;
    var backoff = 1000;
    var maxBackoff = 30000;
    var ws;
    var connect = function() {
      ws = new WebSocket(url);
      ws.onopen = function() { backoff = 1000; };
      ws.onmessage = function(e) {
        var html = e.data;
        html = processOOB(html);
        var target = el;
        var swapStr = getInheritedAttr(el, "hx-swap") || config.defaultSwapStyle;
        var swapSpec = parseSwapSpec(swapStr);
        doSwap(target, html, swapSpec.swapStyle);
        processScripts(target);
        processNode(target);
      };
      ws.onclose = function() {
        if (document.contains(el)) {
          setTimeout(function() {
            backoff = Math.min(backoff * 2, maxBackoff);
            connect();
          }, backoff);
        }
      };
      ws.onerror = function() { /* handled by onclose */ };
    };
    connect();
    // ws-send
    var sendElts = el.querySelectorAll("[ws-send]");
    for (var i = 0; i < sendElts.length; i++) {
      (function(sendEl) {
        if (sendEl._htmxWSSend) return;
        sendEl._htmxWSSend = true;
        var triggerStr = getInheritedAttr(sendEl, "hx-trigger");
        var triggers = parseTriggers(sendEl, triggerStr);
        var evName = triggers[0] ? triggers[0].event : "submit";
        sendEl.addEventListener(evName, function(evt) {
          if (evName === "submit") evt.preventDefault();
          var fd = collectParams(sendEl, "POST");
          var obj = {};
          fd.forEach(function(v, k) { obj[k] = v; });
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
        });
      })(sendElts[i]);
    }
    // MutationObserver for cleanup
    var mo = new MutationObserver(function() {
      if (!document.contains(el)) { ws.close(); mo.disconnect(); }
    });
    mo.observe(document.body, {childList: true, subtree: true});
  };
  if (elt.matches && elt.matches("[ws-connect]")) processEl(elt);
  var wsElts = elt.querySelectorAll("[ws-connect]");
  for (var i = 0; i < wsElts.length; i++) processEl(wsElts[i]);
}

// Indicator styles
function injectIndicatorStyles() {
  if (!config.includeIndicatorStyles) return;
  var style = document.createElement("style");
  style.textContent = ".htmx-indicator{opacity:0;transition:opacity 200ms ease-in;}.htmx-request .htmx-indicator,.htmx-request.htmx-indicator{opacity:1;}";
  document.head.appendChild(style);
}

// Init
function init() {
  // Load meta config
  var meta = document.querySelector("meta[name='htmx-config']");
  if (meta) {
    try {
      var mc = JSON.parse(meta.getAttribute("content"));
      for (var k in mc) { if (mc.hasOwnProperty(k)) config[k] = mc[k]; }
    } catch(e) { /* ignore */ }
  }
  // History popstate
  window.addEventListener("popstate", function(evt) {
    restoreHistory(window.location.href);
  });
  // Indicator styles
  injectIndicatorStyles();
  // Process body
  processNode(document.body);
}

// Public API (C10)
var htmx = {
  version: version,
  config: config,
  logger: null,
  process: processNode,
  find: function(a, b) {
    if (typeof a === "string") return document.querySelector(a);
    return a.querySelector(b);
  },
  findAll: function(a, b) {
    if (typeof a === "string") return Array.prototype.slice.call(document.querySelectorAll(a));
    return Array.prototype.slice.call(a.querySelectorAll(b));
  },
  closest: function(elt, sel) { return elt.closest(sel); },
  remove: function(elt) { elt.remove(); },
  addClass: function(elt, cls, delay) {
    if (delay) { setTimeout(function() { elt.classList.add(cls); }, parseInterval(delay)); }
    else elt.classList.add(cls);
  },
  removeClass: function(elt, cls, delay) {
    if (delay) { setTimeout(function() { elt.classList.remove(cls); }, parseInterval(delay)); }
    else elt.classList.remove(cls);
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
    var spec = parseSwapSpec(swapSpec || config.defaultSwapStyle);
    html = processOOB(html);
    doSwap(target, html, spec.swapStyle);
    processScripts(target);
    processNode(target);
  },
  values: function(elt) {
    var fd = collectParams(elt, "GET");
    var obj = {};
    fd.forEach(function(v, k) { obj[k] = v; });
    return obj;
  },
  on: function(a, b, c) {
    if (typeof a === "string") { document.body.addEventListener(a, b); return; }
    a.addEventListener(b, c);
  },
  off: function(a, b, c) {
    if (typeof a === "string") { document.body.removeEventListener(a, b); return; }
    a.removeEventListener(b, c);
  },
  ajax: function(verb, url, spec) {
    var target = document.body;
    var source = document.body;
    if (typeof spec === "string") {
      target = document.querySelector(spec) || document.body;
      source = target;
    } else if (spec && spec.nodeType) {
      target = spec;
      source = spec;
    } else if (spec) {
      if (spec.target) target = typeof spec.target === "string" ? document.querySelector(spec.target) : spec.target;
      if (spec.source) source = typeof spec.source === "string" ? document.querySelector(spec.source) : spec.source;
    }
    issueRequest(source || document.body, verb, url, null, target || document.body, false);
  },
  defineExtension: function(name, def) {
    registry[name] = def;
    if (def.init) def.init({config: config});
  },
  removeExtension: function(name) { delete registry[name]; },
  parseInterval: parseInterval,
  logAll: function() {
    logger = function(elt, evt, detail) { console.log(evt, elt, detail); };
  },
  logNone: function() { logger = null; },
  _: {
    fire: fire,
    getAttr: getAttr,
    resolveTarget: resolveTarget,
    doSwap: doSwap,
    processScripts: processScripts
  }
};

// Make logger a property
Object.defineProperty(htmx, "logger", {
  get: function() { return logger; },
  set: function(v) { logger = v; },
  enumerable: true,
  configurable: true
});

window.htmx = htmx;

// Boot
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();
