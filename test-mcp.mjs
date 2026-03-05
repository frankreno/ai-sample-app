/**
 * SiteCheck MCP smoke test
 * Usage: node test-mcp.mjs
 *
 * Requires: MCP server running on localhost:8787  (node mcp/server.js)
 * Requires: Next.js app running on localhost:3000 (npm run dev)
 */

const BASE = "http://localhost:8787/mcp";

// ── Raw MCP JSON-RPC POST ─────────────────────────────────────────────────────
async function mcpPost(method, params, id) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
  });

  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!res.ok) {
    console.error(`  HTTP ${res.status}:`, text);
    return null;
  }

  // Streamable HTTP responds with either plain JSON or SSE
  if (ct.includes("text/event-stream")) {
    const messages = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          messages.push(JSON.parse(line.slice(6)));
        } catch {}
      }
    }
    return messages.length === 1 ? messages[0] : messages;
  }

  return text ? JSON.parse(text) : null;
}

function pass(label) {
  console.log(`  ✅ ${label}`);
}

function fail(label, detail) {
  console.error(`  ❌ ${label}:`, detail);
  process.exitCode = 1;
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(50 - title.length)}`);
}

// ── 1. Health check ───────────────────────────────────────────────────────────
section("Health check");
try {
  const health = await fetch("http://localhost:8787/health");
  if (health.ok) {
    pass(`GET /health → ${health.status}`);
  } else {
    fail("health check", `status ${health.status}`);
  }
} catch (e) {
  fail("health check — is the MCP server running?", e.message);
  process.exit(1);
}

// ── 2. initialize ─────────────────────────────────────────────────────────────
section("initialize");
const init = await mcpPost(
  "initialize",
  {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  },
  1
);
if (init?.result?.protocolVersion) {
  pass(`protocolVersion: ${init.result.protocolVersion}`);
  pass(`serverInfo: ${JSON.stringify(init.result.serverInfo)}`);
} else {
  fail("initialize", JSON.stringify(init));
}

// ── 3. tools/list ─────────────────────────────────────────────────────────────
section("tools/list");
const toolList = await mcpPost("tools/list", {}, 2);
const tools = toolList?.result?.tools ?? [];
if (tools.length > 0) {
  pass(`${tools.length} tool(s) registered`);
  for (const t of tools) {
    console.log(`     • ${t.name}`);
  }
} else {
  fail("tools/list — expected at least 1 tool", JSON.stringify(toolList));
}

// ── 4. tools/call → set_project ───────────────────────────────────────────────
section("tools/call → set_project");
const callResult = await mcpPost(
  "tools/call",
  { name: "set_project", arguments: {} },
  3
);

const toolResult = callResult?.result;
if (!toolResult) {
  fail("no result", JSON.stringify(callResult));
} else if (toolResult.isError) {
  fail("tool returned isError", toolResult.content?.[0]?.text);
} else {
  const projects = toolResult.structuredContent?.projects;
  if (Array.isArray(projects)) {
    pass(`structuredContent.projects is an array (${projects.length} items)`);
    for (const p of projects) {
      console.log(`     • ${p.name} (${p.id})`);
    }
  } else {
    fail("structuredContent.projects missing or not array", JSON.stringify(toolResult.structuredContent));
  }

  const text = toolResult.content?.[0]?.text;
  if (text) {
    pass(`content[0].text: "${text.split("\n")[0]}"`);
  } else {
    fail("content[0].text missing", JSON.stringify(toolResult.content));
  }
}

// ── 5. tools/call → log_deficiency ───────────────────────────────────────────
// Uses the first real project ID from set_project result above
section("tools/call → log_deficiency");
const firstProject = toolResult?.structuredContent?.projects?.[0];
if (!firstProject) {
  fail("log_deficiency — no project available to test with", "");
} else {
  const logResult = await mcpPost(
    "tools/call",
    {
      name: "log_deficiency",
      arguments: {
        project_id: firstProject.id,
        title: "Test crack in east wall",
        description: "Hairline crack observed at grid B4",
        category: "Structural",
        location: "Grid B4, East Foundation Wall",
        trade: "Concrete",
      },
    },
    4
  );

  const lr = logResult?.result;
  if (!lr) {
    fail("no result", JSON.stringify(logResult));
  } else if (lr.isError) {
    fail("tool returned isError", lr.content?.[0]?.text);
  } else {
    const prefill = lr.structuredContent?.prefill;
    if (prefill?.title === "Test crack in east wall") {
      pass(`structuredContent.prefill.title correct`);
    } else {
      fail("structuredContent.prefill.title", JSON.stringify(prefill));
    }

    if (lr.structuredContent?.apiBase) {
      pass(`structuredContent.apiBase: ${lr.structuredContent.apiBase}`);
    } else {
      fail("structuredContent.apiBase missing", "");
    }

    if (Array.isArray(lr.structuredContent?.severities)) {
      pass(`structuredContent.severities: [${lr.structuredContent.severities.join(", ")}]`);
    } else {
      fail("structuredContent.severities missing", "");
    }

    const meta = lr._meta;
    if (meta?.ui?.resourceUri) {
      pass(`_meta.ui.resourceUri: ${meta.ui.resourceUri}`);
    } else {
      fail("_meta.ui.resourceUri missing — widget won't render in ChatGPT", JSON.stringify(meta));
    }

    const text = lr.content?.[0]?.text;
    if (text) {
      pass(`content[0].text present`);
    } else {
      fail("content[0].text missing", "");
    }
  }
}

// ── 5b. tools/call → get_deficiency_list ─────────────────────────────────────
section("tools/call → get_deficiency_list");
if (!firstProject) {
  fail("get_deficiency_list — no project available", "");
} else {
  const listResult = await mcpPost(
    "tools/call",
    {
      name: "get_deficiency_list",
      arguments: { project_id: firstProject.id },
    },
    41
  );
  const lr = listResult?.result;
  if (!lr || lr.isError) {
    fail("tool error", lr?.content?.[0]?.text ?? JSON.stringify(listResult));
  } else {
    const { items, total } = lr.structuredContent ?? {};
    if (Array.isArray(items)) {
      pass(`structuredContent.items: ${items.length} item(s) (total=${total})`);
    } else {
      fail("structuredContent.items missing", JSON.stringify(lr.structuredContent));
    }
    if (lr._meta?.ui?.resourceUri) {
      pass(`_meta.ui.resourceUri: ${lr._meta.ui.resourceUri}`);
    } else {
      fail("_meta.ui.resourceUri missing", "");
    }
  }
}

// ── 5c. tools/call → set_severity ────────────────────────────────────────────
section("tools/call → set_severity");
// Grab a real deficiency ID from the list we just fetched
const listForSev = await mcpPost(
  "tools/call",
  { name: "get_deficiency_list", arguments: { project_id: firstProject?.id ?? "" } },
  42
);
const firstDef = listForSev?.result?.structuredContent?.items?.[0];
if (!firstDef) {
  fail("set_severity — no deficiency to test with", "");
} else {
  const sevResult = await mcpPost(
    "tools/call",
    {
      name: "set_severity",
      arguments: { deficiency_id: firstDef.id, severity: "Major" },
    },
    43
  );
  const sr = sevResult?.result;
  if (!sr || sr.isError) {
    fail("tool error", sr?.content?.[0]?.text ?? JSON.stringify(sevResult));
  } else {
    if (sr.structuredContent?.deficiency_id === firstDef.id) {
      pass(`structuredContent.deficiency_id: ${sr.structuredContent.deficiency_id}`);
    } else {
      fail("deficiency_id mismatch", JSON.stringify(sr.structuredContent));
    }
    if (sr.structuredContent?.selectedSeverity === "Major") {
      pass(`selectedSeverity pre-selected: Major`);
    } else {
      fail("selectedSeverity wrong", JSON.stringify(sr.structuredContent));
    }
    if (sr._meta?.ui?.resourceUri) {
      pass(`_meta.ui.resourceUri: ${sr._meta.ui.resourceUri}`);
    } else {
      fail("_meta.ui.resourceUri missing", "");
    }
  }
}

// ── 5d. tools/call → update_status ───────────────────────────────────────────
section("tools/call → update_status");
if (!firstDef) {
  fail("update_status — no deficiency to test with", "");
} else {
  const statResult = await mcpPost(
    "tools/call",
    {
      name: "update_status",
      arguments: { deficiency_id: firstDef.id, status: "In Progress" },
    },
    44
  );
  const str = statResult?.result;
  if (!str || str.isError) {
    fail("tool error", str?.content?.[0]?.text ?? JSON.stringify(statResult));
  } else {
    const def = str.structuredContent?.deficiency;
    if (def?.status === "In Progress") {
      pass(`status updated to "In Progress" — id: ${def.id}`);
    } else {
      fail("status not updated", JSON.stringify(str.structuredContent));
    }
    // Restore original status
    await mcpPost("tools/call", { name: "update_status", arguments: { deficiency_id: firstDef.id, status: firstDef.status } }, 45);
    pass(`status restored to "${firstDef.status}"`);
  }
}

// ── 6. resources/read → deficiency-form widget ───────────────────────────────
section("resources/read → deficiency-form widget");
const resRead = await mcpPost(
  "resources/read",
  { uri: "resource://sitecheck-ai/widgets/deficiency-form" },
  5
);
const widgetContents = resRead?.result?.contents;
if (Array.isArray(widgetContents) && widgetContents[0]?.text?.includes("<!DOCTYPE html>")) {
  pass(`Widget HTML served (${widgetContents[0].text.length} chars)`);
} else {
  fail("Widget HTML not returned", JSON.stringify(resRead?.result ?? resRead));
}

// ── 5e. tools/call → upload_photo ────────────────────────────────────────────
section("tools/call → upload_photo");
if (!firstDef) {
  fail("upload_photo — no deficiency to test with", "");
} else {
  const upResult = await mcpPost(
    "tools/call",
    { name: "upload_photo", arguments: { deficiency_id: firstDef.id } },
    51
  );
  const ur = upResult?.result;
  if (!ur || ur.isError) {
    fail("tool error", ur?.content?.[0]?.text ?? JSON.stringify(upResult));
  } else {
    if (ur.structuredContent?.deficiency_id === firstDef.id) {
      pass(`structuredContent.deficiency_id: ${ur.structuredContent.deficiency_id}`);
    } else {
      fail("deficiency_id mismatch", JSON.stringify(ur.structuredContent));
    }
    if (ur.structuredContent?.apiBase) {
      pass(`structuredContent.apiBase: ${ur.structuredContent.apiBase}`);
    } else {
      fail("structuredContent.apiBase missing", "");
    }
    if (ur._meta?.ui?.resourceUri) {
      pass(`_meta.ui.resourceUri: ${ur._meta.ui.resourceUri}`);
    } else {
      fail("_meta.ui.resourceUri missing", "");
    }
  }
}

// ── 5f. tools/call → get_summary_stats ───────────────────────────────────────
section("tools/call → get_summary_stats");
if (!firstProject) {
  fail("get_summary_stats — no project available", "");
} else {
  const statsResult = await mcpPost(
    "tools/call",
    { name: "get_summary_stats", arguments: { project_id: firstProject.id } },
    52
  );
  const sr = statsResult?.result;
  if (!sr || sr.isError) {
    fail("tool error", sr?.content?.[0]?.text ?? JSON.stringify(statsResult));
  } else {
    const sc = sr.structuredContent ?? {};
    if (typeof sc.total === "number") {
      pass(`total: ${sc.total}`);
    } else {
      fail("total missing or not a number", JSON.stringify(sc));
    }
    if (sc.by_severity && typeof sc.by_severity === "object") {
      pass(`by_severity: ${JSON.stringify(sc.by_severity)}`);
    } else {
      fail("by_severity missing", JSON.stringify(sc));
    }
    if (sc.by_status && typeof sc.by_status === "object") {
      pass(`by_status: ${JSON.stringify(sc.by_status)}`);
    } else {
      fail("by_status missing", JSON.stringify(sc));
    }
    if (sr._meta?.ui?.resourceUri) {
      pass(`_meta.ui.resourceUri: ${sr._meta.ui.resourceUri}`);
    } else {
      fail("_meta.ui.resourceUri missing", "");
    }
  }
}

// ── 5g. tools/call → generate_report ─────────────────────────────────────────
section("tools/call → generate_report");
if (!firstProject) {
  fail("generate_report — no project available", "");
} else {
  const rptResult = await mcpPost(
    "tools/call",
    { name: "generate_report", arguments: { project_id: firstProject.id } },
    53
  );
  const rr = rptResult?.result;
  if (!rr || rr.isError) {
    fail("tool error", rr?.content?.[0]?.text ?? JSON.stringify(rptResult));
  } else {
    const sc = rr.structuredContent ?? {};
    if (sc.download_url?.startsWith("/reports/")) {
      pass(`download_url: ${sc.download_url}`);
    } else {
      fail("download_url missing or wrong format", JSON.stringify(sc));
    }
    if (typeof sc.deficiency_count === "number") {
      pass(`deficiency_count: ${sc.deficiency_count}`);
    } else {
      fail("deficiency_count missing", JSON.stringify(sc));
    }
    if (sc.apiBase) {
      pass(`apiBase: ${sc.apiBase}`);
    } else {
      fail("apiBase missing", "");
    }
    if (rr._meta?.ui?.resourceUri) {
      pass(`_meta.ui.resourceUri: ${rr._meta.ui.resourceUri}`);
    } else {
      fail("_meta.ui.resourceUri missing", "");
    }
  }
}

// ── 6b. resources/read → deficiency-table widget ─────────────────────────────
section("resources/read → deficiency-table widget");
const tableRes = await mcpPost("resources/read", { uri: "resource://sitecheck-ai/widgets/deficiency-table" }, 6);
const tableContents = tableRes?.result?.contents;
if (Array.isArray(tableContents) && tableContents[0]?.text?.includes("<!DOCTYPE html>")) {
  pass(`Table widget HTML served (${tableContents[0].text.length} chars)`);
} else {
  fail("Table widget HTML not returned", JSON.stringify(tableRes?.result ?? tableRes));
}

// ── 6c. resources/read → severity-picker widget ───────────────────────────────
section("resources/read → severity-picker widget");
const pickerRes = await mcpPost("resources/read", { uri: "resource://sitecheck-ai/widgets/severity-picker" }, 7);
const pickerContents = pickerRes?.result?.contents;
if (Array.isArray(pickerContents) && pickerContents[0]?.text?.includes("<!DOCTYPE html>")) {
  pass(`Severity picker widget HTML served (${pickerContents[0].text.length} chars)`);
} else {
  fail("Severity picker widget HTML not returned", JSON.stringify(pickerRes?.result ?? pickerRes));
}

// ── 6d. resources/read — remaining three widgets ──────────────────────────────
let widgetReadId = 60;
for (const [label, uri] of [
  ["photo-upload widget",    "resource://sitecheck-ai/widgets/photo-upload"],
  ["stats-dashboard widget", "resource://sitecheck-ai/widgets/stats-dashboard"],
  ["report-download widget", "resource://sitecheck-ai/widgets/report-download"],
]) {
  section(`resources/read → ${label}`);
  const r = await mcpPost("resources/read", { uri }, widgetReadId++);
  const contents = r?.result?.contents;
  if (Array.isArray(contents) && contents[0]?.text?.includes("<!DOCTYPE html>")) {
    pass(`HTML served (${contents[0].text.length} chars)`);
  } else {
    fail("HTML not returned", JSON.stringify(r?.result ?? r));
  }
}

// ── tools/list — verify all 8 tools registered ───────────────────────────────
section("tools/list — final count");
const finalList = await mcpPost("tools/list", {}, 99);
const allTools = finalList?.result?.tools ?? [];
const EXPECTED = ["set_project","log_deficiency","get_deficiency_list","set_severity","update_status","upload_photo","get_summary_stats","generate_report"];
if (allTools.length === EXPECTED.length) {
  pass(`${allTools.length}/8 tools registered`);
  for (const t of allTools) console.log(`     • ${t.name}`);
} else {
  const names = allTools.map(t => t.name);
  const missing = EXPECTED.filter(n => !names.includes(n));
  fail(`Expected 8 tools, got ${allTools.length}. Missing: ${missing.join(", ")}`, "");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n── Summary " + "─".repeat(51));
if (process.exitCode === 1) {
  console.log("  Some checks failed — see above.");
} else {
  console.log("  ✅ All 8 tools and 6 widgets passing.");
  console.log("     Phase 2 MCP server complete.");
  console.log("     Next: ngrok http 8787 → register in ChatGPT Dev Mode.");
}
console.log();
