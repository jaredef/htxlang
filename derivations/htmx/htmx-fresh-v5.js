(function() {
var extensions = {};
var historyCache = [];
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

function getAttr(elt, name) {
    if (!elt || !elt.getAttribute) return null;
    return elt.getAttribute(name);
}

function getInheritedAttr(elt, name) {
    var cur = elt;
    while (cur) {
        var dis = getAttr(cur, "hx-disinherit");
        if (cur !== elt && dis) {
            if (dis === "*" || dis.split(/\s+/).indexOf(name) >= 0) return null;
        }
        var val = getAttr(cur, name);
        if (val !== null) return val;
        cur = cur.parentElement;
    }
    return null;
}

function parseInterval(str) {
    if (!str) return 0;
    str = str.trim();
    if (str.slice(-2) === "ms") return parseFloat(str);
    if (str.slice(-1) === "s") return parseFloat(str) * 1000;
    return parseFloat(str);
}

function fire(elt, name, detail) {
    detail = detail || {};
    var evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
    var exts = resolveExtensions(elt);
    for (var i = 0; i < exts.length; i++) {
        if (exts[i].onEvent) {
            try { exts[i].onEvent(name, evt); } catch(e) {}
        }
    }
    if (window.htmx.logger) {
        window.htmx.logger(elt, name, detail);
    }
    return elt.dispatchEvent(evt);
}

function resolveExtensions(elt) {
    var result = [];
    var ignored = {};
    var cur = elt;
    while (cur) {
        var attr = getAttr(cur, "hx-ext");
        if (attr) {
            var parts = attr.split(",");
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i].trim();
                if (p.indexOf("ignore:") === 0) {
                    ignored[p.slice(7).trim()] = true;
                } else if (!ignored[p] && extensions[p]) {
                    result.push(extensions[p]);
                }
            }
        }
        cur = cur.parentElement;
    }
    return result;
}

function resolveTarget(elt, val) {
    if (!val || val === "this") return elt;
    if (val.indexOf("closest ") === 0) return elt.closest(val.slice(8));
    if (val.indexOf("find ") === 0) return elt.querySelector(val.slice(5));
    if (val.indexOf("next") === 0) {
        var ns = val.slice(4).trim();
        if (!ns) return elt.nextElementSibling;
        var n = elt.nextElementSibling;
        while (n) { if (n.matches(ns)) return n; n = n.nextElementSibling; }
        return null;
    }
    if (val.indexOf("previous") === 0) {
        var ps = val.slice(8).trim();
        if (!ps) return elt.previousElementSibling;
        var p = elt.previousElementSibling;
        while (p) { if (p.matches(ps)) return p; p = p.previousElementSibling; }
        return null;
    }
    return document.querySelector(val);
}

function parseSwapSpec(str) {
    var spec = { swapStyle: config.defaultSwapStyle, swapDelay: config.defaultSwapDelay, settleDelay: config.defaultSettleDelay, scroll: null, show: null, focusScroll: null, transition: false };
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
            spec.scroll = { dir: sc[sc.length - 1], selector: sc.length > 1 ? sc.slice(0, -1).join(":") : null };
            if (spec.scroll.dir !== "top" && spec.scroll.dir !== "bottom") { spec.scroll.selector = null; spec.scroll.dir = sv; }
        } else if (p.indexOf("show:") === 0) {
            var shv = p.slice(5);
            var sh = shv.split(":");
            spec.show = { dir: sh[sh.length - 1], selector: sh.length > 1 ? sh.slice(0, -1).join(":") : null };
            if (spec.show.dir !== "top" && spec.show.dir !== "bottom") { spec.show.selector = null; spec.show.dir = shv; }
        } else if (p.indexOf("focus-scroll:") === 0) spec.focusScroll = p.slice(13) === "true";
        else if (p.indexOf("transition:") === 0) spec.transition = p.slice(11) === "true";
    }
    return spec;
}

function doSwap(target, html, strategy) {
    switch (strategy) {
        case "innerHTML": target.innerHTML = html; break;
        case "outerHTML": target.outerHTML = html; break;
        case "beforebegin": target.insertAdjacentHTML("beforebegin", html); break;
        case "afterbegin": target.insertAdjacentHTML("afterbegin", html); break;
        case "beforeend": target.insertAdjacentHTML("beforeend", html); break;
        case "afterend": target.insertAdjacentHTML("afterend", html); break;
        case "delete": target.remove(); break;
        case "none": break;
    }
}

function processOob(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var oobElts = tmp.querySelectorAll("[hx-swap-oob]");
    var toRemove = [];
    for (var i = 0; i < oobElts.length; i++) {
        var oob = oobElts[i];
        toRemove.push(oob);
        var attr = getAttr(oob, "hx-swap-oob");
        oob.removeAttribute("hx-swap-oob");
        var strategy = "outerHTML";
        var targetSel = null;
        if (attr !== "true") {
            var ci = attr.indexOf(":");
            if (ci >= 0) {
                strategy = attr.slice(0, ci);
                targetSel = attr.slice(ci + 1);
            } else {
                strategy = attr;
            }
        }
        var oobTarget = targetSel ? document.querySelector(targetSel) : document.getElementById(oob.id);
        if (!oobTarget) {
            fire(document.body, "htmx:oobErrorNoTarget", { content: oob });
            continue;
        }
        fire(oobTarget, "htmx:oobBeforeSwap", { target: oobTarget, fragment: oob });
        if (strategy === "outerHTML") {
            doSwap(oobTarget, oob.outerHTML, "outerHTML");
            var swapped = document.getElementById(oob.id);
            if (swapped) process(swapped);
        } else {
            doSwap(oobTarget, oob.innerHTML, strategy);
            process(oobTarget);
        }
        fire(oobTarget, "htmx:oobAfterSwap", { target: oobTarget, fragment: oob });
    }
    for (var j = 0; j < toRemove.length; j++) {
        if (toRemove[j].parentNode) toRemove[j].parentNode.removeChild(toRemove[j]);
    }
    return tmp.innerHTML;
}

function processSelectOob(html, selectOob) {
    if (!selectOob) return html;
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var entries = selectOob.split(",");
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i].trim();
        var ci = entry.indexOf(":");
        var srcSel, tgtSel;
        if (ci >= 0) {
            srcSel = entry.slice(0, ci).trim();
            tgtSel = entry.slice(ci + 1).trim();
        } else {
            srcSel = tgtSel = entry;
        }
        var src = tmp.querySelector(srcSel);
        var tgt = document.querySelector(tgtSel);
        if (src && tgt) {
            fire(tgt, "htmx:oobBeforeSwap", { target: tgt, fragment: src });
            tgt.innerHTML = src.innerHTML;
            process(tgt);
            fire(tgt, "htmx:oobAfterSwap", { target: tgt, fragment: src });
            src.parentNode.removeChild(src);
        }
    }
    return tmp.innerHTML;
}

function processScripts(elt) {
    if (!config.allowScriptTags) return;
    var scripts = elt.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
        var old = scripts[i];
        var nw = document.createElement("script");
        var attrs = old.attributes;
        for (var j = 0; j < attrs.length; j++) {
            nw.setAttribute(attrs[j].name, attrs[j].value);
        }
        nw.textContent = old.textContent;
        if (config.inlineScriptNonce) nw.nonce = config.inlineScriptNonce;
        old.parentNode.replaceChild(nw, old);
    }
}

function processHxOn(elt) {
    if (!config.allowEval) return;
    var all = elt.querySelectorAll("*");
    var elts = [elt];
    for (var i = 0; i < all.length; i++) elts.push(all[i]);
    for (var j = 0; j < elts.length; j++) {
        var el = elts[j];
        if (el._hxOnProcessed) continue;
        var attrs = el.attributes;
        var found = false;
        for (var k = 0; k < attrs.length; k++) {
            var aname = attrs[k].name;
            if (aname.indexOf("hx-on:") === 0 || aname.indexOf("hx-on::") === 0) {
                found = true;
                var evtName;
                if (aname.indexOf("hx-on::") === 0) {
                    evtName = "htmx:" + aname.slice(7);
                } else {
                    evtName = aname.slice(6);
                }
                var code = attrs[k].value;
                el.addEventListener(evtName, new Function("event", code).bind(el));
            }
        }
        if (found) el._hxOnProcessed = true;
    }
}

function triggerServerEvent(elt, header) {
    if (!header) return;
    try {
        var parsed = JSON.parse(header);
        for (var name in parsed) {
            if (parsed.hasOwnProperty(name)) {
                fire(elt, name, parsed[name] && typeof parsed[name] === "object" ? parsed[name] : { value: parsed[name] });
            }
        }
    } catch(e) {
        var names = header.split(",");
        for (var i = 0; i < names.length; i++) {
            fire(elt, names[i].trim(), {});
        }
    }
}

function handleScroll(spec) {
    if (spec.scroll) {
        var scrollElt = spec.scroll.selector ? document.querySelector(spec.scroll.selector) : null;
        if (scrollElt) {
            scrollElt.scrollIntoView({ behavior: config.scrollBehavior, block: spec.scroll.dir === "bottom" ? "end" : "start" });
        }
    }
    if (spec.show) {
        var showElt = spec.show.selector ? document.querySelector(spec.show.selector) : null;
        if (showElt) {
            showElt.scrollIntoView({ behavior: config.scrollBehavior, block: spec.show.dir === "bottom" ? "end" : "start" });
        }
    }
}

function parseTriggers(str, elt) {
    var triggers = [];
    if (!str) {
        var tag = elt.tagName;
        if (tag === "FORM") return [{ event: "submit", modifiers: {} }];
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return [{ event: "change", modifiers: {} }];
        return [{ event: "click", modifiers: {} }];
    }
    var parts = str.split(",");
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (!part) continue;
        if (part.indexOf("every ") === 0) {
            triggers.push({ event: "every", interval: parseInterval(part.slice(6).trim()), modifiers: {} });
            continue;
        }
        var filter = null;
        var bi = part.indexOf("[");
        if (bi >= 0) {
            var ei = part.indexOf("]", bi);
            filter = part.slice(bi + 1, ei);
            part = part.slice(0, bi) + part.slice(ei + 1);
        }
        var tokens = part.trim().split(/\s+/);
        var event = tokens[0];
        var mods = { filter: filter };
        var ti = 1;
        while (ti < tokens.length) {
            var tok = tokens[ti];
            if (tok === "once") { mods.once = true; ti++; }
            else if (tok === "changed") { mods.changed = true; ti++; }
            else if (tok === "consume") { mods.consume = true; ti++; }
            else if (tok.indexOf("delay:") === 0) { mods.delay = parseInterval(tok.slice(6)); ti++; }
            else if (tok.indexOf("throttle:") === 0) { mods.throttle = parseInterval(tok.slice(9)); ti++; }
            else if (tok.indexOf("queue:") === 0) { mods.queue = tok.slice(6); ti++; }
            else if (tok.indexOf("target:") === 0) { mods.target = tok.slice(7); ti++; }
            else if (tok.indexOf("from:") === 0) {
                var fromVal = tok.slice(5);
                ti++;
                var modKeywords = ["once", "changed", "consume", "delay:", "throttle:", "queue:", "target:", "from:"];
                while (ti < tokens.length) {
                    var isKw = false;
                    for (var m = 0; m < modKeywords.length; m++) {
                        if (tokens[ti] === modKeywords[m] || tokens[ti].indexOf(modKeywords[m]) === 0) { isKw = true; break; }
                    }
                    if (isKw) break;
                    fromVal += " " + tokens[ti];
                    ti++;
                }
                mods.from = fromVal;
            }
            else if (tok.indexOf("root:") === 0) { mods.root = tok.slice(5); ti++; }
            else if (tok.indexOf("threshold:") === 0) { mods.threshold = parseFloat(tok.slice(10)); ti++; }
            else { ti++; }
        }
        triggers.push({ event: event, modifiers: mods });
    }
    return triggers;
}

function resolveFromSelector(elt, from) {
    if (!from) return elt;
    if (from === "document") return document;
    if (from === "window") return window;
    if (from.indexOf("closest ") === 0) return elt.closest(from.slice(8));
    if (from.indexOf("find ") === 0) return elt.querySelector(from.slice(5));
    if (from.indexOf("next") === 0) {
        var ns = from.slice(4).trim();
        if (!ns) return elt.nextElementSibling;
        var n = elt.nextElementSibling;
        while (n) { if (n.matches(ns)) return n; n = n.nextElementSibling; }
        return null;
    }
    if (from.indexOf("previous") === 0) {
        var ps = from.slice(8).trim();
        if (!ps) return elt.previousElementSibling;
        var p = elt.previousElementSibling;
        while (p) { if (p.matches(ps)) return p; p = p.previousElementSibling; }
        return null;
    }
    return document.querySelector(from);
}

function collectParams(elt, verb) {
    var fd = new FormData();
    var form = elt.closest("form");
    if (elt.tagName === "FORM") form = elt;
    if (form) fd = new FormData(form);
    if (elt.name && elt.value !== undefined && elt.tagName !== "FORM") {
        fd.set(elt.name, elt.value);
    }
    var includeAttr = getInheritedAttr(elt, "hx-include");
    if (includeAttr) {
        var targets = Array.prototype.slice.call(document.querySelectorAll(includeAttr));
        for (var t = 0; t < targets.length; t++) {
            var el = targets[t];
            if (el.tagName === "FORM") {
                var ffd = new FormData(el);
                ffd.forEach(function(v, k) { fd.append(k, v); });
            } else if (el.name) {
                fd.set(el.name, el.value || "");
            } else {
                var inputs = el.querySelectorAll("input[name], select[name], textarea[name]");
                for (var ii = 0; ii < inputs.length; ii++) {
                    fd.set(inputs[ii].name, inputs[ii].value || "");
                }
            }
        }
    }
    var valsAttr = getInheritedAttr(elt, "hx-vals");
    if (valsAttr) {
        try {
            if (config.allowEval && valsAttr.trim().indexOf("js:") === 0) {
                var obj = new Function("return (" + valsAttr.trim().slice(3) + ")")();
                for (var k in obj) { if (obj.hasOwnProperty(k)) fd.append(k, obj[k]); }
            } else {
                var vals = JSON.parse(valsAttr);
                for (var k2 in vals) { if (vals.hasOwnProperty(k2)) fd.append(k2, vals[k2]); }
            }
        } catch(e) {}
    }
    var paramsAttr = getInheritedAttr(elt, "hx-params");
    if (paramsAttr && paramsAttr !== "*") {
        if (paramsAttr === "none") {
            var allKeys = [];
            fd.forEach(function(v, k) { allKeys.push(k); });
            for (var d = 0; d < allKeys.length; d++) fd.delete(allKeys[d]);
        } else if (paramsAttr.indexOf("not ") === 0) {
            var exclude = paramsAttr.slice(4).split(",").map(function(s) { return s.trim(); });
            for (var e = 0; e < exclude.length; e++) fd.delete(exclude[e]);
        } else {
            var include = paramsAttr.split(",").map(function(s) { return s.trim(); });
            var existing = [];
            fd.forEach(function(v, k) { if (existing.indexOf(k) < 0) existing.push(k); });
            for (var r = 0; r < existing.length; r++) {
                if (include.indexOf(existing[r]) < 0) fd.delete(existing[r]);
            }
        }
    }
    return fd;
}

function hasFiles(fd) {
    var found = false;
    fd.forEach(function(v) { if (v instanceof File && v.size > 0) found = true; });
    return found;
}

function saveToHistoryCache(url) {
    if (!config.historyEnabled) return;
    var histElt = document.querySelector("[hx-history-elt]") || document.body;
    fire(histElt, "htmx:beforeHistorySave");
    var entry = { url: url, content: histElt.innerHTML, title: document.title, scroll: window.scrollY };
    for (var i = 0; i < historyCache.length; i++) {
        if (historyCache[i].url === url) { historyCache.splice(i, 1); break; }
    }
    historyCache.push(entry);
    if (historyCache.length > config.historyCacheSize) historyCache.shift();
}

function issueRequest(elt, verb, url, triggerEvt, isBoosted) {
    var confirmMsg = getInheritedAttr(elt, "hx-confirm");
    if (confirmMsg) {
        if (!fire(elt, "htmx:confirm", { question: confirmMsg, triggeringEvent: triggerEvt })) return;
        if (!confirm(confirmMsg)) return;
    }
    var promptMsg = getInheritedAttr(elt, "hx-prompt");
    var promptVal = null;
    if (promptMsg) {
        promptVal = prompt(promptMsg);
        if (promptVal === null) return;
    }
    var validateAttr = getInheritedAttr(elt, "hx-validate");
    if (validateAttr === "true") {
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
    var fd = collectParams(elt, verb);
    var targetAttr = getInheritedAttr(elt, "hx-target");
    var target = targetAttr ? resolveTarget(elt, targetAttr) : elt;
    var swapAttr = getInheritedAttr(elt, "hx-swap");
    var swapSpec = parseSwapSpec(swapAttr);
    var headersAttr = getInheritedAttr(elt, "hx-headers");
    var extraHeaders = {};
    if (headersAttr) { try { extraHeaders = JSON.parse(headersAttr); } catch(e) {} }
    var headers = {
        "HX-Request": "true",
        "HX-Current-URL": window.location.href,
        "HX-Target": target ? (target.id || "") : "",
        "HX-Trigger": elt.id || "",
        "HX-Trigger-Name": elt.name || ""
    };
    if (isBoosted) headers["HX-Boosted"] = "true";
    if (promptVal !== null) headers["HX-Prompt"] = promptVal;
    for (var hk in extraHeaders) { if (extraHeaders.hasOwnProperty(hk)) headers[hk] = extraHeaders[hk]; }
    var detail = { elt: elt, target: target, verb: verb.toUpperCase(), path: url, parameters: fd, headers: headers, triggeringEvent: triggerEvt };
    if (!fire(elt, "htmx:configRequest", detail)) return;
    url = detail.path;
    var exts = resolveExtensions(elt);
    for (var ei = 0; ei < exts.length; ei++) {
        if (exts[ei].transformRequest) exts[ei].transformRequest(detail.headers, fd, elt);
    }
    if (!fire(elt, "htmx:beforeRequest", detail)) return;
    var syncAttr = getInheritedAttr(elt, "hx-sync");
    var syncScope = elt;
    var syncMode = "drop";
    if (syncAttr) {
        var sci = syncAttr.lastIndexOf(":");
        if (sci > 0) {
            var scopeSel = syncAttr.slice(0, sci).trim();
            syncMode = syncAttr.slice(sci + 1).trim();
            syncScope = resolveTarget(elt, scopeSel) || elt;
        } else {
            syncMode = syncAttr.trim();
        }
    }
    if (syncMode === "replace" || syncMode === "abort") {
        if (syncScope._htmxAbort) syncScope._htmxAbort.abort();
    } else if (syncMode === "drop") {
        if (syncScope._htmxInFlight) return;
    }
    var ac = new AbortController();
    syncScope._htmxAbort = ac;
    syncScope._htmxInFlight = true;
    var indicatorAttr = getInheritedAttr(elt, "hx-indicator");
    var indicators = indicatorAttr ? Array.prototype.slice.call(document.querySelectorAll(indicatorAttr)) : [elt];
    for (var ii = 0; ii < indicators.length; ii++) indicators[ii].classList.add(config.indicatorClass);
    var disabledAttr = getInheritedAttr(elt, "hx-disabled-elt");
    var disabledElts = [];
    if (disabledAttr) {
        disabledElts = Array.prototype.slice.call(document.querySelectorAll(disabledAttr));
        for (var di = 0; di < disabledElts.length; di++) disabledElts[di].disabled = true;
    }
    var reqAttr = getInheritedAttr(elt, "hx-request");
    var reqTimeout = config.timeout;
    var reqCreds = config.withCredentials;
    if (reqAttr) {
        try {
            var ro = JSON.parse(reqAttr);
            if (ro.timeout !== undefined) reqTimeout = ro.timeout;
            if (ro.credentials !== undefined) reqCreds = ro.credentials === "include" || ro.credentials === true;
        } catch(e) {}
    }
    var timeoutId = null;
    if (reqTimeout > 0) {
        timeoutId = setTimeout(function() {
            ac.abort();
            fire(elt, "htmx:timeout", detail);
        }, reqTimeout);
    }
    var isGet = config.methodsThatUseUrlParams.indexOf(verb.toLowerCase()) >= 0;
    var fetchUrl = url;
    var fetchOpts = { method: verb.toUpperCase(), headers: {}, signal: ac.signal };
    if (reqCreds) fetchOpts.credentials = "include";
    for (var fh in headers) { if (headers.hasOwnProperty(fh)) fetchOpts.headers[fh] = headers[fh]; }
    if (config.selfRequestsOnly) {
        try {
            var u = new URL(fetchUrl, window.location.href);
            if (u.origin !== window.location.origin) {
                fire(elt, "htmx:sendError", detail);
                cleanup();
                return;
            }
        } catch(e) {}
    }
    var encoding = getInheritedAttr(elt, "hx-encoding");
    if (isGet) {
        var qs = new URLSearchParams(fd).toString();
        if (qs) fetchUrl += (fetchUrl.indexOf("?") >= 0 ? "&" : "?") + qs;
        if (config.getCacheBusterParam) fetchUrl += (fetchUrl.indexOf("?") >= 0 ? "&" : "?") + "org.htmx.cache-buster=" + encodeURIComponent(target ? target.id || "" : "");
    } else {
        if (encoding === "multipart/form-data" || hasFiles(fd)) {
            fetchOpts.body = fd;
        } else {
            fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
            fetchOpts.body = new URLSearchParams(fd).toString();
        }
    }
    fire(elt, "htmx:beforeSend", detail);
    var abortHandler = function() { ac.abort(); fire(elt, "htmx:xhr:abort", detail); };
    elt.addEventListener("htmx:abort", abortHandler, { once: true });

    function cleanup() {
        syncScope._htmxInFlight = false;
        if (timeoutId) clearTimeout(timeoutId);
        for (var ci = 0; ci < indicators.length; ci++) indicators[ci].classList.remove(config.indicatorClass);
        for (var cdi = 0; cdi < disabledElts.length; cdi++) disabledElts[cdi].disabled = false;
        elt.removeEventListener("htmx:abort", abortHandler);
    }

    fetch(fetchUrl, fetchOpts).then(function(resp) {
        return resp.text().then(function(text) {
            if (timeoutId) clearTimeout(timeoutId);
            fire(elt, "htmx:afterRequest", { elt: elt, xhr: resp, target: target, successful: resp.ok });
            if (!resp.ok && resp.status !== 204) {
                fire(elt, "htmx:responseError", { elt: elt, xhr: resp, target: target });
            }
            var redirect = resp.headers.get("HX-Redirect");
            if (redirect) { window.location.href = redirect; cleanup(); return; }
            var refresh = resp.headers.get("HX-Refresh");
            if (refresh === "true") { window.location.reload(); cleanup(); return; }
            var location = resp.headers.get("HX-Location");
            if (location) {
                try {
                    var loc = JSON.parse(location);
                    var locTarget = loc.target ? document.querySelector(loc.target) : document.body;
                    var locVerb = loc.verb || "GET";
                    issueRequest(locTarget, locVerb, loc.path, null, false);
                } catch(e) {
                    issueRequest(document.body, "GET", location, null, false);
                }
                cleanup();
                return;
            }
            var retarget = resp.headers.get("HX-Retarget");
            if (retarget) target = document.querySelector(retarget);
            var reswap = resp.headers.get("HX-Reswap");
            if (reswap) swapSpec = parseSwapSpec(reswap);
            for (var exi = 0; exi < exts.length; exi++) {
                if (exts[exi].transformResponse) text = exts[exi].transformResponse(text, resp, elt);
            }
            var shouldSwap = resp.ok && resp.status !== 204;
            var bsDetail = { elt: elt, xhr: resp, target: target, shouldSwap: shouldSwap, serverResponse: text, swapSpec: swapSpec };
            if (!fire(elt, "htmx:beforeSwap", bsDetail)) { cleanup(); return; }
            shouldSwap = bsDetail.shouldSwap;
            target = bsDetail.target;
            text = bsDetail.serverResponse;
            if (!shouldSwap) { cleanup(); return; }
            var titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            if (titleMatch) document.title = titleMatch[1].trim();
            var pushUrl = resp.headers.get("HX-Push-Url");
            var replaceUrl = resp.headers.get("HX-Replace-Url");
            if (!pushUrl) { var pattr = getInheritedAttr(elt, "hx-push-url"); if (pattr === "true") pushUrl = url; else if (pattr && pattr !== "false") pushUrl = pattr; }
            if (!replaceUrl) { var rattr = getInheritedAttr(elt, "hx-replace-url"); if (rattr === "true") replaceUrl = url; else if (rattr && rattr !== "false") replaceUrl = rattr; }
            if (isBoosted && !pushUrl && !replaceUrl) pushUrl = url;
            if (pushUrl === "false") pushUrl = null;
            if (replaceUrl === "false") replaceUrl = null;

            var selectOob = getAttr(elt, "hx-select-oob");
            text = processSelectOob(text, selectOob);
            text = processOob(text);
            var selectAttr = getAttr(elt, "hx-select");
            if (selectAttr) {
                var selTmp = document.createElement("div");
                selTmp.innerHTML = text;
                var selected = selTmp.querySelector(selectAttr);
                text = selected ? selected.outerHTML : "";
            }
            var preserved = [];
            if (target) {
                var preserveElts = target.querySelectorAll("[hx-preserve][id]");
                for (var pi = 0; pi < preserveElts.length; pi++) {
                    preserved.push({ id: preserveElts[pi].id, node: preserveElts[pi].cloneNode(true) });
                }
            }
            function doTheSwap() {
                if (target) target.classList.add(config.swappingClass);
                setTimeout(function() {
                    if (target) {
                        var childrenBefore = target.children ? Array.prototype.slice.call(target.children) : [];
                        doSwap(target, text, swapSpec.swapStyle);
                        for (var pri = 0; pri < preserved.length; pri++) {
                            var placeholder = document.getElementById(preserved[pri].id);
                            if (placeholder) placeholder.parentNode.replaceChild(preserved[pri].node, placeholder);
                        }
                        if (target.classList) target.classList.remove(config.swappingClass);
                        var newTarget = swapSpec.swapStyle === "outerHTML" ? document.querySelector(retarget || targetAttr || "") || document.body : target;
                        process(newTarget);
                        processScripts(newTarget);
                        processHxOn(newTarget);
                        var childrenAfter = newTarget.children ? Array.prototype.slice.call(newTarget.children) : [];
                        for (var ca = 0; ca < childrenAfter.length; ca++) {
                            if (childrenBefore.indexOf(childrenAfter[ca]) < 0) {
                                childrenAfter[ca].classList.add(config.addedClass);
                            }
                        }
                        if (pushUrl) {
                            saveToHistoryCache(window.location.href);
                            history.pushState({ htmx: true }, "", pushUrl);
                            fire(document.body, "htmx:pushedIntoHistory", { path: pushUrl });
                        }
                        if (replaceUrl) {
                            saveToHistoryCache(window.location.href);
                            history.replaceState({ htmx: true }, "", replaceUrl);
                            fire(document.body, "htmx:replacedInHistory", { path: replaceUrl });
                        }
                        triggerServerEvent(elt, resp.headers.get("HX-Trigger"));
                        fire(newTarget, "htmx:afterSwap", { elt: elt, target: newTarget, xhr: resp });
                        triggerServerEvent(elt, resp.headers.get("HX-Trigger-After-Swap"));
                        newTarget.classList.add(config.settlingClass);
                        setTimeout(function() {
                            triggerServerEvent(elt, resp.headers.get("HX-Trigger-After-Settle"));
                            newTarget.classList.remove(config.settlingClass);
                            for (var ra = 0; ra < childrenAfter.length; ra++) {
                                childrenAfter[ra].classList.remove(config.addedClass);
                            }
                            fire(newTarget, "htmx:afterSettle", { elt: elt, target: newTarget, xhr: resp });
                            handleScroll(swapSpec);
                            fire(newTarget, "htmx:load", { elt: newTarget });
                            if (config.scrollIntoViewOnBoost && isBoosted) {
                                window.scrollTo({ top: 0, behavior: config.scrollBehavior });
                            }
                        }, swapSpec.settleDelay);
                    }
                    cleanup();
                }, swapSpec.swapDelay);
            }
            if ((swapSpec.transition || config.globalViewTransitions) && document.startViewTransition) {
                document.startViewTransition(function() { doTheSwap(); });
            } else {
                doTheSwap();
            }
        });
    }).catch(function(err) {
        if (err.name === "AbortError") {
            cleanup();
            return;
        }
        fire(elt, "htmx:sendError", { elt: elt, error: err });
        fire(elt, "htmx:afterRequest", { elt: elt, successful: false });
        cleanup();
    });
}

function attachTrigger(elt, verb, url, trigDef, isBoosted) {
    if (trigDef.event === "every") {
        var ivl = setInterval(function() {
            if (!document.contains(elt)) { clearInterval(ivl); return; }
            issueRequest(elt, verb, url, null, isBoosted);
        }, trigDef.interval);
        return;
    }
    if (trigDef.event === "load") {
        setTimeout(function() { issueRequest(elt, verb, url, null, isBoosted); }, 0);
        return;
    }
    if (trigDef.event === "revealed") {
        var obs = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) {
                    obs.disconnect();
                    issueRequest(elt, verb, url, null, isBoosted);
                }
            }
        });
        obs.observe(elt);
        return;
    }
    if (trigDef.event === "intersect") {
        var ioOpts = {};
        if (trigDef.modifiers.root) ioOpts.root = document.querySelector(trigDef.modifiers.root);
        if (trigDef.modifiers.threshold !== undefined) ioOpts.threshold = trigDef.modifiers.threshold;
        var iobs = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) {
                    issueRequest(elt, verb, url, entries[i], isBoosted);
                }
            }
        }, ioOpts);
        iobs.observe(elt);
        return;
    }
    var mods = trigDef.modifiers;
    var listenTarget = mods.from ? resolveFromSelector(elt, mods.from) : elt;
    if (!listenTarget) return;
    var delayTimer = null;
    var throttleTimer = null;
    var fired = false;
    var lastValue = undefined;
    var handler = function(evt) {
        if (mods.target) {
            if (!evt.target.matches(mods.target)) return;
        }
        if (mods.filter && config.allowEval) {
            var pass = new Function("event", "return (" + mods.filter + ")").call(elt, evt);
            if (!pass) return;
        }
        if (trigDef.event === "submit") evt.preventDefault();
        if (mods.consume) { evt.preventDefault(); evt.stopPropagation(); }
        if (mods.once && fired) return;
        if (mods.changed) {
            var curVal = elt.value;
            if (curVal === lastValue) return;
            lastValue = curVal;
        }
        function doRequest() {
            fired = true;
            issueRequest(elt, verb, url, evt, isBoosted);
        }
        if (mods.delay !== undefined) {
            if (delayTimer) clearTimeout(delayTimer);
            delayTimer = setTimeout(doRequest, mods.delay);
            return;
        }
        if (mods.throttle !== undefined) {
            if (throttleTimer) return;
            doRequest();
            throttleTimer = setTimeout(function() { throttleTimer = null; }, mods.throttle);
            return;
        }
        doRequest();
    };
    listenTarget.addEventListener(trigDef.event, handler);
}

function boost(container) {
    var links = container.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (a._htmxBoosted) continue;
        if (getInheritedAttr(a, "hx-boost") !== "true") continue;
        var href = a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("javascript:") === 0) continue;
        a._htmxBoosted = true;
        a.addEventListener("click", function(evt) {
            if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
            evt.preventDefault();
            var el = evt.currentTarget;
            var tgt = getInheritedAttr(el, "hx-target") || "body";
            var target = resolveTarget(el, tgt);
            issueRequest(el, "GET", el.href, evt, true);
        });
    }
    var forms = container.querySelectorAll("form");
    for (var j = 0; j < forms.length; j++) {
        var form = forms[j];
        if (form._htmxBoosted) continue;
        if (getInheritedAttr(form, "hx-boost") !== "true") continue;
        form._htmxBoosted = true;
        form.addEventListener("submit", function(evt) {
            evt.preventDefault();
            var el = evt.currentTarget;
            var method = (el.method || "GET").toUpperCase();
            issueRequest(el, method, el.action, evt, true);
        });
    }
}

function initSSE(elt) {
    if (elt._htmxSSE) return;
    var url = getAttr(elt, "sse-connect");
    if (!url) return;
    var es = new EventSource(url);
    elt._htmxSSE = es;
    es.onopen = function() { fire(elt, "htmx:sseOpen", {}); };
    es.onerror = function() { fire(elt, "htmx:sseError", {}); };
    var swappers = elt.querySelectorAll("[sse-swap]");
    var allSwappers = [];
    if (getAttr(elt, "sse-swap")) allSwappers.push(elt);
    for (var i = 0; i < swappers.length; i++) allSwappers.push(swappers[i]);
    for (var j = 0; j < allSwappers.length; j++) {
        (function(swapper) {
            var evtName = getAttr(swapper, "sse-swap");
            es.addEventListener(evtName, function(e) {
                var data = e.data;
                data = processOob(data);
                var tgtAttr = getInheritedAttr(swapper, "hx-target");
                var tgt = tgtAttr ? resolveTarget(swapper, tgtAttr) : swapper;
                var swapAttr = getInheritedAttr(swapper, "hx-swap");
                var spec = parseSwapSpec(swapAttr);
                doSwap(tgt, data, spec.swapStyle);
                process(tgt);
                processScripts(tgt);
                processHxOn(tgt);
            });
        })(allSwappers[j]);
    }
    var closeEvt = getAttr(elt, "sse-close");
    if (closeEvt) {
        es.addEventListener(closeEvt, function() { es.close(); elt._htmxSSE = null; });
    }
    var sseCheck = setInterval(function() {
        if (!document.contains(elt)) { es.close(); clearInterval(sseCheck); }
    }, 2000);
}

function initWS(elt) {
    if (elt._htmxWS) return;
    var url = getAttr(elt, "ws-connect");
    if (!url) return;
    var retryDelay = 1000;
    function connect() {
        var ws = new WebSocket(url);
        elt._htmxWS = ws;
        ws.onopen = function() { retryDelay = 1000; };
        ws.onmessage = function(e) {
            var data = e.data;
            data = processOob(data);
            if (data.trim()) {
                var swapAttr = getInheritedAttr(elt, "hx-swap");
                var spec = parseSwapSpec(swapAttr);
                doSwap(elt, data, spec.swapStyle || config.defaultSwapStyle);
                process(elt);
                processScripts(elt);
                processHxOn(elt);
            }
        };
        ws.onclose = function() {
            if (!document.contains(elt)) return;
            retryDelay = Math.min(retryDelay * 2, 30000);
            setTimeout(connect, retryDelay);
        };
        ws.onerror = function() { ws.close(); };
    }
    connect();
    var senders = elt.querySelectorAll("[ws-send]");
    for (var i = 0; i < senders.length; i++) {
        (function(sender) {
            var trigStr = getAttr(sender, "hx-trigger");
            var triggers = parseTriggers(trigStr, sender);
            for (var t = 0; t < triggers.length; t++) {
                sender.addEventListener(triggers[t].event, function(evt) {
                    if (triggers[t].event === "submit") evt.preventDefault();
                    var fd = collectParams(sender, "post");
                    var obj = {};
                    fd.forEach(function(v, k) { obj[k] = v; });
                    if (elt._htmxWS && elt._htmxWS.readyState === WebSocket.OPEN) {
                        elt._htmxWS.send(JSON.stringify(obj));
                    }
                });
            }
        })(senders[i]);
    }
    var wsCheck = setInterval(function() {
        if (!document.contains(elt)) {
            if (elt._htmxWS) elt._htmxWS.close();
            clearInterval(wsCheck);
        }
    }, 2000);
}

function process(elt) {
    if (!elt) return;
    if (getAttr(elt, "hx-disable") !== null) return;
    fire(elt, "htmx:beforeProcessNode", { elt: elt });
    var verbs = ["get", "post", "put", "patch", "delete"];
    for (var v = 0; v < verbs.length; v++) {
        var verb = verbs[v];
        var sel = "[hx-" + verb + "]";
        var elts = elt.querySelectorAll(sel);
        if (getAttr(elt, "hx-" + verb) !== null) processElement(elt, verb);
        for (var i = 0; i < elts.length; i++) {
            if (getAttr(elts[i], "hx-disable") !== null) continue;
            if (elts[i].closest("[hx-disable]") && elts[i].closest("[hx-disable]") !== elts[i]) continue;
            processElement(elts[i], verb);
        }
    }
    boost(elt);
    var sseElts = elt.querySelectorAll("[sse-connect]");
    if (getAttr(elt, "sse-connect") !== null) initSSE(elt);
    for (var s = 0; s < sseElts.length; s++) initSSE(sseElts[s]);
    var wsElts = elt.querySelectorAll("[ws-connect]");
    if (getAttr(elt, "ws-connect") !== null) initWS(elt);
    for (var w = 0; w < wsElts.length; w++) initWS(wsElts[w]);
    fire(elt, "htmx:afterProcessNode", { elt: elt });
}

function processElement(elt, verb) {
    if (elt._htmxProcessed && elt._htmxProcessed[verb]) return;
    if (!elt._htmxProcessed) elt._htmxProcessed = {};
    elt._htmxProcessed[verb] = true;
    var url = getAttr(elt, "hx-" + verb);
    var trigStr = getAttr(elt, "hx-trigger");
    var triggers = parseTriggers(trigStr, elt);
    for (var i = 0; i < triggers.length; i++) {
        attachTrigger(elt, verb.toUpperCase(), url, triggers[i], false);
    }
}

function init() {
    var meta = document.querySelector('meta[name="htmx-config"]');
    if (meta) {
        try {
            var mc = JSON.parse(meta.getAttribute("content"));
            for (var k in mc) { if (mc.hasOwnProperty(k)) config[k] = mc[k]; }
        } catch(e) {}
    }
    if (config.includeIndicatorStyles) {
        var style = document.createElement("style");
        style.textContent = ".htmx-indicator{opacity:0;transition:opacity 200ms ease-in;}.htmx-request .htmx-indicator,.htmx-request.htmx-indicator{opacity:1;}";
        document.head.appendChild(style);
    }
    window.addEventListener("popstate", function(evt) {
        var url = window.location.href;
        fire(document.body, "htmx:historyRestore", { path: url });
        for (var i = 0; i < historyCache.length; i++) {
            if (historyCache[i].url === url) {
                var entry = historyCache[i];
                var histElt = document.querySelector("[hx-history-elt]") || document.body;
                histElt.innerHTML = entry.content;
                document.title = entry.title;
                process(histElt);
                processScripts(histElt);
                processHxOn(histElt);
                setTimeout(function() { window.scrollTo(0, entry.scroll); }, 0);
                return;
            }
        }
        fire(document.body, "htmx:historyCacheMiss", { path: url });
        if (config.refreshOnHistoryMiss) {
            window.location.reload();
            return;
        }
        var histElt2 = document.querySelector("[hx-history-elt]") || document.body;
        fetch(url, { headers: { "HX-Request": "true", "HX-History-Restore-Request": "true" } }).then(function(resp) {
            return resp.text().then(function(text) {
                fire(document.body, "htmx:historyCacheMissLoad", { path: url, serverResponse: text });
                var bodyMatch = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                histElt2.innerHTML = bodyMatch ? bodyMatch[1] : text;
                var titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                if (titleMatch) document.title = titleMatch[1].trim();
                process(histElt2);
                processScripts(histElt2);
                processHxOn(histElt2);
            });
        }).catch(function() {
            fire(document.body, "htmx:historyCacheMissError", { path: url });
        });
    });
    process(document.body);
}

window.htmx = {
    version: "derived-2.0.0",
    config: config,
    logger: null,
    process: function(elt) {
        process(elt);
        processScripts(elt);
        processHxOn(elt);
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
            if (spec.target) target = typeof spec.target === "string" ? document.querySelector(spec.target) || document.body : spec.target;
            if (spec.source) source = typeof spec.source === "string" ? document.querySelector(spec.source) || document.body : spec.source;
        }
        issueRequest(source, verb.toUpperCase(), url, null, false);
    },
    find: function(eltOrSel, sel) {
        if (typeof eltOrSel === "string") return document.querySelector(eltOrSel);
        return eltOrSel.querySelector(sel);
    },
    findAll: function(eltOrSel, sel) {
        if (typeof eltOrSel === "string") return Array.prototype.slice.call(document.querySelectorAll(eltOrSel));
        return Array.prototype.slice.call(eltOrSel.querySelectorAll(sel));
    },
    closest: function(elt, sel) { return elt.closest(sel); },
    remove: function(elt) { if (elt) elt.remove(); },
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
        var sibs = elt.parentElement ? elt.parentElement.children : [];
        for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove(cls);
        elt.classList.add(cls);
    },
    trigger: function(elt, name, detail) { fire(elt, name, detail); },
    swap: function(target, html, swapSpecStr) {
        var spec = parseSwapSpec(swapSpecStr || "");
        doSwap(target, html, spec.swapStyle);
    },
    values: function(elt) {
        var fd = collectParams(elt, "get");
        var obj = {};
        fd.forEach(function(v, k) { obj[k] = v; });
        return obj;
    },
    on: function(eltOrEvt, evtOrHandler, handler) {
        if (typeof eltOrEvt === "string") { document.addEventListener(eltOrEvt, evtOrHandler); }
        else { eltOrEvt.addEventListener(evtOrHandler, handler); }
    },
    off: function(eltOrEvt, evtOrHandler, handler) {
        if (typeof eltOrEvt === "string") { document.removeEventListener(eltOrEvt, evtOrHandler); }
        else { eltOrEvt.removeEventListener(evtOrHandler, handler); }
    },
    defineExtension: function(name, def) {
        extensions[name] = def;
        if (def.init) def.init({ config: config });
    },
    removeExtension: function(name) { delete extensions[name]; },
    parseInterval: parseInterval,
    logAll: function() {
        window.htmx.logger = function(elt, name, detail) {
            console.log("[htmx]", name, elt, detail);
        };
    },
    logNone: function() { window.htmx.logger = null; },
    _: {
        fire: fire,
        getAttr: getAttr,
        resolveTarget: resolveTarget,
        doSwap: doSwap,
        processScripts: processScripts
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
})();
