# AI Platform Integration Report
## What It Takes to Build a Vendor-Connectable Chat Interface

**Prepared for:** Internal Platform Team
**Context:** Derived from hands-on implementation of a vendor integration (SiteCheck AI) into ChatGPT using the Model Context Protocol and OpenAI Apps SDK.
**Audience:** Executives, Product Managers, and Engineers

---

## Executive Summary

Building a chat interface that third-party vendors can connect their SaaS products to is achievable — but it requires far more infrastructure than "add a chatbot." ChatGPT's approach reveals a mature, layered platform with six distinct capability areas that must work together: a **tool protocol** that lets vendor code run, an **authentication layer** that secures every connection, a **UI embedding system** that lets vendors render rich interfaces inside chat, a **sandboxing model** that protects users, a **content policy layer** that controls what the AI says, and a **developer toolchain** that makes building integrations practical.

The core insight from building SiteCheck AI is this: **the chat interface is not the product — it is the surface.** The real product is the platform that decides what vendors can do, how their data flows, how their UI renders, and how the AI behaves around their output. Every one of those decisions requires an explicit platform feature. None of them happen automatically.

For a construction technology platform entering this space, the opportunity is significant: vendors in this industry (project management, inspection, scheduling, BIM, estimating) are actively looking for ways to make their data conversational. The platform that owns the chat interface owns the workflow. This report outlines exactly what you would need to build.

**The five things you must get right:**
1. A vendor tool protocol (how vendor code runs in response to user messages)
2. OAuth per-vendor authentication (how users connect their accounts)
3. An AI model that can use vendor tools intelligently
4. A widget/iframe embedding system (how vendors render UI inside chat)
5. A content duplication prevention layer (how you stop the AI from narrating what the widget already shows)

Getting any one of these wrong produces a broken experience. Getting all five right produces a platform that vendors want to build on.

---

## Part 1: What ChatGPT Offers — A Feature Taxonomy

This section describes what ChatGPT provides to vendors, framed generically so it can be used as a reference for your own platform design.

---

### 1. Tool Protocol (MCP — Model Context Protocol)

**What it is:**
A standard protocol that defines how an external server exposes tools (functions the AI can call) and resources (data the AI can read). ChatGPT discovers and calls these over HTTP.

**How it works:**
- Vendors run an HTTP server (their "connector server")
- ChatGPT sends JSON-RPC 2.0 requests to that server
- The server responds with tool definitions, inputs, and outputs
- The AI decides when to call each tool based on the conversation

**Key protocol concepts:**
- `tools/list` — ChatGPT asks the server what tools it has
- `tools/call` — ChatGPT invokes a specific tool with arguments
- `resources/list` — ChatGPT asks what resources (e.g. widget HTML) are available
- `resources/read` — ChatGPT fetches a specific resource

**Transport:** Stateless HTTP (one request = one tool call). No persistent connection required. Vendors can deploy this as a simple Node.js/Python/Go HTTP server.

**Tool annotations:** Vendors can declare hints about each tool's behavior:
- `readOnlyHint` — this tool does not mutate data
- `destructiveHint` — this tool deletes or irreversibly changes data
- `openWorldHint` — this tool calls external services (vs. a closed database)

These hints help the AI decide whether to confirm with the user before calling.

**Structured content:** Tools return two parallel payloads:
- `content[]` — text/markdown that the AI reads and can quote
- `structuredContent{}` — typed JSON that widgets and downstream tools consume

This separation is critical: it lets you control what the AI "sees" vs. what gets passed to UI.

**What you'd need to build:**
A protocol-compliant endpoint that vendors register with. You define the protocol (MCP or your own). You host the discovery layer. You pass tool calls through to vendor servers and pipe results back to the AI.

---

### 2. Authentication (OAuth 2.0 per Vendor)

**What it is:**
Every vendor connector requires OAuth 2.0. Users must explicitly authorize the connection. ChatGPT handles the full OAuth Authorization Code flow, including dynamic client registration.

**How it works:**
- Vendor exposes four OAuth endpoints on their connector server:
  - `/.well-known/oauth-authorization-server` — discovery document (RFC 8414)
  - `/register` — dynamic client registration (RFC 7591)
  - `/authorize` — redirects user to grant access
  - `/token` — exchanges auth code for Bearer token
- ChatGPT registers itself as an OAuth client dynamically (no pre-registration needed)
- The user is redirected through the vendor's auth flow once
- ChatGPT stores the Bearer token and sends it on every subsequent tool call

**PKCE:** ChatGPT requires PKCE (Proof Key for Code Exchange, S256 method) — the current security best practice for public OAuth clients.

**Why this matters:** OAuth means the user's identity and permissions are scoped per-vendor. A user's SiteCheck account is separate from their Procore account. The platform doesn't need to manage vendor credentials — it just passes the Bearer token through.

**What you'd need to build:**
An OAuth orchestration layer. When a user connects a vendor app, your platform handles the redirect, stores the token securely, and attaches it to outgoing tool call requests. Vendors implement the OAuth server side. You implement the client side.

---

### 3. AI Model with Tool Use

**What it is:**
The underlying LLM must be capable of "tool use" — reasoning about when to call a vendor tool, constructing valid inputs, and incorporating the result into its response.

**Key behaviors your model must support:**
- **Multi-step tool calling:** The AI calls Tool A, uses the result to call Tool B, then responds. (Example: look up a project ID, then fetch its deficiencies, then show a summary.)
- **Parallel tool calling:** Call multiple tools simultaneously when results are independent.
- **Tool selection from a list:** Given 8+ vendor tools, the AI picks the right one based on the user's message and the tool's description.
- **Argument extraction:** The AI parses natural language ("log a crack at Grid B4") into structured JSON arguments (`{"title": "Crack at Grid B4", "category": "Structural", ...}`).
- **Error handling:** When a tool returns an error, the AI should explain it, not silently fail.
- **Tool chaining discipline:** The AI should not call a UI-rendering tool as a silent intermediate step — it should use a data-only tool for lookups.

**Tool descriptions are prompt engineering:**
The description field on each tool is read by the AI at call time. Precise, directive descriptions dramatically affect behavior. Vague descriptions cause wrong tool selection. Overly verbose descriptions cause the AI to summarize tool output in text (the duplication problem).

**What you'd need to build:**
Either integrate a foundation model with proven tool-use capability (GPT-4o, Claude 3.5+, Gemini 1.5+ all qualify) or fine-tune your own. The key capability is reliable multi-step tool calling with structured input/output. This is the hardest part of the stack to build from scratch — most platforms should start with an existing model API.

---

### 4. Widget / UI Embedding System

**What it is:**
Vendors can render custom HTML/CSS/JS interfaces inside the chat window. When a tool runs and returns a widget reference, the chat renders that UI inline — not as a link, not as a code block, but as an interactive embedded component.

**How it works — three-layer system:**

**Layer 1: Widget resources**
Vendors register HTML files as "App resources" with a special MIME type (`text/html;profile=mcp-app`). These are served by the connector server and identified by a URI scheme (`ui://vendor-name/widget.html`).

**Layer 2: Tool → Widget binding**
When registering a tool, vendors declare which widget it renders via metadata:
```json
{
  "_meta": {
    "ui": {
      "resourceUri": "ui://sitecheck/deficiency-form.html"
    }
  }
}
```
When ChatGPT calls that tool, it fetches the widget resource and renders it alongside the tool result.

**Layer 3: PostMessage data bridge**
The widget runs in a sandboxed iframe. The platform passes tool result data to the widget via `window.postMessage` using JSON-RPC 2.0:

1. Widget sends `ui/initialize` handshake to parent frame
2. Platform responds, confirming the widget is ready
3. Platform sends `ui/notifications/tool-result` with the tool's `structuredContent`
4. Widget renders using that data

This is a clean pattern: the AI fetches data, passes it to the widget, and the widget renders it. The AI is a data pipeline, not a UI renderer.

**Content Security Policy (CSP):**
Widgets declare which domains they're allowed to call via a CSP `connectDomains` field in the resource metadata. This prevents malicious widgets from exfiltrating data to arbitrary URLs. The platform enforces this at the sandbox level.

**What you'd need to build:**
- An iframe sandbox environment within your chat UI
- A widget resource registry (store and serve vendor HTML)
- A postMessage relay (your chat shell passes tool results into the iframe)
- CSP enforcement per widget
- A URI scheme for widget addressing

This is the most complex UI feature in the stack. The good news: for a web app with iframe support, the core pieces are already available — the effort is in building the relay protocol and sandboxing.

---

### 5. Content Policy / Duplication Prevention

**What it is:**
When a widget renders data visually, the AI must not also narrate that same data in text. Without explicit controls, the AI will enumerate project names, list deficiency counts, and describe form fields — all information already visible in the widget. This creates a confusing, cluttered experience.

**The problem in detail:**
The AI "sees" the tool's `content[]` field and uses it to generate its response. If `content[]` contains data (project names, counts, etc.), the AI will summarize it. If a widget is rendering that same data, the user sees it twice.

**ChatGPT's solution — multiple layers:**

**Layer 1 — Empty content:**
Widget tools return `content: []`. The AI has nothing to summarize, so it doesn't.

**Layer 2 — Suggested assistant message:**
Tools return an `assistant_message` in `structuredContent`. The AI is instructed (via system prompt or tool description) to use this exact message rather than generating its own. Example: `"Here are your projects — tap one to view details."`

**Layer 3 — Suppression flags:**
Tools return `ui_rendered: true` and `suppress_assistant_summary: true` in `structuredContent`. The model's instruction layer checks for these flags and enforces minimal text output.

**Layer 4 — Tool description directives:**
Each tool description includes explicit instructions: `"Do NOT enumerate the results in text — the widget displays the table."`

**The design principle:**
These layers exist because the AI's default behavior is to be helpful by summarizing. You are fighting a training objective. You need multiple redundant controls to win consistently. Any single layer alone is insufficient.

**What you'd need to build:**
- A post-tool response policy: after any tool call that triggers a widget, gate the AI's text output
- Support for vendor-provided `assistant_message` hints
- System prompt instructions that the platform controls (not the vendor)
- Tool description parsing that can enforce response constraints

The platform-controlled system prompt is the most powerful lever here. Vendors cannot be trusted to write their tool descriptions in a way that reliably suppresses AI narration. The platform must enforce the policy.

---

### 6. Developer Experience Layer

**What it is:**
ChatGPT provides tooling that makes building and testing integrations practical for vendor developers.

**Key developer features:**

**Local tunnel support:**
Vendor connector servers run locally during development. ChatGPT connects to them via a public HTTPS URL (typically ngrok). The platform must tolerate dynamic, non-production URLs during development.

**Developer mode registration:**
Vendors register connectors without a formal app review process during development. Registration takes minutes, not weeks.

**Widget dev server:**
Vendors need to test widgets in isolation — without going through the full ChatGPT flow. Our approach: the connector server also serves widget HTML at `/widgets/<name>.html` with URL params for test data. Your platform should provide something equivalent.

**Typed schema validation:**
Tool inputs are declared as Zod/JSON Schema. The platform validates inputs before calling the tool. This catches malformed arguments at the boundary, not inside vendor code.

**Error surfacing:**
When a tool fails, ChatGPT shows the error to the AI (which can explain it to the user) rather than silently swallowing it. Vendor errors need to propagate meaningfully.

**Structured error codes:**
Beyond HTTP status codes, structured `error_code` fields in responses allow the AI to reason about error type: `NOT_FOUND` vs `VALIDATION_ERROR` vs `AUTH_REQUIRED` produce different AI behaviors.

**What you'd need to build:**
- A developer portal for registering connectors (name, MCP URL, OAuth config, icon)
- A sandbox/dev mode that bypasses app review
- Documentation, an SDK, and example connectors
- A widget testing harness
- Error log visibility for vendors during development

---

## Part 1B: How It Actually Works — A Message's Journey from Keyboard to Screen

This section walks through exactly what happens when a user types a message into ChatGPT and gets back an interactive widget from a connected vendor app. We'll use a real example from SiteCheck AI: the user types **"Show me deficiencies for Maple Street"** and gets back an interactive table.

---

### Step 1: The user types a message

The user is in ChatGPT and has already connected the SiteCheck app. They type:

> "Show me deficiencies for Maple Street"

At this point, ChatGPT has no idea what "Maple Street" is, what a deficiency is, or where any of that data lives. All it knows is:
- It has a list of tools that SiteCheck registered (search projects, list deficiencies, log deficiency, etc.)
- Each tool has a name, a description, and a list of expected inputs

---

### Step 2: The AI reads the tool descriptions and makes a plan

Before responding, the AI reads through every tool description available from connected apps. It's essentially scanning a menu of capabilities:

- `search_projects` — "Search SiteCheck projects by name or location..."
- `get_deficiency_list` — "List deficiencies for the active project..."
- `log_deficiency` — "Extract deficiency details and show a form..."
- ...and so on

Based on the user's words, the AI decides: "The user mentioned 'Maple Street' — I should search for a project with that name first, then list its deficiencies."

The AI may do this in multiple steps (call one tool, use its result to call another) or in a single step if it has enough context.

---

### Step 3: ChatGPT calls the vendor's connector server

ChatGPT sends an HTTP request to the SiteCheck connector server (the MCP server). This request says, in effect: "Call the `search_projects` tool with the argument `q = 'Maple Street'`."

The message is formatted as a JSON-RPC 2.0 request — a standard format for remote procedure calls. It travels over HTTPS to wherever the connector server is hosted (in development, this is typically through an ngrok tunnel to a developer's laptop).

---

### Step 4: The connector server calls the vendor's API

The connector server is intentionally simple — it doesn't contain any business logic. When it receives the `search_projects` call, it turns around and makes a request to the SiteCheck web app's REST API:

```
GET /api/projects?q=Maple+Street
```

The REST API queries the database, finds matching projects, and returns them. The connector server packages this result into the format ChatGPT expects and sends it back.

This design is important: the connector server is a thin translator between ChatGPT's protocol and the vendor's existing API. All the real work (database queries, validation, business rules) stays in the vendor's app.

---

### Step 5: The AI gets the result and decides what to do next

ChatGPT receives the search results — say, two projects with "Maple" in the name. The AI now has project IDs it can use.

If the tool was configured to show a widget (like a project picker), ChatGPT renders that widget and waits for the user. If it was a silent lookup tool (no widget), the AI continues on its own — it picks the best match and calls the next tool.

In our example, `search_projects` shows a project dashboard widget. The user sees clickable project cards and selects "Maple Street Renovation." Or, the AI may proceed directly by calling `get_deficiency_list` with the project ID it found.

---

### Step 6: ChatGPT calls the deficiency list tool

Now ChatGPT calls `get_deficiency_list` with the project ID. The same flow repeats:

1. ChatGPT sends a tool call to the connector server
2. The connector server calls the REST API: `GET /api/deficiencies?project_id=abc123`
3. The API returns a list of deficiencies
4. The connector server packages the results

But this time, the tool result includes two important pieces:

- **Structured content** — the raw data (list of deficiencies, total count, active filters) in a machine-readable format
- **A widget reference** — a pointer to an HTML file (`ui://sitecheck/deficiency-table.html`) that knows how to display this data

---

### Step 7: ChatGPT loads the widget

When ChatGPT sees that a tool result has a widget reference, it does the following:

1. **Fetches the widget HTML** from the connector server (the HTML file was registered as a "resource" when the server started)
2. **Creates a sandboxed iframe** inside the chat window — this is like a tiny, isolated browser window embedded in the conversation
3. **Loads the widget HTML** into that iframe

The widget is now running, but it doesn't have any data yet. It's just a blank table waiting to be populated.

---

### Step 8: The widget and ChatGPT do a handshake

Before any data flows, the widget and ChatGPT's host page confirm they can talk to each other:

1. The widget says: "I'm the SiteCheck app, version 1.0 — I'm ready to initialize"
2. ChatGPT responds: "Acknowledged — here's some context about the display environment"
3. The widget says: "Initialization complete — send me the data"

This handshake uses `window.postMessage` — the standard browser mechanism for communication between a page and an embedded iframe. The messages follow JSON-RPC 2.0 format so both sides know exactly how to parse them.

---

### Step 9: ChatGPT sends the tool data to the widget

Now ChatGPT sends the structured content from Step 6 into the widget:

```
"Here are 8 deficiencies for this project, with their IDs, titles,
severities, statuses, and dates. No filters are active."
```

The widget receives this data and populates itself — the table fills in with rows, severity badges get color-coded, column headers become sortable. Everything the user sees is rendered by the widget, not by the AI.

---

### Step 10: The AI writes a short response (or nothing at all)

Because the tool was configured with `ui_fulfills_request: true` and an empty `content` array, the AI knows the widget is handling the display. So instead of listing out all 8 deficiencies in text (which would duplicate what the table already shows), the AI writes something minimal:

> "Here are the deficiencies for Maple Street."

The combination of empty content, the fulfillment flag, and the tool description telling the AI to be minimal all work together to prevent the AI from narrating what the user can already see.

---

### Step 11: The user interacts with the widget

From here, the widget is interactive. The user can:
- **Sort columns** by clicking headers (handled entirely within the widget — no round-trip to the server)
- **Click a deficiency** to view details (the widget can call back to the API directly, or signal ChatGPT to call another tool)
- **Take an action** like changing severity (which opens a new widget in the conversation)

When the widget needs to communicate back to ChatGPT — for example, to report that the user selected a project — it sends a message through the same postMessage channel. ChatGPT receives this and can trigger a new conversation turn or tool call.

---

### The complete journey, summarized

```
User types message
    ↓
AI reads tool descriptions, picks the right tool(s)
    ↓
ChatGPT sends tool call → Connector server → REST API → Database
    ↓
Database result flows back: Database → REST API → Connector server → ChatGPT
    ↓
ChatGPT sees a widget reference in the result
    ↓
ChatGPT fetches the widget HTML, loads it in a sandboxed iframe
    ↓
Widget and ChatGPT handshake via postMessage
    ↓
ChatGPT passes the structured data into the widget
    ↓
Widget renders the interactive UI (table, form, chart, etc.)
    ↓
AI writes a minimal text response (or nothing)
    ↓
User sees the widget and interacts with it directly
```

### What makes this work well

- **The AI is a router, not a renderer.** It figures out what the user wants, calls the right tool, and gets out of the way. The widget handles the display.
- **The connector server is a translator, not a brain.** It converts between ChatGPT's protocol and the vendor's existing API. No business logic is duplicated.
- **The widget is self-contained.** It receives data, renders it, and handles interactions. It doesn't depend on the AI to explain what it shows.
- **Multiple layers prevent duplication.** Empty content arrays, fulfillment flags, and careful tool descriptions all work together to stop the AI from narrating what the widget already displays.

---

## Part 2: What You Would Need to Build

This section maps the ChatGPT feature taxonomy to a greenfield platform build, organized by priority.

---

### Tier 1 — Must Have (Platform is not viable without these)

| Feature | What to Build | Key Decision |
|---|---|---|
| Tool protocol | Define and implement a vendor connector protocol (MCP or proprietary). Vendors register an HTTP endpoint. Your platform calls it. | Adopting MCP is free and gives vendors reusable skills. A proprietary protocol gives you more control but raises vendor onboarding cost. |
| OAuth per vendor | OAuth 2.0 client orchestration. When a user connects a vendor app, your platform handles the redirect and token storage. | Store tokens encrypted per user per vendor. Never let vendor tokens touch client-side code. |
| AI model with tool use | Integrate a foundation model that supports multi-step tool calling. | GPT-4o or Claude 3.5/3.7 are the proven choices. Do not try to build this capability yourself. |
| Tool selection + argument extraction | Pass tool definitions to the model in each conversation turn. The model decides which to call and constructs the arguments. | Tool descriptions are critical prompt surface — your platform should provide a description linting/review step for vendors. |
| CORS + request proxying | Widget iframes call vendor APIs from a sandboxed origin. Your platform must either proxy those requests or enforce CORS headers on vendor APIs. | Proxying adds latency but lets you audit/log. Enforcing CORS puts burden on vendors but is simpler to build. |

---

### Tier 2 — High Value (Strongly recommended for launch)

| Feature | What to Build | Key Decision |
|---|---|---|
| Widget embedding | Iframe sandbox in chat UI + postMessage relay from platform shell to widget + widget resource registry | Start with a defined postMessage protocol. Publish an SDK with a helper that handles the handshake. Vendors should not need to implement JSON-RPC 2.0 from scratch. |
| Content duplication prevention | Post-tool response policy gate + support for `assistant_message` hints + platform-controlled system prompt instructions | This is underrated. Without it, every widget tool produces a bad experience. Build the policy gate before you launch widgets. |
| CSP per widget | Widget resources declare allowed `connectDomains`. Platform enforces at sandbox level. | A vendor with a misconfigured widget that calls arbitrary domains is a security incident. Non-negotiable. |
| Structured errors | Standard error envelope with `error_code`. Documented error codes the AI is instructed to handle. | Agree on a small set of codes (10–15) and document how the AI should respond to each. |

---

### Tier 3 — Important for Scale (Build after initial launch)

| Feature | What to Build | Key Decision |
|---|---|---|
| Developer portal | Web UI for registering connectors, viewing error logs, managing OAuth apps, testing tools | This is table stakes for vendor adoption. No portal = slow adoption. |
| Widget dev harness | A way for vendors to test their widgets without going through the full chat flow | Without this, widget debugging requires live chat sessions. Painful. |
| Tool description review | A step in vendor onboarding where platform reviews tool descriptions for quality | Poor descriptions = wrong tool selection = broken UX. You can't fix this at runtime. |
| App review / approval | Formal review before a vendor connector is available to all users | Required once you have multiple paying customers. Security, quality, and liability. |
| Rate limiting per vendor | Cap tool calls per vendor per user per minute | Without this, a misbehaving connector can degrade the entire platform. |
| Telemetry + observability | Log every tool call: tool name, latency, success/error, user session | You cannot improve what you cannot measure. Essential for platform health. |

---

## Part 3: The Hardest Problems — Engineering Realities

These are the things that are not obvious from the outside but are genuinely difficult to get right.

### 1. The AI's default is to be helpful by narrating

The model wants to summarize tool output in text. This fights every widget experience. You need redundant controls at the description level, the content level, and the system prompt level. No single control is sufficient. Plan for this from day one.

### 2. OAuth for local development is painful

Every vendor building against your platform will want to develop locally. OAuth flows require HTTPS redirect URIs. You need a documented local dev story — either a first-party tunnel (like ngrok), a localhost exception policy, or a test mode with mocked tokens. Skipping this adds days to vendor onboarding.

### 3. Stateless tool servers are architecturally important

Vendor connector servers should be stateless (each tool call is independent). If they're stateful, you have session management complexity. The MCP Streamable HTTP transport pattern (one HTTP request = one tool call, no persistent session) is the right default. Document this as a requirement for vendors.

### 4. Widget sandboxing is a security boundary, not a UI detail

Widgets are arbitrary vendor HTML/JS running in your product. Without strict CSP enforcement, a malicious or compromised vendor widget can exfiltrate user data. This is not a stretch goal — it is a launch requirement. Design the sandbox before you design the widget UI.

### 5. Tool description quality determines AI quality

The model decides which tool to call based on the description. A vendor who writes "does stuff with projects" instead of "Look up available projects and their IDs. Call this before any operation that requires a project_id." will produce a broken integration. You need to provide guidance, examples, and ideally a review step.

### 6. The model sees all registered tools on every turn

If a user has 5 vendor apps connected with 8 tools each, the model is evaluating 40 tool definitions on every message. This has cost, latency, and context window implications. You need a tool relevance layer — either filter tools by detected topic, or require vendors to declare tool categories so you can load only relevant tools per conversation.

---

## Part 4: Recommended Build Sequence

For a construction technology platform, here is a pragmatic sequence:

**Phase 0 — Foundations (pre-build)**
- Choose or define your tool protocol (MCP recommended — it's an open standard, tools can be reused across platforms)
- Choose your foundation model (GPT-4o or Claude 3.5 Sonnet are proven for multi-step tool use)
- Define your error envelope standard
- Define your widget postMessage protocol

**Phase 1 — Core platform (MVP)**
- Tool protocol endpoint + tool call routing
- OAuth per-vendor (client orchestration, token storage)
- AI model integration with tool use
- Basic text-only tool responses (no widgets yet)
- One internal reference connector (your own product, dog-food it)

**Phase 2 — Widget platform**
- Widget resource registry
- Iframe sandbox in chat UI
- PostMessage relay (platform → widget)
- CSP enforcement
- Content duplication prevention (empty content + assistant_message + policy gate)
- Widget dev harness for vendors

**Phase 3 — Developer experience**
- Developer portal (registration, OAuth config, error logs)
- SDK / helper library for vendors
- Documentation with worked examples
- Sandbox/dev mode

**Phase 4 — Scale and trust**
- App review process
- Rate limiting per vendor
- Tool relevance filtering
- Telemetry and observability
- Usage analytics for vendors

---

## Appendix: Key Terms

| Term | Definition |
|---|---|
| MCP | Model Context Protocol — an open standard (by Anthropic) for connecting AI models to external tools and data sources over HTTP |
| Connector server | The HTTP server a vendor runs that implements the tool protocol |
| Tool | A function the AI can call — defined by name, description, input schema, and handler |
| Tool annotation | Metadata on a tool that hints at its behavior (read-only, destructive, etc.) |
| Widget | A vendor-supplied HTML/JS file rendered in an iframe inside the chat UI |
| Widget resource | A widget file registered with the platform and served with a special MIME type |
| postMessage bridge | The JSON-RPC 2.0 message-passing protocol between the chat shell and widget iframes |
| CSP | Content Security Policy — controls what domains a widget iframe is allowed to call |
| structuredContent | The typed JSON payload in a tool response, used by widgets and downstream tools |
| content[] | The text/markdown payload in a tool response, readable by the AI model |
| assistant_message | A vendor-provided suggested response for the AI to use after a widget renders |
| OAuth Authorization Code flow | The standard OAuth 2.0 flow used to connect a user's vendor account |
| PKCE | Proof Key for Code Exchange — a security extension to OAuth required by ChatGPT |
| Dynamic client registration | An OAuth extension (RFC 7591) allowing ChatGPT to register itself as a client without pre-coordination |
| Tool duplication | When the AI narrates data that a widget is already displaying visually |
| Stateless transport | A connector server architecture where each tool call is an independent HTTP request with no session state |
