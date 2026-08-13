"use client";

import { DEFAULT_MODEL, isAllowedModel } from "@/lib/models";

const STORAGE_KEY = "uigen-model";

export function getStoredModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isAllowedModel(stored) ? stored : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setStoredModel(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode etc.) — selection simply won't persist.
  }
}
