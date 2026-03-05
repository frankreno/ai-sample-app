"use client";
import { useState, useRef } from "react";
import { CATEGORIES, SEVERITIES, STATUSES } from "@/types";

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function NewDeficiencyModal({ projectId, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Structural",
    severity: "Major",
    status: "Open",
    location: "",
    trade: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/deficiencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, project_id: projectId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const defId = json.data.id;

      if (photo) {
        const fd = new FormData();
        fd.append("photo", photo);
        await fetch(`/api/deficiencies/${defId}/photos`, { method: "POST", body: fd });
      }

      onCreated();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create deficiency");
    } finally {
      setSaving(false);
    }
  }

  const severityColors: Record<string, string> = {
    Critical: "border-red-500 bg-red-50",
    Major: "border-orange-500 bg-orange-50",
    Minor: "border-yellow-400 bg-yellow-50",
    Observation: "border-blue-500 bg-blue-50",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-900 rounded-t-xl">
          <h2 className="text-lg font-bold text-white">New Deficiency</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Brief description of the deficiency"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
            />
          </div>

          {/* Category + Trade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1">Trade</label>
              <input
                type="text"
                value={form.trade}
                onChange={(e) => set("trade", e.target.value)}
                placeholder="e.g. Electrical, Concrete"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Grid B4, Floor 14, East Wall"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
            />
          </div>

          {/* Severity picker */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">Severity</label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("severity", s)}
                  className={`py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                    form.severity === s
                      ? severityColors[s] + " ring-2 ring-offset-1 ring-stone-400"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Initial Status</label>
            <div className="flex gap-2 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    form.status === s
                      ? "bg-stone-800 text-white border-stone-800"
                      : "bg-white text-stone-500 border-stone-300 hover:border-stone-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Detailed observations, measurements, references to drawings..."
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500 resize-none"
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Photo (optional)</label>
            <div
              className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center cursor-pointer hover:border-stone-500 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {photo ? (
                <div className="flex items-center justify-center gap-2 text-sm text-stone-700">
                  <span className="text-green-600">✓</span>
                  <span className="font-medium">{photo.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPhoto(null); }}
                    className="text-stone-400 hover:text-red-500 ml-2"
                  >×</button>
                </div>
              ) : (
                <div className="text-sm text-stone-400">
                  <div className="text-2xl mb-1">📷</div>
                  Click to upload photo
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-700 disabled:opacity-50 disabled:cursor-wait"
            >
              {saving ? "Saving…" : "Log Deficiency"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
