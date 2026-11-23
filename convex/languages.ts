import { v } from "convex/values";

// Every language the website speaks (keep in sync with escape-web src/lib/languages.ts).
// Server-side texts (emails, push notifications) fall back to English for languages they lack.
export const LANGUAGE_CODES = [
  "en", "el", "nl", "de", "fr", "es", "it", "pt", "pl",
  "ro", "bg", "tr", "ru", "uk", "ar", "zh", "ja", "ko",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export function isSupportedLanguage(lang: unknown): lang is LanguageCode {
  return typeof lang === "string" && (LANGUAGE_CODES as readonly string[]).includes(lang);
}

const optStr = v.optional(v.string());

/** Per-language texts of a room's story / description: { en?: string, el?: string, ... }. */
export const translationsValidator = v.object({
  en: optStr, el: optStr, nl: optStr, de: optStr, fr: optStr, es: optStr,
  it: optStr, pt: optStr, pl: optStr, ro: optStr, bg: optStr, tr: optStr,
  ru: optStr, uk: optStr, ar: optStr, zh: optStr, ja: optStr, ko: optStr,
});
