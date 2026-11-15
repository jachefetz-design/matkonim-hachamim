import { translateText } from "@/lib/recipe-server";

export const runtime = "edge";

const API = "https://www.themealdb.com/api/json/v1/1";
const typeSearch: Record<string, { categories?: string[]; terms?: string[] }> = {
  cakes: { terms: ["cake"] },
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
  const rawIngredients = (searchParams.get("ingredients") || "")
    .split("|")
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
  const config = typeSearch[type] ?? typeSearch.fish;

  try {
    let query = rawQuery;
    if (query && sourceLanguage !== "en") {
      query = await translateText(query, sourceLanguage, "en");
    }

    const requestedIngredients: string[] = [];
    for (const ingredient of rawIngredients) {
      const translated = sourceLanguage === "en"
        ? ingredient
        : await translateText(ingredient, sourceLanguage, "en");
      requestedIngredients.push(translated.toLowerCase().replace(/\s+/g, " ").trim());
    }

    const summaries = new Map<string, Meal>();
    const candidateScores = new Map<string, number>();

    if (query) {
      const byName = await getJson(`${API}/search.php?s=${encodeURIComponent(query)}`);
      for (const meal of byName.meals ?? []) {
        summaries.set(meal.idMeal, meal);
        candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 2);
      }

      if (!summaries.size) {
        const ingredient = query.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const byIngredient = await getJson(`${API}/filter.php?i=${encodeURIComponent(ingredient)}`);
        for (const meal of byIngredient.meals ?? []) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 1);
        }
      }
    }

    if (requestedIngredients.length) {
      const ingredientResults = await Promise.all(requestedIngredients.map(async (ingredient) => {
        const normalized = ingredient.replace(/[^a-z0-9]+/g, "_").replace(/s$/, "");
        const payload = await getJson(`${API}/filter.php?i=${encodeURIComponent(normalized)}`);
        return payload.meals ?? [];
      }));
      for (const result of ingredientResults) {
        for (const meal of result) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 3);
        }
      }
    }

    // When products were supplied, keep the chosen recipe type influential.
    // Category/term matches receive extra score, while products still determine
    // which candidates rise to the top within that type.
    if (!query && summaries.size) {
      for (const category of config.categories ?? []) {
        const payload = await getJson(`${API}/filter.php?c=${encodeURIComponent(category)}`);
        for (const meal of (payload.meals ?? []).slice(0, 12)) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 1);
        }
      }
      for (const term of config.terms ?? []) {
        const payload = await getJson(`${API}/search.php?s=${encodeURIComponent(term)}`);
        for (const meal of payload.meals ?? []) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 5);
        }
      }
    }

    if (!summaries.size) {
      for (const category of config.categories ?? []) {
        const payload = await getJson(`${API}/filter.php?c=${encodeURIComponent(category)}`);
        for (const meal of (payload.meals ?? []).slice(0, 8)) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, 1);
        }
      }
      for (const term of config.terms ?? []) {
        const payload = await getJson(`${API}/search.php?s=${encodeURIComponent(term)}`);
        for (const meal of payload.meals ?? []) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, 2);
        }
      }
    }

    const chosen = [...summaries.values()]
      .sort((a, b) => (candidateScores.get(b.idMeal) ?? 0) - (candidateScores.get(a.idMeal) ?? 0))
      .slice(0, 14);
    const details = await Promise.all(
      chosen.map((meal) =>
        meal.strInstructions ? Promise.resolve(meal) : lookup(meal.idMeal),
      ),
    );

    const complete = details.filter((meal): meal is Meal => Boolean(meal));
    const ingredientMatches: Record<string, number> = {};
    for (const meal of complete) {
      const names = Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "")
        .join(" ")
        .toLowerCase();
      ingredientMatches[meal.idMeal] = requestedIngredients.filter((ingredient) => {
        const core = ingredient.replace(/s$/, "");
        return names.includes(ingredient) || names.includes(core);
      }).length;
    }
    complete.sort((a, b) => (ingredientMatches[b.idMeal] ?? 0) - (ingredientMatches[a.idMeal] ?? 0));
    const typedResults = type === "cakes"
      ? complete.filter((meal) => /\bcakes?\b/i.test(meal.strMeal))
      : complete;

    return Response.json(
      {
        meals: (typedResults.length ? typedResults : complete).slice(0, 10),
        query: query || null,
        requestedIngredients,
        ingredientMatches,
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
