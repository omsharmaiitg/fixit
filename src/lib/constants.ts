import type { IssueCategory, IssueStatus, AgingStatus } from "@/types";

// sessionStorage flag — set once a visitor passes the landing page as a guest;
// signed-in users skip the landing via auth state instead. Cleared on explicit
// logout so the landing front door reappears only then.
export const ENTERED_APP_KEY = "fixit_entered";

export const CATEGORY_EMOJIS: Record<IssueCategory, string> = {
  road_damage: "🕳️",
  drainage_flooding: "🌊",
  water_supply: "🚰",
  street_lighting: "💡",
  waste_garbage: "🗑️",
  sewage: "🦠",
  public_safety: "⚠️",
  footpath: "🚶",
  tree_hazard: "🌳",
  other: "📌",
};

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  road_damage: "Road Damage",
  drainage_flooding: "Drainage / Flooding",
  water_supply: "Water Supply",
  street_lighting: "Street Lighting",
  waste_garbage: "Waste / Garbage",
  sewage: "Sewage",
  public_safety: "Public Safety",
  footpath: "Footpath",
  tree_hazard: "Tree Hazard",
  other: "Other",
};

// Category base-weight (1–10) used in the severity formula (visual·0.5 +
// category·0.3 + community·0.2) and exposed to the Triage Agent's
// get_category_severity_weight tool. Higher = inherently riskier.
export const CATEGORY_BASE_WEIGHT: Record<IssueCategory, number> = {
  road_damage: 7,
  drainage_flooding: 8,
  water_supply: 6,
  street_lighting: 6,
  waste_garbage: 4,
  sewage: 7,
  public_safety: 9,
  footpath: 5,
  tree_hazard: 7,
  other: 4,
};

// Severity-label swatches (1–3 low … 9–10 critical).
export const SEVERITY_COLORS: Record<string, string> = {
  low: "#16a34a",
  moderate: "#ca8a04",
  high: "#ea580c",
  critical: "#dc2626",
};

// Aging dots.
export const AGING_COLORS: Record<AgingStatus, string> = {
  fresh: "#16a34a",
  aging: "#ca8a04",
  neglected: "#ea580c",
  critical_neglect: "#dc2626",
  civic_failure: "#1f2937",
};

export const AGING_LABELS: Record<AgingStatus, string> = {
  fresh: "Fresh",
  aging: "Aging",
  neglected: "Neglected",
  critical_neglect: "Critical Neglect",
  civic_failure: "Civic Failure",
};

// Status colors.
export const STATUS_COLORS: Record<IssueStatus, string> = {
  reported: "#6b7280", // grey
  verified: "#1d4ed8", // blue
  acknowledged: "#4f46e5", // indigo
  in_progress: "#f59e0b", // amber
  pending_confirmation: "#9333ea", // purple
  resolved: "#16a34a", // green
  reopened: "#dc2626", // red
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  reported: "Reported",
  verified: "Verified",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  pending_confirmation: "Pending Confirmation",
  resolved: "Resolved",
  reopened: "Reopened",
};
