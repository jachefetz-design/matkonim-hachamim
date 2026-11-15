import { detectSourceLanguage, splitForTranslation, translateText } from "@/lib/recipe-server";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      texts?: unknown;
      source?: unknown;
      target?: unknown;
    };
    const texts = Array.isArray(body.texts)
      ? body.texts.filter((value): value is string => typeof value === "string").slice(0, 24)
      : [];
    const source = typeof body.source === "string" ? body.source : "en";
    const target = typeof body.target === "string" ? body.target : "he";
    if (!texts.length) {
      return Response.json({ error: "לא התקבל טקסט לתרגום" }, { status: 400 });
    }

    async function translateInput(text: string) {
      const chunks = splitForTranslation(text);
      const translatedChunks: string[] = [];
      for (const chunk of chunks.slice(0, 36)) {
        const detectedSource = source === "auto" ? detectSourceLanguage(chunk) : source;
        const translated = await translateText(chunk, detectedSource, target);
        const requiresHebrew = target === "he" && detectedSource !== "he" && /[A-Za-z]{3}/.test(chunk);
        if (requiresHebrew && !/[\u0590-\u05ff]/.test(translated)) {
          throw new Error("incomplete translation");
        }
        translatedChunks.push(translated);
      }
      return translatedChunks.join("\n") || text;
    }

    const translated: string[] = [];
    // Translate sequentially. The public translation service throttles bursts;
    // a selected recipe must be translated completely or not shown at all.
    for (const text of texts) {
      translated.push(await translateInput(text));
    }

    return Response.json(
      { translated },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch {
    return Response.json({ error: "התרגום אינו זמין כרגע" }, { status: 502 });
  }
}
