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
      for (const chunk of chunks.slice(0, 20)) {
        const detectedSource = source === "auto" ? detectSourceLanguage(chunk) : source;
        translatedChunks.push(await translateText(chunk, detectedSource, target));
      }
      return translatedChunks.join("\n") || text;
    }

    const translated: string[] = [];
    for (let index = 0; index < texts.length; index += 4) {
      translated.push(...await Promise.all(texts.slice(index, index + 4).map(translateInput)));
    }

    return Response.json(
      { translated },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch {
    return Response.json({ error: "התרגום אינו זמין כרגע" }, { status: 502 });
  }
}
