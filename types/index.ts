export interface Project {
  id: string;
  name: string;
  location: string;
  description: string;
  created_at: string;
}

export interface Deficiency {
  id: string;
  project_id: string;
  title: string;
  description: string;
  category: string;
  severity: "Critical" | "Major" | "Minor" | "Observation";
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  location: string;
  trade: string;
  photo_paths: string; // JSON string array
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
}

export const CATEGORIES = [
  "Structural", "Mechanical", "Electrical", "Plumbing", "Finish", "Safety", "Other",
] as const;

export const SEVERITIES = ["Critical", "Major", "Minor", "Observation"] as const;

export const STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;

export const STATUS_NEXT: Record<string, string> = {
  "Open": "In Progress",
  "In Progress": "Resolved",
  "Resolved": "Closed",
  "Closed": "Open",
};

export const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-600 text-white",
  Major: "bg-orange-500 text-white",
  Minor: "bg-yellow-400 text-stone-900",
  Observation: "bg-blue-600 text-white",
};

export const STATUS_STYLES: Record<string, string> = {
  "Open": "bg-red-950 text-red-400 border border-red-800",
  "In Progress": "bg-amber-950 text-amber-400 border border-amber-800",
  "Resolved": "bg-green-950 text-green-400 border border-green-800",
  "Closed": "bg-stone-800 text-stone-400 border border-stone-600",
};
