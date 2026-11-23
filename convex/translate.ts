"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { LANGUAGE_CODES, isSupportedLanguage } from "./languages";

const SUPPORTED_LANGUAGES = LANGUAGE_CODES;

// MyMemory language codes where they differ from ours.
const MYMEMORY_CODES: Record<string, string> = { zh: "zh-CN" };
const apiCode = (lang: string) =>
  isSupportedLanguage(lang) ? MYMEMORY_CODES[lang] ?? lang : null;

// MyMemory rejects queries over 500 bytes, so long stories go in sentence-sized pieces.
const MAX_CHUNK = 450;
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?;\n]+[.!?;]*\s*|\n+/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (new TextEncoder().encode(cur + s).length > MAX_CHUNK && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function translateChunk(text: string, fromCode: string, toCode: string): Promise<string | null> {
  if (!text.trim()) return text;
  // An email raises MyMemory's free quota from 5,000 to 50,000 characters a day.
  const email = process.env.MYMEMORY_EMAIL;
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${fromCode}|${toCode}` +
    (email ? `&de=${encodeURIComponent(email)}` : "");
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
    const translated: string = data.responseData.translatedText;
    if (translated === text.trim().toUpperCase()) return null;
    // Keep the whitespace / line breaks around the piece.
    return text.match(/^\s*/)![0] + translated + text.match(/\s*$/)![0];
  }
  return null;
}

async function translateText(
  text: string,
  from: string,
  to: string
): Promise<string | null> {
  if (!text.trim()) return null;
  const fromCode = apiCode(from);
  const toCode = apiCode(to);
  if (!fromCode || !toCode || fromCode === toCode) return null;

  const parts: string[] = [];
  for (const chunk of chunkText(text)) {
    const t = await translateChunk(chunk, fromCode, toCode);
    if (t === null) return null; // all-or-nothing: no half-translated stories
    parts.push(t);
  }
  return parts.join("");
}

// Internal: nothing calls it from a client, and it writes to any room it is given.
export const autoTranslateRoom = internalAction({
  args: {
    roomId: v.id("rooms"),
    story: v.string(),
    description: v.string(),
    sourceLang: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { roomId, story, description } = args;
    const sourceLang = args.sourceLang || "en";

    console.log(`[AutoTranslate] Starting: roomId=${roomId}, sourceLang=${sourceLang}, storyLen=${story.length}, descLen=${description.length}`);

    const targetLangs = SUPPORTED_LANGUAGES.filter((l) => l !== sourceLang);
    console.log(`[AutoTranslate] Target languages: ${targetLangs.join(", ")}`);

    const storyTranslations: Record<string, string> = {};
    const descriptionTranslations: Record<string, string> = {};

    for (const lang of targetLangs) {
      const [translatedStory, translatedDesc] = await Promise.all([
        translateText(story, sourceLang, lang),
        translateText(description, sourceLang, lang),
      ]);
      console.log(`[AutoTranslate] ${sourceLang}->${lang}: story=${translatedStory ? 'OK' : 'FAILED'}, desc=${translatedDesc ? 'OK' : 'FAILED'}`);
      if (translatedStory) storyTranslations[lang] = translatedStory;
      if (translatedDesc) descriptionTranslations[lang] = translatedDesc;
    }

    storyTranslations[sourceLang] = story;
    descriptionTranslations[sourceLang] = description;

    console.log(`[AutoTranslate] Final keys: story=[${Object.keys(storyTranslations).join(",")}], desc=[${Object.keys(descriptionTranslations).join(",")}]`);

    await ctx.runMutation(internal.translateHelpers.saveTranslations, {
      roomId,
      storyTranslations: storyTranslations as any,
      descriptionTranslations: descriptionTranslations as any,
    });

    return { storyTranslations, descriptionTranslations };
  },
});
