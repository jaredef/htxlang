/**
 * htmx-fresh-derivation.js
 * Derived from HTMX-SEED.md constraint specification (C1-C19).
 * Drop-in replacement for htmx 2.x — same hx-* attribute namespace.
 * ES5-compatible IIFE, attaches window.htmx.
 */
(function() {
  "use strict";

  // =========================================================================
  // C11 — Runtime Configuration
  // =========================================================================
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

  // =========================================================================
  // Internal state
  // =========================================================================
  var extensions = {};
  var historyCache = [];
  var VERBS = ["get", "post", "put", "patch", "delete"];
  var internalData = new WeakMap();

  function getInternalData(elt) {
    var d = internalData.get(elt);
    if (!d) {
      d = {};
      internalData.set(elt, d);
    }
    return d;
  }

  // =========================================================================
  // Utility functions
  // =========================================================================

  function parseInterval(str) {
    if (!str) return 0;
    if (typeof str === "number") return str;
    str = String(str).trim();
    if (/ms$/.test(str)) return parseFloat(str);
    if (/s$/.test(str)) return parseFloat(str) * 1000;
    if (/m$/.test(str)) return parseFloat(str) * 60000;
    return parseFloat(str);
  }

  function matches(elt, selector) {
    var fn = elt.matches || elt.msMatchesSelector || elt.mozMatchesSelector || elt.webkitMatchesSelector;
    return fn ? fn.call(elt, selector) : false;
  }

  function closest(elt, selector) {
    if (elt.closest) return elt.closest(selector);
    while (elt) {
      if (matches(elt, selector)) return elt;
      elt = elt.parentElement;
    }
    return null;
  }

  function triggerEvent(elt, name, detail) {
    detail = detail || {};
    var evt = new CustomEvent(name, {
      bubbles: true,
      cancelable: true,
      detail: detail
    });
    return elt.dispatchEvent(evt);
  }

  function triggerErrorEvent(elt, name, detail) {
    triggerEvent(elt, name, detail);
  }

  // C16 — invoke extension hooks for an element
  function callExtensionHook(hookName, args, elt) {
    var activeExts = getActiveExtensions(elt);
    for (var i = 0; i < activeExts.length; i++) {
      var ext = activeExts[i];
      if (ext && typeof ext[hookName] === "function") {
        ext[hookName].apply(ext, args);
      }
    }
  }

  function getActiveExtensions(elt) {
    var result = [];
    var seen = {};
    var current = elt;
    while (current) {
      var extAttr = current.getAttribute ? current.getAttribute("hx-ext") : null;
      if (extAttr) {
        var parts = extAttr.split(",");
        for (var i = 0; i < parts.length; i++) {
          var name = parts[i].trim();
          if (name.indexOf("ignore:") === 0) {
            seen[name.substring(7).trim()] = true;
          } else if (!seen[name] && extensions[name]) {
            seen[name] = true;
            result.push(extensions[name]);
          }
        }
      }
      current = current.parentElement;
    }
    return result;
  }

  function dispatchWithExtensions(elt, name, detail) {
    var activeExts = getActiveExtensions(elt);
    for (var i = 0; i < activeExts.length; i++) {
      var ext = activeExts[i];
      if (ext && typeof ext.onEvent === "function") {
        ext.onEvent(name, { detail: detail, target: elt });
      }
    }
    return triggerEvent(elt, name, detail);
  }

  // =========================================================================
  // C18 — Attribute inheritance with disinherit
  // =========================================================================
  function getClosestAttributeValue(elt, attr) {
    var current = elt;
    while (current) {
      var val = current.getAttribute ? current.getAttribute(attr) : null;
      if (val !== null && val !== undefined) return val;
      // Check disinherit on parent
      var parent = current.parentElement;
      if (parent) {
        var disinherit = parent.getAttribute ? parent.getAttribute("hx-disinherit") : null;
        if (disinherit) {
          if (disinherit === "*") return null;
          var parts = disinherit.split(/\s+/);
          for (var i = 0; i < parts.length; i++) {
            if (parts[i] === attr) return null;
          }
        }
      }
      current = parent;
    }
    return null;
  }

  function getAttributeValue(elt, attr) {
    return elt.getAttribute ? elt.getAttribute(attr) : null;
  }

  // =========================================================================
  // C4 — Target resolution
  // =========================================================================
  function resolveTarget(elt, targetStr) {
    if (!targetStr) return elt;
    targetStr = targetStr.trim();
    if (targetStr === "this") return elt;
    if (targetStr.indexOf("closest ") === 0) {
      return closest(elt, targetStr.substring(8).trim());
    }
    if (targetStr.indexOf("find ") === 0) {
      return elt.querySelector(targetStr.substring(5).trim());
    }
    if (targetStr.indexOf("next ") === 0) {
      var sel = targetStr.substring(5).trim();
      var sibling = elt.nextElementSibling;
      while (sibling) {
        if (matches(sibling, sel)) return sibling;
        sibling = sibling.nextElementSibling;
      }
      return null;
    }
    if (targetStr.indexOf("previous ") === 0) {
      var sel2 = targetStr.substring(9).trim();
      var prev = elt.previousElementSibling;
      while (prev) {
        if (matches(prev, sel2)) return prev;
        prev = prev.previousElementSibling;
      }
      return null;
    }
    return document.querySelector(targetStr);
  }

  // =========================================================================
  // C3 — Swap spec parsing
  // =========================================================================
  function parseSwapSpec(str) {
    var spec = {
      swapStyle: config.defaultSwapStyle,
      swapDelay: config.defaultSwapDelay,
      settleDelay: config.defaultSettleDelay,
      scroll: null,
      scrollTarget: null,
      show: null,
      showTarget: null,
      focusScroll: config.defaultFocusScroll,
      transition: config.globalViewTransitions
    };
    if (!str) return spec;
    var parts = str.split(/\s+/);
    if (parts[0]) {
      spec.swapStyle = parts[0];
    }
    for (var i = 1; i < parts.length; i++) {
      var mod = parts[i];
      if (mod.indexOf("swap:") === 0) {
        spec.swapDelay = parseInterval(mod.substring(5));
      } else if (mod.indexOf("settle:") === 0) {
        spec.settleDelay = parseInterval(mod.substring(7));
      } else if (mod.indexOf("scroll:") === 0) {
        spec.scroll = mod.substring(7);
      } else if (mod.indexOf("show:") === 0) {
        spec.show = mod.substring(5);
      } else if (mod.indexOf("focus-scroll:") === 0) {
        spec.focusScroll = mod.substring(13) === "true";
      } else if (mod.indexOf("transition:") === 0) {
        spec.transition = mod.substring(11) === "true";
      }
    }
    return spec;
  }

  // =========================================================================
  // C3 — DOM swap implementation
  // =========================================================================
  function doSwap(target, html, swapSpec) {
    if (!target) return;
    var style = swapSpec.swapStyle || config.defaultSwapStyle;
    var newChildren = [];
    var tempDiv;

    switch (style) {
      case "innerHTML":
        tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        newChildren = copyChildArray(tempDiv);
        target.innerHTML = "";
        for (var i = 0; i < newChildren.length; i++) {
          target.appendChild(newChildren[i]);
        }
        break;

      case "outerHTML":
        tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        newChildren = copyChildArray(tempDiv);
        var parent = target.parentElement;
        if (parent) {
          for (var j = 0; j < newChildren.length; j++) {
            parent.insertBefore(newChildren[j], target);
          }
          parent.removeChild(target);
        }
        break;

      case "beforebegin":
        tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        newChildren = copyChildArray(tempDiv);
        if (target.parentElement) {
          for (var k = 0; k < newChildren.length; k++) {
            target.parentElement.insertBefore(newChildren[k], target);
          }
        }
        break;

      case "afterbegin":
        tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        newChildren = copyChildArray(tempDiv);
        var firstChild = target.firstChild;
        for (var m = newChildren.length - 1; m >= 0; m--) {
          target.insertBefore(newChildren[m], firstChild);
          firstChild = newChildren[m];
        }
        break;

      case "beforeend":
        tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        newChildren = copyChildArray(tempDiv);
        for (var n = 0; n < newChildren.length; n++) {
          target.appendChild(newChildren[n]);
        }
        break;

      case "afterend":
        tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        newChildren = copyChildArray(tempDiv);
        var nextSib = target.nextSibling;
        for (var p = 0; p < newChildren.length; p++) {
          target.parentElement.insertBefore(newChildren[p], nextSib);
        }
        break;

      case "delete":
        if (target.parentElement) {
          target.parentElement.removeChild(target);
        }
        return [];

      case "none":
        return [];
    }

    return newChildren;
  }

  function copyChildArray(el) {
    var arr = [];
    var child = el.firstChild;
    while (child) {
      arr.push(child);
      child = child.nextSibling;
    }
    return arr;
  }

  // =========================================================================
  // C9 — Script evaluation
  // =========================================================================
  function processScripts(elt) {
    if (!config.allowScriptTags) return;
    var scripts = elt.querySelectorAll ? elt.querySelectorAll("script") : [];
    for (var i = 0; i < scripts.length; i++) {
      var oldScript = scripts[i];
      var newScript = document.createElement("script");
      var attrs = oldScript.attributes;
      for (var j = 0; j < attrs.length; j++) {
        newScript.setAttribute(attrs[j].name, attrs[j].value);
      }
      newScript.textContent = oldScript.textContent;
      if (config.inlineScriptNonce) {
        newScript.setAttribute("nonce", config.inlineScriptNonce);
      }
      oldScript.parentElement.replaceChild(newScript, oldScript);
    }
  }

  // =========================================================================
  // C7 — Title extraction
  // =========================================================================
  function updateTitle(html) {
    var match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (match) {
      document.title = match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    }
  }

  // =========================================================================
  // C7 — Server trigger headers
  // =========================================================================
  function handleTriggerHeader(xhr, headerName, elt) {
    var val = xhr.getResponseHeader(headerName);
    if (!val) return;
    val = val.trim();
    if (val.charAt(0) === "{") {
      try {
        var triggers = JSON.parse(val);
        for (var eventName in triggers) {
          if (triggers.hasOwnProperty(eventName)) {
            triggerEvent(elt, eventName, triggers[eventName]);
          }
        }
      } catch (e) {
        // If JSON parse fails, treat as comma-separated names
        var names = val.split(",");
        for (var i = 0; i < names.length; i++) {
          triggerEvent(elt, names[i].trim(), {});
        }
      }
    } else {
      var names2 = val.split(",");
      for (var j = 0; j < names2.length; j++) {
        triggerEvent(elt, names2[j].trim(), {});
      }
    }
  }

  // =========================================================================
  // C8 — Out-of-band swaps
  // =========================================================================
  function processOobSwaps(tempDiv, settleInfo) {
    var oobElements = tempDiv.querySelectorAll("[hx-swap-oob], [data-hx-swap-oob]");
    var toRemove = [];
    for (var i = 0; i < oobElements.length; i++) {
      var oob = oobElements[i];
      toRemove.push(oob);
      var oobVal = oob.getAttribute("hx-swap-oob") || oob.getAttribute("data-hx-swap-oob") || "true";
      var strategy = "outerHTML";
      var targetSelector = null;

      if (oobVal === "true") {
        strategy = "outerHTML";
      } else if (oobVal.indexOf(":") > -1) {
        var colonIdx = oobVal.indexOf(":");
        strategy = oobVal.substring(0, colonIdx).trim();
        targetSelector = oobVal.substring(colonIdx + 1).trim();
      } else {
        strategy = oobVal;
      }

      var targetElt;
      if (targetSelector) {
        targetElt = document.querySelector(targetSelector);
      } else {
        targetElt = document.getElementById(oob.id);
      }

      if (!targetElt) {
        triggerEvent(document.body, "htmx:oobErrorNoTarget", { content: oob });
        continue;
      }

      triggerEvent(targetElt, "htmx:oobBeforeSwap", { content: oob, target: targetElt });

      oob.removeAttribute("hx-swap-oob");
      oob.removeAttribute("data-hx-swap-oob");

      if (strategy === "outerHTML") {
        doSwap(targetElt, oob.outerHTML, { swapStyle: "outerHTML" });
      } else {
        // For non-outerHTML strategies, use the OOB element's inner content
        doSwap(targetElt, oob.innerHTML, { swapStyle: strategy });
      }

      triggerEvent(targetElt, "htmx:oobAfterSwap", { content: oob, target: targetElt });
    }

    // Remove OOB elements from the primary content
    for (var j = 0; j < toRemove.length; j++) {
      if (toRemove[j].parentElement) {
        toRemove[j].parentElement.removeChild(toRemove[j]);
      }
    }
  }

  // C8 — hx-select-oob
  function processSelectOob(responseHtml, elt) {
    var selectOob = getAttributeValue(elt, "hx-select-oob") || getClosestAttributeValue(elt, "hx-select-oob");
    if (!selectOob) return;
    var tempDiv = document.createElement("div");
    tempDiv.innerHTML = responseHtml;
    var pairs = selectOob.split(",");
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].trim();
      var colonIdx = pair.indexOf(":");
      if (colonIdx === -1) continue;
      var srcSel = pair.substring(0, colonIdx).trim();
      var tgtSel = pair.substring(colonIdx + 1).trim();
      var srcElt = tempDiv.querySelector(srcSel);
      var tgtElt = document.querySelector(tgtSel);
      if (srcElt && tgtElt) {
        doSwap(tgtElt, srcElt.innerHTML, { swapStyle: "innerHTML" });
        processNode(tgtElt);
      }
    }
  }

  // C8 — hx-preserve
  function savePreserved(target) {
    var preserved = target.querySelectorAll ? target.querySelectorAll("[hx-preserve][id], [data-hx-preserve][id]") : [];
    var map = {};
    for (var i = 0; i < preserved.length; i++) {
      map[preserved[i].id] = preserved[i].cloneNode(true);
    }
    return map;
  }

  function restorePreserved(target, map) {
    for (var id in map) {
      if (map.hasOwnProperty(id)) {
        var existing = document.getElementById(id);
        if (existing && existing.parentElement) {
          existing.parentElement.replaceChild(map[id], existing);
        }
      }
    }
  }

  // =========================================================================
  // C5 — Trigger parsing
  // =========================================================================
  function getDefaultTrigger(elt) {
    var tag = elt.tagName;
    if (tag === "FORM") return "submit";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "change";
    return "click";
  }

  function parseTriggers(triggerStr, elt) {
    if (!triggerStr) {
      return [{ event: getDefaultTrigger(elt), modifiers: {} }];
    }
    var triggers = [];
    var parts = triggerStr.split(",");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var trigger = parseSingleTrigger(part);
      triggers.push(trigger);
    }
    return triggers;
  }

  function parseSingleTrigger(str) {
    var result = {
      event: null,
      modifiers: {},
      filter: null,
      pollInterval: null,
      sseEvent: null
    };
    var tokens = str.trim().split(/\s+/);
    var idx = 0;

    // Check for "every Ns" polling
    if (tokens[0] === "every" && tokens.length >= 2) {
      result.event = "every";
      result.pollInterval = parseInterval(tokens[1]);
      idx = 2;
    } else {
      var eventToken = tokens[0];
      // Check for filter expression [expr]
      var bracketIdx = eventToken.indexOf("[");
      if (bracketIdx > -1) {
        result.event = eventToken.substring(0, bracketIdx);
        var closeBracket = str.indexOf("]");
        if (closeBracket > -1) {
          result.filter = str.substring(str.indexOf("[") + 1, closeBracket);
        }
      } else {
        result.event = eventToken;
      }
      idx = 1;
    }

    // Parse modifiers
    for (var i = idx; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok === "once") {
        result.modifiers.once = true;
      } else if (tok === "changed") {
        result.modifiers.changed = true;
      } else if (tok === "consume") {
        result.modifiers.consume = true;
      } else if (tok.indexOf("delay:") === 0) {
        result.modifiers.delay = parseInterval(tok.substring(6));
      } else if (tok.indexOf("throttle:") === 0) {
        result.modifiers.throttle = parseInterval(tok.substring(9));
      } else if (tok.indexOf("from:") === 0) {
        result.modifiers.from = tok.substring(5);
      } else if (tok.indexOf("target:") === 0) {
        result.modifiers.target = tok.substring(7);
      } else if (tok.indexOf("queue:") === 0) {
        result.modifiers.queue = tok.substring(6);
      } else if (tok.indexOf("root:") === 0) {
        result.modifiers.root = tok.substring(5);
      } else if (tok.indexOf("threshold:") === 0) {
        result.modifiers.threshold = parseFloat(tok.substring(10));
      }
    }

    return result;
  }

  // =========================================================================
  // C5 — from: resolver for triggers
  // =========================================================================
  function resolveFromTarget(elt, fromStr) {
    if (!fromStr) return elt;
    if (fromStr === "document") return document;
    if (fromStr === "window") return window;
    if (fromStr === "body") return document.body;
    if (fromStr.indexOf("closest ") === 0) {
      return closest(elt, fromStr.substring(8).trim());
    }
    if (fromStr.indexOf("find ") === 0) {
      return elt.querySelector(fromStr.substring(5).trim());
    }
    if (fromStr.indexOf("next ") === 0) {
      var sel = fromStr.substring(5).trim();
      var sib = elt.nextElementSibling;
      while (sib) {
        if (matches(sib, sel)) return sib;
        sib = sib.nextElementSibling;
      }
      return null;
    }
    if (fromStr.indexOf("previous ") === 0) {
      var sel2 = fromStr.substring(9).trim();
      var prev = elt.previousElementSibling;
      while (prev) {
        if (matches(prev, sel2)) return prev;
        prev = prev.previousElementSibling;
      }
      return null;
    }
    return document.querySelector(fromStr);
  }

  // =========================================================================
  // C13 — Composable parameters
  // =========================================================================
  function getInputValues(elt) {
    var values = {};

    // If elt is inside a form, serialize the form
    var form = null;
    if (elt.tagName === "FORM") {
      form = elt;
    } else {
      form = closest(elt, "form");
    }

    if (form) {
      var formData = new FormData(form);
      formData.forEach(function(value, key) {
        if (values.hasOwnProperty(key)) {
          if (!Array.isArray(values[key])) {
            values[key] = [values[key]];
          }
          values[key].push(value);
        } else {
          values[key] = value;
        }
      });
    }

    // Include the element's own name/value if it has them
    if (elt.name && elt.value !== undefined && elt.tagName !== "FORM") {
      values[elt.name] = elt.value;
    }

    return values;
  }

  function mergeIncludeValues(elt, values) {
    var include = getClosestAttributeValue(elt, "hx-include");
    if (!include) return;
    var targets = [];
    if (include.indexOf("closest ") === 0 || include.indexOf("find ") === 0 ||
        include.indexOf("next ") === 0 || include.indexOf("previous ") === 0 ||
        include === "this") {
      var t = resolveTarget(elt, include);
      if (t) targets.push(t);
    } else {
      var elts = document.querySelectorAll(include);
      for (var i = 0; i < elts.length; i++) {
        targets.push(elts[i]);
      }
    }
    for (var j = 0; j < targets.length; j++) {
      var t2 = targets[j];
      if (t2.tagName === "FORM") {
        var fd = new FormData(t2);
        fd.forEach(function(val, key) {
          values[key] = val;
        });
      } else if (t2.name) {
        values[t2.name] = t2.value;
      } else {
        // It may be a container — gather inputs inside it
        var inputs = t2.querySelectorAll("input[name], select[name], textarea[name]");
        for (var k = 0; k < inputs.length; k++) {
          var inp = inputs[k];
          if (inp.name) {
            if (inp.type === "checkbox" || inp.type === "radio") {
              if (inp.checked) values[inp.name] = inp.value;
            } else {
              values[inp.name] = inp.value;
            }
          }
        }
      }
    }
  }

  function mergeHxVals(elt, values) {
    var valsStr = getClosestAttributeValue(elt, "hx-vals");
    if (!valsStr) return;
    valsStr = valsStr.trim();
    if (valsStr.indexOf("js:") === 0 && config.allowEval) {
      try {
        var jsVals = new Function("return (" + valsStr.substring(3) + ")")();
        for (var k in jsVals) {
          if (jsVals.hasOwnProperty(k)) values[k] = jsVals[k];
        }
      } catch (e) { /* ignore */ }
    } else {
      try {
        var parsed = JSON.parse(valsStr);
        for (var k2 in parsed) {
          if (parsed.hasOwnProperty(k2)) values[k2] = parsed[k2];
        }
      } catch (e) { /* ignore */ }
    }
  }

  function filterParams(elt, values) {
    var paramsAttr = getClosestAttributeValue(elt, "hx-params");
    if (!paramsAttr || paramsAttr === "*") return values;
    if (paramsAttr === "none") return {};
    if (paramsAttr.indexOf("not ") === 0) {
      var excluded = paramsAttr.substring(4).split(",");
      for (var i = 0; i < excluded.length; i++) {
        delete values[excluded[i].trim()];
      }
      return values;
    }
    // Positive list
    var included = paramsAttr.split(",");
    var result = {};
    for (var j = 0; j < included.length; j++) {
      var name = included[j].trim();
      if (values.hasOwnProperty(name)) {
        result[name] = values[name];
      }
    }
    return result;
  }

  function hasFileInput(elt) {
    var form = elt.tagName === "FORM" ? elt : closest(elt, "form");
    if (!form) return false;
    return form.querySelector('input[type="file"]') !== null;
  }

  // =========================================================================
  // C2 — Encode parameters
  // =========================================================================
  function encodeParams(values) {
    var parts = [];
    for (var key in values) {
      if (values.hasOwnProperty(key)) {
        var val = values[key];
        if (Array.isArray(val)) {
          for (var i = 0; i < val.length; i++) {
            parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val[i]));
          }
        } else {
          parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
        }
      }
    }
    return parts.join("&");
  }

  // =========================================================================
  // C19 — Request configuration
  // =========================================================================
  function getRequestConfig(elt) {
    var reqConf = { timeout: config.timeout, credentials: config.withCredentials };
    var reqAttr = getClosestAttributeValue(elt, "hx-request");
    if (reqAttr) {
      try {
        var parsed = JSON.parse(reqAttr);
        if (parsed.timeout !== undefined) reqConf.timeout = parsed.timeout;
        if (parsed.credentials !== undefined) {
          reqConf.credentials = parsed.credentials === "include" || parsed.credentials === true;
        }
      } catch (e) { /* ignore */ }
    }
    return reqConf;
  }

  // =========================================================================
  // Sync (hx-sync)
  // =========================================================================
  function getSyncStrategy(elt) {
    var syncAttr = getClosestAttributeValue(elt, "hx-sync");
    if (!syncAttr) return null;
    var parts = syncAttr.trim().split(":");
    if (parts.length === 1) {
      return { mode: parts[0].trim() };
    }
    return { mode: parts[0].trim(), queue: parts[1] ? parts[1].trim() : null };
  }

  // =========================================================================
  // Indicator management
  // =========================================================================
  function addIndicatorClass(elt) {
    var indicatorSel = getClosestAttributeValue(elt, "hx-indicator");
    var targets = [];
    if (indicatorSel) {
      targets = toArray(document.querySelectorAll(indicatorSel));
    }
    targets.push(elt);
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.add(config.indicatorClass);
    }
    return targets;
  }

  function removeIndicatorClass(targets) {
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.remove(config.indicatorClass);
    }
  }

  function toArray(nodeList) {
    var arr = [];
    for (var i = 0; i < nodeList.length; i++) {
      arr.push(nodeList[i]);
    }
    return arr;
  }

  // =========================================================================
  // C1, C2, C7, C13, C14 — Core request issuing
  // =========================================================================
  function issueRequest(elt, verb, url, eventOrSource, extraParams) {
    verb = verb.toLowerCase();
    var source = elt;

    // C19 — hx-disable check
    if (closest(elt, "[hx-disable], [data-hx-disable]")) return;

    // C14 — htmx:confirm
    var confirmAttr = getClosestAttributeValue(elt, "hx-confirm");
    if (confirmAttr) {
      var confirmEvent = triggerEvent(elt, "htmx:confirm", {
        question: confirmAttr,
        triggeringEvent: eventOrSource
      });
      if (!confirmEvent) return;
      if (!confirm(confirmAttr)) return;
    }

    // C13 — hx-prompt
    var promptAttr = getClosestAttributeValue(elt, "hx-prompt");
    var promptValue = null;
    if (promptAttr) {
      promptValue = prompt(promptAttr);
      if (promptValue === null) return;
    }

    // C17 — Form validation
    var validateAttr = getClosestAttributeValue(elt, "hx-validate");
    if (validateAttr === "true") {
      var form = elt.tagName === "FORM" ? elt : closest(elt, "form");
      if (form) {
        triggerEvent(form, "htmx:validation:validate");
        if (!form.checkValidity()) {
          form.reportValidity();
          triggerEvent(form, "htmx:validation:failed");
          triggerEvent(form, "htmx:validation:halted");
          return;
        }
      }
    }

    // C13 — Gather parameters
    var values = getInputValues(elt);
    mergeIncludeValues(elt, values);
    mergeHxVals(elt, values);
    if (extraParams) {
      for (var ep in extraParams) {
        if (extraParams.hasOwnProperty(ep)) values[ep] = extraParams[ep];
      }
    }
    values = filterParams(elt, values);

    // Resolve target
    var targetStr = getClosestAttributeValue(elt, "hx-target");
    var target = resolveTarget(elt, targetStr);
    if (!target) target = elt;

    // Resolve swap spec
    var swapStr = getClosestAttributeValue(elt, "hx-swap");
    var swapSpec = parseSwapSpec(swapStr);

    // Check for multipart encoding
    var encoding = getClosestAttributeValue(elt, "hx-encoding");
    var useMultipart = encoding === "multipart/form-data" || hasFileInput(elt);

    // Build headers
    var headers = {
      "HX-Request": "true",
      "HX-Current-URL": window.location.href,
      "HX-Target": target.id || "",
      "HX-Trigger": elt.id || "",
      "HX-Trigger-Name": elt.getAttribute("name") || ""
    };

    // C6 — boosted header
    var isBoosted = getClosestAttributeValue(elt, "hx-boost") === "true";
    if (isBoosted) {
      headers["HX-Boosted"] = "true";
    }

    // C13 — prompt header
    if (promptValue !== null) {
      headers["HX-Prompt"] = promptValue;
    }

    // C14 — configRequest event
    var configRequestDetail = {
      headers: headers,
      parameters: values,
      target: target,
      verb: verb,
      elt: elt,
      path: url,
      triggeringEvent: eventOrSource
    };
    var configAllowed = dispatchWithExtensions(elt, "htmx:configRequest", configRequestDetail);
    if (!configAllowed) return;

    // Update from event handler modifications
    headers = configRequestDetail.headers;
    values = configRequestDetail.parameters;
    url = configRequestDetail.path;

    // C19 — self-requests-only check
    if (config.selfRequestsOnly) {
      try {
        var urlObj = new URL(url, window.location.href);
        if (urlObj.origin !== window.location.origin) {
          triggerErrorEvent(elt, "htmx:sendError", { error: "Cross-origin request blocked" });
          return;
        }
      } catch (e) { /* relative URLs are fine */ }
    }

    // C14 — beforeRequest event
    var beforeRequestAllowed = dispatchWithExtensions(elt, "htmx:beforeRequest", {
      elt: elt, target: target, requestConfig: configRequestDetail
    });
    if (!beforeRequestAllowed) {
      triggerEvent(elt, "htmx:afterRequest", { elt: elt, target: target, successful: false });
      return;
    }

    // Add indicator class
    var indicatorTargets = addIndicatorClass(elt);

    // Internal data for sync/abort
    var data = getInternalData(elt);

    // Sync handling
    var syncStrategy = getSyncStrategy(elt);
    if (syncStrategy) {
      if (syncStrategy.mode === "drop" && data.xhr) {
        removeIndicatorClass(indicatorTargets);
        return;
      }
      if ((syncStrategy.mode === "abort" || syncStrategy.mode === "replace") && data.xhr) {
        data.xhr.abort();
      }
    }

    // Build URL with params for GET-like methods
    var useUrlParams = config.methodsThatUseUrlParams.indexOf(verb) > -1;
    var body = null;

    if (useUrlParams) {
      var qs = encodeParams(values);
      if (qs) {
        url += (url.indexOf("?") > -1 ? "&" : "?") + qs;
      }
      if (config.getCacheBusterParam) {
        url += (url.indexOf("?") > -1 ? "&" : "?") + "org.htmx.cache-buster=" + encodeURIComponent(target.id || "true");
      }
    } else {
      if (useMultipart) {
        var fd = new FormData();
        for (var key in values) {
          if (values.hasOwnProperty(key)) {
            fd.append(key, values[key]);
          }
        }
        // Also append file inputs
        var form2 = elt.tagName === "FORM" ? elt : closest(elt, "form");
        if (form2) {
          var fileInputs = form2.querySelectorAll('input[type="file"]');
          for (var fi = 0; fi < fileInputs.length; fi++) {
            var files = fileInputs[fi].files;
            for (var fj = 0; fj < files.length; fj++) {
              fd.append(fileInputs[fi].name, files[fj]);
            }
          }
        }
        body = fd;
      } else {
        body = encodeParams(values);
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    }

    // C16 — transformRequest extension hook
    callExtensionHook("transformRequest", [headers, values, elt], elt);

    // Make the request
    var xhr = new XMLHttpRequest();
    data.xhr = xhr;
    xhr.open(verb.toUpperCase(), url, true);

    // Set headers
    for (var h in headers) {
      if (headers.hasOwnProperty(h)) {
        xhr.setRequestHeader(h, headers[h]);
      }
    }

    // C19 — Request config
    var reqConf = getRequestConfig(elt);
    if (reqConf.credentials) {
      xhr.withCredentials = true;
    }
    if (reqConf.timeout) {
      xhr.timeout = reqConf.timeout;
    }

    // Abort listener (C14)
    var abortHandler = function() {
      xhr.abort();
      triggerEvent(elt, "htmx:xhr:abort", {});
    };
    elt.addEventListener("htmx:abort", abortHandler);

    // C14 — beforeSend
    dispatchWithExtensions(elt, "htmx:beforeSend", { xhr: xhr, target: target, requestConfig: configRequestDetail });

    xhr.onload = function() {
      // Cleanup
      elt.removeEventListener("htmx:abort", abortHandler);
      data.xhr = null;

      var status = xhr.status;
      var responseHtml = xhr.responseText;

      // C16 — transformResponse extension hook
      var activeExts = getActiveExtensions(elt);
      for (var ei = 0; ei < activeExts.length; ei++) {
        if (typeof activeExts[ei].transformResponse === "function") {
          responseHtml = activeExts[ei].transformResponse(responseHtml, xhr, elt);
        }
      }

      // C7 — Server response headers
      var hxRedirect = xhr.getResponseHeader("HX-Redirect");
      if (hxRedirect) {
        window.location.href = hxRedirect;
        removeIndicatorClass(indicatorTargets);
        return;
      }

      var hxRefresh = xhr.getResponseHeader("HX-Refresh");
      if (hxRefresh === "true") {
        window.location.reload();
        removeIndicatorClass(indicatorTargets);
        return;
      }

      var hxLocation = xhr.getResponseHeader("HX-Location");
      if (hxLocation) {
        var locSpec;
        try {
          locSpec = JSON.parse(hxLocation);
        } catch (e) {
          locSpec = { path: hxLocation };
        }
        // Issue an AJAX redirect
        var locTarget = locSpec.target ? document.querySelector(locSpec.target) : document.body;
        htmx.ajax("get", locSpec.path, { target: locTarget, source: elt });
        removeIndicatorClass(indicatorTargets);
        return;
      }

      // C7 — HX-Retarget
      var hxRetarget = xhr.getResponseHeader("HX-Retarget");
      if (hxRetarget) {
        target = document.querySelector(hxRetarget) || target;
      }

      // C7 — HX-Reswap
      var hxReswap = xhr.getResponseHeader("HX-Reswap");
      if (hxReswap) {
        swapSpec = parseSwapSpec(hxReswap);
      }

      // C7 — HX-Push-Url
      var hxPushUrl = xhr.getResponseHeader("HX-Push-Url");
      // C7 — HX-Replace-Url
      var hxReplaceUrl = xhr.getResponseHeader("HX-Replace-Url");

      // C7 — trigger events from response headers
      handleTriggerHeader(xhr, "HX-Trigger", elt);

      var isSuccessful = status >= 200 && status < 300;
      var isError = status >= 400;

      // C14 — afterRequest
      triggerEvent(elt, "htmx:afterRequest", {
        xhr: xhr, target: target, successful: isSuccessful,
        elt: elt, requestConfig: configRequestDetail
      });

      // C14 — responseError
      if (isError) {
        triggerEvent(elt, "htmx:responseError", {
          xhr: xhr, target: target, error: "Response Status: " + status
        });
      }

      // C2 — only swap on 2xx, not on 204
      var shouldSwap = isSuccessful && status !== 204;
      var isSwapError = !shouldSwap;

      // C14 — beforeSwap
      var beforeSwapDetail = {
        xhr: xhr, target: target, elt: elt,
        shouldSwap: shouldSwap,
        isError: isError,
        serverResponse: responseHtml,
        requestConfig: configRequestDetail,
        swapSpec: swapSpec
      };
      var beforeSwapAllowed = dispatchWithExtensions(elt, "htmx:beforeSwap", beforeSwapDetail);
      shouldSwap = beforeSwapDetail.shouldSwap;

      if (!beforeSwapAllowed || !shouldSwap) {
        removeIndicatorClass(indicatorTargets);
        return;
      }

      // C8 — hx-select-oob
      processSelectOob(responseHtml, elt);

      // Parse response HTML into a temp container
      var tempDiv = document.createElement("div");
      tempDiv.innerHTML = responseHtml;

      // C7 — Update title
      updateTitle(responseHtml);

      // C8 — Process OOB swaps (removes OOB elements from tempDiv)
      processOobSwaps(tempDiv, null);

      // hx-select: if present, select specific content from the response
      var selectAttr = getClosestAttributeValue(elt, "hx-select");
      var finalHtml;
      if (selectAttr) {
        var selected = tempDiv.querySelectorAll(selectAttr);
        var selectDiv = document.createElement("div");
        for (var si = 0; si < selected.length; si++) {
          selectDiv.appendChild(selected[si]);
        }
        finalHtml = selectDiv.innerHTML;
      } else {
        finalHtml = tempDiv.innerHTML;
      }

      // C8 — Save preserved elements before swap
      var preservedMap = savePreserved(target);

      // C3 — CSS class lifecycle: add swapping class
      target.classList.add(config.swappingClass);

      var performSwap = function() {
        // C9 — View Transitions API
        var doActualSwap = function() {
          // Perform the swap
          var newChildren = doSwap(target, finalHtml, swapSpec);

          // Remove swapping class, add settling class
          target.classList.remove(config.swappingClass);
          target.classList.add(config.settlingClass);

          // Add htmx-added to new children
          if (newChildren) {
            for (var nc = 0; nc < newChildren.length; nc++) {
              if (newChildren[nc].classList) {
                newChildren[nc].classList.add(config.addedClass);
              }
            }
          }

          // C8 — restore preserved
          restorePreserved(target, preservedMap);

          // C14 — afterSwap
          dispatchWithExtensions(elt, "htmx:afterSwap", {
            xhr: xhr, target: target, elt: elt, requestConfig: configRequestDetail
          });

          // C7 — trigger after-swap events
          handleTriggerHeader(xhr, "HX-Trigger-After-Swap", elt);

          // History handling
          handleHistoryAfterSwap(elt, url, hxPushUrl, hxReplaceUrl, isBoosted, swapSpec);

          // Settle phase
          setTimeout(function() {
            // Remove settling class and htmx-added
            target.classList.remove(config.settlingClass);
            if (newChildren) {
              for (var nc2 = 0; nc2 < newChildren.length; nc2++) {
                if (newChildren[nc2].classList) {
                  newChildren[nc2].classList.remove(config.addedClass);
                }
              }
            }

            // C14 — afterSettle
            dispatchWithExtensions(elt, "htmx:afterSettle", {
              xhr: xhr, target: target, elt: elt, requestConfig: configRequestDetail
            });

            // C7 — trigger after-settle events
            handleTriggerHeader(xhr, "HX-Trigger-After-Settle", elt);

            // C9 — Process swapped content (re-scan for hx-* attributes)
            if (swapSpec.swapStyle !== "outerHTML") {
              processNode(target);
            } else if (newChildren) {
              for (var nc3 = 0; nc3 < newChildren.length; nc3++) {
                if (newChildren[nc3].nodeType === 1) {
                  processNode(newChildren[nc3]);
                }
              }
            }

            // C9 — Evaluate scripts
            if (swapSpec.swapStyle !== "outerHTML") {
              processScripts(target);
            } else if (newChildren) {
              for (var nc4 = 0; nc4 < newChildren.length; nc4++) {
                if (newChildren[nc4].nodeType === 1) {
                  processScripts(newChildren[nc4]);
                }
              }
            }

            // C14 — htmx:load on new content
            if (newChildren) {
              for (var nc5 = 0; nc5 < newChildren.length; nc5++) {
                if (newChildren[nc5].nodeType === 1) {
                  triggerEvent(newChildren[nc5], "htmx:load", {});
                }
              }
            }

            // Scroll handling
            handleScrolling(target, swapSpec);

            removeIndicatorClass(indicatorTargets);
          }, swapSpec.settleDelay);
        };

        // C9 — View Transitions
        if (swapSpec.transition && document.startViewTransition) {
          document.startViewTransition(doActualSwap);
        } else {
          doActualSwap();
        }
      };

      // C3 — swap delay
      if (swapSpec.swapDelay > 0) {
        setTimeout(performSwap, swapSpec.swapDelay);
      } else {
        performSwap();
      }
    };

    xhr.onerror = function() {
      elt.removeEventListener("htmx:abort", abortHandler);
      data.xhr = null;
      removeIndicatorClass(indicatorTargets);
      triggerErrorEvent(elt, "htmx:sendError", { xhr: xhr, elt: elt });
      triggerEvent(elt, "htmx:afterRequest", { xhr: xhr, elt: elt, target: target, successful: false });
    };

    xhr.ontimeout = function() {
      elt.removeEventListener("htmx:abort", abortHandler);
      data.xhr = null;
      removeIndicatorClass(indicatorTargets);
      triggerEvent(elt, "htmx:timeout", { xhr: xhr, elt: elt, target: target });
      triggerEvent(elt, "htmx:afterRequest", { xhr: xhr, elt: elt, target: target, successful: false });
    };

    xhr.send(body);
  }

  // =========================================================================
  // Scroll handling
  // =========================================================================
  function handleScrolling(target, swapSpec) {
    if (swapSpec.scroll === "top") {
      target.scrollTop = 0;
      target.scrollIntoView({ behavior: config.scrollBehavior, block: "start" });
    } else if (swapSpec.scroll === "bottom") {
      target.scrollIntoView({ behavior: config.scrollBehavior, block: "end" });
    }
    if (swapSpec.show === "top") {
      target.scrollIntoView({ behavior: config.scrollBehavior, block: "start" });
    } else if (swapSpec.show === "bottom") {
      target.scrollIntoView({ behavior: config.scrollBehavior, block: "end" });
    }
    if (swapSpec.focusScroll) {
      target.scrollIntoView({ behavior: config.scrollBehavior, block: "start" });
    }
  }

  // =========================================================================
  // C12 — History handling
  // =========================================================================
  function handleHistoryAfterSwap(elt, url, hxPushUrl, hxReplaceUrl, isBoosted, swapSpec) {
    if (!config.historyEnabled) return;

    // Client-side attributes
    var pushUrl = getClosestAttributeValue(elt, "hx-push-url");
    var replaceUrl = getClosestAttributeValue(elt, "hx-replace-url");

    // Server headers override
    if (hxPushUrl !== null && hxPushUrl !== undefined) {
      pushUrl = hxPushUrl;
    }
    if (hxReplaceUrl !== null && hxReplaceUrl !== undefined) {
      replaceUrl = hxReplaceUrl;
    }

    // Boosted elements default to push
    if (isBoosted && pushUrl === null && replaceUrl === null) {
      pushUrl = "true";
    }

    if (pushUrl === "false" || replaceUrl === "false") return;

    if (pushUrl) {
      var pushTarget = pushUrl === "true" ? url : pushUrl;
      saveHistorySnapshot();
      history.pushState({ htmx: true }, "", pushTarget);
      triggerEvent(document.body, "htmx:pushedIntoHistory", { path: pushTarget });
    } else if (replaceUrl) {
      var replaceTarget = replaceUrl === "true" ? url : replaceUrl;
      saveHistorySnapshot();
      history.replaceState({ htmx: true }, "", replaceTarget);
      triggerEvent(document.body, "htmx:replacedInHistory", { path: replaceTarget });
    }
  }

  function saveHistorySnapshot() {
    triggerEvent(document.body, "htmx:beforeHistorySave", {});
    var historyElt = document.querySelector("[hx-history-elt]") || document.body;
    var snapshot = {
      url: window.location.href,
      content: historyElt.innerHTML,
      title: document.title,
      scrollTop: window.scrollY || document.documentElement.scrollTop
    };
    // LRU cache
    historyCache = historyCache.filter(function(item) {
      return item.url !== snapshot.url;
    });
    historyCache.push(snapshot);
    if (historyCache.length > config.historyCacheSize) {
      historyCache.shift();
    }
  }

  function restoreFromHistory(url) {
    triggerEvent(document.body, "htmx:historyRestore", { path: url });
    for (var i = 0; i < historyCache.length; i++) {
      if (historyCache[i].url === url) {
        var snapshot = historyCache[i];
        var historyElt = document.querySelector("[hx-history-elt]") || document.body;
        historyElt.innerHTML = snapshot.content;
        document.title = snapshot.title;
        window.scrollTo(0, snapshot.scrollTop);
        processNode(historyElt);
        processScripts(historyElt);
        return;
      }
    }
    // Cache miss
    triggerEvent(document.body, "htmx:historyCacheMiss", { path: url });
    if (config.refreshOnHistoryMiss) {
      window.location.reload();
    } else {
      // Fetch from server
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.setRequestHeader("HX-Request", "true");
      xhr.setRequestHeader("HX-History-Restore-Request", "true");
      xhr.setRequestHeader("HX-Current-URL", window.location.href);
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          var historyElt2 = document.querySelector("[hx-history-elt]") || document.body;
          // Extract body content if full page
          var html = xhr.responseText;
          var bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
          if (bodyMatch) html = bodyMatch[1];
          historyElt2.innerHTML = html;
          updateTitle(xhr.responseText);
          processNode(historyElt2);
          processScripts(historyElt2);
          triggerEvent(document.body, "htmx:historyCacheMissLoad", { path: url, xhr: xhr });
        } else {
          triggerEvent(document.body, "htmx:historyCacheMissError", { path: url, xhr: xhr });
        }
      };
      xhr.onerror = function() {
        triggerEvent(document.body, "htmx:historyCacheMissError", { path: url, xhr: xhr });
      };
      xhr.send();
    }
  }

  // =========================================================================
  // C5, C6 — Process node (scan for hx-* attributes, attach triggers)
  // =========================================================================
  function processNode(elt) {
    if (!elt || elt.nodeType !== 1) return;

    // C19 — hx-disable
    if (closest(elt, "[hx-disable], [data-hx-disable]")) return;

    // C14 — beforeProcessNode
    triggerEvent(elt, "htmx:beforeProcessNode", { elt: elt });

    // Process hx-on:* attributes (C9)
    processHxOn(elt);

    // Process this element
    processSingleElement(elt);

    // Process children
    var children = elt.querySelectorAll("*");
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (closest(child, "[hx-disable], [data-hx-disable]")) continue;
      processHxOn(child);
      processSingleElement(child);
    }

    // C14 — afterProcessNode
    triggerEvent(elt, "htmx:afterProcessNode", { elt: elt });
  }

  function processSingleElement(elt) {
    // Check for verb attributes (C1)
    var verb = null;
    var url = null;
    for (var i = 0; i < VERBS.length; i++) {
      var v = VERBS[i];
      var attrVal = getAttributeValue(elt, "hx-" + v) || getAttributeValue(elt, "data-hx-" + v);
      if (attrVal !== null) {
        verb = v;
        url = attrVal;
        break;
      }
    }

    // C6 — hx-boost
    var boost = getClosestAttributeValue(elt, "hx-boost");
    if (boost === "true") {
      processBoost(elt);
    }

    // C15 — SSE
    var sseConnect = getAttributeValue(elt, "sse-connect");
    if (sseConnect) {
      initSSE(elt, sseConnect);
    }

    // C15 — WebSocket
    var wsConnect = getAttributeValue(elt, "ws-connect");
    if (wsConnect) {
      initWebSocket(elt, wsConnect);
    }

    // SSE swap targets
    var sseSwap = getAttributeValue(elt, "sse-swap");
    if (sseSwap) {
      bindSSESwap(elt, sseSwap);
    }

    // WS send
    var wsSend = getAttributeValue(elt, "ws-send");
    if (wsSend !== null) {
      bindWSSend(elt);
    }

    if (!verb) return;

    var data = getInternalData(elt);
    if (data.initialized) return;
    data.initialized = true;

    // Parse triggers (C5)
    var triggerStr = getClosestAttributeValue(elt, "hx-trigger");
    var triggers = parseTriggers(triggerStr, elt);

    for (var t = 0; t < triggers.length; t++) {
      attachTrigger(elt, triggers[t], verb, url);
    }
  }

  function attachTrigger(elt, trigger, verb, url) {
    var event = trigger.event;
    var mods = trigger.modifiers;

    // C5 — Polling (every Ns)
    if (event === "every" && trigger.pollInterval) {
      var pollId = setInterval(function() {
        if (!document.body.contains(elt)) {
          clearInterval(pollId);
          return;
        }
        issueRequest(elt, verb, url, null);
      }, trigger.pollInterval);
      getInternalData(elt).pollId = pollId;
      return;
    }

    // C5 — load trigger
    if (event === "load") {
      // Use setTimeout to let DOM settle
      setTimeout(function() {
        issueRequest(elt, verb, url, null);
      }, 1);
      return;
    }

    // C5 — revealed trigger (IntersectionObserver, fires once)
    if (event === "revealed") {
      var observer = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            observer.disconnect();
            issueRequest(elt, verb, url, null);
            return;
          }
        }
      });
      observer.observe(elt);
      return;
    }

    // C5 — intersect trigger
    if (event === "intersect") {
      var ioOptions = {};
      if (mods.root) {
        ioOptions.root = document.querySelector(mods.root);
      }
      if (mods.threshold !== undefined) {
        ioOptions.threshold = mods.threshold;
      }
      var intObserver = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            issueRequest(elt, verb, url, entries[i]);
          }
        }
      }, ioOptions);
      intObserver.observe(elt);
      return;
    }

    // Determine the listener target
    var listenTarget = mods.from ? resolveFromTarget(elt, mods.from) : elt;
    if (!listenTarget) return;

    var data = getInternalData(elt);
    var onceTriggered = false;
    var lastValue = elt.value;
    var throttleTimer = null;
    var delayTimer = null;
    var queuedEvents = [];
    var isProcessingQueue = false;

    var handler = function(evt) {
      // C5 — target: modifier (filter by event target)
      if (mods.target) {
        if (!evt.target || !matches(evt.target, mods.target)) return;
      }

      // C5 — filter expression
      if (trigger.filter && config.allowEval) {
        try {
          var filterResult = new Function("event", "return (" + trigger.filter + ")")(evt);
          if (!filterResult) return;
        } catch (e) { return; }
      }

      // C5 — consume modifier
      if (mods.consume) {
        evt.preventDefault();
        evt.stopPropagation();
      }

      // C5 — once modifier
      if (mods.once) {
        if (onceTriggered) return;
        onceTriggered = true;
      }

      // C5 — changed modifier
      if (mods.changed) {
        if (elt.value === lastValue) return;
        lastValue = elt.value;
      }

      var fireRequest = function() {
        issueRequest(elt, verb, url, evt);
      };

      // C5 — queue modifier
      if (mods.queue) {
        if (data.xhr) {
          if (mods.queue === "none") return;
          if (mods.queue === "first") {
            if (queuedEvents.length === 0) queuedEvents.push(fireRequest);
            return;
          }
          if (mods.queue === "last") {
            queuedEvents = [fireRequest];
            return;
          }
          if (mods.queue === "all") {
            queuedEvents.push(fireRequest);
            return;
          }
        }
      }

      // C5 — throttle modifier
      if (mods.throttle) {
        if (throttleTimer) return;
        throttleTimer = setTimeout(function() {
          throttleTimer = null;
        }, mods.throttle);
        fireRequest();
        return;
      }

      // C5 — delay modifier (debounce)
      if (mods.delay) {
        clearTimeout(delayTimer);
        delayTimer = setTimeout(fireRequest, mods.delay);
        return;
      }

      fireRequest();
    };

    listenTarget.addEventListener(event, handler);

    // Store handler reference for cleanup
    if (!data.listeners) data.listeners = [];
    data.listeners.push({ target: listenTarget, event: event, handler: handler });

    // Queue processing: check after each request completes
    elt.addEventListener("htmx:afterRequest", function() {
      if (queuedEvents.length > 0) {
        var next = queuedEvents.shift();
        next();
      }
    });
  }

  // =========================================================================
  // C9 — hx-on:* attribute handlers
  // =========================================================================
  function processHxOn(elt) {
    if (!config.allowEval) return;
    var attrs = elt.attributes;
    if (!attrs) return;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var name = attr.name;
      if (name.indexOf("hx-on:") === 0 || name.indexOf("hx-on::") === 0 || name.indexOf("data-hx-on:") === 0 || name.indexOf("data-hx-on::") === 0) {
        var eventName;
        if (name.indexOf("data-hx-on::") === 0) {
          eventName = "htmx:" + name.substring(12);
        } else if (name.indexOf("data-hx-on:") === 0) {
          eventName = name.substring(11);
        } else if (name.indexOf("hx-on::") === 0) {
          eventName = "htmx:" + name.substring(7);
        } else {
          eventName = name.substring(6);
        }
        var code = attr.value;
        var internalKey = "_hxon_" + eventName;
        var data = getInternalData(elt);
        if (data[internalKey]) continue;
        data[internalKey] = true;
        (function(eventName2, code2) {
          elt.addEventListener(eventName2, function(event) {
            try {
              new Function("event", code2).call(elt, event);
            } catch (e) {
              // ignore eval errors
            }
          });
        })(eventName, code);
      }
    }
  }

  // =========================================================================
  // C6 — Progressive Enhancement (hx-boost)
  // =========================================================================
  function processBoost(container) {
    // Boost links
    var links = container.tagName === "A" ? [container] : toArray(container.querySelectorAll("a[href]"));
    for (var i = 0; i < links.length; i++) {
      boostLink(links[i], container);
    }
    // Boost forms
    var forms = container.tagName === "FORM" ? [container] : toArray(container.querySelectorAll("form"));
    for (var j = 0; j < forms.length; j++) {
      boostForm(forms[j], container);
    }
  }

  function boostLink(link, container) {
    // Check opt-out
    if (getAttributeValue(link, "hx-boost") === "false") return;
    var data = getInternalData(link);
    if (data.boosted) return;
    data.boosted = true;

    link.addEventListener("click", function(evt) {
      // Skip if modifier keys are held
      if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;

      evt.preventDefault();
      var url = link.getAttribute("href");

      // Inherit target from ancestors, default to body
      var targetStr = getClosestAttributeValue(link, "hx-target") || "body";
      var target = resolveTarget(link, targetStr);
      var swapStr = getClosestAttributeValue(link, "hx-swap") || "innerHTML";
      var swapSpec = parseSwapSpec(swapStr);

      // Set internal attributes for the request
      // We directly issue the request since boost implies hx-get
      issueRequest(link, "get", url, evt);

      // Scroll to top on boost
      if (config.scrollIntoViewOnBoost) {
        window.scrollTo({ top: 0, behavior: config.scrollBehavior });
      }
    });
  }

  function boostForm(form, container) {
    if (getAttributeValue(form, "hx-boost") === "false") return;
    var data = getInternalData(form);
    if (data.boosted) return;
    data.boosted = true;

    form.addEventListener("submit", function(evt) {
      evt.preventDefault();
      var method = (form.getAttribute("method") || "get").toLowerCase();
      var action = form.getAttribute("action") || window.location.href;
      issueRequest(form, method, action, evt);
    });
  }

  // =========================================================================
  // C15 — SSE (Server-Sent Events)
  // =========================================================================
  function initSSE(elt, url) {
    var data = getInternalData(elt);
    if (data.sseSource) return;

    var source = new EventSource(url);
    data.sseSource = source;

    // Handle sse-close
    var closeEvent = getAttributeValue(elt, "sse-close");
    if (closeEvent) {
      source.addEventListener(closeEvent, function() {
        source.close();
        data.sseSource = null;
      });
    }

    // Store source on the element for child sse-swap elements to find
    elt._sseSource = source;

    // Check if disconnected from DOM — clean up
    var checkAlive = setInterval(function() {
      if (!document.body.contains(elt)) {
        source.close();
        clearInterval(checkAlive);
      }
    }, 5000);
  }

  function bindSSESwap(elt, eventName) {
    // Find the closest SSE source
    var current = elt;
    var source = null;
    while (current) {
      if (current._sseSource) {
        source = current._sseSource;
        break;
      }
      current = current.parentElement;
    }
    if (!source) return;

    source.addEventListener(eventName, function(evt) {
      var swapStr = getClosestAttributeValue(elt, "hx-swap") || config.defaultSwapStyle;
      var swapSpec = parseSwapSpec(swapStr);
      var target = elt;
      var targetStr = getClosestAttributeValue(elt, "hx-target");
      if (targetStr) target = resolveTarget(elt, targetStr) || elt;

      // Parse for OOB
      var tempDiv = document.createElement("div");
      tempDiv.innerHTML = evt.data;
      processOobSwaps(tempDiv, null);

      doSwap(target, tempDiv.innerHTML, swapSpec);
      processNode(target);
      processScripts(target);
    });
  }

  // =========================================================================
  // C15 — WebSocket
  // =========================================================================
  function initWebSocket(elt, url) {
    var data = getInternalData(elt);
    if (data.ws) return;

    var reconnectDelay = 1000;
    var maxReconnectDelay = 30000;

    function connect() {
      var ws = new WebSocket(url);
      data.ws = ws;
      elt._ws = ws;

      ws.onmessage = function(evt) {
        var tempDiv = document.createElement("div");
        tempDiv.innerHTML = evt.data;

        // Process OOB swaps
        processOobSwaps(tempDiv, null);

        // Swap remaining content into the connecting element
        if (tempDiv.innerHTML.trim()) {
          var swapStr = getClosestAttributeValue(elt, "hx-swap") || config.defaultSwapStyle;
          var swapSpec = parseSwapSpec(swapStr);
          doSwap(elt, tempDiv.innerHTML, swapSpec);
          processNode(elt);
          processScripts(elt);
        }
      };

      ws.onclose = function() {
        data.ws = null;
        elt._ws = null;
        // Auto-reconnect with exponential backoff
        if (document.body.contains(elt)) {
          setTimeout(function() {
            connect();
            reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
          }, reconnectDelay);
        }
      };

      ws.onopen = function() {
        reconnectDelay = 1000; // Reset on successful connection
      };

      ws.onerror = function() {
        // Will trigger onclose
      };
    }

    connect();

    // Cleanup when removed from DOM
    var checkAlive = setInterval(function() {
      if (!document.body.contains(elt)) {
        if (data.ws) data.ws.close();
        clearInterval(checkAlive);
      }
    }, 5000);
  }

  function bindWSSend(elt) {
    var data = getInternalData(elt);
    if (data.wsSendBound) return;
    data.wsSendBound = true;

    var triggerStr = getClosestAttributeValue(elt, "hx-trigger");
    var trigger = triggerStr || getDefaultTrigger(elt);

    elt.addEventListener(trigger, function(evt) {
      if (evt.type === "submit") evt.preventDefault();

      // Find closest WS connection
      var current = elt;
      var ws = null;
      while (current) {
        if (current._ws) {
          ws = current._ws;
          break;
        }
        current = current.parentElement;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Gather form data as JSON
      var values = getInputValues(elt);
      mergeHxVals(elt, values);
      ws.send(JSON.stringify(values));
    });
  }

  // =========================================================================
  // Indicator styles injection (C11)
  // =========================================================================
  function injectIndicatorStyles() {
    if (!config.includeIndicatorStyles) return;
    var style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.textContent =
      ".htmx-indicator { opacity: 0; transition: opacity 200ms ease-in; }\n" +
      ".htmx-request .htmx-indicator, .htmx-request.htmx-indicator { opacity: 1; }";
    document.head.appendChild(style);
  }

  // =========================================================================
  // C11 — Meta tag config
  // =========================================================================
  function loadMetaConfig() {
    var meta = document.querySelector('meta[name="htmx-config"]');
    if (meta) {
      try {
        var parsed = JSON.parse(meta.getAttribute("content"));
        for (var key in parsed) {
          if (parsed.hasOwnProperty(key) && config.hasOwnProperty(key)) {
            config[key] = parsed[key];
          }
        }
      } catch (e) { /* ignore parse errors */ }
    }
  }

  // =========================================================================
  // C10 — Public API (window.htmx)
  // =========================================================================
  var htmx = {
    version: "2.0.0-derived",
    config: config,

    // C10 — htmx.ajax
    ajax: function(verb, url, spec) {
      var target, source;
      if (typeof spec === "string") {
        target = document.querySelector(spec);
        source = target;
      } else if (spec && spec.nodeType) {
        target = spec;
        source = spec;
      } else if (spec && typeof spec === "object") {
        target = spec.target;
        source = spec.source || target;
        if (typeof target === "string") target = document.querySelector(target);
        if (typeof source === "string") source = document.querySelector(source);
      } else {
        target = document.body;
        source = document.body;
      }
      if (!target) target = document.body;
      if (!source) source = target;

      // Temporarily set attributes for the request
      issueRequest(source, verb, url, null);
    },

    // C10 — htmx.process
    process: function(elt) {
      processNode(elt);
    },

    // C10 — htmx.find
    find: function(eltOrSel, sel) {
      if (sel) {
        return eltOrSel.querySelector(sel);
      }
      return document.querySelector(eltOrSel);
    },

    // C10 — htmx.findAll
    findAll: function(eltOrSel, sel) {
      if (sel) {
        return toArray(eltOrSel.querySelectorAll(sel));
      }
      return toArray(document.querySelectorAll(eltOrSel));
    },

    // C10 — htmx.closest
    closest: function(elt, sel) {
      return closest(elt, sel);
    },

    // C10 — htmx.remove
    remove: function(elt) {
      if (elt && elt.parentElement) {
        elt.parentElement.removeChild(elt);
      }
    },

    // C10 — htmx.addClass
    addClass: function(elt, cls, delay) {
      if (delay) {
        setTimeout(function() { elt.classList.add(cls); }, parseInterval(delay));
      } else {
        elt.classList.add(cls);
      }
    },

    // C10 — htmx.removeClass
    removeClass: function(elt, cls, delay) {
      if (delay) {
        setTimeout(function() { elt.classList.remove(cls); }, parseInterval(delay));
      } else {
        elt.classList.remove(cls);
      }
    },

    // C10 — htmx.toggleClass
    toggleClass: function(elt, cls) {
      elt.classList.toggle(cls);
    },

    // C10 — htmx.takeClass
    takeClass: function(elt, cls) {
      var siblings = elt.parentElement ? elt.parentElement.children : [];
      for (var i = 0; i < siblings.length; i++) {
        siblings[i].classList.remove(cls);
      }
      elt.classList.add(cls);
    },

    // C10 — htmx.trigger
    trigger: function(elt, event, detail) {
      triggerEvent(elt, event, detail || {});
    },

    // C10 — htmx.swap
    swap: function(target, html, swapSpec) {
      if (typeof target === "string") target = document.querySelector(target);
      if (!swapSpec) swapSpec = {};
      if (typeof swapSpec === "string") swapSpec = parseSwapSpec(swapSpec);
      if (!swapSpec.swapStyle) swapSpec.swapStyle = config.defaultSwapStyle;
      doSwap(target, html, swapSpec);
      processNode(target);
      processScripts(target);
    },

    // C10 — htmx.values
    values: function(elt) {
      return getInputValues(elt);
    },

    // C10 — htmx.on
    on: function(evtOrElt, handlerOrEvt, handler) {
      if (typeof evtOrElt === "string") {
        // htmx.on(evt, handler)
        document.body.addEventListener(evtOrElt, handlerOrEvt);
      } else {
        // htmx.on(elt, evt, handler)
        evtOrElt.addEventListener(handlerOrEvt, handler);
      }
    },

    // C10 — htmx.off
    off: function(evtOrElt, handlerOrEvt, handler) {
      if (typeof evtOrElt === "string") {
        document.body.removeEventListener(evtOrElt, handlerOrEvt);
      } else {
        evtOrElt.removeEventListener(handlerOrEvt, handler);
      }
    },

    // C16 — htmx.defineExtension
    defineExtension: function(name, def) {
      extensions[name] = def;
      if (def && typeof def.init === "function") {
        def.init(htmx);
      }
    },

    // C16 — htmx.removeExtension
    removeExtension: function(name) {
      delete extensions[name];
    },

    // C10 — htmx.parseInterval
    parseInterval: parseInterval
  };

  // =========================================================================
  // Initialization (DOMContentLoaded)
  // =========================================================================
  function init() {
    // C11 — Load meta config
    loadMetaConfig();

    // Inject indicator styles
    injectIndicatorStyles();

    // C12 — History popstate listener
    window.addEventListener("popstate", function(evt) {
      if (evt.state && evt.state.htmx) {
        restoreFromHistory(window.location.href);
      }
    });

    // Process the document body
    processNode(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Attach to window
  window.htmx = htmx;

})();
