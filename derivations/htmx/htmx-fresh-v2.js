// htmx-fresh-v2.js — Derived from HTMX-SEED.md constraint seed
// Drop-in htmx 2.x replacement. ES5-compatible IIFE.
(function() {
"use strict";

var VERBS = ["get", "post", "put", "patch", "delete"];
var SWAP_STYLES = ["innerHTML", "outerHTML", "beforebegin", "afterbegin", "beforeend", "afterend", "delete", "none"];
var extensions = {};
var historyCache = [];
var logEnabled = false;

// C11 — Runtime Configuration
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

// Utility: get attribute with data- prefix fallback, hx-* takes precedence
function getAttr(elt, name) {
    if (!elt || !elt.getAttribute) return null;
    var val = elt.getAttribute(name);
    if (val !== null) return val;
    return elt.getAttribute("data-" + name);
}

// C18 — Attribute inheritance with disinherit support
function getClosestAttr(elt, name) {
    var node = elt;
    while (node) {
        var val = getAttr(node, name);
        if (val !== null) return val;
        node = node.parentElement;
        if (node) {
            var dis = getAttr(node, "hx-disinherit");
            if (dis) {
                if (dis === "*") return null;
                var parts = dis.split(/\s+/);
                for (var i = 0; i < parts.length; i++) {
                    if (parts[i] === name) return null;
                }
            }
        }
    }
    return null;
}

// Fire custom event, returns false if cancelled
function fire(elt, name, detail) {
    detail = detail || {};
    var evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
    if (logEnabled && htmx.logger) {
        htmx.logger(elt, name, detail);
    }
    // C16 — Extension onEvent hook (only for active extensions on this element)
    var activeExts = getActiveExtensions(elt);
    for (var i = 0; i < activeExts.length; i++) {
        if (activeExts[i].onEvent) {
            activeExts[i].onEvent(name, evt);
        }
    }
    return elt.dispatchEvent(evt);
}

// C16 — Resolve active extensions for an element
function getActiveExtensions(elt) {
    var result = [];
    var ignored = {};
    var node = elt;
    while (node) {
        var extAttr = getAttr(node, "hx-ext");
        if (extAttr) {
            var names = extAttr.split(/\s*,\s*/);
            for (var i = 0; i < names.length; i++) {
                var n = names[i].trim();
                if (n.indexOf("ignore:") === 0) {
                    ignored[n.substring(7).trim()] = true;
                } else if (!ignored[n] && extensions[n]) {
                    result.push(extensions[n]);
                }
            }
        }
        node = node.parentElement;
    }
    return result;
}

// Parse time string to ms
function parseInterval(str) {
    if (!str) return 0;
    str = str.trim();
    if (/ms$/.test(str)) return parseInt(str, 10);
    if (/s$/.test(str)) return parseFloat(str) * 1000;
    return parseInt(str, 10);
}

// C4 — Resolve target with extended selectors
function resolveTarget(elt, spec) {
    if (!spec || spec === "this") return elt;
    if (spec.indexOf("closest ") === 0) return elt.closest(spec.substring(8).trim());
    if (spec.indexOf("find ") === 0) return elt.querySelector(spec.substring(5).trim());
    if (spec.indexOf("next ") === 0) {
        var sel = spec.substring(5).trim();
        if (!sel) return elt.nextElementSibling;
        var sib = elt.nextElementSibling;
        while (sib) { if (sib.matches(sel)) return sib; sib = sib.nextElementSibling; }
        return null;
    }
    if (spec === "next") return elt.nextElementSibling;
    if (spec.indexOf("previous ") === 0) {
        var sel2 = spec.substring(9).trim();
        if (!sel2) return elt.previousElementSibling;
        var sib2 = elt.previousElementSibling;
        while (sib2) { if (sib2.matches(sel2)) return sib2; sib2 = sib2.previousElementSibling; }
        return null;
    }
    if (spec === "previous") return elt.previousElementSibling;
    return document.querySelector(spec);
}

// C3 — Parse swap spec with modifiers
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
    var parts = str.trim().split(/\s+/);
    if (parts[0] && SWAP_STYLES.indexOf(parts[0]) >= 0) {
        spec.swapStyle = parts[0];
    }
    for (var i = 1; i < parts.length; i++) {
        var p = parts[i];
        if (p.indexOf("swap:") === 0) spec.swapDelay = parseInterval(p.substring(5));
        else if (p.indexOf("settle:") === 0) spec.settleDelay = parseInterval(p.substring(7));
        else if (p.indexOf("scroll:") === 0) {
            var sv = p.substring(7);
            // scroll:top:selector or scroll:top
            var sc = sv.split(":");
            spec.scroll = sc[0];
            if (sc.length > 1) spec.scrollTarget = sc.slice(1).join(":");
        }
        else if (p.indexOf("show:") === 0) {
            var shv = p.substring(5).split(":");
            spec.show = shv[0];
            if (shv.length > 1) spec.showTarget = shv.slice(1).join(":");
        }
        else if (p.indexOf("focus-scroll:") === 0) spec.focusScroll = p.substring(13) === "true";
        else if (p.indexOf("transition:") === 0) spec.transition = p.substring(11) === "true";
    }
    return spec;
}

// C3 — Perform the DOM swap
function doSwap(target, html, swapSpec, settleInfo) {
    if (!target) return;
    settleInfo = settleInfo || { tasks: [], elts: [] };
    var style = swapSpec.swapStyle || config.defaultSwapStyle;
    if (style === "none") return;
    if (style === "delete") { target.parentElement.removeChild(target); return; }
    if (style === "innerHTML") {
        target.innerHTML = html;
        settleInfo.elts = Array.prototype.slice.call(target.children);
    } else if (style === "outerHTML") {
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        settleInfo.elts = Array.prototype.slice.call(tmp.children);
        while (tmp.firstChild) target.parentElement.insertBefore(tmp.firstChild, target);
        target.parentElement.removeChild(target);
    } else if (style === "beforebegin") {
        target.insertAdjacentHTML("beforebegin", html);
        settleInfo.elts = [target.previousElementSibling];
    } else if (style === "afterbegin") {
        target.insertAdjacentHTML("afterbegin", html);
        settleInfo.elts = [target.firstElementChild];
    } else if (style === "beforeend") {
        target.insertAdjacentHTML("beforeend", html);
        settleInfo.elts = [target.lastElementChild];
    } else if (style === "afterend") {
        target.insertAdjacentHTML("afterend", html);
        settleInfo.elts = [target.nextElementSibling];
    }
    return settleInfo;
}

// C9 — Script evaluation
function processScripts(elt) {
    if (!config.allowScriptTags) return;
    var scripts = elt.querySelectorAll ? elt.querySelectorAll("script") : [];
    if (elt.tagName === "SCRIPT") scripts = [elt];
    for (var i = 0; i < scripts.length; i++) {
        var old = scripts[i];
        var nw = document.createElement("script");
        for (var j = 0; j < old.attributes.length; j++) {
            nw.setAttribute(old.attributes[j].name, old.attributes[j].value);
        }
        if (config.inlineScriptNonce) nw.nonce = config.inlineScriptNonce;
        nw.textContent = old.textContent;
        old.parentElement.replaceChild(nw, old);
    }
}

// C9 — Process hx-on:* attributes
function processHxOn(elt) {
    if (!config.allowEval) return;
    var all = elt.querySelectorAll ? [elt].concat(Array.prototype.slice.call(elt.querySelectorAll("*"))) : [elt];
    for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.__htmx_on_processed) continue;
        var attrs = Array.prototype.slice.call(el.attributes || []);
        var hasOn = false;
        for (var j = 0; j < attrs.length; j++) {
            var name = attrs[j].name;
            var prefix = null;
            // Double colon MUST be checked before single colon (:: starts with :)
            if (name.indexOf("data-hx-on::") === 0) { prefix = "data-hx-on::"; }
            else if (name.indexOf("hx-on::") === 0) { prefix = "hx-on::"; }
            else if (name.indexOf("data-hx-on:") === 0) { prefix = "data-hx-on:"; }
            else if (name.indexOf("hx-on:") === 0) { prefix = "hx-on:"; }
            if (prefix) {
                hasOn = true;
                var evtName = name.substring(prefix.length);
                // Double colon means htmx: prefix
                if (prefix.indexOf("::") >= 0) {
                    evtName = "htmx:" + evtName;
                }
                var code = attrs[j].value;
                (function(el2, evtName2, code2) {
                    el2.addEventListener(evtName2, function(evt) {
                        new Function("event", code2).call(el2, evt);
                    });
                })(el, evtName, code);
            }
        }
        if (hasOn) el.__htmx_on_processed = true;
    }
}

// C8 — Process OOB swaps from response
function processOobSwaps(fragment) {
    var oobElts = [];
    var children = Array.prototype.slice.call(fragment.children);
    for (var i = children.length - 1; i >= 0; i--) {
        var child = children[i];
        var oobVal = getAttr(child, "hx-swap-oob");
        if (oobVal) {
            oobElts.push({ el: child, oob: oobVal });
            child.parentElement.removeChild(child);
        }
    }
    for (var j = 0; j < oobElts.length; j++) {
        var entry = oobElts[j];
        var oob = entry.oob;
        var el = entry.el;
        el.removeAttribute("hx-swap-oob");
        el.removeAttribute("data-hx-swap-oob");
        var strategy = "outerHTML";
        var targetEl = null;
        if (oob === "true") {
            targetEl = document.getElementById(el.id);
        } else if (oob.indexOf(":") > 0) {
            var parts = oob.split(":");
            strategy = parts[0];
            targetEl = document.querySelector(parts.slice(1).join(":"));
        } else {
            strategy = oob;
            targetEl = document.getElementById(el.id);
        }
        if (!targetEl) {
            fire(document.body, "htmx:oobErrorNoTarget", { content: el });
            continue;
        }
        fire(targetEl, "htmx:oobBeforeSwap", { target: targetEl, fragment: el });
        if (strategy === "outerHTML") {
            targetEl.parentElement.replaceChild(el, targetEl);
            processNode(el);
            processScripts(el);
            processHxOn(el);
        } else {
            // Non-outerHTML: swap inner content
            var innerHtml = el.innerHTML;
            doSwap(targetEl, innerHtml, { swapStyle: strategy });
            processNode(targetEl);
            processScripts(targetEl);
            processHxOn(targetEl);
        }
        fire(targetEl, "htmx:oobAfterSwap", { target: targetEl, fragment: el });
    }
}

// C8 — Process hx-select-oob
function processSelectOob(fragment, sourceElt) {
    var selectOob = getAttr(sourceElt, "hx-select-oob");
    if (!selectOob) return;
    var entries = selectOob.split(",");
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i].trim();
        if (entry.indexOf(":") < 0) continue; // skip invalid entries
        var colonIdx = entry.indexOf(":");
        var srcSel = entry.substring(0, colonIdx).trim();
        var tgtSel = entry.substring(colonIdx + 1).trim();
        var srcEl = fragment.querySelector(srcSel);
        var tgtEl = document.querySelector(tgtSel);
        if (srcEl && tgtEl) {
            srcEl.parentElement.removeChild(srcEl);
            tgtEl.innerHTML = srcEl.outerHTML;
            processNode(tgtEl);
        }
    }
}

// C8 — hx-preserve
function handlePreserve(target) {
    var preserved = [];
    var els = target.querySelectorAll("[hx-preserve], [data-hx-preserve]");
    for (var i = 0; i < els.length; i++) {
        if (els[i].id) preserved.push(els[i].cloneNode(true));
    }
    return preserved;
}

function restorePreserved(target, preserved) {
    for (var i = 0; i < preserved.length; i++) {
        var ph = target.querySelector("#" + preserved[i].id);
        if (ph) ph.parentElement.replaceChild(preserved[i], ph);
    }
}

// C7 — Parse HX-Trigger header (string or JSON)
function fireServerEvents(elt, headerVal) {
    if (!headerVal) return;
    headerVal = headerVal.trim();
    if (headerVal.charAt(0) === "{") {
        try {
            var obj = JSON.parse(headerVal);
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) fire(elt, key, obj[key]);
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

// C13 — Gather form values
function gatherValues(elt, verb) {
    var vals = {};
    var form = null;
    if (elt.tagName === "FORM") form = elt;
    else form = elt.closest("form");

    function addVal(name, value) {
        if (!name) return;
        if (vals[name] !== undefined) {
            if (!Array.isArray(vals[name])) vals[name] = [vals[name]];
            vals[name].push(value);
        } else {
            vals[name] = value;
        }
    }

    function gatherInputs(container) {
        var inputs = container.querySelectorAll("input, select, textarea");
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp.disabled) continue;
            if (!inp.name) continue;
            if (inp.type === "checkbox" || inp.type === "radio") {
                if (inp.checked) addVal(inp.name, inp.value);
            } else if (inp.tagName === "SELECT" && inp.multiple) {
                for (var j = 0; j < inp.options.length; j++) {
                    if (inp.options[j].selected) addVal(inp.name, inp.options[j].value);
                }
            } else {
                addVal(inp.name, inp.value);
            }
        }
    }

    if (form) gatherInputs(form);
    // Include triggering element's name/value
    if (elt.name && elt.value !== undefined && elt !== form) addVal(elt.name, elt.value);

    // hx-include
    var include = getClosestAttr(elt, "hx-include");
    if (include) {
        var incElt = resolveTarget(elt, include);
        if (incElt) {
            if (incElt.tagName === "FORM" || incElt.tagName === "INPUT" || incElt.tagName === "SELECT" || incElt.tagName === "TEXTAREA") {
                if (incElt.tagName === "FORM") gatherInputs(incElt);
                else if (incElt.name) addVal(incElt.name, incElt.value);
            } else {
                gatherInputs(incElt);
            }
        } else {
            // Try querySelectorAll for CSS selectors matching multiple elements
            try {
                var incElts = document.querySelectorAll(include);
                for (var k = 0; k < incElts.length; k++) {
                    var ie = incElts[k];
                    if (ie.tagName === "FORM") gatherInputs(ie);
                    else if (ie.name) addVal(ie.name, ie.value);
                    else gatherInputs(ie);
                }
            } catch(e) {}
        }
    }

    // hx-vals
    var hxVals = getClosestAttr(elt, "hx-vals");
    if (hxVals) {
        hxVals = hxVals.trim();
        if (config.allowEval && hxVals.indexOf("js:") === 0) {
            try {
                var evalResult = new Function("return (" + hxVals.substring(3) + ")")();
                for (var ek in evalResult) {
                    if (evalResult.hasOwnProperty(ek)) addVal(ek, evalResult[ek]);
                }
            } catch(e) {}
        } else {
            try {
                var parsed = JSON.parse(hxVals);
                for (var pk in parsed) {
                    if (parsed.hasOwnProperty(pk)) addVal(pk, parsed[pk]);
                }
            } catch(e) {}
        }
    }

    // hx-params filter
    var hxParams = getClosestAttr(elt, "hx-params");
    if (hxParams) {
        if (hxParams === "none") {
            vals = {};
        } else if (hxParams !== "*") {
            if (hxParams.indexOf("not ") === 0) {
                var exclude = hxParams.substring(4).split(",").map(function(s) { return s.trim(); });
                for (var ei = 0; ei < exclude.length; ei++) delete vals[exclude[ei]];
            } else {
                var only = hxParams.split(",").map(function(s) { return s.trim(); });
                var filtered = {};
                for (var oi = 0; oi < only.length; oi++) {
                    if (vals[only[oi]] !== undefined) filtered[only[oi]] = vals[only[oi]];
                }
                vals = filtered;
            }
        }
    }

    return vals;
}

// Check if request has file inputs
function hasFileInputs(elt) {
    var form = elt.tagName === "FORM" ? elt : elt.closest("form");
    if (!form) return false;
    return form.querySelector("input[type=file]") !== null;
}

// C13 — Merge headers from hx-headers inheritance
function gatherHeaders(elt) {
    var headers = {};
    // Walk ancestors from furthest to closest, so closer takes precedence
    var chain = [];
    var node = elt;
    while (node) {
        var hVal = getAttr(node, "hx-headers");
        if (hVal) chain.unshift({ el: node, val: hVal });
        node = node.parentElement;
        if (node) {
            var dis = getAttr(node, "hx-disinherit");
            if (dis && (dis === "*" || dis.split(/\s+/).indexOf("hx-headers") >= 0)) break;
        }
    }
    for (var i = 0; i < chain.length; i++) {
        try {
            var parsed = JSON.parse(chain[i].val);
            for (var k in parsed) {
                if (parsed.hasOwnProperty(k)) headers[k] = parsed[k];
            }
        } catch(e) {}
    }
    return headers;
}

// Sync tracking
var syncMap = {};

function getSyncKey(elt) {
    if (!elt.__htmx_sync_id) elt.__htmx_sync_id = "sync_" + Math.random().toString(36).substring(2);
    return elt.__htmx_sync_id;
}

// C5 — Parse trigger spec
function parseTriggers(elt) {
    var triggerStr = getClosestAttr(elt, "hx-trigger");
    if (!triggerStr) {
        // Defaults
        var tag = elt.tagName;
        if (tag === "FORM") return [{ event: "submit", modifiers: {} }];
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return [{ event: "change", modifiers: {} }];
        return [{ event: "click", modifiers: {} }];
    }
    var triggers = [];
    var parts = triggerStr.split(",");
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (!part) continue;
        var trigger = { event: null, modifiers: {} };
        // Check for every Ns/Nms
        var everyMatch = part.match(/^every\s+(\d+(?:ms|s))/);
        if (everyMatch) {
            trigger.event = "every";
            trigger.modifiers.interval = parseInterval(everyMatch[1]);
            // Parse remaining modifiers after the interval
            var rest = part.substring(everyMatch[0].length).trim();
            parseModifiers(rest, trigger);
            triggers.push(trigger);
            continue;
        }
        var tokens = part.split(/\s+/);
        var eventToken = tokens[0];
        // Check for filter expression: eventName[expr]
        var bracketIdx = eventToken.indexOf("[");
        if (bracketIdx >= 0) {
            trigger.event = eventToken.substring(0, bracketIdx);
            var endBracket = part.indexOf("]", bracketIdx);
            trigger.modifiers.filter = part.substring(bracketIdx + 1, endBracket);
            var afterFilter = part.substring(endBracket + 1).trim();
            parseModifiers(afterFilter, trigger);
        } else {
            trigger.event = eventToken;
            var modStr = tokens.slice(1).join(" ");
            parseModifiers(modStr, trigger);
        }
        triggers.push(trigger);
    }
    return triggers;
}

function parseModifiers(str, trigger) {
    if (!str) return;
    var tokens = str.split(/\s+/);
    var modKeywords = ["once", "changed", "delay:", "throttle:", "from:", "target:", "consume", "queue:", "root:", "threshold:"];
    for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        if (t === "once") trigger.modifiers.once = true;
        else if (t === "changed") trigger.modifiers.changed = true;
        else if (t === "consume") trigger.modifiers.consume = true;
        else if (t.indexOf("delay:") === 0) trigger.modifiers.delay = parseInterval(t.substring(6));
        else if (t.indexOf("throttle:") === 0) trigger.modifiers.throttle = parseInterval(t.substring(9));
        else if (t.indexOf("queue:") === 0) trigger.modifiers.queue = t.substring(6);
        else if (t.indexOf("target:") === 0) trigger.modifiers.target = t.substring(7);
        else if (t.indexOf("root:") === 0) trigger.modifiers.root = t.substring(5);
        else if (t.indexOf("threshold:") === 0) trigger.modifiers.threshold = parseFloat(t.substring(10));
        else if (t.indexOf("from:") === 0) {
            // from: value may contain spaces — consume up to next recognized modifier keyword
            var fromVal = t.substring(5);
            for (var j = i + 1; j < tokens.length; j++) {
                var isKeyword = false;
                for (var k = 0; k < modKeywords.length; k++) {
                    if (tokens[j] === modKeywords[k].replace(":", "") || tokens[j].indexOf(modKeywords[k]) === 0) {
                        isKeyword = true; break;
                    }
                }
                if (isKeyword) break;
                fromVal += " " + tokens[j];
                i = j;
            }
            trigger.modifiers.from = fromVal;
        }
    }
}

// Resolve "from:" selector
function resolveFromTarget(elt, from) {
    if (!from) return elt;
    if (from === "document") return document;
    if (from === "window") return window;
    if (from === "body") return document.body;
    if (from.indexOf("closest ") === 0) return elt.closest(from.substring(8).trim());
    if (from.indexOf("find ") === 0) return elt.querySelector(from.substring(5).trim());
    if (from.indexOf("next ") === 0) return resolveTarget(elt, from);
    if (from.indexOf("previous ") === 0) return resolveTarget(elt, from);
    return document.querySelector(from);
}

// C14 — Main request issuing function
function issueRequest(elt, verb, url, evtOrSource, isBoosted) {
    verb = verb.toUpperCase();
    var source = elt;
    var triggerElt = elt;

    // C13 — hx-confirm
    var confirmMsg = getClosestAttr(elt, "hx-confirm");
    if (confirmMsg) {
        if (!fire(elt, "htmx:confirm", { question: confirmMsg, triggerEvent: evtOrSource })) return;
        if (!confirm(confirmMsg)) return;
    }

    // C13 — hx-prompt
    var promptMsg = getClosestAttr(elt, "hx-prompt");
    var promptValue = null;
    if (promptMsg) {
        promptValue = prompt(promptMsg);
        if (promptValue === null) return;
    }

    // C17 — Form validation
    var validate = getClosestAttr(elt, "hx-validate");
    if (validate === "true") {
        var form = elt.tagName === "FORM" ? elt : elt.closest("form");
        if (form) {
            fire(form, "htmx:validation:validate");
            if (!form.checkValidity()) {
                form.reportValidity();
                fire(form, "htmx:validation:failed");
                fire(form, "htmx:validation:halted");
                return;
            }
        }
    }

    // Resolve target
    var targetSpec = getClosestAttr(elt, "hx-target");
    var target = targetSpec ? resolveTarget(elt, targetSpec) : elt;

    // Resolve swap
    var swapSpec = parseSwapSpec(getClosestAttr(elt, "hx-swap"));

    // Gather values
    var vals = gatherValues(elt, verb);

    // Gather headers
    var reqHeaders = gatherHeaders(elt);
    reqHeaders["HX-Request"] = "true";
    reqHeaders["HX-Current-URL"] = window.location.href;
    if (target && target.id) reqHeaders["HX-Target"] = target.id;
    if (triggerElt.id) reqHeaders["HX-Trigger"] = triggerElt.id;
    if (triggerElt.name) reqHeaders["HX-Trigger-Name"] = triggerElt.name;
    if (isBoosted) reqHeaders["HX-Boosted"] = "true";
    if (promptValue !== null) reqHeaders["HX-Prompt"] = promptValue;

    // C19 — Request config
    var reqConfig = getClosestAttr(elt, "hx-request");
    var reqTimeout = config.timeout;
    var reqCredentials = config.withCredentials;
    if (reqConfig) {
        try {
            var rc = JSON.parse(reqConfig);
            if (rc.timeout !== undefined) reqTimeout = rc.timeout;
            if (rc.credentials !== undefined) reqCredentials = rc.credentials === "include" || rc.credentials === true;
        } catch(e) {}
    }

    // C14 — configRequest event
    var configDetail = { headers: reqHeaders, parameters: vals, verb: verb, path: url, target: target, elt: elt };
    if (!fire(elt, "htmx:configRequest", configDetail)) return;
    url = configDetail.path;
    vals = configDetail.parameters;
    reqHeaders = configDetail.headers;

    // C16 — transformRequest extension hook
    var activeExts = getActiveExtensions(elt);
    for (var ei = 0; ei < activeExts.length; ei++) {
        if (activeExts[ei].transformRequest) {
            activeExts[ei].transformRequest(reqHeaders, vals, elt);
        }
    }

    // C19 — selfRequestsOnly check
    if (config.selfRequestsOnly) {
        try {
            var a = document.createElement("a");
            a.href = url;
            if (a.hostname && a.hostname !== window.location.hostname) {
                fire(elt, "htmx:sendError", {});
                return;
            }
        } catch(e) {}
    }

    // C14 — beforeRequest event
    if (!fire(elt, "htmx:beforeRequest", { elt: elt, target: target, requestConfig: configDetail })) return;

    // Sync handling
    var syncSpec = getClosestAttr(elt, "hx-sync");
    var syncElt = elt;
    var syncMode = null;
    if (syncSpec) {
        var colonIdx = syncSpec.indexOf(":");
        if (colonIdx > 0) {
            var syncSel = syncSpec.substring(0, colonIdx).trim();
            syncMode = syncSpec.substring(colonIdx + 1).trim();
            syncElt = resolveTarget(elt, syncSel) || elt;
        } else {
            syncMode = syncSpec.trim();
        }
    }

    var syncKey = getSyncKey(syncElt);
    var syncState = syncMap[syncKey];
    if (!syncState) syncState = syncMap[syncKey] = { inFlight: false, abortController: null, queue: [] };

    if (syncMode && syncState.inFlight) {
        if (syncMode === "drop") return;
        if (syncMode === "abort" || syncMode === "replace") {
            if (syncState.abortController) syncState.abortController.abort();
            syncState.inFlight = false;
        } else if (syncMode.indexOf("queue:") === 0) {
            var qMode = syncMode.substring(6);
            if (qMode === "none") return;
            if (qMode === "first") {
                if (syncState.queue.length > 0) return;
                syncState.queue.push(function() { issueRequest(elt, verb, url, evtOrSource, isBoosted); });
                return;
            }
            if (qMode === "last") {
                syncState.queue = [function() { issueRequest(elt, verb, url, evtOrSource, isBoosted); }];
                return;
            }
            if (qMode === "all") {
                syncState.queue.push(function() { issueRequest(elt, verb, url, evtOrSource, isBoosted); });
                return;
            }
            return;
        }
    }

    // Indicator
    var indicatorSpec = getClosestAttr(elt, "hx-indicator");
    var indicators = [];
    if (indicatorSpec) {
        try { indicators = Array.prototype.slice.call(document.querySelectorAll(indicatorSpec)); } catch(e) {}
    } else {
        indicators = [elt];
    }
    for (var ii = 0; ii < indicators.length; ii++) {
        indicators[ii].classList.add(config.indicatorClass);
    }

    // C13 — hx-disabled-elt
    var disabledSpec = getClosestAttr(elt, "hx-disabled-elt");
    var disabledElts = [];
    if (disabledSpec) {
        try {
            disabledElts = Array.prototype.slice.call(document.querySelectorAll(disabledSpec));
            for (var di = 0; di < disabledElts.length; di++) disabledElts[di].disabled = true;
        } catch(e) {}
    }

    // Build URL and body
    var body = null;
    var useUrlParams = config.methodsThatUseUrlParams.indexOf(verb.toLowerCase()) >= 0;
    var encoding = getClosestAttr(elt, "hx-encoding");
    var useMultipart = encoding === "multipart/form-data" || hasFileInputs(elt);

    if (useUrlParams) {
        // C2 — GET encodes as query string
        var qs = [];
        for (var key in vals) {
            if (vals.hasOwnProperty(key)) {
                var v = vals[key];
                if (Array.isArray(v)) {
                    for (var ai = 0; ai < v.length; ai++) qs.push(encodeURIComponent(key) + "=" + encodeURIComponent(v[ai]));
                } else {
                    qs.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
                }
            }
        }
        // C19 — cache buster
        if (config.getCacheBusterParam) {
            qs.push("org.htmx.cache-buster=" + encodeURIComponent(target && target.id ? target.id : "true"));
        }
        if (qs.length) url += (url.indexOf("?") >= 0 ? "&" : "?") + qs.join("&");
    } else if (useMultipart) {
        // C2 — multipart
        body = new FormData();
        for (var mk in vals) {
            if (vals.hasOwnProperty(mk)) {
                var mv = vals[mk];
                if (Array.isArray(mv)) {
                    for (var mi = 0; mi < mv.length; mi++) body.append(mk, mv[mi]);
                } else {
                    body.append(mk, mv);
                }
            }
        }
        // Append file inputs
        var formEl = elt.tagName === "FORM" ? elt : elt.closest("form");
        if (formEl) {
            var fileInputs = formEl.querySelectorAll("input[type=file]");
            for (var fi = 0; fi < fileInputs.length; fi++) {
                var files = fileInputs[fi].files;
                for (var fj = 0; fj < files.length; fj++) body.append(fileInputs[fi].name, files[fj]);
            }
        }
    } else {
        // C2 — url-encoded
        var pairs = [];
        for (var uk in vals) {
            if (vals.hasOwnProperty(uk)) {
                var uv = vals[uk];
                if (Array.isArray(uv)) {
                    for (var ui = 0; ui < uv.length; ui++) pairs.push(encodeURIComponent(uk) + "=" + encodeURIComponent(uv[ui]));
                } else {
                    pairs.push(encodeURIComponent(uk) + "=" + encodeURIComponent(uv));
                }
            }
        }
        body = pairs.join("&");
        if (!useMultipart) reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }

    // Abort listener
    var abortController = new AbortController();
    syncState.abortController = abortController;
    syncState.inFlight = true;

    var abortHandler = function() {
        abortController.abort();
        fire(elt, "htmx:xhr:abort", {});
    };
    elt.addEventListener("htmx:abort", abortHandler, { once: true });

    // C14 — beforeSend
    fire(elt, "htmx:beforeSend", { xhr: null, target: target, requestConfig: configDetail });

    // Build fetch options
    var fetchOpts = {
        method: verb,
        headers: reqHeaders,
        signal: abortController.signal
    };
    if (body !== null && !useUrlParams) fetchOpts.body = body;
    if (reqCredentials) fetchOpts.credentials = "include";

    // Timeout
    var timeoutId = null;
    if (reqTimeout > 0) {
        timeoutId = setTimeout(function() {
            abortController.abort();
            fire(elt, "htmx:timeout", { elt: elt, url: url });
        }, reqTimeout);
    }

    fetch(url, fetchOpts).then(function(resp) {
        if (timeoutId) clearTimeout(timeoutId);

        var status = resp.status;

        // C7 — Server response headers
        var hxRedirect = resp.headers.get("HX-Redirect");
        if (hxRedirect) { window.location.href = hxRedirect; return; }
        var hxRefresh = resp.headers.get("HX-Refresh");
        if (hxRefresh === "true") { window.location.reload(); return; }

        // C7 — HX-Location: client-side AJAX redirect
        var hxLocation = resp.headers.get("HX-Location");
        if (hxLocation) {
            var locPath, locTarget, locVerb;
            hxLocation = hxLocation.trim();
            if (hxLocation.charAt(0) === "{") {
                try {
                    var locObj = JSON.parse(hxLocation);
                    locPath = locObj.path;
                    locTarget = locObj.target || "body";
                    locVerb = (locObj.verb || "GET").toUpperCase();
                } catch(e) { locPath = hxLocation; locTarget = "body"; locVerb = "GET"; }
            } else {
                locPath = hxLocation; locTarget = "body"; locVerb = "GET";
            }
            var locTargetElt = document.querySelector(locTarget) || document.body;
            issueRequest(locTargetElt, locVerb, locPath, null, false);
            return;
        }

        var hxRetarget = resp.headers.get("HX-Retarget");
        if (hxRetarget) target = document.querySelector(hxRetarget);
        var hxReswap = resp.headers.get("HX-Reswap");
        if (hxReswap) swapSpec = parseSwapSpec(hxReswap);

        var hxPushUrl = resp.headers.get("HX-Push-Url");
        var hxReplaceUrl = resp.headers.get("HX-Replace-Url");

        return resp.text().then(function(html) {
            // C14 — afterRequest
            fire(elt, "htmx:afterRequest", { elt: elt, target: target, xhr: null, successful: status >= 200 && status < 300 });

            // C7 — HX-Trigger (before swap)
            fireServerEvents(elt, resp.headers.get("HX-Trigger"));

            // C2 — only swap on 2xx, not 204
            var shouldSwap = status >= 200 && status < 300 && status !== 204;
            if (status >= 400) fire(elt, "htmx:responseError", { elt: elt, target: target, status: status, response: html });

            // C14 — beforeSwap (allows override via shouldSwap)
            var beforeSwapDetail = { elt: elt, target: target, shouldSwap: shouldSwap, serverResponse: html, requestConfig: configDetail };
            fire(elt, "htmx:beforeSwap", beforeSwapDetail);
            shouldSwap = beforeSwapDetail.shouldSwap;

            if (!shouldSwap) return;

            // C16 — transformResponse extension hook
            for (var tei = 0; tei < activeExts.length; tei++) {
                if (activeExts[tei].transformResponse) {
                    html = activeExts[tei].transformResponse(html, null, elt);
                }
            }

            // Parse response into fragment
            var frag = document.createElement("div");
            frag.innerHTML = html;

            // C7 — Update title from response
            var titleEl = frag.querySelector("title");
            if (titleEl) document.title = titleEl.textContent;

            // C8 — Process select-oob first
            processSelectOob(frag, elt);

            // C8 — Process OOB swaps
            processOobSwaps(frag);

            // C3 — hx-select: extract portion of response
            var selectSpec = getAttr(elt, "hx-select") || getAttr(elt, "data-hx-select");
            var swapHtml;
            if (selectSpec) {
                var selected = frag.querySelector(selectSpec);
                swapHtml = selected ? selected.outerHTML : "";
            } else {
                swapHtml = frag.innerHTML;
            }

            // C8 — hx-preserve
            var preserved = handlePreserve(target);

            // Perform swap with transition support
            var doTheSwap = function() {
                // C3 — swapping class lifecycle
                target.classList.add(config.swappingClass);
                setTimeout(function() {
                    var settleInfo = { tasks: [], elts: [] };
                    doSwap(target, swapHtml, swapSpec, settleInfo);

                    // Restore preserved
                    if (swapSpec.swapStyle === "innerHTML" || swapSpec.swapStyle === "outerHTML") {
                        var swapTarget = swapSpec.swapStyle === "outerHTML" ? (settleInfo.elts[0] || target) : target;
                        restorePreserved(swapTarget, preserved);
                    }

                    target.classList.remove(config.swappingClass);

                    // C14 — afterSwap
                    fire(elt, "htmx:afterSwap", { elt: elt, target: target });

                    // C7 — HX-Trigger-After-Swap
                    fireServerEvents(elt, resp.headers.get("HX-Trigger-After-Swap"));

                    // Process new content
                    if (swapSpec.swapStyle === "outerHTML") {
                        for (var si = 0; si < settleInfo.elts.length; si++) {
                            if (settleInfo.elts[si]) {
                                processNode(settleInfo.elts[si]);
                                processScripts(settleInfo.elts[si]);
                                processHxOn(settleInfo.elts[si]);
                            }
                        }
                    } else {
                        processNode(target);
                        processScripts(target);
                        processHxOn(target);
                    }

                    // C3 — settle phase
                    target.classList.add(config.settlingClass);
                    // Add htmx-added to newly inserted elements
                    for (var ni = 0; ni < settleInfo.elts.length; ni++) {
                        if (settleInfo.elts[ni]) settleInfo.elts[ni].classList.add(config.addedClass);
                    }

                    setTimeout(function() {
                        target.classList.remove(config.settlingClass);
                        for (var ri = 0; ri < settleInfo.elts.length; ri++) {
                            if (settleInfo.elts[ri]) settleInfo.elts[ri].classList.remove(config.addedClass);
                        }

                        // C7 — HX-Trigger-After-Settle
                        fireServerEvents(elt, resp.headers.get("HX-Trigger-After-Settle"));

                        // C14 — afterSettle, load
                        fire(elt, "htmx:afterSettle", { elt: elt, target: target });
                        fire(target, "htmx:load", { elt: target });

                        // C12 — History: push or replace URL
                        var pushUrl = getClosestAttr(elt, "hx-push-url");
                        var replaceUrl = getClosestAttr(elt, "hx-replace-url");
                        // Server headers override
                        if (hxPushUrl !== null) pushUrl = hxPushUrl;
                        if (hxReplaceUrl !== null) replaceUrl = hxReplaceUrl;

                        if (pushUrl && pushUrl !== "false") {
                            var pushPath = pushUrl === "true" ? url : pushUrl;
                            saveHistory();
                            history.pushState({ htmx: true }, "", pushPath);
                            fire(elt, "htmx:pushedIntoHistory", { path: pushPath });
                        } else if (replaceUrl && replaceUrl !== "false") {
                            var replacePath = replaceUrl === "true" ? url : replaceUrl;
                            saveHistory();
                            history.replaceState({ htmx: true }, "", replacePath);
                            fire(elt, "htmx:replacedInHistory", { path: replacePath });
                        } else if (isBoosted) {
                            // Boosted elements push URL
                            saveHistory();
                            history.pushState({ htmx: true }, "", url);
                            fire(elt, "htmx:pushedIntoHistory", { path: url });
                        }

                        // Scroll handling
                        if (swapSpec.scroll) {
                            var scrollTarget = swapSpec.scrollTarget ? document.querySelector(swapSpec.scrollTarget) : target;
                            if (scrollTarget) {
                                scrollTarget.scrollIntoView({ behavior: config.scrollBehavior, block: swapSpec.scroll === "top" ? "start" : "end" });
                            }
                        }
                        if (swapSpec.show) {
                            var showTarget = swapSpec.showTarget ? document.querySelector(swapSpec.showTarget) : target;
                            if (showTarget) {
                                showTarget.scrollIntoView({ behavior: config.scrollBehavior, block: swapSpec.show === "top" ? "start" : "end" });
                            }
                        }
                        if (isBoosted && config.scrollIntoViewOnBoost) {
                            window.scrollTo({ top: 0, behavior: config.scrollBehavior });
                        }
                    }, swapSpec.settleDelay);
                }, swapSpec.swapDelay);
            };

            // C9 — View Transitions
            if (swapSpec.transition && document.startViewTransition) {
                document.startViewTransition(doTheSwap);
            } else {
                doTheSwap();
            }
        });
    }).catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name !== "AbortError") {
            fire(elt, "htmx:sendError", { error: err });
            fire(elt, "htmx:afterRequest", { elt: elt, target: target, successful: false });
        }
    }).finally(function() {
        // Cleanup
        for (var ci = 0; ci < indicators.length; ci++) indicators[ci].classList.remove(config.indicatorClass);
        for (var cdi = 0; cdi < disabledElts.length; cdi++) disabledElts[cdi].disabled = false;
        elt.removeEventListener("htmx:abort", abortHandler);
        syncState.inFlight = false;
        syncState.abortController = null;
        // Process sync queue
        if (syncState.queue.length > 0) {
            var next = syncState.queue.shift();
            next();
        }
    });
}

// C12 — History save
function saveHistory() {
    fire(document.body, "htmx:beforeHistorySave", {});
    var historyElt = document.querySelector("[hx-history-elt], [data-hx-history-elt]") || document.body;
    var snapshot = {
        url: window.location.href,
        content: historyElt.innerHTML,
        title: document.title,
        scroll: window.scrollY
    };
    // LRU cache
    for (var i = 0; i < historyCache.length; i++) {
        if (historyCache[i].url === snapshot.url) { historyCache.splice(i, 1); break; }
    }
    historyCache.push(snapshot);
    if (historyCache.length > config.historyCacheSize) historyCache.shift();
}

// C12 — History restore
function restoreHistory(url) {
    fire(document.body, "htmx:historyRestore", { path: url });
    var historyElt = document.querySelector("[hx-history-elt], [data-hx-history-elt]") || document.body;
    for (var i = 0; i < historyCache.length; i++) {
        if (historyCache[i].url === url) {
            historyElt.innerHTML = historyCache[i].content;
            document.title = historyCache[i].title;
            processNode(historyElt);
            processScripts(historyElt);
            processHxOn(historyElt);
            window.scrollTo(0, historyCache[i].scroll);
            return;
        }
    }
    // Cache miss
    fire(document.body, "htmx:historyCacheMiss", { path: url });
    if (config.refreshOnHistoryMiss) {
        window.location.reload();
        return;
    }
    // Fetch from server
    fetch(url, {
        headers: { "HX-Request": "true", "HX-History-Restore-Request": "true", "HX-Current-URL": window.location.href }
    }).then(function(resp) {
        return resp.text().then(function(html) {
            fire(document.body, "htmx:historyCacheMissLoad", { path: url, serverResponse: html });
            // If full document, extract body
            var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) html = bodyMatch[1];
            historyElt.innerHTML = html;
            var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            if (titleMatch) document.title = titleMatch[1];
            processNode(historyElt);
            processScripts(historyElt);
            processHxOn(historyElt);
        });
    }).catch(function(err) {
        fire(document.body, "htmx:historyCacheMissError", { path: url, error: err });
    });
}

// C15 — SSE Support
function initSSE(elt) {
    var url = getAttr(elt, "sse-connect") || getAttr(elt, "data-sse-connect");
    if (!url || elt.__htmx_sse) return;
    var es = new EventSource(url);
    elt.__htmx_sse = es;

    es.onopen = function() { fire(elt, "htmx:sseOpen", {}); };
    es.onerror = function() { fire(elt, "htmx:sseError", {}); };

    // Find all sse-swap descendants (and self)
    function bindSseSwaps() {
        var swapElts = elt.querySelectorAll("[sse-swap], [data-sse-swap]");
        var all = [elt].concat(Array.prototype.slice.call(swapElts));
        for (var i = 0; i < all.length; i++) {
            var se = all[i];
            var eventName = getAttr(se, "sse-swap");
            if (!eventName || se.__htmx_sse_bound) continue;
            se.__htmx_sse_bound = true;
            (function(el, evName) {
                es.addEventListener(evName, function(evt) {
                    var html = evt.data;
                    var sseTarget = getClosestAttr(el, "hx-target") ? resolveTarget(el, getClosestAttr(el, "hx-target")) : el;
                    var sseSwapSpec = parseSwapSpec(getClosestAttr(el, "hx-swap"));

                    // OOB processing for SSE
                    var frag = document.createElement("div");
                    frag.innerHTML = html;
                    processOobSwaps(frag);
                    html = frag.innerHTML;

                    doSwap(sseTarget, html, sseSwapSpec);
                    processNode(sseTarget);
                    processScripts(sseTarget);
                    processHxOn(sseTarget);
                    fire(sseTarget, "htmx:load", { elt: sseTarget });
                });
            })(se, eventName);
        }
    }
    bindSseSwaps();

    // sse-close
    var closeEvt = getAttr(elt, "sse-close") || getAttr(elt, "data-sse-close");
    if (closeEvt) {
        es.addEventListener(closeEvt, function() { es.close(); });
    }

    // Cleanup when element removed from DOM
    var sseCheckInterval = setInterval(function() {
        if (!document.body.contains(elt)) {
            es.close();
            clearInterval(sseCheckInterval);
        }
    }, 1000);
}

// C15 — WebSocket Support
function initWebSocket(elt) {
    var url = getAttr(elt, "ws-connect") || getAttr(elt, "data-ws-connect");
    if (!url || elt.__htmx_ws) return;

    var reconnectDelay = 1000;
    var maxDelay = 30000;

    function connect() {
        var ws = new WebSocket(url);
        elt.__htmx_ws = ws;

        ws.onopen = function() { reconnectDelay = 1000; };
        ws.onmessage = function(evt) {
            var html = evt.data;
            var frag = document.createElement("div");
            frag.innerHTML = html;
            processOobSwaps(frag);
            if (frag.innerHTML.trim()) {
                var swapSpec = parseSwapSpec(getClosestAttr(elt, "hx-swap"));
                doSwap(elt, frag.innerHTML, swapSpec);
                processNode(elt);
                processScripts(elt);
                processHxOn(elt);
            }
        };
        ws.onclose = function() {
            if (!document.body.contains(elt)) return;
            setTimeout(function() {
                reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
                connect();
            }, reconnectDelay);
        };

        // ws-send elements
        var senders = elt.querySelectorAll("[ws-send], [data-ws-send]");
        for (var i = 0; i < senders.length; i++) {
            if (senders[i].__htmx_ws_send) continue;
            senders[i].__htmx_ws_send = true;
            (function(sender) {
                var triggers = parseTriggers(sender);
                for (var t = 0; t < triggers.length; t++) {
                    sender.addEventListener(triggers[t].event === "submit" ? "submit" : triggers[t].event, function(evt) {
                        if (evt.type === "submit") evt.preventDefault();
                        var vals = gatherValues(sender, "POST");
                        ws.send(JSON.stringify(vals));
                    });
                }
            })(senders[i]);
        }
    }
    connect();

    // Cleanup
    var wsCheckInterval = setInterval(function() {
        if (!document.body.contains(elt)) {
            if (elt.__htmx_ws) elt.__htmx_ws.close();
            clearInterval(wsCheckInterval);
        }
    }, 1000);
}

// Main processing — C1, C5, C6, C19
function processNode(elt) {
    if (!elt || !elt.querySelectorAll) return;

    fire(elt, "htmx:beforeProcessNode", { elt: elt });

    // Process self and descendants
    var all = [elt].concat(Array.prototype.slice.call(elt.querySelectorAll("*")));
    for (var i = 0; i < all.length; i++) {
        var el = all[i];

        // C19 — hx-disable: skip element if it has hx-disable or is inside an hx-disable subtree
        if (getAttr(el, "hx-disable") !== null) continue;
        var disableAncestor = el.closest("[hx-disable], [data-hx-disable]");
        if (disableAncestor) continue;

        // Skip already processed
        if (el.__htmx_processed) continue;

        // Check for verb attributes (direct first, then inherited)
        var verb = null, url = null;
        for (var vi = 0; vi < VERBS.length; vi++) {
            var directVal = getAttr(el, "hx-" + VERBS[vi]);
            if (directVal !== null) {
                verb = VERBS[vi];
                url = directVal;
                break;
            }
        }
        if (!verb) {
            for (var vi2 = 0; vi2 < VERBS.length; vi2++) {
                var inherited = getClosestAttr(el, "hx-" + VERBS[vi2]);
                if (inherited !== null) {
                    verb = VERBS[vi2];
                    url = inherited;
                    break;
                }
            }
        }

        if (verb) {
            el.__htmx_processed = true;
            attachTriggers(el, verb, url, false);
        }

        // C6 — Boost processing (hx-boost="false" on child opts out)
        if (!verb) {
            var ownBoost = getAttr(el, "hx-boost");
            var boost = ownBoost !== null ? ownBoost : getClosestAttr(el, "hx-boost");
            if (boost === "true") {
                if (el.tagName === "A") {
                    var href = el.getAttribute("href");
                    if (href && href.charAt(0) !== "#" && href.indexOf("mailto:") !== 0 && href.indexOf("javascript:") !== 0 && href !== "") {
                        if (!el.__htmx_processed) {
                            el.__htmx_processed = true;
                            el.addEventListener("click", function(evt) {
                                if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
                                evt.preventDefault();
                                var a = evt.currentTarget;
                                var target = getClosestAttr(a, "hx-target");
                                var resolvedTarget = target ? resolveTarget(a, target) : document.body;
                                // Use the href from the anchor
                                var reqUrl = a.href; // resolved absolute URL
                                issueBoostRequest(a, "GET", reqUrl, resolvedTarget);
                            });
                        }
                    }
                } else if (el.tagName === "FORM") {
                    if (!el.__htmx_processed) {
                        el.__htmx_processed = true;
                        el.addEventListener("submit", function(evt) {
                            evt.preventDefault();
                            var f = evt.currentTarget;
                            var method = (f.method || "GET").toUpperCase();
                            var target = getClosestAttr(f, "hx-target");
                            var resolvedTarget = target ? resolveTarget(f, target) : document.body;
                            var reqUrl = f.action; // resolved absolute URL
                            issueBoostRequest(f, method, reqUrl, resolvedTarget);
                        });
                    }
                }
            }
        }

        // C15 — SSE/WS init
        if (getAttr(el, "sse-connect") || getAttr(el, "data-sse-connect")) initSSE(el);
        if (getAttr(el, "ws-connect") || getAttr(el, "data-ws-connect")) initWebSocket(el);
    }

    fire(elt, "htmx:afterProcessNode", { elt: elt });
}

// Boosted request helper
function issueBoostRequest(elt, verb, url, target) {
    // Save the original hx-target resolution for the request
    var origTarget = getClosestAttr(elt, "hx-target");
    issueRequest(elt, verb, url, null, true);
}

// C5 — Attach trigger listeners
function attachTriggers(elt, verb, url, isBoosted) {
    var triggers = parseTriggers(elt);
    for (var i = 0; i < triggers.length; i++) {
        (function(trigger) {
            if (trigger.event === "load") {
                // Fire immediately
                setTimeout(function() { issueRequest(elt, verb, url, null, isBoosted); }, 0);
                return;
            }
            if (trigger.event === "revealed") {
                // IntersectionObserver, fires once
                var observer = new IntersectionObserver(function(entries) {
                    for (var e = 0; e < entries.length; e++) {
                        if (entries[e].isIntersecting) {
                            observer.disconnect();
                            issueRequest(elt, verb, url, null, isBoosted);
                        }
                    }
                });
                observer.observe(elt);
                return;
            }
            if (trigger.event === "intersect") {
                var opts = {};
                if (trigger.modifiers.threshold !== undefined) opts.threshold = trigger.modifiers.threshold;
                if (trigger.modifiers.root) {
                    var rootEl = document.querySelector(trigger.modifiers.root);
                    if (rootEl) opts.root = rootEl;
                }
                var intObserver = new IntersectionObserver(function(entries) {
                    for (var e = 0; e < entries.length; e++) {
                        if (entries[e].isIntersecting) {
                            issueRequest(elt, verb, url, null, isBoosted);
                        }
                    }
                }, opts);
                intObserver.observe(elt);
                return;
            }
            if (trigger.event === "every") {
                var intervalId = setInterval(function() {
                    if (!document.body.contains(elt)) { clearInterval(intervalId); return; }
                    issueRequest(elt, verb, url, null, isBoosted);
                }, trigger.modifiers.interval);
                return;
            }

            // Standard event
            var listenTarget = trigger.modifiers.from ? resolveFromTarget(elt, trigger.modifiers.from) : elt;
            if (!listenTarget) return;

            var lastValue = null;
            var throttleTimer = null;
            var delayTimer = null;
            var fired = false;

            // Queue handling
            var queueMode = trigger.modifiers.queue || null;

            listenTarget.addEventListener(trigger.event, function handler(evt) {
                // Submit always preventDefault
                if (trigger.event === "submit") evt.preventDefault();

                // Filter expression
                if (trigger.modifiers.filter && config.allowEval) {
                    try {
                        var filterResult = new Function("event", "return (" + trigger.modifiers.filter + ")")(evt);
                        if (!filterResult) return;
                    } catch(e) { return; }
                }

                // Target filter
                if (trigger.modifiers.target) {
                    if (!evt.target.matches(trigger.modifiers.target)) return;
                }

                // Once
                if (trigger.modifiers.once) {
                    if (fired) return;
                    fired = true;
                }

                // Changed
                if (trigger.modifiers.changed) {
                    var currentVal = elt.value;
                    if (currentVal === lastValue) return;
                    lastValue = currentVal;
                }

                // Consume
                if (trigger.modifiers.consume) {
                    evt.preventDefault();
                    evt.stopPropagation();
                }

                var doRequest = function() {
                    issueRequest(elt, verb, url, evt, isBoosted);
                };

                // Throttle
                if (trigger.modifiers.throttle) {
                    if (throttleTimer) return;
                    doRequest();
                    throttleTimer = setTimeout(function() { throttleTimer = null; }, trigger.modifiers.throttle);
                    return;
                }

                // Delay (debounce)
                if (trigger.modifiers.delay) {
                    if (delayTimer) clearTimeout(delayTimer);
                    delayTimer = setTimeout(doRequest, trigger.modifiers.delay);
                    return;
                }

                doRequest();
            });
        })(triggers[i]);
    }
}

// Indicator styles injection
function injectIndicatorStyles() {
    if (!config.includeIndicatorStyles) return;
    var style = document.createElement("style");
    style.textContent = ".htmx-indicator{opacity:0;transition:opacity 200ms ease-in;}.htmx-request .htmx-indicator,.htmx-request.htmx-indicator{opacity:1;}";
    document.head.appendChild(style);
}

// C11 — Load config from meta tag
function loadConfig() {
    var meta = document.querySelector('meta[name="htmx-config"]');
    if (meta) {
        try {
            var userConfig = JSON.parse(meta.getAttribute("content"));
            for (var key in userConfig) {
                if (userConfig.hasOwnProperty(key)) config[key] = userConfig[key];
            }
        } catch(e) {}
    }
}

// Init
function init() {
    loadConfig();
    injectIndicatorStyles();

    // C12 — Popstate handler
    window.addEventListener("popstate", function(evt) {
        if (!evt.state || !evt.state.htmx) return;
        restoreHistory(window.location.href);
    });

    processNode(document.body);
    processHxOn(document.body);
}

// C10 — Public API
var htmx = {
    version: "2.0.0-derived",
    config: config,
    logger: null,

    process: function(elt) { processNode(elt); processHxOn(elt); },

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
            target = (typeof spec.target === "string" ? document.querySelector(spec.target) : spec.target) || document.body;
            source = (typeof spec.source === "string" ? document.querySelector(spec.source) : spec.source) || target;
        }
        issueRequest(source, verb, url, null, false);
    },

    find: function(eltOrSel, sel) {
        if (sel !== undefined) return eltOrSel.querySelector(sel);
        return document.querySelector(eltOrSel);
    },

    findAll: function(eltOrSel, sel) {
        if (sel !== undefined) return Array.prototype.slice.call(eltOrSel.querySelectorAll(sel));
        return Array.prototype.slice.call(document.querySelectorAll(eltOrSel));
    },

    closest: function(elt, sel) { return elt.closest(sel); },

    remove: function(elt) { if (elt && elt.parentElement) elt.parentElement.removeChild(elt); },

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
        var sibs = elt.parentElement ? elt.parentElement.children : [];
        for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove(cls);
        elt.classList.add(cls);
    },

    trigger: function(elt, event, detail) { fire(elt, event, detail); },

    swap: function(target, html, swapSpecStr) {
        var spec = parseSwapSpec(swapSpecStr);
        doSwap(target, html, spec);
        processNode(target);
        processScripts(target);
        processHxOn(target);
    },

    values: function(elt) { return gatherValues(elt, "GET"); },

    on: function(eltOrEvt, evtOrHandler, handler) {
        if (typeof eltOrEvt === "string") {
            document.body.addEventListener(eltOrEvt, evtOrHandler);
        } else {
            eltOrEvt.addEventListener(evtOrHandler, handler);
        }
    },

    off: function(eltOrEvt, evtOrHandler, handler) {
        if (typeof eltOrEvt === "string") {
            document.body.removeEventListener(eltOrEvt, evtOrHandler);
        } else {
            eltOrEvt.removeEventListener(evtOrHandler, handler);
        }
    },

    defineExtension: function(name, def) {
        extensions[name] = def;
        if (def.init) def.init(htmx);
    },

    removeExtension: function(name) { delete extensions[name]; },

    parseInterval: parseInterval,

    logAll: function() { logEnabled = true; },
    logNone: function() { logEnabled = false; },

    // Internal API for extensions
    _: {
        fire: fire,
        getAttr: getAttr,
        resolveTarget: resolveTarget,
        doSwap: doSwap,
        processScripts: processScripts
    }
};

window.htmx = htmx;

// Initialization
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
