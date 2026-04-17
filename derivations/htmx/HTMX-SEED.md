# HTMX Constraint Seed

Self-contained specification for a drop-in hypermedia interaction library. Implements the same `hx-*` attribute namespace as htmx.org. A resolver consuming this seed derives a conformant implementation in JavaScript.

## Identity

You are building a client-side JavaScript library that enables any HTML element to issue HTTP requests and swap the response into the DOM. The library is declarative — behavior is specified via HTML attributes, not JavaScript. The library is a drop-in replacement for htmx.js using the same `hx-*` attribute namespace.

## Six Essential Constraints

### C1 — Any Element, Any Verb

Any HTML element MAY issue HTTP requests. The verb is specified by attribute:
- `hx-get="url"` — GET request
- `hx-post="url"` — POST request  
- `hx-put="url"` — PUT request
- `hx-patch="url"` — PATCH request
- `hx-delete="url"` — DELETE request

### C2 — HTML Response, Not JSON

The response from the server is HTML. The library does not parse JSON. The server returns an HTML fragment; the library swaps it into the DOM. This is the fundamental constraint: the server is the source of truth for what the UI looks like.

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

### C4 — Declarative Target

`hx-target="selector"` specifies which DOM element receives the swap. Defaults to the element that triggered the request. Supports:
- CSS selectors: `hx-target="#results"`
- `this` — the triggering element
- `closest selector` — nearest ancestor matching selector
- `find selector` — first descendant matching selector

### C5 — Declarative Trigger

`hx-trigger="event"` specifies what event initiates the request. Defaults:
- `click` for most elements
- `change` for inputs/selects/textareas
- `submit` for forms

Supports modifiers:
- `once` — fire only once
- `changed` — only if value changed
- `delay:Nms` — debounce by N milliseconds
- `throttle:Nms` — throttle by N milliseconds
- `from:selector` — listen on a different element
- `load` — fire on element load
- `revealed` — fire when element enters viewport

### C6 — Progressive Enhancement

The library MUST work as progressive enhancement. A page without the library MUST still be functional HTML. The library adds interactivity; it does not replace structure.

## Additional Attributes

- `hx-vals='{"key":"val"}'` — extra values to include in the request (JSON string)
- `hx-headers='{"key":"val"}'` — extra headers
- `hx-confirm="message"` — show confirm dialog before request
- `hx-indicator="selector"` — element to show as loading indicator (add/remove `htmx-request` class)
- `hx-push-url="true|url"` — push URL to browser history after swap
- `hx-select="selector"` — select a portion of the response to swap
- `hx-boost="true"` — progressively enhance links and forms within the element
- `hx-disabled-elt="selector"` — disable element(s) during request

## Request Headers

Every request MUST include:
- `HX-Request: true`
- `HX-Current-URL: {current page URL}`
- `HX-Target: {target element id, if any}`
- `HX-Trigger: {triggering element id, if any}`

## Events

The library fires these events on the triggering element:
- `htmx:beforeRequest` — before the fetch (cancelable)
- `htmx:afterRequest` — after the fetch completes
- `htmx:beforeSwap` — before the DOM swap (cancelable)
- `htmx:afterSwap` — after the DOM swap
- `htmx:afterSettle` — after the swap has settled (scripts executed, etc.)

## Processing

1. On `DOMContentLoaded`, scan the entire document for `hx-*` attributes and attach event listeners.
2. After every swap, scan the swapped content for new `hx-*` attributes and attach listeners.
3. For `hx-boost`, intercept link clicks and form submits within boosted containers.
4. Include form data automatically when the triggering element is inside a form, or when the element is an input.

## Verification

A conformant implementation passes these checks:
1. `hx-get` on a button fetches and swaps innerHTML of target
2. `hx-post` on a form submits form data and swaps response
3. `hx-swap="outerHTML"` replaces the target element entirely
4. `hx-trigger="click once"` fires only on first click
5. `hx-trigger="keyup changed delay:500ms"` debounces
6. `hx-confirm` shows dialog and cancels on deny
7. `hx-indicator` adds/removes `htmx-request` class during fetch
8. `hx-push-url` updates browser history
9. `hx-select` extracts portion of response
10. `hx-boost` intercepts links and submits via AJAX
11. Dynamically swapped content with hx-* attributes is processed
12. `HX-Request: true` header is sent on every request
