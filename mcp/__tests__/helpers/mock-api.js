/**
 * Shared mock data and fetch interceptor for MCP tool handler tests.
 *
 * Call setupFetchMock() in beforeEach to intercept global fetch calls and
 * return canned REST API responses. The mock routes mirror the real REST API
 * shape (envelope: { success, data, error }).
 */

import { vi } from "vitest";

// ── Canned data ───────────────────────────────────────────────────────────────

export const MOCK_PROJECTS = [
  {
    id: "proj-001",
    name: "Maple Street Renovation",
    location: "Boulder, CO",
    description: "Historic seismic retrofit",
    created_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "proj-002",
    name: "Oakwood Tower",
    location: "Denver, CO",
    description: "22-story mixed-use tower",
    created_at: "2026-02-01T10:00:00Z",
  },
];

export const MOCK_DEFICIENCY = {
  id: "DEF-001",
  project_id: "proj-001",
  title: "Cracked foundation wall",
  description: "Visible crack along east wall",
  category: "Structural",
  severity: "Critical",
  status: "Open",
  location: "Grid B4, East Foundation Wall",
  trade: "Concrete",
  photo_paths: "[]",
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-01T10:00:00Z",
};

export const MOCK_DEFICIENCY_LIST = {
  items: [
    MOCK_DEFICIENCY,
    {
      ...MOCK_DEFICIENCY,
      id: "DEF-002",
      title: "Missing fire extinguisher",
      category: "Safety",
      severity: "Major",
      status: "Open",
      trade: "General",
    },
  ],
  total: 2,
};

export const MOCK_STATS = {
  total: 8,
  by_severity: { Critical: 2, Major: 3, Minor: 2, Observation: 1 },
  by_status: { Open: 4, "In Progress": 2, Resolved: 1, Closed: 1 },
};

export const MOCK_REPORT = {
  download_url: "/reports/report-proj-001.pdf",
  deficiency_count: 8,
};

// ── Fetch mock setup ──────────────────────────────────────────────────────────

export function setupFetchMock() {
  const mockFetch = vi.fn(async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const method = options.method ?? "GET";

    // GET /api/projects
    if (method === "GET" && pathname === "/api/projects") {
      const q = new URL(url).searchParams.get("q");
      let projects = MOCK_PROJECTS;
      if (q) {
        projects = projects.filter(
          (p) => p.name.toLowerCase().includes(q.toLowerCase()) ||
                 p.location.toLowerCase().includes(q.toLowerCase())
        );
      }
      return mockResponse({ success: true, data: projects, error: null });
    }

    // GET /api/deficiencies/:id
    if (method === "GET" && pathname.match(/^\/api\/deficiencies\/DEF-\d+$/)) {
      return mockResponse({ success: true, data: MOCK_DEFICIENCY, error: null });
    }

    // GET /api/deficiencies (list)
    if (method === "GET" && pathname === "/api/deficiencies") {
      return mockResponse({ success: true, data: MOCK_DEFICIENCY_LIST, error: null });
    }

    // POST /api/deficiencies
    if (method === "POST" && pathname === "/api/deficiencies") {
      const body = JSON.parse(options.body);
      return mockResponse({
        success: true,
        data: {
          id: "DEF-009",
          ...body,
          severity: body.severity ?? "Major",
          status: "Open",
          photo_paths: "[]",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
    }

    // PATCH /api/deficiencies/:id
    if (method === "PATCH" && pathname.match(/^\/api\/deficiencies\/DEF-\d+$/)) {
      const body = JSON.parse(options.body);
      return mockResponse({
        success: true,
        data: { ...MOCK_DEFICIENCY, ...body },
        error: null,
      });
    }

    // GET /api/deficiencies/stats
    if (method === "GET" && pathname === "/api/deficiencies/stats") {
      return mockResponse({ success: true, data: MOCK_STATS, error: null });
    }

    // POST /api/reports/generate
    if (method === "POST" && pathname === "/api/reports/generate") {
      return mockResponse({ success: true, data: MOCK_REPORT, error: null });
    }

    return mockResponse({ success: false, data: null, error: "Not found" }, 404);
  });

  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

function mockResponse(body, status = 200) {
  return {
    status,
    json: async () => body,
  };
}
