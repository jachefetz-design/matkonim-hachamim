const TRANSLATE_ENDPOINT = "https://api.mymemory.translated.net/get";

export async function translateText(
  text: string,
  source = "en",
  target = "he",
): Promise<string> {
  const clean = text.trim();
  if (!clean || source === target) return clean;

  const url = new URL(TRANSLATE_ENDPOINT);
  url.searchParams.set("q", clean.slice(0, 490));
  url.searchParams.set("langpair", `${source}|${target}`);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Matkonim-Hachamim/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        responseData?: { translatedText?: string };
        responseStatus?: number | string;
      };
      const translated = payload.responseData?.translatedText?.trim();
      if (translated && !translated.includes("INVALID SOURCE LANGUAGE")) return translated;
    } catch {
      // Retry once for transient network and provider failures.
    }
  }
  return clean;
}

export function detectSourceLanguage(text: string): string {
  if (/[\u0590-\u05ff]/.test(text)) return "he";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0370-\u03ff]/.test(text)) return "el";
  return "en";
}

export function splitForTranslation(text: string, maxLength = 470): string[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) chunks.push(current);
      for (let index = 0; index < sentence.length; index += maxLength) {
        chunks.push(sentence.slice(index, index + maxLength));
      }
      current = "";
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
