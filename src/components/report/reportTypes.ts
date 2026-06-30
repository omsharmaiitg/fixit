import type { CapturedImage, CapturedMedia } from "@/lib/imageUtils";

// The draft the Triage Agent hands back via finalize_report.args. Loosely typed
// (category/language are raw agent strings) — normalized to our unions at submit.
export interface ReportDraft {
  category: string;
  severity: number;
  title: string;
  description?: string;
  descriptionEnglish?: string;
  lat: number;
  lng: number;
  address?: string;
  language?: string;
}

export interface ConfirmedLocation {
  lat: number;
  lng: number;
  address: string;
}

export type { CapturedImage, CapturedMedia };
