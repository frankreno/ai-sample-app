# CLAUDE.md — AI Sample App

This file provides guidance for AI assistants (Claude Code and others) working on this repository. Read it fully before making changes.

---

## Project Overview

**ai-sample-app** is a sample application demonstrating integration with AI platforms, with a primary focus on the [Anthropic Claude API](https://platform.claude.com/docs/en/about-claude/models/overview.md). It serves as a reference implementation and starting point for developers building LLM-powered features.

**Repository:** `frankreno/ai-sample-app`
**Status:** Early-stage / bootstrapping
**Purpose:** Demonstrate patterns for integrating Claude and other AI platforms

---

## Repository Structure

```
ai-sample-app/
├── CLAUDE.md          # This file — AI assistant guidance
└── README.md          # Project overview
```

As the project grows, expect to see:

```
ai-sample-app/
├── src/               # Application source code
├── tests/             # Test suite
├── .env.example       # Environment variable template (never commit .env)
├── CLAUDE.md
└── README.md
```

---

## Git Workflow

### Branch Naming

- Feature branches: `claude/feature-description-<session-id>`
- Bug fixes: `fix/description`
- All Claude Code sessions must develop on the designated branch and push there — **never push to `main` or `master` directly**

### Commits

- Write clear, descriptive commit messages in imperative mood (e.g., "Add streaming support for chat endpoint")
- One logical change per commit
- Always run lint/tests before committing if they are configured

### Push

Always push with tracking:
```bash
git push -u origin <branch-name>
```

---

## Claude API Integration Guidelines

This project integrates with the Anthropic Claude API. Follow these conventions for all AI-related code.

### Model Selection

| Use Case | Model |
|---|---|
| Default / most tasks | `claude-opus-4-6` |
| High-volume / cost-sensitive | `claude-sonnet-4-6` |
| Simple classification / speed-critical | `claude-haiku-4-5` |

**Default to `claude-opus-4-6`.** Never downgrade the model without explicit instruction from the user.

### API Client Initialization

**Python:**
```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from environment
```

**TypeScript:**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();  // reads ANTHROPIC_API_KEY from environment
```

**Never hardcode API keys.** Always use environment variables.

### Extended Thinking

For Opus 4.6 and Sonnet 4.6, use **adaptive thinking** — `budget_tokens` is deprecated on these models:

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=16000,
    thinking={"type": "adaptive"},
    output_config={"effort": "high"},  # low | medium | high | max
    messages=[{"role": "user", "content": "..."}]
)
```

### Streaming

Default to streaming for any request with large input, large output, or high `max_tokens`. This prevents HTTP timeouts:

**Python:**
```python
with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[{"role": "user", "content": "..."}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()
```

**TypeScript:**
```typescript
const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: "..." }],
});
for await (const event of stream) { ... }
const final = await stream.finalMessage();
```

### Tool Use

Prefer the **tool runner** (beta) over manual agentic loops unless fine-grained control is needed:

**Python:**
```python
from anthropic import beta_tool

@beta_tool
def my_tool(param: str) -> str:
    """Tool description used by Claude."""
    return f"result for {param}"

runner = client.beta.messages.tool_runner(
    model="claude-opus-4-6",
    max_tokens=4096,
    tools=[my_tool],
    messages=[{"role": "user", "content": "..."}],
)
for message in runner:
    print(message)
```

**TypeScript:**
```typescript
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const myTool = betaZodTool({
    name: "my_tool",
    description: "Tool description used by Claude.",
    inputSchema: z.object({ param: z.string() }),
    run: async ({ param }) => `result for ${param}`,
});

const finalMessage = await client.beta.messages.toolRunner({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    tools: [myTool],
    messages: [{ role: "user", content: "..." }],
});
```

### Structured Outputs

Use `client.messages.parse()` with Pydantic (Python) or Zod (TypeScript) for validated structured responses:

```python
from pydantic import BaseModel

class MyOutput(BaseModel):
    summary: str
    confidence: float

response = client.messages.parse(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}],
    output_format=MyOutput,
)
result = response.parsed_output  # validated MyOutput instance
```

Use `output_config: {format: {...}}` — the `output_format` top-level parameter is deprecated.

### Error Handling

Use typed SDK exception classes — never match error messages as strings:

```python
import anthropic

try:
    response = client.messages.create(...)
except anthropic.RateLimitError:
    # retry with backoff
except anthropic.AuthenticationError:
    # invalid API key
except anthropic.APIStatusError as e:
    if e.status_code >= 500:
        # server error, retry
```

The SDK retries 429 and 5xx errors automatically (default: 2 retries). Only add custom retry logic for behavior beyond that.

---

## Security Conventions

- **Never commit `.env` files** or any file containing API keys, tokens, or credentials
- **Always provide a `.env.example`** with placeholder values when adding environment variables
- **Validate all external input** at system boundaries (user input, webhook payloads, API responses)
- **Sanitize filenames** using `os.path.basename()` / `path.basename()` before writing any files to disk (prevents path traversal)
- Store only what is necessary; be cautious with PII and follow applicable data privacy regulations

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |

Add new variables to `.env.example` whenever they are introduced. Load them from the environment — never hardcode.

---

## Development Setup (Planned)

When a language/framework is chosen, set up the following and update this section:

1. **Dependency manager** — `pip`/`poetry` for Python, `npm`/`pnpm` for Node.js
2. **Linter / formatter** — e.g., `ruff` + `black` (Python), `eslint` + `prettier` (TypeScript)
3. **Test runner** — e.g., `pytest` (Python), `vitest`/`jest` (TypeScript)
4. **Pre-commit hooks** — enforce lint and tests before each commit

---

## Choosing the Right Integration Surface

| Need | Approach |
|---|---|
| Single Q&A, classification, summarization | Claude API — one request/response |
| Streaming chat UI | Claude API with `stream()` |
| Multi-step pipeline with your own tools | Claude API + tool use (tool runner) |
| Agent with file/web/terminal access | Claude Agent SDK |
| Batch offline processing | Messages Batches API (50% cost reduction) |
| Reuse large documents across requests | Files API + prompt caching |

---

## Key Conventions for AI Assistants

1. **Read before modifying** — Always read a file before editing it
2. **Minimal changes** — Only change what is necessary; do not refactor unrelated code
3. **No hardcoded secrets** — Use environment variables
4. **Prefer SDK helpers** — Use `stream.finalMessage()`, typed exceptions, and SDK types (`Anthropic.MessageParam`, etc.) rather than reimplementing
5. **Default to Opus 4.6** — Do not downgrade the model unless the user explicitly requests it
6. **Adaptive thinking on Opus/Sonnet 4.6** — Use `thinking: {type: "adaptive"}`; `budget_tokens` is deprecated on these models
7. **Streaming for large requests** — Default to streaming with `get_final_message()` / `finalMessage()` to avoid timeouts
8. **Structured outputs via `output_config`** — Use `output_config: {format: {...}}` not the deprecated `output_format`
9. **Never push to main** — All changes go to the feature branch specified at session start
10. **Commit often** — Small, focused commits with clear messages

---

## References

- [Claude API Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview.md)
- [Claude API Documentation](https://platform.claude.com/docs/en/build-with-claude)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude Agent SDK (Python)](https://github.com/anthropics/claude-agent-sdk-python)
- [Claude Agent SDK (TypeScript)](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Tool Use Concepts](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md)
- [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md)
