# HTMX Constraint Seed — Full Parity

Self-contained specification for a drop-in hypermedia interaction library. Implements the same `hx-*` attribute namespace as htmx.org. A resolver consuming this seed derives a conformant, full-parity implementation in JavaScript.

**Derived implementation:** [htmx-derived.js](/derivations/htmx/htmx-derived.js) — 1,318 lines. Drop-in replacement, same namespace, full parity. 19 constraints.

**Test suite:** [54 tests, all passing](/demo/htmx/tests) | **Live demo:** [Try it](/demo/htmx)

---

## Identity

You are building a client-side JavaScript library that enables any HTML element to issue HTTP requests and swap the response into the DOM. The library is declarative — behavior is specified via HTML attributes, not JavaScript. The library is a drop-in replacement for htmx.js using the same `hx-*` attribute namespace. The library MUST achieve full feature parity with htmx 2.x.

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

Swap modifiers (space-separated after strategy): `swap:Nms` (delay before swap), `settle:Nms` (delay before settle, default 20ms), `scroll:top|bottom` (scroll target after settle), `show:top|bottom` (scroll element into view), `focus-scroll:true|false`, `transition:true|false` (use View Transitions API).

CSS class lifecycle: add `htmx-swapping` to target before swap, remove after swap. Add `htmx-settling` after swap, remove after settle. Add `htmx-added` to new child elements during settle, remove after.

### C4 — Declarative Target

`hx-target="selector"` specifies which DOM element receives the swap. Defaults to the triggering element. Supports:
- CSS selectors: `hx-target="#results"`
- `this` — the triggering element
- `closest selector` — nearest ancestor matching selector
- `find selector` — first descendant matching selector
- `next selector` — next sibling matching selector
- `previous selector` — previous sibling matching selector

### C5 — Declarative Trigger

`hx-trigger="event"` specifies what event initiates the request. Defaults: `click` for most elements, `change` for inputs/selects/textareas, `submit` for forms. Multiple triggers are comma-separated; each gets independent modifiers.

Modifiers:
- `once` — fire only once
- `changed` — only if value changed
- `delay:Nms` — debounce
- `throttle:Nms` — throttle
- `from:selector` — listen on a different element (supports `document`, `window`, `closest selector`, `find selector`, `next selector`, `previous selector`)
- `target:selector` — only fire if event.target matches
- `consume` — preventDefault and stopPropagation
- `queue:first|last|all|none` — queue behavior during active requests
- `[expr]` — filter expression (evaluated as JavaScript, guarded by `config.allowEval`)
- `load` — fire on element load
- `revealed` — fire when element enters viewport (IntersectionObserver, fires once)
- `intersect` — fire on intersection (supports `root:selector` and `threshold:N` options)
- `every Ns|Nms` — polling at specified interval

### C6 — Progressive Enhancement

`hx-boost="true"` on a container progressively enhances all links (`<a>`) and forms (`<form>`) within it. Boosted links issue GET via AJAX instead of navigating; boosted forms submit via AJAX. Boosted elements inherit `hx-target` from ancestors (default: `body`), automatically set `hx-push-url="true"`, and scroll to top on boost. `hx-boost="false"` on a child opts out. Modifier keys (meta, ctrl, shift, alt) on link clicks bypass boost.

---

## Ring 1 — Server Authority (C7–C10)

### C7 — Server Controls the Response Lifecycle

The server MAY override client-side behavior via response headers:
- `HX-Redirect: url` — full page redirect
- `HX-Refresh: true` — full page reload
- `HX-Location: url|json` — client-side AJAX redirect (JSON form: `{"path":"/x","target":"#t"}`)
- `HX-Push-Url: url|false` — push URL to browser history
- `HX-Replace-Url: url|false` — replace current URL (replaceState)
- `HX-Retarget: selector` — override the swap target
- `HX-Reswap: strategy` — override the swap strategy (with modifiers)
- `HX-Trigger: event|json` — fire events on the triggering element (JSON: `{"event":{"key":"val"}}`, string: comma-separated names)
- `HX-Trigger-After-Swap: event|json` — fire after swap
- `HX-Trigger-After-Settle: event|json` — fire after settle

The client-side attribute `hx-replace-url="true|url"` replaces the URL via replaceState instead of pushState.

If the response contains a `<title>` tag, the library MUST update `document.title`.

### C8 — Out-of-Band Swaps

A response fragment MAY include elements marked for out-of-band swap:
- `hx-swap-oob="true"` on a response element: swap by `outerHTML` into the DOM element with the same `id`
- `hx-swap-oob="strategy"` (e.g., `innerHTML`, `beforeend`): use specified strategy, target by element's `id`
- `hx-swap-oob="strategy:selector"` (e.g., `beforeend:#notifications`): use specified strategy on specified target

For non-`outerHTML` strategies, swap the OOB element's **inner content** (not its outerHTML) into the target.

OOB elements MUST be removed from the response before the primary swap, so they do not appear in the primary target.

`hx-select-oob="selector:target, ..."` on the request element selects multiple fragments from the response and routes each to its target.

`hx-preserve` on an element with an `id`: if the swap would replace this element, preserve it by restoring the original after swap.

Events: `htmx:oobBeforeSwap`, `htmx:oobAfterSwap`, `htmx:oobErrorNoTarget`.

### C9 — Swapped Content is Live

Content swapped into the DOM MUST be treated as a live document:

1. **Script evaluation:** `<script>` tags in swapped content MUST be re-created (not just inserted via innerHTML) so they execute. Guarded by `config.allowScriptTags`. If `config.inlineScriptNonce` is set, apply it to new script elements.

2. **Inline event handlers:** `hx-on:eventname="code"` and `hx-on::htmx:eventname="code"` attributes bind event handlers. The `::` prefix denotes htmx-namespaced events. Guarded by `config.allowEval`.

3. **View Transitions API:** When `transition:true` is set on the swap spec (or `config.globalViewTransitions` is true), wrap the swap in `document.startViewTransition()` if the API is available.

### C10 — Programmatic JavaScript API

The library MUST expose `window.htmx` with:

| Method | Purpose |
|---|---|
| `htmx.ajax(verb, url, spec)` | Issue a request programmatically. `spec` is a target selector, element, or `{target, source}` |
| `htmx.process(elt)` | Scan element for `hx-*` attributes and attach listeners |
| `htmx.find(sel)` / `htmx.find(elt, sel)` | querySelector shortcut |
| `htmx.findAll(sel)` / `htmx.findAll(elt, sel)` | querySelectorAll (returns array) |
| `htmx.closest(elt, sel)` | closest ancestor |
| `htmx.remove(elt)` | Remove element |
| `htmx.addClass(elt, cls, delay?)` | Add class (optional delay) |
| `htmx.removeClass(elt, cls, delay?)` | Remove class (optional delay) |
| `htmx.toggleClass(elt, cls)` | Toggle class |
| `htmx.takeClass(elt, cls)` | Remove class from all siblings, add to element |
| `htmx.trigger(elt, event, detail?)` | Fire custom event |
| `htmx.swap(target, html, swapSpec?)` | Programmatic swap |
| `htmx.values(elt)` | Get resolved form values as object |
| `htmx.on(evt, handler)` / `htmx.on(elt, evt, handler)` | Add event listener |
| `htmx.off(evt, handler)` / `htmx.off(elt, evt, handler)` | Remove event listener |
| `htmx.defineExtension(name, def)` | Register extension (see C16) |
| `htmx.removeExtension(name)` | Remove extension |
| `htmx.parseInterval(str)` | Parse time string ("500ms", "2s") to milliseconds |
| `htmx.config` | Configuration object (see C11) |
| `htmx.version` | Version string |

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

Configuration MAY be set via `<meta name="htmx-config" content='{"key":"value"}'>` in the document head (parsed at init).

### C12 — History Cache

DOM state before navigation MUST be cacheable and restorable:

1. Before pushing or replacing a URL, snapshot the current content of the history element (`[hx-history-elt]` or `document.body`) including scroll position and document title.
2. Store snapshots in an in-memory LRU cache (size: `config.historyCacheSize`).
3. On `popstate`, check cache: if hit, restore content, title, scroll position, and re-process; if miss, either reload (`config.refreshOnHistoryMiss`) or fetch from server with `HX-History-Restore-Request: true` header.
4. `hx-push-url="true|url"` pushes to history and caches. `hx-push-url="false"` suppresses.
5. `hx-replace-url="true|url"` replaces current entry. `hx-replace-url="false"` suppresses.

Events: `htmx:beforeHistorySave`, `htmx:pushedIntoHistory`, `htmx:replacedInHistory`, `htmx:historyRestore`, `htmx:historyCacheMiss`, `htmx:historyCacheMissLoad`, `htmx:historyCacheMissError`.

### C13 — Composable Parameters

The set of parameters in a request MUST be composable from multiple sources:

1. **Form data:** If the triggering element is inside a form (or is a form), serialize the form. If the element has `name` and `value`, include it.
2. **hx-include="selector":** Merge values from the matched elements (inputs or forms).
3. **hx-vals='{"key":"val"}':** Merge additional values. If `config.allowEval` and value starts with `js:`, evaluate as JavaScript.
4. **hx-params:** Filter which parameters are submitted:
   - `*` — all (default)
   - `none` — none
   - `not param1, param2` — exclude named params
   - `param1, param2` — include only named params
5. **hx-prompt="message":** Show `prompt()` dialog. Include the response as `HX-Prompt` header. Cancel on null.

### C14 — Complete Lifecycle Event Stream

Every phase of the request-swap lifecycle MUST emit a named, cancelable event with sufficient detail:

**Request phase:**
- `htmx:configRequest` — fired before the request; `detail` contains `headers`, `parameters`, `target`, `verb`. Handlers MAY modify headers and parameters. Cancelable.
- `htmx:beforeRequest` — fired before fetch. Cancelable (prevents request).
- `htmx:beforeSend` — fired just before fetch call.
- `htmx:timeout` — fired if request times out.
- `htmx:sendError` — fired on network error.

**Response phase:**
- `htmx:afterRequest` — fired after response. `detail.successful` indicates 2xx.
- `htmx:responseError` — fired on 4xx/5xx status.

**Swap phase:**
- `htmx:beforeSwap` — fired before DOM swap. `detail.shouldSwap` and `detail.isError` allow control. Cancelable.
- `htmx:afterSwap` — fired after DOM swap.

**Settle phase:**
- `htmx:afterSettle` — fired after settle delay.
- `htmx:load` — fired on new content after it settles into the DOM.

**Processing phase:**
- `htmx:beforeProcessNode` — before an element is scanned for hx-*.
- `htmx:afterProcessNode` — after processing.

**Abort:**
- Listening for `htmx:abort` on an element aborts its in-flight request.
- `htmx:xhr:abort` — fired when a request is aborted.

**Confirm:**
- `htmx:confirm` — fired before the native confirm dialog. Cancelable (prevents confirm and request).

---

## Ring 3 — Extensions (C15–C19)

### C15 — Server-Pushed Content Streams

The library MUST support persistent server-to-client content channels:

**SSE (Server-Sent Events):**
- `sse-connect="url"` — open an EventSource connection
- `sse-swap="eventName"` — swap the event's data into this element when the named event arrives
- `sse-close="eventName"` — close the connection when this event fires
- Auto-reconnect is provided by the EventSource API

**WebSocket:**
- `ws-connect="url"` — open a WebSocket connection
- `ws-send` — on trigger, serialize the element's form data as JSON and send via WebSocket
- Incoming messages are swapped into the connecting element (process OOB swaps in messages)
- Auto-reconnect with exponential backoff (1s initial, 30s max)

### C16 — Extension API

Third-party code MUST be able to hook into the lifecycle:

- `htmx.defineExtension(name, definition)` — register an extension. `definition.init(api)` is called at registration.
- `htmx.removeExtension(name)` — deregister.
- `hx-ext="name1, name2"` — activate extensions on an element's subtree. `hx-ext="ignore:name"` deactivates.
- Extension hooks: `onEvent(name, evt)` — called for every htmx event on elements where the extension is active. `transformResponse(html, xhr, elt)` — modify response HTML before swap. `transformRequest(headers, data, elt)` — modify request before send.

### C17 — Form Validation

If `hx-validate="true"` is set (or inherited), the library MUST call `form.checkValidity()` before issuing the request. If validation fails: call `form.reportValidity()`, fire `htmx:validation:failed`, fire `htmx:validation:halted`, and abort the request. Fire `htmx:validation:validate` before checking.

### C18 — Attribute Disinherit

All `hx-*` attributes inherit from ancestors by default (walking up the DOM tree). `hx-disinherit="attr1 attr2"` on an element stops inheritance of the named attributes for all descendants. `hx-disinherit="*"` stops all inheritance.

### C19 — Request Configuration

Requests MUST support configurable credentials and timing:
- `hx-request='{"timeout":N, "credentials":"include"}'` — per-element request options
- `config.timeout` — global timeout in ms (abort + fire `htmx:timeout` on expiry)
- `config.selfRequestsOnly` — block cross-origin URLs (fire `htmx:sendError`)
- `config.withCredentials` — send credentials (cookies) with requests
- `config.getCacheBusterParam` — append `org.htmx.cache-buster` param to GET requests
- `hx-disable` — disable htmx processing on an element and all its descendants

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

1. On `DOMContentLoaded`, load config from `<meta name="htmx-config">`, initialize history (popstate listener), inject indicator styles if configured, and process `document.body`.
2. Processing: scan for `hx-get/post/put/patch/delete` attributes, attach triggers. Scan for `hx-boost="true"`, boost contained links and forms. Process `hx-on:*` handlers. Initialize `sse-connect` and `ws-connect` elements.
3. After every swap: re-process the swapped content, evaluate scripts, process `hx-on:*`, initialize SSE/WS.

## Sync

`hx-sync="mode"` coordinates concurrent requests on an element:
- `drop` — drop the new request if one is in-flight
- `abort` — abort the previous request, start the new one
- `replace` — same as abort
- `queue:first|last|all` — queue requests

Use `AbortController` for request cancellation. Clean up the controller in the `finally` block.

## Indicator Styles

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
4. `hx-target` resolves `this`, `closest`, `find`, `next`, `previous`, and CSS selectors
5. Multiple comma-separated triggers each get independent modifiers
6. `from:document`, `from:window`, `from:closest selector` all resolve correctly
7. `hx-boost` intercepts links/forms, inherits target, pushes URL, respects opt-out

**Ring 1 (C7–C10):**
8. `HX-Retarget` and `HX-Reswap` response headers override client-side declarations
9. `HX-Trigger` fires events in all three phases (immediate, after-swap, after-settle)
10. `hx-swap-oob="true"` swaps OOB elements by ID; OOB elements are removed from primary swap
11. OOB with strategy (`beforeend`, etc.) uses inner content, not outer element
12. `<script>` tags in swapped content execute
13. `<title>` tags in responses update document.title
14. `htmx.ajax`, `htmx.find`, `htmx.values`, `htmx.trigger`, `htmx.defineExtension` all work

**Ring 2 (C11–C14):**
15. `htmx.config` is readable and mutable; `<meta>` tag overrides work
16. `hx-push-url` pushes state; popstate restores from cache
17. `hx-include` merges external values; `hx-params="not x"` filters
18. `htmx:beforeRequest` is cancelable; `htmx:configRequest` allows header modification

**Ring 3 (C15–C19):**
19. `sse-connect` opens EventSource; `sse-swap` swaps on named events
20. `htmx.defineExtension` registers; `onEvent` hook receives lifecycle events
21. `hx-validate="true"` halts requests on invalid forms
22. `hx-disinherit` blocks attribute inheritance
23. `hx-request='{"timeout":N}'` aborts slow requests; `HX-Request` header is always sent
