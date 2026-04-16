# htxlang Implementation Specification

**Version 0.1**
**Jared Foy**
**April 2026**

**Companion to:** htxlang Specification v0.2, Reference Profile v0.1

---

## Status

Working draft. This document describes the algorithms, data structures, and exact behaviors required to implement a reference-profile-conformant htxlang engine.

An engineer reading this document should be able to build a complete engine in any language without consulting source code.

---

## 1. Engine Architecture

### 1.1 Components

A conformant engine consists of the following components:

```
Engine
├── Router                  — maps URL paths to template files
├── TemplateReader          — reads template files from disk
├── IncludeResolver         — expands <htx:include> directives
├── ComponentResolver       — expands <htx:component> directives
├── ExpressionEngine        — evaluates <htx:v> and {htx:...} expressions
├── DataResolver            — processes <htx:data> directives
├── ControlFlow             — processes <htx:each> and <htx:if> directives
├── LayoutResolver          — wraps content in layout templates
├── GrantResolver           — materializes <htx:grant> credentials
├── MutationHandler         — generates and verifies <htx:action> tokens
├── ModuleRegistry          — manages module lifecycle and capabilities
├── StaticServer            — serves static files from public directory
├── ChannelMiddleware       — validates Bearer tokens on /api/channel routes
└── RequestHandler          — orchestrates the 22-stage pipeline
```

### 1.2 Data Structures

**Data Context:** A mutable key-value map (string keys, arbitrary values). Populated progressively through the pipeline. Passed to the expression engine for value resolution.

**Script Collector:** An ordered array of strings. Scripts extracted from components and page-level htx:script blocks are appended to this array. After layout wrapping, the contents are injected into the document.

**Route Match:** A tuple of (filePath: string, params: Record<string, string>).

---

## 2. Router

### 2.1 Input

A URL path string (e.g., `/blog/hello-world`).

### 2.2 Algorithm

```
FUNCTION resolve(requestPath):
  normalized = requestPath == "/" ? "/index" : requestPath.trimTrailingSlash()

  # Step 1: Exact file match
  candidate = templateDir + normalized + ".htx"
  IF candidate exists AND is a file:
    RETURN (filePath: candidate, params: {})

  # Step 2: Directory index
  candidate = templateDir + normalized + "/index.htx"
  IF candidate exists AND is a file:
    RETURN (filePath: candidate, params: {})

  # Step 3: Dynamic segment resolution
  RETURN walkDynamic(templateDir, normalized.split("/").filter(nonEmpty), 0, {})
```

### 2.3 Dynamic Segment Algorithm

```
FUNCTION walkDynamic(dir, segments, index, params):
  IF index >= segments.length:
    indexFile = dir + "/index.htx"
    IF indexFile exists: RETURN (filePath: indexFile, params: params)
    RETURN null

  segment = segments[index]
  isLast = (index == segments.length - 1)

  # Try exact match
  IF isLast:
    exactFile = dir + "/" + segment + ".htx"
    IF exactFile exists AND is file:
      RETURN (filePath: exactFile, params: params)

  exactDir = dir + "/" + segment
  IF exactDir exists AND is directory:
    result = walkDynamic(exactDir, segments, index + 1, params)
    IF result != null: RETURN result

  # Try dynamic segment [paramName]
  FOR EACH entry in listDirectory(dir):
    match = entry.match(/^\[([^\]]+)\](\.htx)?$/)
    IF match == null: CONTINUE

    paramName = match[1]
    isFile = entry.endsWith(".htx")

    IF isFile AND isLast:
      RETURN (filePath: dir + "/" + entry, params: {...params, [paramName]: segment})

    IF NOT isFile:
      subDir = dir + "/" + entry
      IF subDir is directory:
        result = walkDynamic(subDir, segments, index + 1, {...params, [paramName]: segment})
        IF result != null: RETURN result

  RETURN null
```

---

## 3. Include Resolver

### 3.1 Input

Template content string, the file path of the current template, the template reader, and a depth counter (default 0).

### 3.2 Pattern

```regex
/<htx:include\s+src\s*=\s*"([^"]+)"\s*\/>/g
```

### 3.3 Algorithm

```
FUNCTION expand(content, filePath, reader, depth):
  IF depth > 10: RETURN content with warning

  RETURN content.replaceAll(INCLUDE_PATTERN, (match, src):
    resolved = resolvePath(src, filePath, reader)
    IF resolved == null:
      RETURN "<!-- include not found: " + src + " -->"
    includeContent = readFile(resolved)
    RETURN expand(includeContent, resolved, reader, depth + 1)
  )

FUNCTION resolvePath(src, fromFile, reader):
  IF src.startsWith("/"): RETURN reader.resolve(src.removeLeadingSlash())
  IF src.contains(".."): RETURN null  # traversal prevention
  candidate = dirname(fromFile) + "/" + src
  IF candidate exists: RETURN candidate
  RETURN reader.resolve(src)
```

---

## 4. Component Resolver

### 4.1 Patterns

```regex
# Component tag (self-closing or with content)
/<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>)/g

# Props block inside component file
/<htx:props>([\s\S]*?)<\/htx:props>/

# Script block inside component file
/<htx:script>([\s\S]*?)<\/htx:script>/g
```

### 4.2 Algorithm

```
FUNCTION resolve(content, data, depth, scriptCollector, reader, sourceFile):
  IF depth > 10: RETURN content

  RETURN content.replaceAll(COMPONENT_PATTERN, (match, src, attrsStr, slotContent):
    componentPath = resolvePath(src, sourceFile, reader)
    IF componentPath == null: RETURN "<!-- component not found: " + src + " -->"

    template = readFile(componentPath)

    # Parse declared props with defaults
    declaredProps = parsePropsBlock(template)
    template = template.removePropsBlock()

    # Parse passed props from attributes
    passedProps = parseAttributes(attrsStr)  # excludes "src"

    # Merge: passed overrides declared
    props = {...declaredProps, ...passedProps}

    # Substitute {{ propName }} in template
    FOR EACH (key, value) in props:
      template = template.replaceAll("{{ " + key + " }}", value)
      template = template.replaceAll("{{" + key + "}}", value)

    # Inject slot content
    IF slotContent != undefined:
      template = template.replace("<htx:slot />", slotContent)
      template = template.replace("<htx:slot></htx:slot>", slotContent)

    # Extract scripts
    IF template.contains("<htx:script>"):
      scripts = extractScripts(template)
      template = scripts.html
      IF scripts.bodies.length > 0:
        id = "htx-c" + scriptCollector.length
        template = addDataHtxId(template, id)
        combined = scripts.bodies.join("\n  ")
        scriptCollector.append(
          "(function(){\n" +
          "  const el = document.querySelector('[data-htx-id=\"" + id + "\"]');\n" +
          "  if (!el) return;\n" +
          "  " + combined + "\n" +
          "})();"
        )

    # Recurse for nested components
    RETURN resolve(template, data, depth + 1, scriptCollector, reader, componentPath)
  )
```

### 4.3 Props Block Parsing

```
FUNCTION parsePropsBlock(template):
  match = template.match(PROPS_PATTERN)
  IF match == null: RETURN {}
  props = {}
  FOR EACH line in match[1].split("\n"):
    # Try: key = "value"
    quoted = line.match(/^\s*(\w+)\s*=\s*"([^"]*)"\s*$/)
    IF quoted: props[quoted[1]] = quoted[2]; CONTINUE
    # Try: key = value
    unquoted = line.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/)
    IF unquoted: props[unquoted[1]] = unquoted[2]
  RETURN props
```

### 4.4 addDataHtxId

Inserts `data-htx-id="ID"` into the first HTML opening tag of the template:

```
FUNCTION addDataHtxId(html, id):
  RETURN html.replace(/^(\s*<[a-zA-Z][a-zA-Z0-9]*)/, '$1 data-htx-id="' + id + '"')
```

---

## 5. Expression Engine

### 5.1 Patterns

```regex
# <htx:v>expression</htx:v> and <htx:v raw>expression</htx:v>
/<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>)/g

# {htx:expression} in attribute values
/\{htx:([^}]+)\}/g

# Script blocks to protect
/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi

# Raw blocks to protect
/<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/gi
```

### 5.2 Evaluation Algorithm

```
FUNCTION evaluate(template, data):
  # Step 1: Protect script and raw blocks
  protected = {}
  content = template.replaceAll(SCRIPT_PATTERN, (match):
    marker = "<!--PRESTO_PROTECTED_" + protected.size + "-->"
    protected[marker] = match
    RETURN marker
  )
  content = content.replaceAll(RAW_PATTERN, (match):
    marker = "<!--PRESTO_PROTECTED_" + protected.size + "-->"
    protected[marker] = match
    RETURN marker
  )

  # Step 2: Evaluate <htx:v> tags
  content = content.replaceAll(HTV_TAG_PATTERN, (match, rawFlag, pathAttr, bodyContent):
    expression = (pathAttr OR bodyContent OR "").trim()
    IF expression == "": RETURN ""
    value = resolveExpression(expression, data)
    IF rawFlag: RETURN String(value)
    RETURN escapeHtml(String(value))
  )

  # Step 3: Evaluate {htx:expression} attributes
  content = content.replaceAll(HTX_ATTR_PATTERN, (match, expression):
    value = resolveExpression(expression.trim(), data)
    RETURN escapeHtml(String(value))
  )

  # Step 4: Restore protected blocks
  FOR EACH (marker, original) in protected:
    content = content.replace(marker, original)

  RETURN content
```

### 5.3 Expression Resolution

```
FUNCTION resolveExpression(expression, data):
  # Check for pipe
  pipeIndex = expression.indexOf("|")
  IF pipeIndex > 0:
    path = expression[0..pipeIndex].trim()
    pipeName = expression[pipeIndex+1..].trim()
    value = resolvePath(path, data)
    RETURN applyPipe(value, pipeName)
  RETURN resolvePath(expression, data)

FUNCTION resolvePath(path, data):
  parts = path.split(".")
  current = data
  FOR EACH part in parts:
    IF current == null: RETURN undefined
    IF current is object: current = current[part]
    ELSE: RETURN undefined
  RETURN current

FUNCTION applyPipe(value, pipeName):
  str = String(value OR "")
  SWITCH pipeName:
    "uppercase": RETURN str.toUpperCase()
    "lowercase": RETURN str.toLowerCase()
    "capitalize": RETURN str[0].toUpperCase() + str[1..]
    "trim": RETURN str.trim()
    "length": RETURN isArray(value) ? value.length : str.length
    "json": RETURN JSON.stringify(value)
    DEFAULT: RETURN value
```

### 5.4 HTML Escaping

```
FUNCTION escapeHtml(str):
  RETURN str
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace('"', "&quot;")
```

### 5.5 hasExpressions

```
FUNCTION hasExpressions(template):
  stripped = template.removeAll(SCRIPT_PATTERN).removeAll(RAW_PATTERN)
  RETURN HTV_TAG_PATTERN.test(stripped) OR HTX_ATTR_PATTERN.test(stripped)
```

---

## 6. Data Resolver

### 6.1 Pattern

```regex
/<htx:data\s+([^>]*)\/>/g
```

### 6.2 Algorithm

```
FUNCTION resolve(content, data, adapter):
  IF adapter == null: RETURN (content: stripDataDirectives(content), data: data)

  enrichedData = copy(data)
  directives = extractDataDirectives(content)

  FOR EACH directive in directives:
    type = directive["type"]
    as = directive["as"]
    IF type == null OR as == null: CONTINUE

    slug = resolveReferences(directive["slug"], data)
    where = resolveReferences(directive["where"], data)
    order = directive["order"]
    limit = parseInt(directive["limit"])
    offset = parseInt(directive["offset"])

    IF slug != null:
      record = adapter.get(type, {slug: slug})
      enrichedData[as] = record
    ELSE:
      records = adapter.query({type, where, order, limit, offset})
      enrichedData[as] = records

  RETURN (content: stripDataDirectives(content), data: enrichedData)

FUNCTION resolveReferences(value, data):
  IF value == null: RETURN null
  RETURN value.replaceAll(/\{([^}]+)\}/g, (match, path):
    RETURN String(resolvePath(path.trim(), data) OR "")
  )
```

---

## 7. Control Flow

### 7.1 Patterns

```regex
# <htx:each items="path" as="var">content</htx:each>
/<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)<\/htx:each>/g

# <htx:empty> separator inside each blocks
/<htx:empty\s*\/?>/

# <htx:if test="expr">content</htx:if> with optional <htx:else>
/<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)<\/htx:if>(?:\s*<htx:else\s*>([\s\S]*?)<\/htx:else>)?/g
```

### 7.2 Each Algorithm

```
FUNCTION resolveEach(content, data, expressionEngine):
  RETURN content.replaceAll(EACH_PATTERN, (match, itemsPath, asVar, body):
    items = expressionEngine.resolvePath(itemsPath.trim(), data)

    IF NOT isArray(items) OR items.length == 0:
      parts = body.split(EMPTY_PATTERN)
      IF parts.length > 1: RETURN parts[1]  # empty fallback
      RETURN ""

    itemTemplate = body.split(EMPTY_PATTERN)[0]
    result = ""

    FOR i = 0 TO items.length - 1:
      itemData = {
        ...data,
        [asVar]: items[i],
        $index: i,
        $first: i == 0,
        $last: i == items.length - 1
      }
      rendered = expressionEngine.evaluate(itemTemplate, itemData)
      rendered = resolveControlFlow(rendered, itemData, expressionEngine)  # recursive
      result = result + rendered

    RETURN result
  )
```

### 7.3 If Algorithm

```
FUNCTION resolveIf(content, data, expressionEngine):
  RETURN content.replaceAll(IF_PATTERN, (match, test, ifContent, elseContent):
    value = expressionEngine.resolvePath(test.trim(), data)
    truthy = isTruthy(value)

    IF truthy:
      RETURN expressionEngine.evaluate(ifContent, data)
    ELSE IF elseContent != null:
      RETURN expressionEngine.evaluate(elseContent, data)
    RETURN ""
  )

FUNCTION isTruthy(value):
  IF value == null: RETURN false
  IF value == false: RETURN false
  IF value == 0: RETURN false
  IF value == "": RETURN false
  IF isArray(value) AND value.length == 0: RETURN false
  RETURN true
```

---

## 8. Layout Resolver

### 8.1 Directive Pattern

```regex
/<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:\/>|><\/htx:layout>)/i
```

### 8.2 Algorithm

```
FUNCTION wrap(content, filePath, reader, skipRoot):
  directive = extractDirective(content)

  IF directive.none: RETURN directive.cleanContent
  IF directive.src: RETURN wrapExplicit(directive.cleanContent, directive.src, reader, skipRoot)

  # Convention walk
  layouts = collectLayouts(filePath, reader.getPrimary())

  IF skipRoot AND layouts.length > 0:
    lastContent = readFile(layouts[last])
    IF lastContent.containsIgnoreCase("<!doctype html"):
      layouts.removeLast()

  output = directive.cleanContent
  FOR EACH layoutPath in layouts:
    layoutContent = readFile(layoutPath)
    output = layoutContent.replaceAll("__content__", output)

  RETURN output

FUNCTION collectLayouts(filePath, siteRoot):
  resolvedRoot = absolutePath(siteRoot)
  currentDir = dirname(absolutePath(filePath))
  layouts = []

  LOOP:
    layoutFile = currentDir + "/_layout.htx"
    IF layoutFile exists:
      content = readFile(layoutFile)
      layouts.append(layoutFile)
      IF content.containsIgnoreCase("<!doctype html"): BREAK

    IF currentDir == resolvedRoot: BREAK
    parentDir = dirname(currentDir)
    IF parentDir == currentDir: BREAK
    currentDir = parentDir

  RETURN layouts
```

---

## 9. Grant Resolver

### 9.1 Pattern

```regex
/<htx:grant\s+([^>]*)\/>/g
```

### 9.2 Algorithm

```
FUNCTION resolve(content, data, userId):
  enrichedData = copy(data)
  grants = extractDirectives(content, GRANT_PATTERN)

  FOR EACH grant in grants:
    type = grant["type"]
    varName = grant["as"]
    IF type == null OR varName == null: CONTINUE

    provider = grantProviders[type]
    IF provider == null: WARN("Unknown grant type: " + type); CONTINUE

    credential = provider.resolve(grant.attributes, userId)
    enrichedData[varName] = credential

  RETURN (content: stripGrants(content), data: enrichedData)
```

### 9.3 Built-in Grant Providers

**Websocket:**
```
Input: (attrs, userId)
Output: { token: signedToken, expiresAt: timestamp }
Procedure: Issue channel token with scope "websocket"
```

**Channel:**
```
Input: (attrs, userId)  # attrs includes "module"
Output: { token: signedToken, module: name, scope: "channel:{module}", expiresAt: timestamp }
Procedure: Issue channel token with scope "channel:{attrs.module}"
```

**Asset:**
```
Input: (attrs, userId)  # attrs includes "path"
Output: { url: signedUrl, path: originalPath, expiresAt: timestamp }
Procedure: Sign the asset path with HMAC, append ?sig={sig}&exp={exp}
```

---

## 10. Mutation Handler

### 10.1 Token Generation (Prepare)

```
FUNCTION prepare(content, data):
  enrichedData = copy(data)
  actions = {}
  directives = extractDirectives(content, ACTION_PATTERN)

  FOR EACH directive in directives:
    name = directive["name"]
    type = directive["type"]
    record = resolveReferences(directive["record"], data)

    payload = JSON.stringify({
      action: name,
      type: type,
      recordId: record,
      exp: currentTimeMs() + 3600000  # 1 hour
    })

    encoded = base64url(payload)
    signature = hmacSha256(encoded, serverSecret)
    token = encoded + "." + base64url(signature)

    actions[name] = token

  enrichedData["$actions"] = actions
  RETURN (content: stripActions(content), data: enrichedData)
```

### 10.2 Token Verification (Execute)

```
FUNCTION execute(token):
  parts = token.split(".")
  IF parts.length != 2: RETURN {valid: false}

  encoded = parts[0]
  signature = parts[1]

  expectedSig = base64url(hmacSha256(encoded, serverSecret))
  IF signature != expectedSig: RETURN {valid: false}

  payload = JSON.parse(base64urlDecode(encoded))
  IF payload.exp < currentTimeMs(): RETURN {valid: false}

  RETURN {valid: true, payload: payload}
```

---

## 11. Auth Conditionals

### 11.1 Patterns

```regex
/<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)<\/htx:auth>/g
/<htx:unauth\s*>([\s\S]*?)<\/htx:unauth>/g
```

### 11.2 Algorithm

```
FUNCTION resolveAuth(content, data):
  auth = data["auth"]

  # htx:auth blocks
  content = content.replaceAll(AUTH_PATTERN, (match, role, body):
    IF auth == null OR auth.user == null: RETURN ""
    IF role != null AND auth.user.role != role: RETURN ""
    RETURN body
  )

  # htx:unauth blocks
  content = content.replaceAll(UNAUTH_PATTERN, (match, body):
    IF auth != null AND auth.user != null: RETURN ""
    RETURN body
  )

  RETURN content
```

---

## 12. Channel Middleware

### 12.1 Algorithm

```
FUNCTION handleChannelRequest(request, registry, channelTokenService):
  # Parse: /api/channel/{module}/{subPath}
  parts = request.path.removePrefix("/api/channel/").split("/")
  moduleName = parts[0]
  subPath = parts[1..].join("/")

  # Find handler
  handler = registry.getChannelHandler(moduleName)
  IF handler == null: RETURN 404 {error: "Unknown channel"}

  # Validate Bearer token
  authHeader = request.headers["Authorization"]
  IF authHeader == null OR NOT authHeader.startsWith("Bearer "):
    RETURN 401 {error: "Unauthorized"}

  token = authHeader.removePrefix("Bearer ")
  payload = channelTokenService.verify(token)
  IF payload == null: RETURN 401 {error: "Invalid or expired token"}

  # Verify scope
  expectedScope = "channel:" + moduleName
  IF payload.scope != expectedScope: RETURN 403 {error: "Token scope mismatch"}

  # Route to handler
  result = handler.handle(subPath, request.query, payload.sub, {
    method: request.method,
    body: request.body
  })

  RETURN result.status, JSON(result.data)
```

---

## 13. Module Registry

### 13.1 Data Structures

```
ModuleRegistry:
  middleware: OrderedList<Middleware>
  contextProviders: Map<String, ContextProvider>
  channelHandlers: Map<String, ChannelHandler>
  templateProcessors: List<TemplateProcessor>
```

### 13.2 Boot Algorithm

```
FUNCTION bootAll(modules):
  FOR EACH module in modules:
    manifest = module.manifest()
    registry = (manifest.trust == "first-party")
      ? self
      : createSandbox(module.name(), manifest)
    TRY:
      module.boot(registry)
      LOG("Module booted: " + module.name())
    CATCH error:
      LOG("Module boot failed: " + module.name() + ": " + error)
      # Continue — one module's failure does not block others
```

### 13.3 Sandbox Algorithm

```
FUNCTION createSandbox(moduleName, manifest):
  RETURN proxy where:
    registerMiddleware(mw):
      IF mw.name() NOT IN manifest.middleware:
        WARN(moduleName + ": undeclared middleware " + mw.name())
        RETURN  # silently drop
      self.middleware.append(mw)

    registerContextProvider(name, provider):
      IF name NOT IN manifest.contextProviders:
        WARN(moduleName + ": undeclared context provider " + name)
        RETURN
      self.contextProviders[name] = provider

    registerChannelHandler(handler):
      IF handler.module() NOT IN manifest.channelHandlers:
        WARN(moduleName + ": undeclared channel handler " + handler.module())
        RETURN
      self.channelHandlers[handler.module()] = handler
```

---

## 14. Request Handler Pipeline

### 14.1 The 22-Stage Pipeline

```
FUNCTION handle(request):
  # Stage 1: Static files
  IF staticServer.canServe(request.path):
    RETURN staticServer.serve(request.path)

  # Stage 2: Channel API
  IF request.path.startsWith("/api/channel/"):
    RETURN handleChannelRequest(request, registry, channelTokenService)

  # Stage 3: Middleware chain
  response = executeMiddlewareChain(request, registry.middleware, () => handleTemplate(request))
  RETURN response

FUNCTION handleTemplate(request):
  match = router.resolve(request.path)
  IF match == null: RETURN 404

  # Mutation execution (POST with token)
  IF request.method == "POST" AND request.body._action_token:
    RETURN executeMutation(request)

  isHtmx = request.headers["HX-Request"] != null
  content = readFile(match.filePath)
  data = {route: match.params, query: request.query, method: request.method, path: request.path}

  # Stage 4: Context providers
  FOR EACH (name, provider) in registry.contextProviders:
    data[name] = provider.resolve(request)

  # Stage 5: Pre-layout template processors
  FOR EACH processor in registry.getProcessors("pre-layout"):
    result = processor.process(content, data)
    content = result.content
    IF result.redirect: RETURN redirect(result.redirect)

  # Stage 6: Include expansion
  content = includeResolver.expand(content, match.filePath, reader)

  # Stage 7: Component resolution
  scriptCollector = []
  content = componentResolver.resolve(content, data, 0, scriptCollector, reader, match.filePath)

  # Stage 8: Page-level htx:script extraction
  content = extractPageScripts(content, scriptCollector)

  # Stage 9: htx:let variable binding
  content = resolveLet(content, data)

  # Stage 10: htx:data resolution
  result = dataResolver.resolve(content, data, adapter)
  content = result.content; data = merge(data, result.data)

  # Stage 11: htx:grant resolution
  result = grantResolver.resolve(content, data, getUserId(data))
  content = result.content; data = merge(data, result.data)

  # Stage 12: htx:action preparation
  result = mutationHandler.prepare(content, data)
  content = result.content; data = merge(data, result.data)

  # Stage 13: htx:auth / htx:unauth
  content = resolveAuth(content, data)

  # Stage 14: Control flow (htx:each, htx:if)
  content = controlFlow.resolve(content, data)

  # Stage 15: Expression evaluation
  content = expressionEngine.evaluate(content, data)

  # Stage 16: Directive stripping
  content = stripRemainingDirectives(content)

  # Stage 17: Post-layout template processors
  FOR EACH processor in registry.getProcessors("post-layout"):
    result = processor.process(content, data)
    content = result.content

  # Stage 18: Layout wrapping
  content = layoutResolver.wrap(content, match.filePath, reader, isHtmx)

  # Stage 19: Post-layout resolution pass
  content = includeResolver.expand(content, match.filePath, reader)
  content = resolveAuth(content, data)
  content = controlFlow.resolve(content, data)

  # Stage 20: Script injection via placeholders
  IF scriptCollector.length > 0:
    scriptBlock = "<!--PRESTO:SCRIPT:BEGIN-->\n" + scriptCollector.join("\n") + "\n<!--PRESTO:SCRIPT:END-->"
    bodyClose = content.lastIndexOf("</body>")
    IF bodyClose >= 0:
      content = content[0..bodyClose] + scriptBlock + "\n" + content[bodyClose..]
    ELSE:
      content = content + scriptBlock

  # Stage 21: Final expression pass
  content = expressionEngine.evaluate(content, data)

  # Stage 22: Finalize
  content = content.replace("<!--PRESTO:SCRIPT:BEGIN-->", "<script>")
  content = content.replace("<!--PRESTO:SCRIPT:END-->", "</script>")
  content = content.removeAll(/<htx:raw[^>]*>/g)
  content = content.removeAll(/<\/htx:raw>/g)

  RETURN 200, content, "text/html"
```

---

## 15. Token Signing

### 15.1 HMAC-SHA256 Procedure

```
FUNCTION hmacSha256(data, secret):
  key = importKey(encode(secret), algorithm: HMAC-SHA256)
  signature = sign(key, encode(data))
  RETURN signature  # raw bytes

FUNCTION signToken(payload, secret):
  encoded = base64url(JSON.stringify(payload))
  sig = base64url(hmacSha256(encoded, secret))
  RETURN encoded + "." + sig

FUNCTION verifyToken(token, secret):
  [encoded, sig] = token.split(".")
  expectedSig = base64url(hmacSha256(encoded, secret))
  IF sig != expectedSig: RETURN null
  payload = JSON.parse(base64urlDecode(encoded))
  IF payload.exp < currentTimeMs(): RETURN null
  RETURN payload
```

### 15.2 Signed URL Procedure

```
FUNCTION signUrl(path, secret, ttlMs):
  expiresAt = currentTimeMs() + ttlMs
  payload = path + ":" + String(expiresAt)
  sig = base64url(hmacSha256(payload, secret))
  separator = path.contains("?") ? "&" : "?"
  RETURN path + separator + "sig=" + sig + "&exp=" + String(expiresAt)

FUNCTION verifySignedUrl(url, secret):
  sig = url.getParam("sig")
  exp = url.getParam("exp")
  IF sig == null OR exp == null: RETURN null
  expiresAt = parseInt(exp)
  IF expiresAt < currentTimeMs(): RETURN null
  path = url.removeParams("sig", "exp").pathAndQuery()
  payload = path + ":" + String(expiresAt)
  expectedSig = base64url(hmacSha256(payload, secret))
  IF sig != expectedSig: RETURN null
  RETURN path
```

---

## 16. Topology Compilation

### 16.1 Boot-Time Compilation

```
FUNCTION loadTopologies(topologiesDir):
  topologies = Map<String, String>

  FOR EACH file in listDirectory(topologiesDir):
    IF file.endsWith(".js"):
      name = file.removeSuffix(".js")
      topologies[name] = readFile(file)

    ELSE IF file.endsWith(".tsx"):
      name = file.removeSuffix(".tsx")
      source = readFile(file)
      pragma = "/** @jsxRuntime classic */\n/** @jsx h */\n"
      topologies[name] = transpile(pragma + source, loader: "tsx", target: "browser")

    ELSE IF file.endsWith(".ts") AND NOT file.endsWith(".d.ts"):
      name = file.removeSuffix(".ts")
      source = readFile(file)
      topologies[name] = transpile(source, loader: "ts", target: "browser")

  RETURN topologies
```

### 16.2 Delivery Payload

```json
{
  "type": "topology",
  "name": "topology-name",
  "code": "compiled JavaScript string",
  "channelToken": "signed.token"
}
```

### 16.3 Client Execution

```javascript
new Function('ws', 'el', 'channelToken', 'channelFetch', code)(
  websocket,    // WebSocket instance or null
  domElement,   // target DOM element
  token,        // scoped channel token
  fetchFn       // pre-configured fetch with Bearer auth
);
```

---

## 17. Conformance Checklist

An implementation following this specification should verify:

- [ ] Router resolves static, index, and dynamic segment routes
- [ ] Includes expand recursively with depth limit and traversal prevention
- [ ] Components substitute props, inject slots, extract and scope scripts
- [ ] Expressions resolve dot-paths, apply pipes, escape HTML by default
- [ ] Script blocks are never processed by the expression engine
- [ ] Raw blocks are never processed by the expression engine
- [ ] Data directives query the adapter and inject results
- [ ] Control flow iterates arrays and evaluates conditionals with proper truthiness
- [ ] Layouts wrap via convention and directive, skip root for fragments
- [ ] Grants materialize scoped, signed, time-limited credentials
- [ ] Mutations use two-phase signed tokens, verify before execution
- [ ] Auth conditionals render based on authentication state
- [ ] Modules boot with manifest enforcement for restricted trust levels
- [ ] Channel API validates Bearer tokens with scope matching
- [ ] Topologies compile from source at boot, deliver with scoped tokens
- [ ] The 22-stage pipeline executes in the specified order
- [ ] Post-layout passes resolve directives in layout content
- [ ] Server-mediated scripts are expression-evaluated via placeholder mechanism
