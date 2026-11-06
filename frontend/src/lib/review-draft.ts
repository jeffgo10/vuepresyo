import type { ExtractedReceipt, ValidationResult } from "@/domain/types";

const STORAGE_KEY = "vuepresyo.reviewDraft";

export type ReviewDraft = {
  receipt: ExtractedReceipt;
  validation: ValidationResult;
  imagePath: string | null;
};

export function saveReviewDraft(draft: ReviewDraft) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function readReviewDraft(): ReviewDraft | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReviewDraft;
  } catch {
    return null;
  }
}

export function clearReviewDraft() {
  sessionStorage.removeItem(STORAGE_KEY);
}
