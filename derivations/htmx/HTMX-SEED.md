# HTMX Constraint Seed — Full Parity (v3)

Self-contained specification for a drop-in hypermedia interaction library. Implements the same `hx-*` attribute namespace as htmx.org. A resolver consuming this seed derives a conformant, full-parity implementation in JavaScript.

**Derived implementation:** [htmx-derived.js](/derivations/htmx/htmx-derived.js) — 1,318 lines. Drop-in replacement, same namespace, full parity. 19 constraints.

**Test suite:** [54 tests, all passing](/demo/htmx/tests) | **Live demo:** [Try it](/demo/htmx)

---

## Identity

You are building a client-side JavaScript library that enables any HTML element to issue HTTP requests and swap the response into the DOM. The library is declarative — behavior is specified via HTML attributes, not JavaScript. The library is a drop-in replacement for htmx.js using the same `hx-*` attribute namespace. The library MUST achieve full feature parity with htmx 2.x.

## Implementation Style

Use the browser's **FormData API** for all parameter collection and serialization. Use `new FormData(form)` to gather inputs, `FormData.append()` for hx-vals and hx-include, `new URLSearchParams(fd)` for GET query strings and url-encoded POST bodies. Do not manually walk input elements. The `hx-include` attribute takes a simple CSS selector resolved via `document.querySelectorAll`; do not implement extended selector resolution (closest, find, next, previous) for include targets.

Process elements by querying for each verb selector separately (`querySelectorAll('[hx-get]')`, etc.) plus `[hx-boost='true']`, `[sse-connect]`, `[ws-connect]`. Do not iterate all descendants with `querySelectorAll('*')`. Boost scanning happens inline inside the `process` function. Implement boost as a single `boost(container)` function that handles both links and forms, not split into separate functions.

Implement `doSwap` as a simple switch statement using `target.innerHTML`, `target.outerHTML`, `target.insertAdjacentHTML`, and `target.remove()`. Do not track inserted elements in a settleInfo object.

Parse `hx-headers` from the inherited attribute value with a single `JSON.parse` call; do not manually walk ancestors for header merging.

For OOB swap processing, parse into a temporary `<div>`, extract OOB elements, remove the attribute, use the same `doSwap` function for all strategies, then return `tmp.innerHTML`.

Implement `hx-preserve` inline within the swap function; do not create separate preserve/restore helpers.

For `hx-on:*` processing, iterate `querySelectorAll('*')` and check each element's attributes for `hx-on:` prefixes. Attach handlers directly with `new Function`. Do not add duplicate-prevention maps, separate attribute queries, or IIFE closures. Check only `hx-on:` and `hx-on::` prefixes. Do not implement `data-hx-*` prefix fallback.

Do not add MutationObservers or DOM-presence polling for SSE/WS cleanup.

**Inline, don't extract:** Target resolution, indicator style injection, history element lookup, and sync mode checking are all inlined at call sites — do not create `getTarget`, `injectIndicatorStyles`, `getHistoryElt`, or `resolveSync` wrapper functions. Extension `onEvent` hooks are called inside the `fire()` function body, not through separate helpers.

The `htmx:configRequest` event receives the FormData directly in `detail.parameters` — do not convert to a plain object before the event or rebuild afterward.

History cache-miss recovery uses `fetch()` and writes `response.text()` directly into the history element — no XMLHttpRequest, no `<body>` tag extraction.

URL history management has exactly two branches: one for push-url and one for replace-url, with server headers taking precedence over attributes.

Logger is a plain property on the `window.htmx` object (`logger: null`), not a variable with `Object.defineProperty`. Title extraction uses regex with `.trim()` only — no HTML entity decoding.

---

## Core Constraints (C1–C6)

### C1 — Any Element, Any Verb

Any HTML element MAY issue HTTP requests. The verb is specified by attribute:
- `hx-get="url"` — GET
- `hx-post="url"` — POST
- `hx-put="url"` — PUT
- `hx-patch="url"` — PATCH
- `hx-delete="url"` — DELETE

### C2 — HTML Response, Not JSON

The response from the server is HTML. The library does not parse JSON. The server returns an HTML fragment; the library swaps it into the DOM. GET requests MUST encode parameters as query strings. Non-GET requests without file inputs MUST send `application/x-www-form-urlencoded`. Non-GET requests with file inputs or `hx-encoding="multipart/form-data"` MUST send multipart. The library MUST only swap on 2xx status codes by default; 4xx/5xx MUST fire `htmx:responseError` and NOT swap unless `htmx:beforeSwap` overrides via `evt.detail.shouldSwap`. Status 204 MUST NOT swap.

### C3 — Declarative Swap

`hx-swap="strategy"` specifies how the response replaces content. Strategies:
- `innerHTML` (default) — replace the target's children
- `outerHTML` — replace the target itself
- `beforebegin` — insert before the target
- `afterbegin` — insert as first child
- `beforeend` — insert as last child
- `afterend` — insert after the target
- `delete` — remove the target
- `none` — don't swap (fire events only)

Swap modifiers (space-separated after strategy): `swap:Nms` (delay before swap), `settle:Nms` (delay before settle, default 20ms), `scroll:top|bottom` or `scroll:top:selector` (scroll target or specified element after settle), `show:top|bottom` or `show:top:selector` (scroll into view), `focus-scroll:true|false`, `transition:true|false` (use View Transitions API).

`hx-select="selector"` on the request element: after retrieving the response, query the response HTML for the given CSS selector and swap only the matched fragment's outerHTML. Applied after OOB processing, before the primary swap.

CSS class lifecycle: add `htmx-swapping` to target before swap, remove after swap. Add `htmx-settling` after swap, remove after settle. Add `htmx-added` to newly inserted child elements only (not all existing children) during settle, remove after.

### C4 — Declarative Target

`hx-target="selector"` specifies which DOM element receives the swap. Defaults to the triggering element. Supports:
- CSS selectors: `hx-target="#results"`
- `this` — the triggering element
- `closest selector` — nearest ancestor matching selector
- `find selector` — first descendant matching selector
- `next selector` — next sibling matching selector (bare `next` without selector matches the immediate next sibling)
- `previous selector` — previous sibling matching selector (bare `previous` matches the immediate previous sibling)

### C5 — Declarative Trigger

`hx-trigger="event"` specifies what event initiates the request. Defaults: `click` for most elements, `change` for inputs/selects/textareas, `submit` for forms. Multiple triggers are comma-separated; each gets independent modifiers. When the resolved trigger event is `submit`, the handler MUST call `evt.preventDefault()` to prevent native form submission.

Modifiers:
- `once` — fire only once
- `changed` — only if value changed
- `delay:Nms` — debounce
- `throttle:Nms` — throttle
- `from:selector` — listen on a different element (supports `document`, `window`, `closest selector`, `find selector`, `next selector`, `previous selector`). The `from:` value MAY contain spaces (e.g., `from:closest .container`); consume all remaining tokens up to the next recognized modifier keyword.
- `target:selector` — only fire if event.target matches
- `consume` — preventDefault and stopPropagation
- `queue:first|last|all|none` — queue behavior during active requests
- Filter expressions are appended directly to the event name: `eventName[expr]`. The parser MUST split at `[` to extract event and filter. Example: `click[ctrlKey]` means event=`click`, filter=`ctrlKey`. Guarded by `config.allowEval`.
- `load` — fire on element load
- `revealed` — fire when element enters viewport (IntersectionObserver, fires once)
- `intersect` — fire on intersection (supports `root:selector` and `threshold:N` options)
- `every Ns|Nms` — polling at specified interval. Polling MUST check whether the element is still in the DOM; if removed, clear the interval.

### C6 — Progressive Enhancement

`hx-boost="true"` on a container progressively enhances all links (`<a>`) and forms (`<form>`) within it. Boosted links issue GET via AJAX instead of navigating; boosted forms submit via AJAX using `form.action` (the resolved absolute URL) as the request URL. Both boosted links AND boosted forms MUST push the URL to browser history. Boosted elements inherit `hx-target` from ancestors (default: `body`); resolve target at request time, do NOT mutate element attributes. Scroll to top on boost (`config.scrollIntoViewOnBoost`). `hx-boost="false"` on a child opts out. Modifier keys (meta, ctrl, shift, alt) on link clicks bypass boost. Boosted links MUST skip hrefs beginning with `#`, `mailto:`, `javascript:`, or empty strings.

---

## Ring 1 — Server Authority (C7–C10)

### C7 — Server Controls the Response Lifecycle

The server MAY override client-side behavior via response headers:
- `HX-Redirect: url` — full page redirect
- `HX-Refresh: true` — full page reload
- `HX-Location: url|json` — client-side AJAX redirect. JSON form: `{"path":"/x","target":"#t","verb":"get"}`. MUST respect `path` as URL, `target` as CSS selector (default: `body`), `verb` (default: `GET`).
- `HX-Push-Url: url|false` — push URL to browser history
- `HX-Replace-Url: url|false` — replace current URL (replaceState)
- `HX-Retarget: selector` — override the swap target
- `HX-Reswap: strategy` — override the swap strategy (with modifiers)
- `HX-Trigger: event|json` — fire events on the triggering element AFTER the swap completes but BEFORE the settle delay. JSON: `{"event":{"key":"val"}}`, string: comma-separated names.
- `HX-Trigger-After-Swap: event|json` — fire after swap completes (same timing as HX-Trigger)
- `HX-Trigger-After-Settle: event|json` — fire after settle completes

Ordering: response received -> swap -> HX-Trigger + HX-Trigger-After-Swap -> settle -> HX-Trigger-After-Settle.

The client-side attribute `hx-replace-url="true|url"` replaces the URL via replaceState instead of pushState.

If the response contains a `<title>` tag, the library MUST update `document.title`.

### C8 — Out-of-Band Swaps

A response fragment MAY include elements marked for out-of-band swap:
- `hx-swap-oob="true"` on a response element: swap by `outerHTML` into the DOM element with the same `id`
- `hx-swap-oob="strategy"` (e.g., `innerHTML`, `beforeend`): use specified strategy, target by element's `id`
- `hx-swap-oob="strategy:selector"` (e.g., `beforeend:#notifications`): use specified strategy on specified target

For non-`outerHTML` strategies, swap the OOB element's **inner content** (not its outerHTML) into the target.

OOB elements MUST be removed from the response before the primary swap, so they do not appear in the primary target. Use a regular `<div>` (not `<template>`) for fragment parsing, as template elements have cross-document ownership quirks.

`hx-select-oob="sourceSelector:targetSelector, ..."` on the request element selects multiple fragments from the response and routes each to its target. Entries without a colon use the same selector for both source and target.

`hx-preserve` on an element with an `id`: before performing the primary swap, deep-clone all preserved elements in the target. After the swap, find placeholder elements with matching ids in the new DOM and replace them with the preserved clones. Preservation occurs after OOB processing, before settle.

Both SSE and WebSocket incoming content MUST be scanned for OOB swap elements before performing the primary swap.

Events: `htmx:oobBeforeSwap`, `htmx:oobAfterSwap`, `htmx:oobErrorNoTarget`.

### C9 — Swapped Content is Live

Content swapped into the DOM MUST be treated as a live document:

1. **Script evaluation:** `<script>` tags in swapped content MUST be re-created (not just inserted via innerHTML) so they execute. Guarded by `config.allowScriptTags`. If `config.inlineScriptNonce` is set, apply it to new script elements.

2. **Inline event handlers:** `hx-on:eventname="code"` and `hx-on::eventname="code"` attributes bind event handlers. For `hx-on::eventname` (double colon), the resolved listener name MUST be `htmx:` + the text after `::` (e.g., `hx-on::afterSwap` listens for `htmx:afterSwap`). For `hx-on:eventname` (single colon), the event name is used as-is. The `this` context inside the handler MUST be bound to the element. Processing `hx-on:*` MUST be idempotent — track per-element state to prevent duplicate listeners on re-processing. Guarded by `config.allowEval`.

3. **View Transitions API:** When `transition:true` is set on the swap spec (or `config.globalViewTransitions` is true), wrap the swap in `document.startViewTransition()` if the API is available.

### C10 — Programmatic JavaScript API

The library MUST expose `window.htmx` with:

| Method | Purpose |
|---|---|
| `htmx.ajax(verb, url, spec)` | Issue a request. `spec`: string (CSS selector for target+source), Element (target+source), or `{target, source}` (each may be string or Element). Default target: `document.body`. |
| `htmx.process(elt)` | Scan element for `hx-*` attributes and attach listeners |
| `htmx.find(sel)` / `htmx.find(elt, sel)` | querySelector shortcut |
| `htmx.findAll(sel)` / `htmx.findAll(elt, sel)` | querySelectorAll (returns array) |
| `htmx.closest(elt, sel)` | closest ancestor |
| `htmx.remove(elt)` | Remove element |
| `htmx.addClass(elt, cls, delay?)` | Add class (optional delay string, e.g., "200ms") |
| `htmx.removeClass(elt, cls, delay?)` | Remove class (optional delay) |
| `htmx.toggleClass(elt, cls)` | Toggle class |
| `htmx.takeClass(elt, cls)` | Remove class from all siblings, add to element |
| `htmx.trigger(elt, event, detail?)` | Fire custom event |
| `htmx.swap(target, html, swapSpec?)` | Programmatic swap. `swapSpec`: string (parsed like `hx-swap`), or undefined (uses `config.defaultSwapStyle`). |
| `htmx.values(elt)` | Get resolved form values as object |
| `htmx.on(evt, handler)` | Add event listener on `document` |
| `htmx.on(elt, evt, handler)` | Add event listener on element |
| `htmx.off(evt, handler)` / `htmx.off(elt, evt, handler)` | Remove event listener |
| `htmx.defineExtension(name, def)` | Register extension (see C16) |
| `htmx.removeExtension(name)` | Remove extension |
| `htmx.parseInterval(str)` | Parse time string ("500ms", "2s") to milliseconds |
| `htmx.logAll()` / `htmx.logNone()` | Enable/disable verbose event logging |
| `htmx.logger` | Writable property — set to a function to receive log messages |
| `htmx.config` | Configuration object (see C11) |
| `htmx.version` | Version string |

`htmx._` MAY expose internal functions for extension authors: `fire`, `getAttr`, `resolveTarget`, `doSwap`, `processScripts`. This is not a stable API.

---

## Ring 2 — Infrastructure (C11–C14)

### C11 — Runtime Configuration

All behavioral defaults MUST be overridable via `htmx.config`:

| Key | Default | Purpose |
|---|---|---|
| `defaultSwapStyle` | `"innerHTML"` | Default swap strategy |
| `defaultSwapDelay` | `0` | Default swap delay (ms) |
| `defaultSettleDelay` | `20` | Default settle delay (ms) |
| `indicatorClass` | `"htmx-request"` | Class added during requests |
| `addedClass` | `"htmx-added"` | Class added to new content |
| `settlingClass` | `"htmx-settling"` | Class during settle phase |
| `swappingClass` | `"htmx-swapping"` | Class during swap phase |
| `includeIndicatorStyles` | `true` | Inject default `.htmx-indicator` CSS |
| `historyEnabled` | `true` | Enable history cache |
| `historyCacheSize` | `10` | Max history snapshots |
| `refreshOnHistoryMiss` | `false` | Reload page on cache miss |
| `allowEval` | `true` | Allow eval for hx-vals js:, hx-on, filters |
| `allowScriptTags` | `true` | Execute scripts in swapped content |
| `inlineScriptNonce` | `""` | Nonce for inline scripts (CSP) |
| `selfRequestsOnly` | `true` | Block cross-origin requests |
| `withCredentials` | `false` | Send credentials with requests |
| `timeout` | `0` | Request timeout (ms, 0 = none) |
| `scrollBehavior` | `"instant"` | Scroll behavior ("smooth" or "instant") |
| `defaultFocusScroll` | `false` | Focus scroll after swap |
| `getCacheBusterParam` | `false` | Add cache-busting param to GETs |
| `globalViewTransitions` | `false` | Enable View Transitions globally |
| `methodsThatUseUrlParams` | `["get"]` | HTTP methods that encode params in URL |
| `scrollIntoViewOnBoost` | `true` | Scroll to top on boosted navigation |

Configuration MAY be set via `<meta name="htmx-config" content='{"key":"value"}'>` in the document head (parsed at init). All provided keys MUST be merged, including keys not in the default set (for extension use).

### C12 — History Cache

DOM state before navigation MUST be cacheable and restorable:

1. Before pushing or replacing a URL, snapshot the current content of the history element (`[hx-history-elt]` or `document.body`) including scroll position and document title. When pushing/replacing, pass `{htmx: true}` as the state object.
2. Store snapshots in an in-memory LRU cache (size: `config.historyCacheSize`).
3. On `popstate`, attempt restoration for all popstate events (do not check `event.state`). Check cache: if hit, restore content, title, scroll position, and re-process; if miss, either reload (`config.refreshOnHistoryMiss`) or fetch from server with `HX-History-Restore-Request: true` header. If the response contains a full HTML document (`<body>` tag), extract only the body content.
4. `hx-push-url="true|url"` pushes to history and caches. `hx-push-url="false"` suppresses.
5. `hx-replace-url="true|url"` replaces current entry. `hx-replace-url="false"` suppresses.

Events: `htmx:beforeHistorySave`, `htmx:pushedIntoHistory`, `htmx:replacedInHistory`, `htmx:historyRestore`, `htmx:historyCacheMiss`, `htmx:historyCacheMissLoad`, `htmx:historyCacheMissError`.

### C13 — Composable Parameters

The set of parameters in a request MUST be composable from multiple sources:

1. **Form data:** If the triggering element is inside a form (or is a form), serialize the form. If the element has `name` and `value`, include it.
2. **hx-include="selector":** Merge values from matched elements. MUST support extended selectors (`this`, `closest selector`, `find selector`, `next selector`, `previous selector`, CSS selectors). When the matched element is a container (not a form or input), gather all named input/select/textarea descendants.
3. **hx-vals='{"key":"val"}':** Merge additional values. If `config.allowEval` and value starts with `js:`, evaluate as JavaScript.
4. **hx-params:** Filter which parameters are submitted:
   - `*` — all (default)
   - `none` — none
   - `not param1, param2` — exclude named params
   - `param1, param2` — include only named params
5. **hx-prompt="message":** Show `prompt()` dialog. Include the response as `HX-Prompt` header. Cancel on null.
6. **hx-headers='{"key":"val"}':** Extra headers to include in the request (JSON string, merged into request headers). MUST inherit from ancestors per C18; multiple inherited values MUST be merged with closer ancestors taking precedence.
7. **hx-disabled-elt="selector":** Disable matched elements during request (set `disabled = true`, resolved via `document.querySelectorAll`); re-enable in `finally` block.
8. **hx-confirm="message":** Before issuing the request, fire `htmx:confirm` (cancelable). If not cancelled, show native `confirm(message)`. If user clicks Cancel, abort.

### C14 — Complete Lifecycle Event Stream

Every phase of the request-swap lifecycle MUST emit a named, cancelable event with sufficient detail. The exact ordering is:

`htmx:confirm` -> `htmx:configRequest` (allows modification of headers/params) -> `htmx:beforeRequest` (cancelable, prevents fetch) -> `htmx:beforeSend` (just before fetch) -> [fetch] -> `htmx:afterRequest` -> `htmx:responseError` (if 4xx/5xx) -> `htmx:beforeSwap` (allows overriding shouldSwap) -> [swap] -> `htmx:afterSwap` -> [settle delay] -> `htmx:afterSettle` -> `htmx:load`

Additional events:
- `htmx:timeout` — fired if request times out
- `htmx:sendError` — fired on network error or blocked cross-origin
- `htmx:beforeProcessNode` / `htmx:afterProcessNode` — before/after element scanning
- `htmx:abort` — listen on element to abort its in-flight request
- `htmx:xhr:abort` — fired when a request is aborted
- `htmx:sseOpen` — SSE connection opened
- `htmx:sseError` — SSE connection error

`htmx:load` MUST be fired on the swap target after new content settles.

---

## Ring 3 — Extensions (C15–C19)

### C15 — Server-Pushed Content Streams

The library MUST support persistent server-to-client content channels:

**SSE (Server-Sent Events):**
- `sse-connect="url"` — open an EventSource connection
- `sse-swap="eventName"` — swap the event's data into this element when the named event arrives. MAY also specify `hx-target` and `hx-swap` to control where/how the data is swapped; if absent, swap into the `sse-swap` element itself.
- `sse-close="eventName"` — close the connection when this event fires
- Auto-reconnect is provided by the EventSource API
- Fire `htmx:sseOpen` on connection open, `htmx:sseError` on error

**WebSocket:**
- `ws-connect="url"` — open a WebSocket connection
- `ws-send` — on trigger, serialize the element's form data as JSON and send via WebSocket
- Incoming messages are swapped into the connecting element (process OOB swaps in messages)
- Auto-reconnect with exponential backoff (1s initial, 30s max)

Both SSE and WebSocket connections MUST be cleaned up when the connecting element is removed from the DOM. Use a periodic check or MutationObserver to detect removal; close the connection and clear any intervals.

### C16 — Extension API

Third-party code MUST be able to hook into the lifecycle:

- `htmx.defineExtension(name, definition)` — register an extension. `definition.init(api)` is called at registration where `api` is `{ config: htmx.config }`.
- `htmx.removeExtension(name)` — deregister.
- `hx-ext="name1, name2"` — activate extensions on an element's subtree. `hx-ext="ignore:name"` deactivates. Extension resolution MUST walk up the DOM, collecting extensions and respecting `ignore:` entries. Extensions closer to the element take precedence.
- Extension hooks: `onEvent(name, evt)` — called for every htmx event, but ONLY on elements where the extension is active (resolved via `hx-ext` ancestry). MUST NOT be called globally for all registered extensions. `transformResponse(html, xhr, elt)` — modify response HTML before swap. `transformRequest(headers, data, elt)` — modify request before send.

### C17 — Form Validation

If `hx-validate="true"` is set (or inherited), the library MUST call `form.checkValidity()` before issuing the request. Fire `htmx:validation:validate` before checking. If validation fails: call `form.reportValidity()`, fire `htmx:validation:failed`, fire `htmx:validation:halted`, and abort the request.

### C18 — Attribute Disinherit

All `hx-*` attributes inherit from ancestors by default (walking up the DOM tree). `hx-disinherit="attr1 attr2"` on an element stops inheritance of the named attributes for all descendants. `hx-disinherit="*"` stops all inheritance. The element that has `hx-disinherit` MAY still define the attribute for itself, but descendants MUST NOT inherit it through that element.

### C19 — Request Configuration

Requests MUST support configurable credentials and timing:
- `hx-request='{"timeout":N, "credentials":"include"}'` — per-element request options (JSON). Supported keys: `timeout` (ms), `credentials` (string `"include"` or boolean).
- `config.timeout` — global timeout in ms (abort + fire `htmx:timeout` on expiry)
- `config.selfRequestsOnly` — block cross-origin URLs (fire `htmx:sendError`)
- `config.withCredentials` — send credentials (cookies) with requests
- `config.getCacheBusterParam` — append `org.htmx.cache-buster` param to GET requests
- `hx-disable` — disable htmx processing on an element and all its descendants. MUST be checked during processing (node scanning), NOT at request time. Elements within an `hx-disable` subtree MUST NOT have triggers attached.

---

## Request Headers

Every request MUST include:
- `HX-Request: true`
- `HX-Current-URL: {current page URL}`
- `HX-Target: {target element id}`
- `HX-Trigger: {triggering element id}`
- `HX-Trigger-Name: {triggering element name}`
- `HX-Boosted: true` (if element was boosted)
- `HX-Prompt: {value}` (if hx-prompt was used)
- `HX-History-Restore-Request: true` (if restoring from history cache miss)

## Initialization

1. If `document.readyState` is `"loading"`, wait for `DOMContentLoaded`; otherwise call `init()` immediately.
2. `init()`: load config from `<meta name="htmx-config">`, initialize history (popstate listener), inject indicator styles if configured, process `document.body`.
3. Processing MUST be idempotent — track a per-element flag to prevent re-attaching triggers on re-processing.
4. Processing: scan for `hx-get/post/put/patch/delete` attributes, attach triggers. Scan for `hx-boost="true"`, boost contained links and forms. Initialize `sse-connect` and `ws-connect` elements. The initial `process(document.body)` call MUST NOT evaluate scripts or bind `hx-on:*` handlers — these only run on swapped content.
5. After every swap: re-process the swapped content, THEN evaluate scripts (`processScripts`), THEN process `hx-on:*` handlers, THEN initialize SSE/WS. Script re-execution and `hx-on:*` binding are swap-only operations, never called during `init()`.

## Sync

`hx-sync="mode"` or `hx-sync="selector:mode"` coordinates concurrent requests. When a selector prefix is present (e.g., `closest form:drop`), track the request on the resolved element. Without a prefix, the triggering element is the sync scope.

Modes:
- `drop` — drop the new request if one is in-flight
- `abort` — abort the previous request, start the new one
- `replace` — same as abort
- Queue modes (`queue:first|last|all`) are OPTIONAL and MAY be simplified to `drop` behavior.

Use `AbortController` for cancellation. Clean up in `finally`.

## Indicator

`hx-indicator="selector"` specifies which elements receive `config.indicatorClass` during a request. If absent, the triggering element itself receives the class. The class is added before the fetch and removed in the `finally` block.

If `config.includeIndicatorStyles` is true, inject at init:
```css
.htmx-indicator { opacity: 0; transition: opacity 200ms ease-in; }
.htmx-request .htmx-indicator, .htmx-request.htmx-indicator { opacity: 1; }
```

## Verification

A conformant implementation passes these checks:

**Core (C1–C6):**
1. All five HTTP verbs issue correct method and encode parameters correctly
2. GET appends params as query string; POST sends url-encoded body
3. All eight swap strategies produce correct DOM mutations
4. `hx-select` extracts portion of response before swapping
5. `hx-target` resolves `this`, `closest`, `find`, `next`, `previous`, and CSS selectors
6. Multiple comma-separated triggers each get independent modifiers
7. `from:document`, `from:window`, `from:closest selector` all resolve correctly
8. Filter expressions: `click[ctrlKey]` only fires when ctrlKey is true
9. `hx-boost` intercepts links/forms, inherits target, pushes URL, respects opt-out
10. Boosted links skip `#`, `mailto:`, `javascript:` hrefs
11. Submit triggers always preventDefault to block native form submission

**Ring 1 (C7–C10):**
12. `HX-Retarget` and `HX-Reswap` response headers override client-side declarations
13. `HX-Trigger` fires BEFORE swap; `HX-Trigger-After-Swap` fires AFTER swap
14. `hx-swap-oob="true"` swaps OOB elements by ID; removed from primary swap
15. OOB with strategy (`beforeend`, etc.) uses inner content, not outer element
16. `<script>` tags in swapped content execute
17. `hx-on::afterSwap` listens for `htmx:afterSwap` (double-colon = htmx: prefix)
18. `<title>` tags in responses update document.title
19. `htmx.ajax`, `htmx.find`, `htmx.values`, `htmx.trigger`, `htmx.defineExtension` all work
20. `htmx.on("event", fn)` attaches to document.body

**Ring 2 (C11–C14):**
21. `htmx.config` is readable and mutable; `<meta>` tag overrides work
22. `hx-push-url` pushes state with `{htmx:true}`; popstate restores from cache only for htmx entries
23. `hx-include` merges external values; `hx-params="not x"` filters
24. Event ordering: `configRequest` -> `beforeRequest` -> `beforeSend` -> fetch -> `afterRequest`
25. `htmx:beforeRequest` is cancelable; `htmx:configRequest` allows header modification

**Ring 3 (C15–C19):**
26. `sse-connect` opens EventSource; `sse-swap` swaps on named events; fires `htmx:sseOpen`
27. SSE/WS connections close when element is removed from DOM
28. `htmx.defineExtension` registers; `onEvent` hook fires only for active extensions on the element
29. `hx-validate="true"` halts requests on invalid forms; fires validation events
30. `hx-disinherit` blocks attribute inheritance; element itself retains its own attributes
31. `hx-disable` prevents trigger attachment during processing, not just at request time
32. `hx-request='{"timeout":N}'` aborts slow requests; `HX-Request` header is always sent
33. Polling intervals clear when element is removed from DOM
