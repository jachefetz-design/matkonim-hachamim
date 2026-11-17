import { translateText } from "@/lib/recipe-server";

export const runtime = "edge";

const API = "https://www.themealdb.com/api/json/v1/1";
const HASHULCHAN = "https://www.hashulchan.co.il";
const COELIAC_UK = "https://www.coeliac.org.uk";
const NIKIB = "https://nikib.co.il";
const BBC_GOOD_FOOD = "https://www.bbcgoodfood.com";
const GO_DAIRY_FREE = "https://godairyfree.org";
const ISRAELI_WORDPRESS_SOURCES = [
  { base: "https://www.10dakot.co.il", provider: "מתכונים ב-10 דקות", glutenFree: false },
  { base: "https://www.lichtenstadt.com", provider: "אז מה את עושה כל היום", glutenFree: false },
  { base: "https://www.shay-glutenfree.co.il", provider: "שי ללא גלוטן", glutenFree: true },
];
const typeSearch: Record<string, { categories?: string[]; terms?: string[]; he: string; en: string }> = {
  cakes: { terms: ["cake"], he: "עוגה", en: "cake" },
  meat: { categories: ["Beef", "Chicken", "Lamb"], he: "מתכון בשר", en: "meat recipe" },
  fish: { categories: ["Seafood"], he: "מתכון דגים", en: "fish recipe" },
  sweet_bake: { categories: ["Dessert"], he: "מאפה מתוק", en: "sweet bake pastry" },
  savory_bake: { terms: ["pie", "tart"], he: "מאפה מלוח", en: "savory bake pastry" },
  quiche_savory: { terms: ["quiche", "savory tart"], he: "קיש", en: "quiche savory tart" },
  savory_casserole: { terms: ["casserole", "frittata"], he: "פשטידה מלוחה", en: "savory casserole frittata" },
  pie_sweet: { terms: ["pie", "tart"], categories: ["Dessert"], he: "פאי טארט מתוק", en: "sweet pie tart" },
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
    const bakedForm = /pie|tart|pastry|quiche|bread|focaccia|pizza|calzone|galette|bun|roll|empanada|samosa|מאפה|פשטידה|קיש|בורקס|טארט|פאי|לחם|לחמנ|פוקאצ|פיצה|קלצונה|גאלט|שבלול|פטאייר|אמפנדס|לחמג'ון|סמבוסק|סיגר/i.test(title);
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
  return value.replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#8217;/g, "’").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function splitEnglishIngredient(value: string) {
  const clean = decodeHtml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const match = clean.match(/^((?:\d+(?:[.,/]\d+)?|[¼½¾⅓⅔])(?:\s+\d+\/\d+)?\s*(?:kg|g|mg|ml|l|cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|lb|pounds?)?)\s+(.+)$/i);
  return match ? { measure: match[1].trim(), name: match[2].trim() } : { measure: "", name: clean };
}

function parseCoeliacRecipe(html: string, url: string): Meal | null {
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const recipe = recipeObject(JSON.parse(match[1]));
      if (!recipe || typeof recipe.name !== "string" || !Array.isArray(recipe.recipeIngredient)) continue;
      const instructions = Array.isArray(recipe.recipeInstructions)
        ? recipe.recipeInstructions.map((step) => typeof step === "string" ? step : String((step as Record<string, unknown>)?.text ?? "")).filter(Boolean)
        : [];
      if (!instructions.length) continue;
      const image = Array.isArray(recipe.image) ? String(recipe.image[0] ?? "") : String(recipe.image ?? "");
      const meal: Meal = {
        idMeal: `coeliac-${hashId(url).replace("hash-", "")}`,
        strMeal: decodeHtml(recipe.name), strMealThumb: image,
        strInstructions: instructions.join("\n"), strCategory: String(recipe.recipeCategory ?? "Gluten-free"),
        strArea: "United Kingdom", strTags: "gluten-free,coeliac",
        strSource: url, strProvider: "Coeliac UK", strLanguage: "en",
        ratingCount: "0", ratingValue: "", strGlutenFreeSource: "true",
      };
      recipe.recipeIngredient.map(String).slice(0, 20).forEach((ingredient, index) => {
        const parsed = splitEnglishIngredient(ingredient);
        meal[`strIngredient${index + 1}`] = parsed.name;
        meal[`strMeasure${index + 1}`] = parsed.measure;
      });
      return meal;
    } catch { /* Continue to the next structured-data block. */ }
  }
  return null;
}

function parseExternalStructuredRecipe(
  html: string,
  url: string,
  options: { provider: string; idPrefix: string; tags?: string; glutenFree?: boolean; dairyFree?: boolean; language?: string },
): Meal | null {
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const recipe = recipeObject(JSON.parse(match[1]));
      if (!recipe || typeof recipe.name !== "string" || !Array.isArray(recipe.recipeIngredient)) continue;
      const instructions = flattenInstructions(recipe.recipeInstructions);
      if (!instructions.length) continue;
      const rawImage = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image;
      const image = rawImage && typeof rawImage === "object"
        ? String((rawImage as Record<string, unknown>).url ?? "") : String(rawImage ?? "");
      const rating = recipe.aggregateRating && typeof recipe.aggregateRating === "object"
        ? recipe.aggregateRating as Record<string, unknown> : {};
      const meal: Meal = {
        idMeal: `${options.idPrefix}-${hashId(url).replace("hash-", "")}`,
        strMeal: decodeHtml(recipe.name), strMealThumb: image,
        strInstructions: instructions.join("\n"), strCategory: String(recipe.recipeCategory ?? "Recipe"),
        strArea: "International", strTags: options.tags ?? "",
        strSource: url, strProvider: options.provider, strLanguage: options.language ?? "en",
        ratingCount: String(rating.ratingCount ?? rating.reviewCount ?? "0"),
        ratingValue: String(rating.ratingValue ?? ""),
        ...(options.glutenFree ? { strGlutenFreeSource: "true" } : {}),
        ...(options.dairyFree ? { strDairyFreeSource: "true" } : {}),
      };
      recipe.recipeIngredient.map(String).slice(0, 20).forEach((ingredient, index) => {
        const parsed = splitEnglishIngredient(ingredient);
        meal[`strIngredient${index + 1}`] = parsed.name;
        meal[`strMeasure${index + 1}`] = parsed.measure;
      });
      return meal;
    } catch { /* Continue to the next structured-data block. */ }
  }
  return null;
}

function flattenInstructions(value: unknown): string[] {
  if (typeof value === "string") return [plainText(value)].filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.flatMap((step) => {
    if (typeof step === "string") return [plainText(step)].filter(Boolean);
    if (!step || typeof step !== "object") return [];
    const item = step as Record<string, unknown>;
    const ownText = typeof item.text === "string" ? [plainText(item.text)].filter(Boolean) : [];
    return [...ownText, ...flattenInstructions(item.itemListElement)];
  });
}

function publicRecipeUrl(value: string) {
  try {
    const url = new URL(decodeHtml(value));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")) return null;
    return url.toString();
  } catch { return null; }
}

async function searchIsraeliWordpress(query: string) {
  if (!query) return [] as Meal[];
  const groups = await Promise.all(ISRAELI_WORDPRESS_SOURCES.map(async ({ base, provider, glutenFree }, sourceIndex) => {
    try {
      const response = await fetch(`${base}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=8`, {
        headers: { ...browserHeaders, "Accept-Language": "he-IL,he;q=0.9" },
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) return [] as Meal[];
      const results = await response.json() as Array<{ url?: string }>;
      const urls = results.map((result) => result.url)
        .filter((url): url is string => Boolean(url && publicRecipeUrl(url))).slice(0, glutenFree ? 8 : 4);
      return fetchRecipesFromUrls(urls, (page, url) => parseExternalStructuredRecipe(page, url, {
        provider, idPrefix: `ilwp-${sourceIndex}`, language: "he", glutenFree,
      }), { ...browserHeaders, "Accept-Language": "he-IL,he;q=0.9" });
    } catch { return [] as Meal[]; }
  }));
  return groups.flat();
}

async function searchCoeliacUk(query: string) {
  if (!query) return [] as Meal[];
  const headers = { "User-Agent": "Matkonim-Hachamim/1.0 Googlebot", "Accept-Language": "en-GB,en;q=0.9" };
  try {
    const searchTerm = query.trim().replace(/s$/i, "");
    const search = await fetch(`${COELIAC_UK}/recipes/?search=${encodeURIComponent(searchTerm)}`, {
      headers, signal: AbortSignal.timeout(18_000),
    });
    if (!search.ok) return [] as Meal[];
    const html = await search.text();
    const urls = [...new Set([...html.matchAll(/href=["'](https:\/\/www\.coeliac\.org\.uk\/recipe\/[^"']+)["']/gi)]
      .map((match) => decodeHtml(match[1])))].slice(0, 10);
    return fetchRecipesFromUrls(urls, parseCoeliacRecipe, headers);
  } catch { return [] as Meal[]; }
}

const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchRecipesFromUrls(
  urls: string[],
  parser: (html: string, url: string) => Meal | null,
  headers: Record<string, string> = browserHeaders,
) {
  const batch = await Promise.all(urls.slice(0, 6).map(async (url) => {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(5_500) });
      return response.ok ? parser(await response.text(), url) : null;
    } catch { return null; }
  }));
  return batch.filter((meal): meal is Meal => Boolean(meal));
}

function withDeadline<T>(promise: Promise<T>, fallback: T, milliseconds = 8_000): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), milliseconds))]);
}

async function searchBbcGoodFood(query: string) {
  if (!query) return [] as Meal[];
  try {
    const response = await fetch(`${BBC_GOOD_FOOD}/search?q=${encodeURIComponent(query)}`, {
      headers: browserHeaders, signal: AbortSignal.timeout(14_000),
    });
    if (!response.ok) return [] as Meal[];
    const html = await response.text();
    const urls = [...new Set([...html.matchAll(/href=["'](https:\/\/www\.bbcgoodfood\.com\/recipes\/[^"'#?]+)["']/gi)]
      .map((match) => decodeHtml(match[1]))
      .filter((url) => !url.includes("/collection/") && !url.includes("/category/")))].slice(0, 10);
    return fetchRecipesFromUrls(urls, (page, url) => parseExternalStructuredRecipe(page, url, {
      provider: "BBC Good Food", idPrefix: "bbc",
    }));
  } catch { return [] as Meal[]; }
}

async function searchGoDairyFree(query: string) {
  if (!query) return [] as Meal[];
  try {
    const searchTerm = query.trim().replace(/s$/i, "");
    const response = await fetch(`${GO_DAIRY_FREE}/wp-json/wp/v2/search?search=${encodeURIComponent(searchTerm)}&per_page=20`, {
      headers: browserHeaders, signal: AbortSignal.timeout(14_000),
    });
    if (!response.ok) return [] as Meal[];
    const results = await response.json() as Array<{ url?: string }>;
    const urls = results.map((result) => result.url).filter((url): url is string => Boolean(url)).slice(0, 10);
    return fetchRecipesFromUrls(urls, (page, url) => parseExternalStructuredRecipe(page, url, {
      provider: "Go Dairy Free", idPrefix: "gdf", tags: "dairy-free,lactose-free", dairyFree: true,
    }));
  } catch { return [] as Meal[]; }
}

function parseNikibRecipe(html: string, url: string): Meal | null {
  const title = plainText(html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const ingredientHtml = html.match(/<div[^>]*id=["']ingredients["'][^>]*>([\s\S]*?)<div[^>]*class=["'][^"']*clearfix/i)?.[1] ?? "";
  const ingredientText = plainText(ingredientHtml.replace(/<h3[\s\S]*?<\/h3>/i, ""));
  const preparationStart = html.search(/<h3[^>]*class=["'][^"']*prp[^"']*["'][^>]*>\s*הכנות/i);
  if (!title || !ingredientText || preparationStart < 0) return null;
  const preparationSegment = html.slice(preparationStart, preparationStart + 28_000)
    .split(/<div[^>]*class=["'][^"']*(?:article-footer|related)/i)[0];
  const instructions = [...preparationSegment.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => plainText(match[1])).filter((value) => value.length > 8).slice(0, 30);
  if (!instructions.length) return null;
  const image = decodeHtml(html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1] ?? "");
  const meal: Meal = {
    idMeal: `nikib-${hashId(url).replace("hash-", "")}`, strMeal: title, strMealThumb: image,
    strInstructions: instructions.join("\n"), strCategory: "ניקי ב", strArea: "ישראל",
    strTags: plainText(html.match(/<span[^>]*class=["']cat["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ""),
    strSource: url, strProvider: "ניקי ב", strLanguage: "he", ratingCount: "0", ratingValue: "",
  };
  ingredientText.split(/\n+/).map((value) => value.trim()).filter(Boolean).slice(0, 20).forEach((ingredient, index) => {
    const parsed = splitHebrewIngredient(ingredient);
    meal[`strIngredient${index + 1}`] = parsed.name;
    meal[`strMeasure${index + 1}`] = parsed.measure;
  });
  return meal;
}

async function searchNikib(query: string) {
  if (!query) return [] as Meal[];
  const headers = { ...browserHeaders, "Accept-Language": "he-IL,he;q=0.9" };
  try {
    const pages = await Promise.all([1, 2].map(async (page) => {
      const url = page === 1 ? `${NIKIB}/?s=${encodeURIComponent(query)}` : `${NIKIB}/page/${page}/?s=${encodeURIComponent(query)}`;
      try {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(14_000) });
        return response.ok ? await response.text() : "";
      } catch { return ""; }
    }));
    const urls = [...new Set(pages.flatMap((html) => [...html.matchAll(/href=["'](https:\/\/nikib\.co\.il\/[^"']+)["']/gi)]
      .map((match) => decodeHtml(match[1])))
      .filter((url) => /\/\d+\/?(?:[#?].*)?$/.test(url)))].slice(0, 10);
    return fetchRecipesFromUrls(urls, parseNikibRecipe, headers);
  } catch { return [] as Meal[]; }
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

async function searchHashulchan(query: string, limit = 24) {
  if (!query) return [] as Meal[];
  const headers = { "User-Agent": "Matkonim-Hachamim/1.0 Googlebot", "Accept-Language": "he-IL,he;q=0.9" };
  const pageUrls = [
    `${HASHULCHAN}/search/?q=${encodeURIComponent(query)}`,
    ...Array.from({ length: 2 }, (_, index) =>
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
  const urls = [...new Set(links.map((href) => new URL(href, HASHULCHAN).toString()))].slice(0, limit);
  const batch = await Promise.all(urls.slice(0, limit).map(async (url) => {
    try {
      const page = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
      return page.ok ? parseHashulchanRecipe(await page.text(), url) : null;
    } catch { return null; }
  }));
  return batch.filter((meal): meal is Meal => Boolean(meal));
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Matkonim-Hachamim/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Recipe service returned ${response.status}`);
  return (await response.json()) as { meals?: Meal[] | null };
}

async function safeGetJson(url: string) {
  try { return await getJson(url); }
  catch { return { meals: [] as Meal[] }; }
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
  const restrictionEntries = (searchParams.get("restrictions") || "").split("|").filter(Boolean);
  const mandatoryRestrictions = restrictionEntries.filter((item) => {
    const [key, mode] = item.split(":");
    return (key === "gluten" && mode !== "off") || ((key === "dairy" || key === "lowcarb") && mode === "strict");
  }).map((item) => item.split(":")[0]);
  const dairyRequested = restrictionEntries.some((item) => item.startsWith("dairy:") && !item.endsWith(":off"));
  const config = typeSearch[type] ?? typeSearch.fish;

  try {
    const [translatedQuery, ...translatedIngredients] = await Promise.all([
      rawQuery && sourceLanguage !== "en" ? translateText(rawQuery, sourceLanguage, "en") : Promise.resolve(rawQuery),
      ...rawIngredients.map((ingredient) => sourceLanguage === "en"
        ? Promise.resolve(ingredient) : translateText(ingredient, sourceLanguage, "en")),
    ]);
    const query = translatedQuery;
    const requestedIngredients = translatedIngredients.map((ingredient) => ingredient.toLowerCase().replace(/\s+/g, " ").trim());
    // Use the user's strongest keyword when supplied; otherwise the selected
    // recipe type becomes the opening search term. Type and diet are enforced
    // after collection, so a narrow provider search cannot erase good results.
    const sourceQueryHe = rawQuery || rawIngredients[0] || config.he;
    const sourceQueryEn = query || requestedIngredients[0] || config.en;

    // Start all independent providers together. Slow or unavailable sources
    // return an empty list without blocking results from the others.
    const hashulchanPromise = sourceQueryHe ? withDeadline(searchHashulchan(sourceQueryHe, 14).catch(() => [] as Meal[]), [] as Meal[]) : Promise.resolve([] as Meal[]);
    const nikibPromise = sourceQueryHe ? withDeadline(searchNikib(sourceQueryHe).catch(() => [] as Meal[]), [] as Meal[]) : Promise.resolve([] as Meal[]);
    const israeliWordpressPromise = sourceQueryHe
      ? withDeadline(searchIsraeliWordpress(sourceQueryHe).catch(() => [] as Meal[]), [] as Meal[])
      : Promise.resolve([] as Meal[]);
    const bbcPromise = sourceQueryEn ? withDeadline(searchBbcGoodFood(sourceQueryEn).catch(() => [] as Meal[]), [] as Meal[]) : Promise.resolve([] as Meal[]);
    const coeliacPromise = mandatoryRestrictions.includes("gluten") && sourceQueryEn
      ? withDeadline(searchCoeliacUk(sourceQueryEn).catch(() => [] as Meal[]), [] as Meal[])
      : Promise.resolve([] as Meal[]);
    const dairyFreePromise = dairyRequested && sourceQueryEn
      ? withDeadline(searchGoDairyFree(sourceQueryEn).catch(() => [] as Meal[]), [] as Meal[])
      : Promise.resolve([] as Meal[]);
    const supplementalQueries = rawQuery
      ? [`${rawQuery} ${config.he}`].map((value) => value.trim()).filter((value) => value !== sourceQueryHe)
      : [];
    const supplementalPromise = Promise.all(supplementalQueries.map(async (supplementalQuery) => {
      const [wordpressExtra, hashulchanExtra] = await Promise.all([
        withDeadline(searchIsraeliWordpress(supplementalQuery).catch(() => [] as Meal[]), [] as Meal[]),
        withDeadline(searchHashulchan(supplementalQuery, 10).catch(() => [] as Meal[]), [] as Meal[]),
      ]);
      return [...wordpressExtra, ...hashulchanExtra];
    })).then((groups) => groups.flat());
    const summaries = new Map<string, Meal>();
    const candidateScores = new Map<string, number>();

    if (query) {
      const byName = await safeGetJson(`${API}/search.php?s=${encodeURIComponent(query)}`);
      for (const meal of byName.meals ?? []) {
        summaries.set(meal.idMeal, meal);
        candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 2);
      }

      // The free-text request is a strict requirement, not merely a ranking hint.
      // Search every meaningful request word as an ingredient as well, so recipes
      // where it appears only in the ingredient list are still considered.
      const strictTerms = requiredQueryTerms(query);
      const termResults = await Promise.all(strictTerms.map((term) =>
        safeGetJson(`${API}/filter.php?i=${encodeURIComponent(term)}`),
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
        const payload = await safeGetJson(`${API}/filter.php?i=${encodeURIComponent(normalized)}`);
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
        const payload = await safeGetJson(`${API}/filter.php?c=${encodeURIComponent(category)}`);
        for (const meal of (payload.meals ?? []).slice(0, 12)) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 1);
        }
      }
      for (const term of config.terms ?? []) {
        const payload = await safeGetJson(`${API}/search.php?s=${encodeURIComponent(term)}`);
        for (const meal of payload.meals ?? []) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, (candidateScores.get(meal.idMeal) ?? 0) + 5);
        }
      }
    }

    if (!summaries.size) {
      for (const category of config.categories ?? []) {
        const payload = await safeGetJson(`${API}/filter.php?c=${encodeURIComponent(category)}`);
        for (const meal of (payload.meals ?? []).slice(0, 8)) {
          summaries.set(meal.idMeal, meal);
          candidateScores.set(meal.idMeal, 1);
        }
      }
      for (const term of config.terms ?? []) {
        const payload = await safeGetJson(`${API}/search.php?s=${encodeURIComponent(term)}`);
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
        meal.strInstructions ? Promise.resolve(meal) : lookup(meal.idMeal).catch(() => null),
      ),
    );

    const complete = details.filter((meal): meal is Meal => Boolean(meal));
    const strictQueryTerms = query ? requiredQueryTerms(query) : [];
    const typedResults = complete.filter((meal) =>
      matchesRequestedType(meal, type) && mealMatchesRequiredTerms(meal, strictQueryTerms),
    );
    const hebrewSourceTerms = rawQuery ? requiredSourceTerms(rawQuery) : [];
    const englishSourceTerms = rawQuery ? strictQueryTerms : [];
    const [hashulchanRaw, nikibRaw, israeliWordpressRaw, bbcRaw, coeliacRaw, dairyFreeRaw, supplementalRaw] = await Promise.all([
      hashulchanPromise, nikibPromise, israeliWordpressPromise, bbcPromise, coeliacPromise, dairyFreePromise, supplementalPromise,
    ]);
    const filterSource = (meals: Meal[], terms: string[]) => meals.filter((meal) =>
      matchesRequestedType(meal, type) && mealMatchesRequiredTerms(meal, terms),
    );
    const hashulchanResults = filterSource(hashulchanRaw, hebrewSourceTerms);
    const nikibResults = filterSource(nikibRaw, hebrewSourceTerms);
    const bbcResults = filterSource(bbcRaw, englishSourceTerms);
    const coeliacResults = filterSource(coeliacRaw, englishSourceTerms);
    const dairyFreeResults = filterSource(dairyFreeRaw, englishSourceTerms);
    const webResults = filterSource(israeliWordpressRaw, hebrewSourceTerms);
    const supplementalResults = filterSource(supplementalRaw, hebrewSourceTerms);
    const allCandidates = [...hashulchanResults, ...nikibResults, ...bbcResults, ...coeliacResults, ...dairyFreeResults, ...webResults, ...supplementalResults, ...typedResults];
    const ingredientMatches: Record<string, number> = {};
    const recordIngredientMatches = (meals: Meal[]) => meals.forEach((meal) => {
        const names = normalizeSearchText(Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "").join(" "));
        ingredientMatches[meal.idMeal] = rawIngredients.reduce((count, ingredient, index) => {
          const alternatives = [ingredient, requestedIngredients[index] ?? ""].map(normalizeSearchText).filter(Boolean);
          const found = alternatives.some((term) => {
            const core = term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term;
            return names.includes(term) || names.includes(core);
          });
          return count + (found ? 1 : 0);
        }, 0);
      });
    recordIngredientMatches(allCandidates);
    const violatesRestriction = (meal: Meal, key: string) => {
      const names = Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`] ?? "");
      if (key === "gluten") {
        if (meal.strGlutenFreeSource === "true") return false;
        return names.some((name) => {
        if (/gluten[- ]?free flour|almond flour|coconut flour|rice flour|corn flour|cornstarch|tamari|קמח ללא גלוטן|קמח שקדים|קמח קוקוס|קמח אורז|קמח תירס|קורנפלור|טמארי/i.test(name)) return false;
        return /flour|wheat|bread|breadcrumbs|pasta|spaghetti|noodle|couscous|barley|semolina|soy sauce|tortilla|cracker|pastry|phyllo|filo|puff pastry|קמח|חיטה|לחם|פירורי לחם|פסטה|אטריות|קוסקוס|שעורה|סולת|רוטב סויה|טורטייה|פילו|בצק עלים/i.test(name);
        });
      }
      if (key === "dairy") {
        if (meal.strDairyFreeSource === "true") return false;
        return names.some((name) => {
          if (/dairy[- ]?free|non[- ]?dairy|plant[- ]?based (?:milk|cream|cheese|butter)|חלב צמחי|ללא חלב|ללא לקטוז/i.test(name)) return false;
          return /milk|cheese|butter|cream|yogurt|whey|casein|mascarpone|mozzarella|parmesan|cheddar|feta|ricotta|חלב|גבינ|חמאה|שמנת|יוגורט|קזאין|מסקרפונה|מוצרלה|פרמזן|פטה|ריקוטה/i.test(name);
        });
      }
      return names.some((name) => /sugar|honey|syrup|flour|bread|rice|potato|pasta|noodle|couscous|corn|beans|lentil|oats|barley|chocolate|סוכר|דבש|סירופ|קמח|לחם|אורז|תפוח אדמה|פסטה|אטריות|קוסקוס|תירס|שעועית|עדשים|שיבולת שועל|שעורה|שוקולד/i.test(name));
    };
    const glutenExplicit = (meal: Meal) => meal.strGlutenFreeSource === "true" || /ללא גלוטן|gluten[- ]?free|coeliac/i.test(`${meal.strTags ?? ""} ${meal.strMeal}`);
    const finalizeCandidates = (candidates: Meal[]) => candidates
        .filter((meal) => mandatoryRestrictions.every((key) => !violatesRestriction(meal, key)))
        .filter((meal) => !mandatoryRestrictions.includes("gluten") || glutenExplicit(meal))
        .filter((meal) => !rawIngredients.length || rawQuery || (ingredientMatches[meal.idMeal] ?? 0) > 0)
        .filter((meal, index, list) => list.findIndex((candidate) => normalizeSearchText(candidate.strMeal) === normalizeSearchText(meal.strMeal)) === index)
        .sort((a, b) => {
        if (rawIngredients.length) {
          const byIngredients = (ingredientMatches[b.idMeal] ?? 0) - (ingredientMatches[a.idMeal] ?? 0);
          if (byIngredients) return byIngredients;
        }
        const sourcePriority = (meal: Meal) => {
          if (mandatoryRestrictions.includes("gluten") && meal.strGlutenFreeSource === "true") return 4;
          if (dairyRequested && meal.strDairyFreeSource === "true") return 4;
          if (meal.strProvider === "השולחן" || meal.strProvider === "ניקי ב") return 2;
          return 1;
        };
        const ratingScore = (meal: Meal) => {
          const count = Math.max(0, Number(meal.ratingCount ?? 0) || 0);
          const value = Math.max(0, Number(meal.ratingValue ?? 0) || 0);
          return value * 2 + Math.log10(count + 1) * 3;
        };
        const byRating = ratingScore(b) - ratingScore(a);
        if (byRating) return byRating;
        const bySource = sourcePriority(b) - sourcePriority(a);
        if (bySource) return bySource;
        return b.strMeal.localeCompare(a.strMeal, "he");
      });
    const combined = finalizeCandidates(allCandidates);

    return Response.json(
      {
        meals: combined.slice(0, 10),
        query: query || null,
        requiredQueryTerms: strictQueryTerms,
        requestedIngredients,
        ingredientMatches,
        provider: "חיפוש אינטרנטי רחב + השולחן + ניקי ב + BBC Good Food + Coeliac UK + Go Dairy Free + TheMealDB",
        sourceCounts: {
          hashulchan: hashulchanResults.length, nikib: nikibResults.length, bbcGoodFood: bbcResults.length,
          coeliacUk: coeliacResults.length, goDairyFree: dairyFreeResults.length, web: webResults.length,
          supplemental: supplementalResults.length, themealdb: typedResults.length,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch {
    return Response.json(
      { error: "לא הצלחנו להגיע למאגר המתכונים. נסה שוב בעוד רגע." },
      { status: 502 },
    );
  }
}
