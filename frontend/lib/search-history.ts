// lib/search-history.ts
"use client";

const HISTORY_KEY = "storeflow_recent_searches";
const MAX_ITEMS = 8;

export function readSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addSearchHistory(keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const existing = readSearchHistory().filter((k) => k !== trimmed);
  const next = [trimmed, ...existing].slice(0, MAX_ITEMS);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function removeSearchHistory(keyword: string) {
  const next = readSearchHistory().filter((k) => k !== keyword);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function clearSearchHistory() {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
}
