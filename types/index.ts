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
  "Open": "bg-red-100 text-red-800 border border-red-300",
  "In Progress": "bg-amber-100 text-amber-800 border border-amber-300",
  "Resolved": "bg-green-100 text-green-800 border border-green-300",
  "Closed": "bg-stone-100 text-stone-600 border border-stone-300",
};
