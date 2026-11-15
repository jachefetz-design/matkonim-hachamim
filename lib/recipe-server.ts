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

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Matkonim-Hachamim/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return clean;
    const payload = (await response.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    };
    const translated = payload.responseData?.translatedText?.trim();
    return translated && !translated.includes("INVALID SOURCE LANGUAGE")
      ? translated
      : clean;
  } catch {
    return clean;
  }
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
