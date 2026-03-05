"use client";
import { STATUS_STYLES } from "@/types";

interface StatusBadgeProps {
  status: string;
  onClick?: () => void;
  loading?: boolean;
}

export function StatusBadge({ status, onClick, loading }: StatusBadgeProps) {
  const cls = STATUS_STYLES[status] ?? "bg-stone-100 text-stone-600 border border-stone-300";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={onClick ? "Click to advance status" : undefined}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls} ${
        onClick ? "cursor-pointer hover:opacity-80 active:scale-95 transition-all" : "cursor-default"
      } ${loading ? "opacity-50 cursor-wait" : ""}`}
    >
      {loading ? "…" : status}
    </button>
  );
}
