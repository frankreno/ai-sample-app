"use client";
import { useState, useEffect, useCallback } from "react";
import { Project, Deficiency, Stats, SEVERITIES, STATUSES, SEVERITY_STYLES, STATUS_NEXT } from "@/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { NewDeficiencyModal } from "@/components/NewDeficiencyModal";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function statusDotColor(status: string) {
  const m: Record<string, string> = {
    "Open": "bg-red-500",
    "In Progress": "bg-amber-500",
    "Resolved": "bg-green-500",
    "Closed": "bg-stone-400",
  };
  return m[status] ?? "bg-stone-400";
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTrade, setFilterTrade] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data.length > 0) {
          setProjects(j.data);
          setSelectedProject(j.data[0]);
        }
      });
  }, []);

  const loadData = useCallback(() => {
    if (!selectedProject) return;
    const params = new URLSearchParams({ project_id: selectedProject.id });
    if (filterSeverity) params.set("severity", filterSeverity);
    if (filterStatus) params.set("status", filterStatus);
    if (filterTrade) params.set("trade", filterTrade);

    fetch(`/api/deficiencies?${params}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setDeficiencies(j.data.items); });

    fetch(`/api/deficiencies/stats?project_id=${selectedProject.id}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setStats(j.data); });
  }, [selectedProject, filterSeverity, filterStatus, filterTrade]);

  useEffect(() => { loadData(); }, [loadData]);

  async function cycleStatus(def: Deficiency) {
    setUpdatingId(def.id);
    const next = STATUS_NEXT[def.status] ?? "Open";
    await fetch(`/api/deficiencies/${def.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    loadData();
    setUpdatingId(null);
  }

  async function generateReport() {
    if (!selectedProject) return;
    setGeneratingReport(true);
    setReportUrl(null);
    const res = await fetch("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: selectedProject.id }),
    });
    const json = await res.json();
    if (json.success) setReportUrl(json.data.download_url);
    setGeneratingReport(false);
  }

  const trades = [...new Set(deficiencies.map((d) => d.trade).filter(Boolean))].sort();

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-700">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white font-black text-sm select-none">SC</div>
            <span className="text-white font-bold tracking-wide text-lg">
              SiteCheck <span className="text-orange-400">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-stone-400 text-sm">Project:</span>
            <select
              value={selectedProject?.id ?? ""}
              onChange={(e) => {
                const p = projects.find((p) => p.id === e.target.value);
                setSelectedProject(p ?? null);
                setReportUrl(null);
              }}
              className="bg-stone-800 border border-stone-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-[220px]"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {reportUrl && (
              <a href={reportUrl} download
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors">
                ↓ Download Report
              </a>
            )}
            <button
              onClick={generateReport}
              disabled={generatingReport || !selectedProject}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-700 text-stone-200 hover:bg-stone-600 disabled:opacity-50 transition-colors"
            >
              {generatingReport ? "Generating…" : "📄 Generate Report"}
            </button>
            <button
              onClick={() => setShowModal(true)}
              disabled={!selectedProject}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
            >
              + New Deficiency
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Project title */}
        {selectedProject && (
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{selectedProject.name}</h1>
            <p className="text-stone-500 text-sm">{selectedProject.location}</p>
          </div>
        )}

        {/* Stats dashboard */}
        {stats && (
          <div className="space-y-3">
            {/* Total + severity cards */}
            <div className="grid grid-cols-5 gap-3">
              <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col shadow-sm">
                <span className="text-3xl font-black text-stone-900">{stats.total}</span>
                <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-widest mt-1">Total</span>
              </div>
              {SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(filterSeverity === sev ? "" : sev)}
                  className={`bg-white border rounded-xl p-4 flex flex-col text-left transition-all hover:shadow-md shadow-sm ${
                    filterSeverity === sev ? "border-stone-700 ring-2 ring-stone-700" : "border-stone-200"
                  }`}
                >
                  <span className="text-2xl font-black text-stone-900">{stats.by_severity[sev] ?? 0}</span>
                  <span className={`mt-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_STYLES[sev]}`}>
                    {sev}
                  </span>
                </button>
              ))}
            </div>

            {/* Status row */}
            <div className="grid grid-cols-4 gap-3">
              {STATUSES.map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(filterStatus === st ? "" : st)}
                  className={`bg-white border rounded-xl px-4 py-3 flex items-center justify-between shadow-sm transition-all hover:shadow-md ${
                    filterStatus === st ? "border-stone-700 ring-2 ring-stone-700" : "border-stone-200"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm text-stone-700">
                    <span className={`w-2 h-2 rounded-full ${statusDotColor(st)}`} />
                    {st}
                  </div>
                  <span className="text-lg font-bold text-stone-900">{stats.by_status[st] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-stone-500">Filter:</span>
          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-400">
            <option value="">All Severities</option>
            {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-400">
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={filterTrade} onChange={(e) => setFilterTrade(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-400">
            <option value="">All Trades</option>
            {trades.map((t) => <option key={t}>{t}</option>)}
          </select>
          {(filterSeverity || filterStatus || filterTrade) && (
            <button onClick={() => { setFilterSeverity(""); setFilterStatus(""); setFilterTrade(""); }}
              className="text-xs text-stone-400 hover:text-red-600 underline underline-offset-2">
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-stone-400">{deficiencies.length} result{deficiencies.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Deficiency table */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          {deficiencies.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <div className="text-4xl mb-3">📋</div>
              <div className="font-medium text-stone-600">No deficiencies found</div>
              <div className="text-sm mt-1">
                {filterSeverity || filterStatus || filterTrade
                  ? "Try adjusting your filters"
                  : "Click \"+ New Deficiency\" to log the first one"}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    {["ID", "Title", "Severity", "Status", "Category", "Location", "Trade", "Date"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-stone-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {deficiencies.map((def) => {
                    const photos: string[] = JSON.parse(def.photo_paths);
                    return (
                      <tr key={def.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-stone-400 whitespace-nowrap">{def.id}</td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="font-semibold text-stone-900 truncate">{def.title}</div>
                          {def.description && (
                            <div className="text-xs text-stone-400 mt-0.5 truncate">{def.description}</div>
                          )}
                          {photos.length > 0 && (
                            <div className="flex gap-2 mt-1">
                              {photos.map((p, i) => (
                                <a key={i} href={p} target="_blank" rel="noreferrer"
                                  className="text-[10px] text-blue-500 hover:underline">📷 Photo {i + 1}</a>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap"><SeverityBadge severity={def.severity} /></td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge
                            status={def.status}
                            loading={updatingId === def.id}
                            onClick={() => cycleStatus(def)}
                          />
                        </td>
                        <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{def.category}</td>
                        <td className="px-4 py-3 text-stone-600 max-w-[140px] truncate">{def.location || "—"}</td>
                        <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{def.trade || "—"}</td>
                        <td className="px-4 py-3 text-stone-400 text-[11px] whitespace-nowrap">{fmt(def.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showModal && selectedProject && (
        <NewDeficiencyModal
          projectId={selectedProject.id}
          onClose={() => setShowModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
