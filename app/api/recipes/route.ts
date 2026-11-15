import { translateText } from "@/lib/recipe-server";

export const runtime = "edge";

const API = "https://www.themealdb.com/api/json/v1/1";
const HASHULCHAN = "https://www.hashulchan.co.il";
const typeSearch: Record<string, { categories?: string[]; terms?: string[] }> = {
  cakes: { terms: ["cake"] },
  meat: { categories: ["Beef", "Chicken", "Lamb"] },
  fish: { categories: ["Seafood"] },
  sweet_bake: { categories: ["Dessert"] },
  savory_bake: { terms: ["pie", "tart"] },
  quiche_savory: { terms: ["pie"] },
  savory_casserole: { terms: ["casserole", "frittata"] },
  pie_sweet: { terms: ["pie", "tart"], categories: ["Dessert"] },
};

type Meal = Record<string, string | null> & { idMeal: string; strMeal: string };

const queryStopWords = new Set([
  "a", "an", "and", "the", "with", "without", "in", "on", "for", "of", "to",
  "recipe", "dish", "meal", "oven", "baked", "bake", "sweet", "savory", "savoury",
  "cake", "cakes", "pie", "pies", "tart", "tarts", "quiche", "pastry",
]);
const sourceStopWords = new Set([
  "של", "עם", "בלי", "ללא", "מתכון", "מתכונים", "בתנור", "אפוי", "אפויה", "מתוק", "מתוקה", "מלוח", "מלוחה",
  "עוגה", "עוגת", "עוגות", "מאפה", "מאפים", "פאי", "טארט", "קיש", "פשטידה", "פשטידת",
]);

function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function requiredQueryTerms(query: string) {
  return [...new Set(normalizeSearchText(query).split(" ")
    .filter((term) => term.length > 1 && !queryStopWords.has(term)))];
}

function requiredSourceTerms(query: string) {
  return [...new Set(normalizeSearchText(query).split(" ")
    .filter((term) => term.length > 1 && !sourceStopWords.has(term)))];
}

function mealMatchesRequiredTerms(meal: Meal, terms: string[]) {
  if (!terms.length) return true;
  const ingredients = Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "").join(" ");
  const searchable = ` ${normalizeSearchText(`${meal.strMeal} ${ingredients}`)} `;
  return terms.every((term) => {
    const singular = term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term;
    return searchable.includes(` ${term} `) || searchable.includes(` ${singular} `);
  });
}

function matchesRequestedType(meal: Meal, type: string) {
  const title = meal.strMeal.toLowerCase();
  const category = (meal.strCategory ?? "").toLowerCase();
  const tags = (meal.strTags ?? "").toLowerCase();
  const ingredients = Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "")
    .join(" ")
    .toLowerCase();
  const all = `${title} ${category} ${tags} ${ingredients}`;
  const instructions = (meal.strInstructions ?? "").toLowerCase();
  const sweetSignals = /dessert|sweet|cake|chocolate|cocoa|custard|jam|caramel|apple|berry|strawberry|blueberry|raspberry|cherry|banana|lemon curd|treacle|קינוח|מתוק|עוג|שוקולד|קקאו|ריבה|קרמל|תפוח|תות|דובדבן|בננה/i;
  const savorySignals = /beef|chicken|lamb|pork|fish|salmon|tuna|cheese|onion|garlic|spinach|mushroom|tomato|potato|leek|broccoli|zucchini|courgette|בשר|עוף|טלה|דג|סלמון|טונה|גבינ|בצל|שום|תרד|פטריות|עגבני|תפוח אדמה|כרישה|ברוקולי|קישוא/i;
  const isSweet = category === "dessert" || sweetSignals.test(`${title} ${category} ${tags}`);

  if (type === "cakes") return /cakes?|עוגה|עוגת|עוגות|קייק/i.test(title);
  if (type === "sweet_bake") {
    const sweetBakedForm = /cake|pie|tart|pastry|cookie|biscuit|brownie|muffin|bread|bun|roll|galette|עוג|פאי|טארט|מאפה|עוגי|בראוני|מאפין|שמרים|לחם|לחמנ|רולדה|גאלט/i.test(title);
    return isSweet && sweetBakedForm && !/salad|סלט/i.test(title);
  }
  if (type === "savory_bake") {
    const excludedDish = /salad|sandwich|bruschetta|toast|soup|gazpacho|סלט|כריך|ברוסקטה|טוסט|מרק|גספצ/i.test(title);
    const bakedForm = /pie|tart|pastry|quiche|bread|focaccia|pizza|calzone|galette|bun|roll|מאפה|פשטידה|קיש|בורקס|טארט|פאי|לחם|לחמנ|פוקאצ|פיצה|קלצונה|גאלט|שבלול/i.test(title);
    return !isSweet && !excludedDish && bakedForm;
  }
  if (type === "quiche_savory") {
    const quicheForm = /quiche|savory tart|קיש|טארט מלוח/i.test(title);
    const bakedBase = /pastry|crust|dough|flour|shortcrust|בצק|קלתית|קמח|פריך/i.test(`${ingredients} ${instructions}`);
    return !isSweet && quicheForm && bakedBase;
  }
  if (type === "savory_casserole") {
    const casseroleForm = /casserole|frittata|pudding|פשטידה|פשטידת|פריטטה/i.test(title);
    const bakedBase = /pastry|crust|dough|shortcrust|בצק|קלתית/i.test(`${ingredients} ${instructions}`);
    return !isSweet && casseroleForm && !bakedBase;
  }
  if (type === "pie_sweet") {
    return isSweet && /pie|tart|pudding|פאי|טארט|פשטידה/i.test(title);
  }
  if (type === "meat") return /beef|chicken|lamb|pork|meat|בשר|בקר|עוף|טלה|פרגית/i.test(all);
  if (type === "fish") return /fish|salmon|tuna|cod|seafood|דג|סלמון|טונה|בקלה/i.test(all);
  return true;
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function recipeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (object["@type"] === "Recipe") return object;
  if (Array.isArray(object["@graph"])) {
    return object["@graph"].map(recipeObject).find(Boolean) ?? null;
  }
  return null;
}

function hashId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return `hash-${Math.abs(hash)}`;
}

function splitHebrewIngredient(value: string) {
  const match = value.trim().match(/^([\d\s./¼½¾⅓⅔]+(?:גרם|ק״ג|ק"ג|קג|מ״ל|מ"ל|ליטר|כוסות?|כפות?|כפיות?|יחידות?|גביע(?:ים)?|חבילות?)?(?:\s*\([^)]*\))?)\s+(.+)$/i);
  return match ? { measure: match[1].trim(), name: match[2].trim() } : { measure: "", name: value.trim() };
}

function parseHashulchanRecipe(html: string, url: string): Meal | null {
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const recipe = recipeObject(JSON.parse(match[1]));
      if (!recipe || typeof recipe.name !== "string") continue;
      const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.map(String) : [];
      const instructions = Array.isArray(recipe.recipeInstructions)
        ? recipe.recipeInstructions.map((step) => typeof step === "string" ? step : String((step as Record<string, unknown>)?.text ?? "")).filter(Boolean)
        : [];
      const image = Array.isArray(recipe.image) ? String(recipe.image[0] ?? "") : String(recipe.image ?? "");
      const rating = recipe.aggregateRating && typeof recipe.aggregateRating === "object"
        ? recipe.aggregateRating as Record<string, unknown> : {};
      const meal: Meal = {
        idMeal: hashId(url), strMeal: recipe.name, strMealThumb: image,
        strInstructions: instructions.join("\n"), strCategory: "השולחן", strArea: "ישראל",
        strTags: String(recipe.keywords ?? ""), strSource: url, strProvider: "השולחן",
        strLanguage: "he", ratingCount: String(rating.ratingCount ?? "0"), ratingValue: String(rating.ratingValue ?? ""),
      };
      ingredients.slice(0, 20).forEach((ingredient, index) => {
        const parsed = splitHebrewIngredient(ingredient);
        meal[`strIngredient${index + 1}`] = parsed.name;
        meal[`strMeasure${index + 1}`] = parsed.measure;
      });
      return meal;
    } catch { /* Ignore malformed metadata blocks and continue. */ }
  }
  return null;
}

async function searchHashulchan(query: string) {
  if (!query) return [] as Meal[];
  const headers = { "User-Agent": "Matkonim-Hachamim/1.0 Googlebot", "Accept-Language": "he-IL,he;q=0.9" };
  const pageUrls = [
    `${HASHULCHAN}/search/?q=${encodeURIComponent(query)}`,
    ...Array.from({ length: 9 }, (_, index) =>
      `${HASHULCHAN}/wp-content/themes/rgb/ajax/search_load_content.php?q=${encodeURIComponent(query)}&p=${11 + index * 10}&ajax=true`,
    ),
  ];
  const searchPages = await Promise.all(pageUrls.map(async (url) => {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      return response.ok ? await response.text() : "";
    } catch { return ""; }
  }));
  const links = searchPages.flatMap((html) =>
    [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => decodeHtml(match[1])),
  ).filter((href) => {
    try {
      const path = decodeURIComponent(new URL(href, HASHULCHAN).pathname);
      return path.startsWith("/מתכונים/") && path !== "/מתכונים/";
    } catch { return false; }
  });
  const urls = [...new Set(links.map((href) => new URL(href, HASHULCHAN).toString()))].slice(0, 100);
  const meals: Meal[] = [];
  for (let start = 0; start < urls.length; start += 8) {
    const batch = await Promise.all(urls.slice(start, start + 8).map(async (url) => {
      try {
        const page = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
        return page.ok ? parseHashulchanRecipe(await page.text(), url) : null;
      } catch { return null; }
    }));
    meals.push(...batch.filter((meal): meal is Meal => Boolean(meal)));
  }
  return meals;
}

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
  const mandatoryRestrictions = (searchParams.get("restrictions") || "").split("|").filter((item) => {
    const [key, mode] = item.split(":");
    return (key === "gluten" && mode !== "off") || ((key === "dairy" || key === "lowcarb") && mode === "strict");
  }).map((item) => item.split(":")[0]);
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

    const hashulchanPromise = rawQuery ? searchHashulchan(rawQuery).catch(() => [] as Meal[]) : Promise.resolve([] as Meal[]);
    const summaries = new Map<string, Meal>();
    const candidateScores = new Map<string, number>();

    if (query) {
      const byName = await getJson(`${API}/search.php?s=${encodeURIComponent(query)}`);
      for (const meal of byName.meals ?? []) {
        summaries.set(meal.idMeal, meal);
        candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 2);
      }

      // The free-text request is a strict requirement, not merely a ranking hint.
      // Search every meaningful request word as an ingredient as well, so recipes
      // where it appears only in the ingredient list are still considered.
      const strictTerms = requiredQueryTerms(query);
      const termResults = await Promise.all(strictTerms.map((term) =>
        getJson(`${API}/filter.php?i=${encodeURIComponent(term)}`).catch(() => ({ meals: [] })),
      ));
      for (const result of termResults) {
        for (const meal of result.meals ?? []) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 4);
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
      .slice(0, query ? 24 : 14);
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
    const strictQueryTerms = query ? requiredQueryTerms(query) : [];
    const typedResults = complete.filter((meal) =>
      matchesRequestedType(meal, type) && mealMatchesRequiredTerms(meal, strictQueryTerms),
    );
    const sourceTerms = requiredSourceTerms(rawQuery);
    const hashulchanResults = (await hashulchanPromise).filter((meal) =>
      matchesRequestedType(meal, type) && mealMatchesRequiredTerms(meal, sourceTerms),
    );
    for (const meal of hashulchanResults) {
      const names = Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "").join(" ");
      ingredientMatches[meal.idMeal] = rawIngredients.filter((ingredient) =>
        normalizeSearchText(names).includes(normalizeSearchText(ingredient)),
      ).length;
    }
    const violatesRestriction = (meal: Meal, key: string) => {
      const names = Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "");
      if (key === "gluten") return names.some((name) => {
        if (/gluten[- ]?free flour|almond flour|coconut flour|rice flour|corn flour|cornstarch|tamari|קמח ללא גלוטן|קמח שקדים|קמח קוקוס|קמח אורז|קמח תירס|קורנפלור|טמארי/i.test(name)) return false;
        return /flour|wheat|bread|breadcrumbs|pasta|spaghetti|noodle|couscous|barley|semolina|soy sauce|tortilla|cracker|pastry|קמח|חיטה|לחם|פירורי לחם|פסטה|אטריות|קוסקוס|שעורה|סולת|רוטב סויה|טורטייה/i.test(name);
      });
      if (key === "dairy") return names.some((name) => /milk|cheese|butter|cream|yogurt|whey|mascarpone|mozzarella|parmesan|cheddar|feta|ricotta|חלב|גבינ|חמאה|שמנת|יוגורט|מסקרפונה|מוצרלה|פרמזן|פטה|ריקוטה/i.test(name));
      return names.some((name) => /sugar|honey|syrup|flour|bread|rice|potato|pasta|noodle|couscous|corn|beans|lentil|oats|barley|chocolate|סוכר|דבש|סירופ|קמח|לחם|אורז|תפוח אדמה|פסטה|אטריות|קוסקוס|תירס|שעועית|עדשים|שיבולת שועל|שעורה|שוקולד/i.test(name));
    };
    const combinedSource = (hashulchanResults.length ? hashulchanResults : typedResults)
      .filter((meal) => mandatoryRestrictions.every((key) => !violatesRestriction(meal, key)));
    const combined = [...combinedSource]
      .filter((meal, index, list) => list.findIndex((candidate) => normalizeSearchText(candidate.strMeal) === normalizeSearchText(meal.strMeal)) === index)
      .sort((a, b) => {
        const byRatings = Number(b.ratingCount ?? 0) - Number(a.ratingCount ?? 0);
        if (byRatings) return byRatings;
        const byIngredients = (ingredientMatches[b.idMeal] ?? 0) - (ingredientMatches[a.idMeal] ?? 0);
        if (byIngredients) return byIngredients;
        return (b.strProvider === "השולחן" ? 1 : 0) - (a.strProvider === "השולחן" ? 1 : 0);
      });

    return Response.json(
      {
        meals: combined.slice(0, 10),
        query: query || null,
        requiredQueryTerms: strictQueryTerms,
        requestedIngredients,
        ingredientMatches,
        provider: "השולחן + TheMealDB",
        sourceCounts: { hashulchan: hashulchanResults.length, themealdb: typedResults.length },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "לא הצלחנו להגיע למאגר המתכונים. נסה שוב בעוד רגע." },
      { status: 502 },
    );
  }
}
