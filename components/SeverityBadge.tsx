"use client";
import { SEVERITY_STYLES } from "@/types";

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEVERITY_STYLES[severity] ?? "bg-stone-200 text-stone-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide ${cls}`}>
      {severity}
    </span>
  );
}
