import { translateText } from "@/lib/recipe-server";

export const runtime = "edge";

const API = "https://www.themealdb.com/api/json/v1/1";
const typeSearch: Record<string, { categories?: string[]; terms?: string[] }> = {
  meat: { categories: ["Beef", "Chicken", "Lamb"] },
  fish: { categories: ["Seafood"] },
  sweet_bake: { categories: ["Dessert"] },
  savory_bake: { terms: ["pie", "tart"] },
  quiche_savory: { terms: ["quiche", "savory pie"] },
  pie_sweet: { terms: ["pie", "tart"], categories: ["Dessert"] },
};

type Meal = Record<string, string | null> & { idMeal: string; strMeal: string };

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Matkonim-Hachamim/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Recipe service returned ${response.status}`);
  return (await response.json()) as { meals?: Meal[] | null };
}

async function lookup(id: string): Promise<Meal | null> {
  const payload = await getJson(`${API}/lookup.php?i=${encodeURIComponent(id)}`);
  return payload.meals?.[0] ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "fish";
  const rawQuery = (searchParams.get("query") || "").trim().slice(0, 80);
  const sourceLanguage = (searchParams.get("language") || "he").slice(0, 8);
  const config = typeSearch[type] ?? typeSearch.fish;

  try {
    let query = rawQuery;
    if (query && sourceLanguage !== "en") {
      query = await translateText(query, sourceLanguage, "en");
    }

    const summaries = new Map<string, Meal>();

    if (query) {
      const byName = await getJson(`${API}/search.php?s=${encodeURIComponent(query)}`);
      for (const meal of byName.meals ?? []) summaries.set(meal.idMeal, meal);

      if (!summaries.size) {
        const ingredient = query.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const byIngredient = await getJson(`${API}/filter.php?i=${encodeURIComponent(ingredient)}`);
        for (const meal of byIngredient.meals ?? []) summaries.set(meal.idMeal, meal);
      }
    }

    if (!summaries.size) {
      for (const category of config.categories ?? []) {
        const payload = await getJson(`${API}/filter.php?c=${encodeURIComponent(category)}`);
        for (const meal of (payload.meals ?? []).slice(0, 8)) {
          summaries.set(meal.idMeal, meal);
        }
      }
      for (const term of config.terms ?? []) {
        const payload = await getJson(`${API}/search.php?s=${encodeURIComponent(term)}`);
        for (const meal of payload.meals ?? []) summaries.set(meal.idMeal, meal);
      }
    }

    const chosen = [...summaries.values()].slice(0, 10);
    const details = await Promise.all(
      chosen.map((meal) =>
        meal.strInstructions ? Promise.resolve(meal) : lookup(meal.idMeal),
      ),
    );

    return Response.json(
      {
        meals: details.filter(Boolean),
        query: query || null,
        provider: "TheMealDB",
      },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch {
    return Response.json(
      { error: "לא הצלחנו להגיע למאגר המתכונים. נסה שוב בעוד רגע." },
      { status: 502 },
    );
  }
}
