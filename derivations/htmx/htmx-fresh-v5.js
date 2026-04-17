(function() {
    "use strict";
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

    var extensions = {};
    var historyCache = [];
    var VERBS = ["get", "post", "put", "patch", "delete"];

    function parseInterval(str) {
        if (!str) return 0;
        if (typeof str === "number") return str;
        str = String(str).trim();
        if (str.match(/\d+s$/)) return parseFloat(str) * 1000;
        if (str.match(/\d+m$/)) return parseFloat(str) * 60000;
        if (str.match(/\d+ms$/)) return parseFloat(str);
        return parseFloat(str);
    }

    function fire(elt, name, detail) {
        detail = detail || {};
        var evt = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
        var active = getActiveExtensions(elt);
        for (var i = 0; i < active.length; i++) {
            if (active[i].onEvent) {
                try { active[i].onEvent(name, evt); } catch(e) {}
            }
        }
        if (htmx.logger) {
            htmx.logger(elt, name, detail);
        }
        elt.dispatchEvent(evt);
        return evt;
    }

    function getActiveExtensions(elt) {
        var result = [];
        var ignore = {};
        var node = elt;
        while (node && node.getAttribute) {
            var attr = node.getAttribute("hx-ext");
            if (attr) {
                var parts = attr.split(",");
                for (var i = 0; i < parts.length; i++) {
                    var n = parts[i].trim();
                    if (n.indexOf("ignore:") === 0) {
                        ignore[n.slice(7).trim()] = true;
                    } else if (!ignore[n] && extensions[n]) {
                        result.push(extensions[n]);
                    }
                }
            }
            node = node.parentElement;
        }
        return result;
    }

    function getAttr(elt, name) {
        if (!elt || !elt.getAttribute) return null;
        var val = elt.getAttribute(name);
        if (val !== null) return val;
        var parent = elt.parentElement;
        while (parent && parent.getAttribute) {
            var dis = parent.getAttribute("hx-disinherit");
            if (dis) {
                if (dis === "*") return null;
                var disList = dis.split(/\s+/);
                for (var i = 0; i < disList.length; i++) {
                    if (disList[i] === name) return null;
                }
            }
            var pval = parent.getAttribute(name);
            if (pval !== null) return pval;
            parent = parent.parentElement;
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
            while (sib) {
                if (sib.matches(sel)) return sib;
                sib = sib.nextElementSibling;
            }
            return null;
        }
        if (spec === "previous") return elt.previousElementSibling;
        if (spec.indexOf("previous ") === 0) {
            var sel2 = spec.slice(9);
            var sib2 = elt.previousElementSibling;
            while (sib2) {
                if (sib2.matches(sel2)) return sib2;
                sib2 = sib2.previousElementSibling;
            }
            return null;
        }
        return document.querySelector(spec);
    }

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
        var strategies = ["innerHTML", "outerHTML", "beforebegin", "afterbegin", "beforeend", "afterend", "delete", "none"];
        if (strategies.indexOf(parts[0]) !== -1) {
            spec.swapStyle = parts[0];
        }
        for (var i = 1; i < parts.length; i++) {
            var p = parts[i];
            if (p.indexOf("swap:") === 0) spec.swapDelay = parseInterval(p.slice(5));
            else if (p.indexOf("settle:") === 0) spec.settleDelay = parseInterval(p.slice(7));
            else if (p.indexOf("scroll:") === 0) {
                var sv = p.slice(7);
                var sc = sv.split(":");
                if (sc.length === 2) { spec.scroll = sc[0]; spec.scrollTarget = sc[1]; }
                else spec.scroll = sv;
            }
            else if (p.indexOf("show:") === 0) {
                var shv = p.slice(5);
                var shc = shv.split(":");
                if (shc.length === 2) { spec.show = shc[0]; spec.showTarget = shc[1]; }
                else spec.show = shv;
            }
            else if (p.indexOf("focus-scroll:") === 0) spec.focusScroll = p.slice(13) === "true";
            else if (p.indexOf("transition:") === 0) spec.transition = p.slice(11) === "true";
        }
        return spec;
    }

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
        }
    }

    function processOob(html) {
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        var oobElts = tmp.querySelectorAll("[hx-swap-oob]");
        for (var i = oobElts.length - 1; i >= 0; i--) {
            var oob = oobElts[i];
            var spec = oob.getAttribute("hx-swap-oob");
            oob.removeAttribute("hx-swap-oob");
            var strategy = "outerHTML";
            var targetSel = null;
            if (spec === "true") {
                targetSel = "#" + oob.id;
            } else if (spec.indexOf(":") !== -1) {
                var ci = spec.indexOf(":");
                strategy = spec.slice(0, ci);
                targetSel = spec.slice(ci + 1);
            } else {
                strategy = spec;
                targetSel = "#" + oob.id;
            }
            var oobTarget = document.querySelector(targetSel);
            if (oobTarget) {
                fire(oobTarget, "htmx:oobBeforeSwap", { target: oobTarget, fragment: oob });
                if (strategy === "outerHTML") {
                    doSwap(oobTarget, oob.outerHTML, "outerHTML");
                    var replaced = document.querySelector(targetSel);
                    if (replaced) process(replaced);
                } else {
                    doSwap(oobTarget, oob.innerHTML, strategy);
                    process(oobTarget);
                }
                fire(oobTarget, "htmx:oobAfterSwap", { target: oobTarget, fragment: oob });
            } else {
                fire(document.body, "htmx:oobErrorNoTarget", { content: oob });
            }
            if (oob.parentNode) oob.parentNode.removeChild(oob);
        }
        return tmp.innerHTML;
    }

    function processSelectOob(html, selectOobAttr) {
        if (!selectOobAttr) return html;
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        var entries = selectOobAttr.split(",");
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i].trim();
            var sourceSel, targetSel;
            if (entry.indexOf(":") !== -1) {
                var ci = entry.indexOf(":");
                sourceSel = entry.slice(0, ci).trim();
                targetSel = entry.slice(ci + 1).trim();
            } else {
                sourceSel = entry;
                targetSel = entry;
            }
            var src = tmp.querySelector(sourceSel);
            var tgt = document.querySelector(targetSel);
            if (src && tgt) {
                tgt.innerHTML = src.outerHTML;
                process(tgt);
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
            for (var j = 0; j < old.attributes.length; j++) {
                nw.setAttribute(old.attributes[j].name, old.attributes[j].value);
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
        for (var e = 0; e < elts.length; e++) {
            var el = elts[e];
            if (!el.attributes) continue;
            var toProcess = [];
            for (var a = 0; a < el.attributes.length; a++) {
                var attr = el.attributes[a];
                if (attr.name.indexOf("hx-on:") === 0 || attr.name.indexOf("hx-on::") === 0) {
                    toProcess.push({ name: attr.name, value: attr.value });
                }
            }
            for (var t = 0; t < toProcess.length; t++) {
                var attrName = toProcess[t].name;
                var code = toProcess[t].value;
                var eventName;
                if (attrName.indexOf("hx-on::") === 0) {
                    eventName = "htmx:" + attrName.slice(7);
                } else {
                    eventName = attrName.slice(6);
                }
                if (!el._htmxOn) el._htmxOn = {};
                var key = attrName + ":" + code;
                if (el._htmxOn[key]) continue;
                var fn = new Function("event", code);
                el.addEventListener(eventName, fn.bind(el));
                el._htmxOn[key] = true;
            }
        }
    }

    function triggerServerEvent(elt, headerVal) {
        if (!headerVal) return;
        headerVal = headerVal.trim();
        if (headerVal.charAt(0) === "{") {
            try {
                var obj = JSON.parse(headerVal);
                for (var name in obj) {
                    if (obj.hasOwnProperty(name)) {
                        fire(elt, name, obj[name] || {});
                    }
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

    function parseTrigger(str, elt) {
        if (!str) {
            var tag = elt.tagName;
            if (tag === "FORM") return [{ event: "submit", modifiers: {} }];
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return [{ event: "change", modifiers: {} }];
            return [{ event: "click", modifiers: {} }];
        }
        var triggers = [];
        var parts = str.split(",");
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim();
            if (!p) continue;
            if (p.indexOf("every ") === 0) {
                triggers.push({ event: "every", interval: parseInterval(p.slice(6).trim()), modifiers: {} });
                continue;
            }
            var mods = {};
            var filter = null;
            var bracketIdx = p.indexOf("[");
            if (bracketIdx !== -1) {
                var endBracket = p.indexOf("]", bracketIdx);
                filter = p.slice(bracketIdx + 1, endBracket);
                p = p.slice(0, bracketIdx) + p.slice(endBracket + 1);
            }
            var tokens = p.trim().split(/\s+/);
            var eventName = tokens[0];
            var j = 1;
            var modKeywords = ["once", "changed", "consume", "delay:", "throttle:", "queue:", "target:", "from:"];
            while (j < tokens.length) {
                var tk = tokens[j];
                if (tk === "once") { mods.once = true; j++; }
                else if (tk === "changed") { mods.changed = true; j++; }
                else if (tk === "consume") { mods.consume = true; j++; }
                else if (tk.indexOf("delay:") === 0) { mods.delay = parseInterval(tk.slice(6)); j++; }
                else if (tk.indexOf("throttle:") === 0) { mods.throttle = parseInterval(tk.slice(9)); j++; }
                else if (tk.indexOf("queue:") === 0) { mods.queue = tk.slice(6); j++; }
                else if (tk.indexOf("target:") === 0) { mods.target = tk.slice(7); j++; }
                else if (tk.indexOf("from:") === 0) {
                    var fromVal = tk.slice(5);
                    j++;
                    while (j < tokens.length) {
                        var isKw = false;
                        for (var k = 0; k < modKeywords.length; k++) {
                            if (tokens[j] === modKeywords[k] || tokens[j].indexOf(modKeywords[k]) === 0) { isKw = true; break; }
                        }
                        if (isKw) break;
                        fromVal += " " + tokens[j];
                        j++;
                    }
                    mods.from = fromVal;
                }
                else if (tk.indexOf("root:") === 0) { mods.root = tk.slice(5); j++; }
                else if (tk.indexOf("threshold:") === 0) { mods.threshold = parseFloat(tk.slice(10)); j++; }
                else { j++; }
            }
            if (filter) mods.filter = filter;
            triggers.push({ event: eventName, modifiers: mods });
        }
        return triggers;
    }

    function resolveFrom(elt, fromSpec) {
        if (!fromSpec) return elt;
        if (fromSpec === "document") return document;
        if (fromSpec === "window") return window;
        if (fromSpec === "body") return document.body;
        if (fromSpec.indexOf("closest ") === 0) return elt.closest(fromSpec.slice(8));
        if (fromSpec.indexOf("find ") === 0) return elt.querySelector(fromSpec.slice(5));
        if (fromSpec === "next") return elt.nextElementSibling;
        if (fromSpec.indexOf("next ") === 0) {
            var sel = fromSpec.slice(5);
            var sib = elt.nextElementSibling;
            while (sib) { if (sib.matches(sel)) return sib; sib = sib.nextElementSibling; }
            return null;
        }
        if (fromSpec === "previous") return elt.previousElementSibling;
        if (fromSpec.indexOf("previous ") === 0) {
            var sel2 = fromSpec.slice(9);
            var sib2 = elt.previousElementSibling;
            while (sib2) { if (sib2.matches(sel2)) return sib2; sib2 = sib2.previousElementSibling; }
            return null;
        }
        return document.querySelector(fromSpec);
    }

    function collectParams(elt, verb) {
        var fd = new FormData();
        var form = null;
        if (elt.tagName === "FORM") {
            form = elt;
            fd = new FormData(form);
        } else {
            form = elt.closest("form");
            if (form) fd = new FormData(form);
            if (elt.name && elt.value !== undefined) fd.set(elt.name, elt.value);
        }
        // hx-include
        var incAttr = getAttr(elt, "hx-include");
        if (incAttr) {
            var targets = [];
            if (incAttr === "this") {
                targets = [elt];
            } else if (incAttr.indexOf("closest ") === 0) {
                var c = elt.closest(incAttr.slice(8));
                if (c) targets = [c];
            } else if (incAttr.indexOf("find ") === 0) {
                var f = elt.querySelector(incAttr.slice(5));
                if (f) targets = [f];
            } else if (incAttr === "next") {
                if (elt.nextElementSibling) targets = [elt.nextElementSibling];
            } else if (incAttr.indexOf("next ") === 0) {
                var ns = elt.nextElementSibling;
                while (ns) { if (ns.matches(incAttr.slice(5))) { targets = [ns]; break; } ns = ns.nextElementSibling; }
            } else if (incAttr === "previous") {
                if (elt.previousElementSibling) targets = [elt.previousElementSibling];
            } else if (incAttr.indexOf("previous ") === 0) {
                var ps = elt.previousElementSibling;
                while (ps) { if (ps.matches(incAttr.slice(9))) { targets = [ps]; break; } ps = ps.previousElementSibling; }
            } else {
                targets = Array.prototype.slice.call(document.querySelectorAll(incAttr));
            }
            for (var ii = 0; ii < targets.length; ii++) {
                var inc = targets[ii];
                if (inc.tagName === "FORM") {
                    var incFd = new FormData(inc);
                    incFd.forEach(function(v, k) { fd.append(k, v); });
                } else if (inc.name) {
                    fd.append(inc.name, inc.value || "");
                } else {
                    var inputs = inc.querySelectorAll("input[name], select[name], textarea[name]");
                    for (var ix = 0; ix < inputs.length; ix++) {
                        var inp = inputs[ix];
                        if (inp.type === "checkbox" || inp.type === "radio") {
                            if (inp.checked) fd.append(inp.name, inp.value || "on");
                        } else {
                            fd.append(inp.name, inp.value);
                        }
                    }
                }
            }
        }
        // hx-vals
        var vals = getAttr(elt, "hx-vals");
        if (vals) {
            if (config.allowEval && vals.indexOf("js:") === 0) {
                try {
                    var jsVals = new Function("return (" + vals.slice(3) + ")")();
                    for (var vk in jsVals) { if (jsVals.hasOwnProperty(vk)) fd.append(vk, jsVals[vk]); }
                } catch(e) {}
            } else {
                try {
                    var jsonVals = JSON.parse(vals);
                    for (var jk in jsonVals) { if (jsonVals.hasOwnProperty(jk)) fd.append(jk, jsonVals[jk]); }
                } catch(e) {}
            }
        }
        // hx-params
        var hxParams = getAttr(elt, "hx-params");
        if (hxParams && hxParams !== "*") {
            if (hxParams === "none") {
                var allKeys = [];
                fd.forEach(function(v, k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });
                for (var ri = 0; ri < allKeys.length; ri++) fd.delete(allKeys[ri]);
            } else if (hxParams.indexOf("not ") === 0) {
                var excl = hxParams.slice(4).split(",").map(function(s) { return s.trim(); });
                for (var ei = 0; ei < excl.length; ei++) fd.delete(excl[ei]);
            } else {
                var incl = hxParams.split(",").map(function(s) { return s.trim(); });
                var keep = {};
                for (var ki = 0; ki < incl.length; ki++) keep[incl[ki]] = true;
                var toRemove = [];
                fd.forEach(function(v, k) { if (!keep[k] && toRemove.indexOf(k) === -1) toRemove.push(k); });
                for (var di = 0; di < toRemove.length; di++) fd.delete(toRemove[di]);
            }
        }
        return { fd: fd, form: form };
    }

    function hasFiles(fd) {
        var found = false;
        fd.forEach(function(v) { if (v instanceof File && v.size > 0) found = true; });
        return found;
    }

    function doScroll(swapSpec, target) {
        if (swapSpec.scroll) {
            var scrollElt = swapSpec.scrollTarget ? document.querySelector(swapSpec.scrollTarget) : target;
            if (scrollElt) {
                var pos = swapSpec.scroll === "top" ? 0 : scrollElt.scrollHeight;
                scrollElt.scrollTo({ top: pos, behavior: config.scrollBehavior });
            }
        }
        if (swapSpec.show) {
            var showElt = swapSpec.showTarget ? document.querySelector(swapSpec.showTarget) : target;
            if (showElt) {
                showElt.scrollIntoView({ behavior: config.scrollBehavior, block: swapSpec.show === "top" ? "start" : "end" });
            }
        }
    }

    function issueRequest(elt, verb, url, triggerSpec, isBoosted) {
        // hx-confirm
        var confirmMsg = getAttr(elt, "hx-confirm");
        if (confirmMsg) {
            var confirmEvt = fire(elt, "htmx:confirm", { question: confirmMsg, triggerEvent: triggerSpec });
            if (confirmEvt.defaultPrevented) return;
            if (!confirm(confirmMsg)) return;
        }
        // hx-prompt
        var promptVal = null;
        var promptMsg = getAttr(elt, "hx-prompt");
        if (promptMsg) {
            promptVal = prompt(promptMsg);
            if (promptVal === null) return;
        }
        // hx-validate
        var validate = getAttr(elt, "hx-validate");
        var paramResult = collectParams(elt, verb);
        var fd = paramResult.fd;
        var form = paramResult.form;
        if (validate === "true" && form) {
            fire(form, "htmx:validation:validate");
            if (!form.checkValidity()) {
                form.reportValidity();
                fire(form, "htmx:validation:failed");
                fire(form, "htmx:validation:halted");
                return;
            }
        }
        // Target
        var targetAttr = getAttr(elt, "hx-target");
        var target = targetAttr ? resolveTarget(elt, targetAttr) : elt;
        if (isBoosted && !targetAttr) target = document.body;
        // Swap spec
        var swapSpec = parseSwapSpec(getAttr(elt, "hx-swap"));
        // Headers
        var headers = {
            "HX-Request": "true",
            "HX-Current-URL": window.location.href,
            "HX-Target": target && target.id ? target.id : "",
            "HX-Trigger": elt.id || "",
            "HX-Trigger-Name": elt.name || ""
        };
        if (isBoosted) headers["HX-Boosted"] = "true";
        if (promptVal !== null) headers["HX-Prompt"] = promptVal;
        // hx-headers (inherited)
        var headersAttr = getAttr(elt, "hx-headers");
        if (headersAttr) {
            try {
                var extra = JSON.parse(headersAttr);
                for (var hk in extra) { if (extra.hasOwnProperty(hk)) headers[hk] = extra[hk]; }
            } catch(e) {}
        }
        // configRequest — FormData passed directly
        var configEvt = fire(elt, "htmx:configRequest", {
            parameters: fd, headers: headers, verb: verb.toUpperCase(),
            path: url, target: target, triggeringEvent: triggerSpec
        });
        if (configEvt.defaultPrevented) return;
        headers = configEvt.detail.headers;
        url = configEvt.detail.path;
        verb = configEvt.detail.verb.toLowerCase();
        // Extension transformRequest
        var activeExts = getActiveExtensions(elt);
        for (var ex = 0; ex < activeExts.length; ex++) {
            if (activeExts[ex].transformRequest) activeExts[ex].transformRequest(headers, fd, elt);
        }
        // selfRequestsOnly
        if (config.selfRequestsOnly) {
            try {
                var reqUrl = new URL(url, window.location.href);
                if (reqUrl.origin !== window.location.origin) {
                    fire(elt, "htmx:sendError", {});
                    return;
                }
            } catch(e) {}
        }
        // beforeRequest
        var brEvt = fire(elt, "htmx:beforeRequest", { elt: elt, target: target, requestConfig: { verb: verb, path: url } });
        if (brEvt.defaultPrevented) return;
        // Sync
        var syncAttr = getAttr(elt, "hx-sync");
        var syncElt = elt;
        var syncMode = "drop";
        if (syncAttr) {
            var sp = syncAttr.split(":");
            if (sp.length > 1) {
                var syncTargetSpec = sp.slice(0, -1).join(":");
                syncElt = resolveTarget(elt, syncTargetSpec) || elt;
                syncMode = sp[sp.length - 1].trim();
            } else {
                syncMode = syncAttr.trim();
            }
        }
        if (syncMode === "replace") syncMode = "abort";
        if (!syncElt._htmxSync) syncElt._htmxSync = {};
        if (syncElt._htmxSync.inFlight) {
            if (syncMode === "drop") return;
            if (syncMode === "abort" && syncElt._htmxSync.controller) {
                syncElt._htmxSync.controller.abort();
                fire(elt, "htmx:xhr:abort", {});
            }
        }
        var controller = new AbortController();
        syncElt._htmxSync.inFlight = true;
        syncElt._htmxSync.controller = controller;
        // Abort listener
        var abortHandler = function() { controller.abort(); fire(elt, "htmx:xhr:abort", {}); };
        elt.addEventListener("htmx:abort", abortHandler, { once: true });
        // Indicator
        var indicatorEls = [];
        var indicatorAttr = getAttr(elt, "hx-indicator");
        if (indicatorAttr) {
            indicatorEls = Array.prototype.slice.call(document.querySelectorAll(indicatorAttr));
        } else {
            indicatorEls = [elt];
        }
        for (var ii = 0; ii < indicatorEls.length; ii++) indicatorEls[ii].classList.add(config.indicatorClass);
        // Disabled elements
        var disabledEls = [];
        var disabledAttr = getAttr(elt, "hx-disabled-elt");
        if (disabledAttr) {
            disabledEls = Array.prototype.slice.call(document.querySelectorAll(disabledAttr));
            for (var de = 0; de < disabledEls.length; de++) disabledEls[de].disabled = true;
        }
        // Fetch options
        var fetchOpts = { method: verb.toUpperCase(), headers: headers, signal: controller.signal };
        if (config.withCredentials) fetchOpts.credentials = "include";
        // Per-element request config
        var reqConfigAttr = getAttr(elt, "hx-request");
        var reqTimeout = config.timeout;
        if (reqConfigAttr) {
            try {
                var rc = JSON.parse(reqConfigAttr);
                if (rc.timeout) reqTimeout = rc.timeout;
                if (rc.credentials === "include" || rc.credentials === true) fetchOpts.credentials = "include";
            } catch(e) {}
        }
        var useUrlParams = config.methodsThatUseUrlParams.indexOf(verb) !== -1;
        var encAttr = getAttr(elt, "hx-encoding");
        if (useUrlParams) {
            var qs = new URLSearchParams(fd).toString();
            if (qs) url += (url.indexOf("?") === -1 ? "?" : "&") + qs;
            if (config.getCacheBusterParam) {
                url += (url.indexOf("?") === -1 ? "?" : "&") + "org.htmx.cache-buster=" + encodeURIComponent(target && target.id ? target.id : "true");
            }
        } else {
            if (encAttr === "multipart/form-data" || hasFiles(fd)) {
                fetchOpts.body = fd;
            } else {
                fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
                fetchOpts.body = new URLSearchParams(fd).toString();
            }
        }
        // beforeSend
        fire(elt, "htmx:beforeSend", { xhr: null, target: target, requestConfig: fetchOpts });
        // Timeout
        var timeoutId = null;
        if (reqTimeout > 0) {
            timeoutId = setTimeout(function() { controller.abort(); fire(elt, "htmx:timeout", {}); }, reqTimeout);
        }
        // Fetch with .finally() for guaranteed cleanup
        fetch(url, fetchOpts).then(function(response) {
            if (timeoutId) clearTimeout(timeoutId);
            fire(elt, "htmx:afterRequest", { xhr: null, target: target, successful: response.ok });
            if (!response.ok) fire(elt, "htmx:responseError", { xhr: null, target: target, response: response });
            // Redirects
            var hxRedirect = response.headers.get("HX-Redirect");
            if (hxRedirect) { window.location.href = hxRedirect; return; }
            var hxRefresh = response.headers.get("HX-Refresh");
            if (hxRefresh === "true") { window.location.reload(); return; }
            // HX-Location
            var hxLocation = response.headers.get("HX-Location");
            if (hxLocation) {
                var locSpec;
                try { locSpec = JSON.parse(hxLocation); } catch(e) { locSpec = { path: hxLocation }; }
                htmx.ajax((locSpec.verb || "get").toLowerCase(), locSpec.path, { target: locSpec.target ? document.querySelector(locSpec.target) : document.body, source: elt });
                return;
            }
            // Retarget / Reswap
            var hxRetarget = response.headers.get("HX-Retarget");
            if (hxRetarget) target = document.querySelector(hxRetarget);
            var hxReswap = response.headers.get("HX-Reswap");
            if (hxReswap) swapSpec = parseSwapSpec(hxReswap);
            // 204 — no swap
            if (response.status === 204) return;
            var shouldSwap = response.ok;
            var bsEvt = fire(target, "htmx:beforeSwap", {
                xhr: null, target: target, requestConfig: fetchOpts,
                shouldSwap: shouldSwap, serverResponse: null
            });
            shouldSwap = bsEvt.detail.shouldSwap;
            if (bsEvt.detail.target) target = bsEvt.detail.target;
            if (!shouldSwap) return;
            return response.text().then(function(html) {
                // Extension transformResponse
                for (var ex2 = 0; ex2 < activeExts.length; ex2++) {
                    if (activeExts[ex2].transformResponse) html = activeExts[ex2].transformResponse(html, null, elt);
                }
                // Title
                var titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
                if (titleMatch) document.title = titleMatch[1].trim();
                // OOB
                html = processOob(html);
                // hx-select-oob
                html = processSelectOob(html, elt.getAttribute("hx-select-oob"));
                // hx-select
                var selectAttr = elt.getAttribute("hx-select");
                if (selectAttr) {
                    var selTmp = document.createElement("div");
                    selTmp.innerHTML = html;
                    var selEl = selTmp.querySelector(selectAttr);
                    html = selEl ? selEl.outerHTML : "";
                }
                // URL history
                var pushUrl = response.headers.get("HX-Push-Url") || getAttr(elt, "hx-push-url");
                var replaceUrl = response.headers.get("HX-Replace-Url") || getAttr(elt, "hx-replace-url");
                function doHistory() {
                    if (pushUrl && pushUrl !== "false") {
                        var pushHref = pushUrl === "true" ? url : pushUrl;
                        saveHistory();
                        history.pushState({ htmx: true }, "", pushHref);
                        fire(elt, "htmx:pushedIntoHistory", { path: pushHref });
                    } else if (replaceUrl && replaceUrl !== "false") {
                        var repHref = replaceUrl === "true" ? url : replaceUrl;
                        saveHistory();
                        history.replaceState({ htmx: true }, "", repHref);
                        fire(elt, "htmx:replacedInHistory", { path: repHref });
                    }
                }
                // Preserve
                var preserved = [];
                if (target) {
                    var preserveEls = target.querySelectorAll("[hx-preserve][id]");
                    for (var pi = 0; pi < preserveEls.length; pi++) {
                        preserved.push({ id: preserveEls[pi].id, clone: preserveEls[pi].cloneNode(true) });
                    }
                }
                function performSwap() {
                    if (target) target.classList.add(config.swappingClass);
                    // Track existing children for htmx-added
                    var existingChildren = [];
                    if (target && swapSpec.swapStyle === "innerHTML") {
                        for (var ec = 0; ec < target.children.length; ec++) existingChildren.push(target.children[ec]);
                    }
                    doSwap(target, html, swapSpec.swapStyle);
                    // Restore preserved
                    for (var pi2 = 0; pi2 < preserved.length; pi2++) {
                        var ph = document.getElementById(preserved[pi2].id);
                        if (ph) ph.parentNode.replaceChild(preserved[pi2].clone, ph);
                    }
                    if (target && document.contains(target)) {
                        target.classList.remove(config.swappingClass);
                        target.classList.add(config.settlingClass);
                    }
                    // Mark newly added children
                    var newChildren = [];
                    if (target && swapSpec.swapStyle === "innerHTML" && document.contains(target)) {
                        for (var nc = 0; nc < target.children.length; nc++) {
                            if (existingChildren.indexOf(target.children[nc]) === -1) {
                                newChildren.push(target.children[nc]);
                                target.children[nc].classList.add(config.addedClass);
                            }
                        }
                    }
                    doHistory();
                    // Process swapped content
                    var processTarget = (swapSpec.swapStyle === "outerHTML")
                        ? (target && target.id ? document.getElementById(target.id) : null) || document.body
                        : target;
                    if (processTarget && document.contains(processTarget)) {
                        process(processTarget);
                        processScripts(processTarget);
                        processHxOn(processTarget);
                    }
                    // Phase 1: HX-Trigger fires
                    triggerServerEvent(elt, response.headers.get("HX-Trigger"));
                    // Phase 2: htmx:afterSwap
                    fire(target || elt, "htmx:afterSwap", { target: target, elt: elt });
                    // Phase 3: HX-Trigger-After-Swap
                    triggerServerEvent(elt, response.headers.get("HX-Trigger-After-Swap"));
                    // Phase 4: settle delay
                    setTimeout(function() {
                        // Phase 5: HX-Trigger-After-Settle
                        triggerServerEvent(elt, response.headers.get("HX-Trigger-After-Settle"));
                        // Phase 6: htmx:afterSettle
                        if (target && document.contains(target)) target.classList.remove(config.settlingClass);
                        for (var ai = 0; ai < newChildren.length; ai++) {
                            if (document.contains(newChildren[ai])) newChildren[ai].classList.remove(config.addedClass);
                        }
                        fire(target || elt, "htmx:afterSettle", { target: target, elt: elt });
                        doScroll(swapSpec, target);
                        if (isBoosted && config.scrollIntoViewOnBoost) {
                            window.scrollTo({ top: 0, behavior: config.scrollBehavior });
                        }
                        fire(processTarget || target || elt, "htmx:load", { elt: processTarget || target });
                    }, swapSpec.settleDelay);
                }
                function executeSwap() {
                    if (swapSpec.transition && document.startViewTransition) {
                        document.startViewTransition(function() { performSwap(); });
                    } else {
                        performSwap();
                    }
                }
                // swapDelay: synchronous when 0, deferred when > 0
                if (swapSpec.swapDelay > 0) {
                    setTimeout(executeSwap, swapSpec.swapDelay);
                } else {
                    executeSwap();
                }
            });
        }).catch(function(err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (err.name !== "AbortError") {
                fire(elt, "htmx:sendError", { error: err });
                fire(elt, "htmx:afterRequest", { xhr: null, target: target, successful: false });
            }
        }).finally(function() {
            syncElt._htmxSync.inFlight = false;
            syncElt._htmxSync.controller = null;
            for (var ci = 0; ci < indicatorEls.length; ci++) indicatorEls[ci].classList.remove(config.indicatorClass);
            for (var dei = 0; dei < disabledEls.length; dei++) disabledEls[dei].disabled = false;
            elt.removeEventListener("htmx:abort", abortHandler);
        });
    }

    function attachTrigger(elt, verb, url, triggerDef, isBoosted) {
        var event = triggerDef.event;
        var mods = triggerDef.modifiers;
        if (event === "every") {
            var intervalId = setInterval(function() {
                if (!document.contains(elt)) { clearInterval(intervalId); return; }
                issueRequest(elt, verb, url, triggerDef, isBoosted);
            }, triggerDef.interval);
            return;
        }
        if (event === "load") {
            setTimeout(function() { issueRequest(elt, verb, url, triggerDef, isBoosted); }, 0);
            return;
        }
        if (event === "revealed") {
            var obs = new IntersectionObserver(function(entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) { obs.disconnect(); issueRequest(elt, verb, url, triggerDef, isBoosted); }
                }
            });
            obs.observe(elt);
            return;
        }
        if (event === "intersect") {
            var intOpts = {};
            if (mods.root) intOpts.root = document.querySelector(mods.root);
            if (mods.threshold !== undefined) intOpts.threshold = mods.threshold;
            var intObs = new IntersectionObserver(function(entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) issueRequest(elt, verb, url, triggerDef, isBoosted);
                }
            }, intOpts);
            intObs.observe(elt);
            return;
        }
        var listenElt = mods.from ? resolveFrom(elt, mods.from) : elt;
        if (!listenElt) return;
        var fired = false;
        var lastValue = undefined;
        var throttleTimer = null;
        var delayTimer = null;
        var handler = function(evt) {
            if (mods.target && !evt.target.matches(mods.target)) return;
            if (mods.filter && config.allowEval) {
                try {
                    if (!new Function("event", "return (" + mods.filter + ")")(evt)) return;
                } catch(e) { return; }
            }
            if (mods.consume) { evt.preventDefault(); evt.stopPropagation(); }
            if (event === "submit") evt.preventDefault();
            if (mods.once && fired) return;
            if (mods.changed) {
                var curVal = elt.value;
                if (curVal === lastValue) return;
                lastValue = curVal;
            }
            var doRequest = function() {
                fired = true;
                if (mods.queue) {
                    if (!elt._htmxSync) elt._htmxSync = {};
                    if (elt._htmxSync.inFlight) {
                        if (mods.queue === "none") return;
                        if (mods.queue === "first" && elt._htmxSync.queued) return;
                        elt._htmxSync.queued = function() { issueRequest(elt, verb, url, triggerDef, isBoosted); };
                        return;
                    }
                }
                issueRequest(elt, verb, url, triggerDef, isBoosted);
            };
            if (mods.throttle) {
                if (throttleTimer) return;
                doRequest();
                throttleTimer = setTimeout(function() { throttleTimer = null; }, mods.throttle);
                return;
            }
            if (mods.delay) {
                if (delayTimer) clearTimeout(delayTimer);
                delayTimer = setTimeout(doRequest, mods.delay);
                return;
            }
            doRequest();
        };
        listenElt.addEventListener(event, handler);
    }

    function boost(container) {
        var links = container.querySelectorAll("a");
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            if (link._htmxBoosted) continue;
            var boostVal = getAttr(link, "hx-boost");
            if (boostVal !== "true") continue;
            if (link.getAttribute("hx-boost") === "false") continue;
            var href = link.getAttribute("href");
            if (!href || href === "" || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("javascript:") === 0) continue;
            link._htmxBoosted = true;
            link.addEventListener("click", function(evt) {
                if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
                evt.preventDefault();
                issueRequest(evt.currentTarget, "get", evt.currentTarget.href, null, true);
            });
        }
        var forms = container.querySelectorAll("form");
        for (var f = 0; f < forms.length; f++) {
            var frm = forms[f];
            if (frm._htmxBoosted) continue;
            var boostVal2 = getAttr(frm, "hx-boost");
            if (boostVal2 !== "true") continue;
            if (frm.getAttribute("hx-boost") === "false") continue;
            frm._htmxBoosted = true;
            frm.addEventListener("submit", function(evt) {
                evt.preventDefault();
                var fm = evt.currentTarget;
                issueRequest(fm, (fm.method || "get").toLowerCase(), fm.action, null, true);
            });
        }
    }

    function initSSE(elt) {
        var url = elt.getAttribute("sse-connect");
        if (!url || elt._htmxSSE) return;
        var es = new EventSource(url);
        elt._htmxSSE = es;
        es.onopen = function() { fire(elt, "htmx:sseOpen", {}); };
        es.onerror = function() { fire(elt, "htmx:sseError", {}); };
        var swappers = elt.querySelectorAll("[sse-swap]");
        var all = [];
        if (elt.getAttribute("sse-swap")) all.push(elt);
        for (var s = 0; s < swappers.length; s++) all.push(swappers[s]);
        for (var i = 0; i < all.length; i++) {
            (function(sw) {
                var evName = sw.getAttribute("sse-swap");
                es.addEventListener(evName, function(e) {
                    var html = processOob(e.data);
                    var sseTarget = sw;
                    var stAttr = getAttr(sw, "hx-target");
                    if (stAttr) sseTarget = resolveTarget(sw, stAttr) || sw;
                    doSwap(sseTarget, html, parseSwapSpec(getAttr(sw, "hx-swap")).swapStyle);
                    process(sseTarget);
                });
            })(all[i]);
        }
        var closeAttr = elt.getAttribute("sse-close");
        if (closeAttr) {
            es.addEventListener(closeAttr, function() { es.close(); elt._htmxSSE = null; });
        }
        var sseCheck = setInterval(function() {
            if (!document.contains(elt)) { es.close(); clearInterval(sseCheck); elt._htmxSSE = null; }
        }, 1000);
    }

    function initWS(elt) {
        var url = elt.getAttribute("ws-connect");
        if (!url || elt._htmxWS) return;
        var retryDelay = 1000;
        var maxDelay = 30000;
        function connect() {
            var ws = new WebSocket(url);
            elt._htmxWS = ws;
            ws.onopen = function() { retryDelay = 1000; };
            ws.onmessage = function(e) {
                var html = processOob(e.data);
                var wsTarget = elt;
                var wtAttr = getAttr(elt, "hx-target");
                if (wtAttr) wsTarget = resolveTarget(elt, wtAttr) || elt;
                doSwap(wsTarget, html, parseSwapSpec(getAttr(elt, "hx-swap")).swapStyle);
                process(wsTarget);
            };
            ws.onclose = function() {
                if (!document.contains(elt)) return;
                retryDelay = Math.min(retryDelay * 2, maxDelay);
                setTimeout(connect, retryDelay);
            };
            ws.onerror = function() { ws.close(); };
            var senders = elt.querySelectorAll("[ws-send]");
            for (var i = 0; i < senders.length; i++) {
                (function(sender) {
                    if (sender._htmxWSSend) return;
                    sender._htmxWSSend = true;
                    var trigs = parseTrigger(sender.getAttribute("hx-trigger"), sender);
                    for (var t = 0; t < trigs.length; t++) {
                        var evtName = trigs[t].event;
                        sender.addEventListener(evtName, function(evt) {
                            if (evtName === "submit") evt.preventDefault();
                            var obj = {};
                            collectParams(sender, "post").fd.forEach(function(v, k) { obj[k] = v; });
                            ws.send(JSON.stringify(obj));
                        });
                    }
                })(senders[i]);
            }
        }
        connect();
        var wsCheck = setInterval(function() {
            if (!document.contains(elt)) {
                if (elt._htmxWS) elt._htmxWS.close();
                clearInterval(wsCheck);
                elt._htmxWS = null;
            }
        }, 1000);
    }

    function process(elt) {
        if (!elt || !elt.querySelectorAll) return;
        if (elt.hasAttribute && elt.hasAttribute("hx-disable")) return;
        fire(elt, "htmx:beforeProcessNode", { elt: elt });
        for (var vi = 0; vi < VERBS.length; vi++) {
            var verb = VERBS[vi];
            var sel = "[hx-" + verb + "]";
            var matched = elt.querySelectorAll(sel);
            var all = [];
            if (elt.getAttribute && elt.getAttribute("hx-" + verb)) all.push(elt);
            for (var e = 0; e < matched.length; e++) all.push(matched[e]);
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                if (el._htmxProcessed) continue;
                if (el.closest && el.closest("[hx-disable]")) continue;
                el._htmxProcessed = true;
                var u = el.getAttribute("hx-" + verb);
                var trigs = parseTrigger(getAttr(el, "hx-trigger"), el);
                for (var t = 0; t < trigs.length; t++) attachTrigger(el, verb, u, trigs[t], false);
            }
        }
        boost(elt);
        var sseElts = elt.querySelectorAll("[sse-connect]");
        if (elt.getAttribute && elt.getAttribute("sse-connect")) initSSE(elt);
        for (var si = 0; si < sseElts.length; si++) initSSE(sseElts[si]);
        var wsElts = elt.querySelectorAll("[ws-connect]");
        if (elt.getAttribute && elt.getAttribute("ws-connect")) initWS(elt);
        for (var wi = 0; wi < wsElts.length; wi++) initWS(wsElts[wi]);
        fire(elt, "htmx:afterProcessNode", { elt: elt });
    }

    function saveHistory() {
        if (!config.historyEnabled) return;
        var historyElt = document.querySelector("[hx-history-elt]") || document.body;
        fire(historyElt, "htmx:beforeHistorySave", {});
        var snapshot = {
            url: window.location.href,
            content: historyElt.innerHTML,
            title: document.title,
            scroll: window.scrollY
        };
        for (var i = historyCache.length - 1; i >= 0; i--) {
            if (historyCache[i].url === snapshot.url) historyCache.splice(i, 1);
        }
        historyCache.push(snapshot);
        if (historyCache.length > config.historyCacheSize) historyCache.shift();
    }

    function restoreHistory(url) {
        var historyElt = document.querySelector("[hx-history-elt]") || document.body;
        fire(historyElt, "htmx:historyRestore", { path: url });
        for (var i = 0; i < historyCache.length; i++) {
            if (historyCache[i].url === url) {
                var cached = historyCache[i];
                historyElt.innerHTML = cached.content;
                document.title = cached.title;
                process(historyElt);
                processScripts(historyElt);
                processHxOn(historyElt);
                setTimeout(function() { window.scrollTo(0, cached.scroll); }, 0);
                return;
            }
        }
        fire(historyElt, "htmx:historyCacheMiss", { path: url });
        if (config.refreshOnHistoryMiss) { window.location.reload(); return; }
        fetch(url, { headers: { "HX-Request": "true", "HX-History-Restore-Request": "true" } })
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) html = bodyMatch[1];
                historyElt.innerHTML = html;
                fire(historyElt, "htmx:historyCacheMissLoad", { path: url });
                process(historyElt);
                processScripts(historyElt);
                processHxOn(historyElt);
                var titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
                if (titleMatch) document.title = titleMatch[1].trim();
            })
            .catch(function(err) {
                fire(historyElt, "htmx:historyCacheMissError", { path: url, error: err });
            });
    }

    function init() {
        var meta = document.querySelector('meta[name="htmx-config"]');
        if (meta) {
            try {
                var userConfig = JSON.parse(meta.getAttribute("content"));
                for (var k in userConfig) { if (userConfig.hasOwnProperty(k)) config[k] = userConfig[k]; }
            } catch(e) {}
        }
        if (config.includeIndicatorStyles) {
            var style = document.createElement("style");
            style.textContent = ".htmx-indicator { opacity: 0; transition: opacity 200ms ease-in; }\n.htmx-request .htmx-indicator, .htmx-request.htmx-indicator { opacity: 1; }";
            document.head.appendChild(style);
        }
        window.addEventListener("popstate", function() { restoreHistory(window.location.href); });
        process(document.body);
    }

    var htmx = {
        version: "derived-2.0.0",
        config: config,
        logger: null,
        process: function(elt) { process(elt); processScripts(elt); processHxOn(elt); },
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
                if (spec.target) target = typeof spec.target === "string" ? document.querySelector(spec.target) || document.body : spec.target;
                if (spec.source) source = typeof spec.source === "string" ? document.querySelector(spec.source) || document.body : spec.source;
            }
            issueRequest(source, verb.toLowerCase(), url, null, false);
        },
        find: function(a, b) { return b === undefined ? document.querySelector(a) : a.querySelector(b); },
        findAll: function(a, b) {
            return b === undefined ? Array.prototype.slice.call(document.querySelectorAll(a)) : Array.prototype.slice.call(a.querySelectorAll(b));
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
            var sibs = elt.parentElement ? elt.parentElement.children : [];
            for (var i = 0; i < sibs.length; i++) sibs[i].classList.remove(cls);
            elt.classList.add(cls);
        },
        trigger: function(elt, event, detail) { fire(elt, event, detail); },
        swap: function(target, html, swapSpecStr) {
            var spec = parseSwapSpec(swapSpecStr);
            html = processOob(html);
            doSwap(target, html, spec.swapStyle);
            process(target);
            processScripts(target);
            processHxOn(target);
        },
        values: function(elt) {
            var obj = {};
            collectParams(elt, "get").fd.forEach(function(v, k) { obj[k] = v; });
            return obj;
        },
        on: function(a, b, c) {
            if (typeof a === "string") { document.body.addEventListener(a, b); }
            else { a.addEventListener(b, c); }
        },
        off: function(a, b, c) {
            if (typeof a === "string") { document.body.removeEventListener(a, b); }
            else { a.removeEventListener(b, c); }
        },
        defineExtension: function(name, def) {
            extensions[name] = def;
            if (def.init) def.init({ config: config });
        },
        removeExtension: function(name) { delete extensions[name]; },
        parseInterval: parseInterval,
        logAll: function() {
            htmx.logger = function(elt, event, detail) { if (console) console.log(event, elt, detail); };
        },
        logNone: function() { htmx.logger = null; },
        _: { fire: fire, getAttr: getAttr, resolveTarget: resolveTarget, doSwap: doSwap, processScripts: processScripts }
    };

    window.htmx = htmx;
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); }
    else { init(); }
})();
