"use client";

import {
  AlertTriangle, BookOpen, Check, ChevronLeft, Clock3, ExternalLink,
  FileSpreadsheet, Fish, Heart, LoaderCircle, Minus, Plus, Printer,
  Search, ShoppingBasket, Sparkles, UtensilsCrossed,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Meal = Record<string, string | null> & {
  idMeal: string; strMeal: string; strMealThumb: string; strInstructions: string;
};
type RestrictionMode = "off" | "preference" | "strict";
type RestrictionKey = "gluten" | "dairy" | "lowcarb";
type FormState = {
  type: string; query: string; language: string; servings: number; maxTime: string;
  ingredients: string[];
  restrictions: Record<RestrictionKey, RestrictionMode>;
};
type Ingredient = {
  originalName: string; hebrewName: string; measure: string; scaledMeasure: string; department: string;
};

const recipeTypes = [
  { value: "cakes", label: "עוגות", icon: "🎂" },
  { value: "savory_bake", label: "מאפה מלוח", icon: "🥐" },
  { value: "sweet_bake", label: "מאפה מתוק", icon: "🍰" },
  { value: "meat", label: "בשר", icon: "🥩" },
  { value: "fish", label: "דגים", icon: "🐟" },
  { value: "quiche_savory", label: "קיש או פשטידה מלוחה", icon: "🥧" },
  { value: "pie_sweet", label: "פשטידה או טארט מתוק", icon: "🍮" },
];
const ingredientSuggestions = ["קמח", "ביצים", "גבינה", "עגבניות", "קישואים", "תרד", "שמנת", "עוף"];
const languages = [
  ["he", "עברית"], ["en", "אנגלית"], ["fr", "צרפתית"], ["it", "איטלקית"],
  ["es", "ספרדית"], ["de", "גרמנית"], ["ar", "ערבית"], ["ru", "רוסית"],
  ["pt", "פורטוגזית"], ["tr", "טורקית"], ["el", "יוונית"],
];
const restrictionLabels: Record<RestrictionKey, { title: string; note: string }> = {
  gluten: { title: "ללא גלוטן", note: "קמח, לחם, פסטה, סויה ועוד" },
  dairy: { title: "ללא מוצרי חלב", note: "חלב, גבינות, חמאה ושמנת" },
  lowcarb: { title: "דל פחמימות", note: "סוכר, דגנים, אורז ותפוחי אדמה" },
};
const triggerPatterns: Record<RestrictionKey, RegExp> = {
  gluten: /\b(flour|wheat|bread|breadcrumbs|pasta|spaghetti|noodle|couscous|barley|semolina|soy sauce|tortilla|cracker|pastry)\b/i,
  dairy: /\b(milk|cheese|butter|cream|yogurt|yoghurt|whey|mascarpone|mozzarella|parmesan|cheddar|feta|ricotta)\b/i,
  lowcarb: /\b(sugar|honey|syrup|flour|bread|rice|potato|pasta|noodle|couscous|corn|beans|lentil|oats|barley|chocolate)\b/i,
};
const defaultForm: FormState = {
  type: "fish", query: "", language: "he", servings: 4, maxTime: "", ingredients: [],
  restrictions: { gluten: "off", dairy: "off", lowcarb: "off" },
};

function mealIngredients(meal: Meal) {
  return Array.from({ length: 20 }, (_, index) => {
    const name = meal[`strIngredient${index + 1}`]?.trim() ?? "";
    const measure = meal[`strMeasure${index + 1}`]?.trim() ?? "";
    return name ? { name, measure } : null;
  }).filter((item): item is { name: string; measure: string } => Boolean(item));
}
function restrictionHits(meal: Meal, key: RestrictionKey) {
  return mealIngredients(meal).map((item) => item.name).filter((name) => triggerPatterns[key].test(name));
}
function parseNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[¼]/g, " 1/4").replace(/[½]/g, " 1/2").replace(/[¾]/g, " 3/4");
  const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = cleaned.match(/^(\d+)\/(\d+)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = cleaned.match(/^\d+(?:\.\d+)?/);
  return decimal ? Number(decimal[0]) : null;
}
function prettyNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const common: [number, string][] = [[0.25, "¼"], [0.33, "⅓"], [0.5, "½"], [0.67, "⅔"], [0.75, "¾"]];
  const found = common.find(([number]) => Math.abs(fraction - number) < 0.035);
  return found ? `${whole || ""}${found[1]}` : String(rounded);
}
function scaleMeasure(measure: string, factor: number) {
  if (!measure || Math.abs(factor - 1) < 0.001) return measure;
  const number = parseNumber(measure);
  if (number === null) return `${measure} (כפול ${prettyNumber(factor)})`;
  const numericPrefix = measure.match(/^[\d\s./¼½¾]+/)?.[0] ?? "";
  return `${prettyNumber(number * factor)}${measure.slice(numericPrefix.length)}`.trim();
}
function departmentFor(name: string) {
  if (/chicken|beef|lamb|pork|meat|turkey/i.test(name)) return "בשר ועוף";
  if (/fish|salmon|tuna|cod|shrimp|prawn|seafood/i.test(name)) return "דגים ופירות ים";
  if (/milk|cheese|butter|cream|yogurt|egg/i.test(name)) return "מקרר וביצים";
  if (/onion|garlic|tomato|pepper|carrot|lemon|lime|herb|parsley|coriander|spinach|mushroom|potato|apple|banana/i.test(name)) return "פירות וירקות";
  if (/frozen|ice/i.test(name)) return "קפואים";
  return "מזווה ותבלינים";
}
function instructionsToSteps(text: string) {
  return text.replace(/\r/g, "").split(/\n+|(?<=[.!?])\s+(?=[A-Zא-ת*])/)
    .map((step) => step.replace(/^\*+/, "").replace(/^\d{1,2}[.)]?\s+/, "").trim())
    .filter((step) => step.length > 8);
}

export default function Home() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Meal | null>(null);
  const [translatedTitle, setTranslatedTitle] = useState("");
  const [translatedInstruction, setTranslatedInstruction] = useState("");
  const [translatedIngredients, setTranslatedIngredients] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  const [originalServings, setOriginalServings] = useState(4);
  const [savedCount, setSavedCount] = useState(0);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [ingredientMatches, setIngredientMatches] = useState<Record<string, number>>({});

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("saved-recipes") || "[]") as unknown[];
    setSavedCount(saved.length);
  }, []);
  const activeRestrictions = useMemo(
    () => (Object.keys(form.restrictions) as RestrictionKey[]).filter((key) => form.restrictions[key] !== "off"),
    [form.restrictions],
  );
  const visibleMeals = useMemo(() => meals.filter((meal) => activeRestrictions.every((key) => (
    form.restrictions[key] !== "strict" || restrictionHits(meal, key).length === 0
  ))), [meals, activeRestrictions, form.restrictions]);

  async function translateBatch(texts: string[]) {
    const response = await fetch("/api/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, source: "en", target: "he" }),
    });
    if (!response.ok) throw new Error("translation failed");
    return ((await response.json()) as { translated: string[] }).translated;
  }
  async function handleSearch(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setSelected(null);
    try {
      const params = new URLSearchParams({
        type: form.type, query: form.query, language: form.language,
        ingredients: form.ingredients.join("|"),
      });
      const response = await fetch(`/api/recipes?${params}`);
      const payload = (await response.json()) as { meals?: Meal[]; error?: string; ingredientMatches?: Record<string, number> };
      if (!response.ok) throw new Error(payload.error || "החיפוש נכשל");
      const found = payload.meals ?? []; setMeals(found); setIngredientMatches(payload.ingredientMatches ?? {});
      if (!found.length) setError("לא נמצאו מתכונים מתאימים. נסה תיאור קצר יותר או קטגוריה אחרת.");
      if (found.length) {
        try {
          const translated = await translateBatch([found.map((meal) => meal.strMeal).join(" ||| ")]);
          const parts = translated[0]?.split(/\s*\|\|\|\s*/);
          if (parts?.length === found.length) setTitles(Object.fromEntries(found.map((meal, index) => [meal.idMeal, parts[index]])));
        } catch { setTitles({}); }
      }
    } catch (searchError) {
      setMeals([]); setError(searchError instanceof Error ? searchError.message : "אירעה תקלה בחיפוש");
    } finally { setLoading(false); }
  }
  function addIngredient(value = ingredientDraft) {
    const ingredient = value.trim().replace(/,$/, "");
    if (!ingredient || form.ingredients.length >= 5 || form.ingredients.some((item) => item.toLowerCase() === ingredient.toLowerCase())) return;
    setForm({ ...form, ingredients: [...form.ingredients, ingredient] });
    setIngredientDraft("");
  }
  function removeIngredient(ingredient: string) {
    setForm({ ...form, ingredients: form.ingredients.filter((item) => item !== ingredient) });
  }
  async function chooseMeal(meal: Meal) {
    setSelected(meal); setTranslatedTitle(titles[meal.idMeal] || meal.strMeal);
    setTranslatedInstruction(""); setTranslatedIngredients([]); setTranslating(true);
    setTimeout(() => document.getElementById("recipe-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const ingredients = mealIngredients(meal);
    try {
      const delimiter = " ||| ";
      const translated = await translateBatch([meal.strMeal, ingredients.map((item) => item.name).join(delimiter), meal.strInstructions]);
      setTranslatedTitle(translated[0] || meal.strMeal);
      const translatedNames = translated[1]?.split(/\s*\|\|\|\s*/);
      setTranslatedIngredients(translatedNames?.length === ingredients.length ? translatedNames : ingredients.map((item) => item.name));
      setTranslatedInstruction(translated[2] || meal.strInstructions);
    } catch {
      setTranslatedIngredients(ingredients.map((item) => item.name)); setTranslatedInstruction(meal.strInstructions);
    } finally { setTranslating(false); }
  }

  const factor = form.servings / Math.max(1, originalServings);
  const ingredientRows: Ingredient[] = selected ? mealIngredients(selected).map((item, index) => ({
    originalName: item.name, hebrewName: translatedIngredients[index] || item.name, measure: item.measure,
    scaledMeasure: scaleMeasure(item.measure, factor), department: departmentFor(item.name),
  })) : [];
  const steps = selected ? instructionsToSteps(translatedInstruction || selected.strInstructions) : [];
  const warnings = selected ? activeRestrictions.flatMap((key) => {
    const hits = restrictionHits(selected, key);
    return hits.length ? [`${restrictionLabels[key].title}: זוהו רכיבים לבדיקה — ${hits.join(", ")}`]
      : [`${restrictionLabels[key].title}: לא זוהה רכיב ברור ברשימה, אך נדרשת בדיקת תוויות וזיהום משני.`];
  }) : [];

  async function exportExcel() {
    if (!selected) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const details = XLSX.utils.aoa_to_sheet([
      ["מתכונים חכמים — סיכום"], ["שם בעברית", translatedTitle], ["שם במקור", selected.strMeal],
      ["קטגוריה", selected.strCategory || ""], ["מטבח", selected.strArea || selected.strCountry || ""],
      ["מספר סועדים", form.servings], ["מנות במתכון המקורי (לפי הזנת המשתמש)", originalServings],
      ["מוצרים שסומנו כזמינים", form.ingredients.join(", ")],
      ["מקור", selected.strSource || `https://www.themealdb.com/meal/${selected.idMeal}`],
    ]);
    const ingredientsSheet = XLSX.utils.json_to_sheet(ingredientRows.map((row) => ({
      "מחלקה": row.department, "מוצר בעברית": row.hebrewName, "שם במקור": row.originalName,
      "כמות מקורית": row.measure, "כמות מותאמת": row.scaledMeasure,
    })));
    const shoppingSheet = XLSX.utils.json_to_sheet(ingredientRows.map((row) => ({
      "מחלקה": row.department, "מוצר": row.hebrewName, "כמות לקנייה": row.scaledMeasure, "נקנה": "☐",
    })));
    const stepsSheet = XLSX.utils.json_to_sheet(steps.map((step, index) => ({ "שלב": index + 1, "הוראות": step, "בוצע": "☐" })));
    const warningsSheet = XLSX.utils.json_to_sheet(warnings.map((warning) => ({ "בדיקות ואזהרות": warning })));
    XLSX.utils.book_append_sheet(workbook, details, "פרטי מתכון"); XLSX.utils.book_append_sheet(workbook, ingredientsSheet, "מצרכים");
    XLSX.utils.book_append_sheet(workbook, shoppingSheet, "רשימת קניות"); XLSX.utils.book_append_sheet(workbook, stepsSheet, "שלבי הכנה");
    XLSX.utils.book_append_sheet(workbook, warningsSheet, "אזהרות");
    XLSX.writeFile(workbook, `${translatedTitle || "מתכון"}-${form.servings}-סועדים.xlsx`);
  }
  function saveRecipe() {
    if (!selected) return;
    const saved = JSON.parse(localStorage.getItem("saved-recipes") || "[]") as { id: string }[];
    const entry = { id: selected.idMeal, title: translatedTitle, originalTitle: selected.strMeal, servings: form.servings,
      savedAt: new Date().toISOString(), source: selected.strSource || `https://www.themealdb.com/meal/${selected.idMeal}` };
    const next = [entry, ...saved.filter((item) => item.id !== selected.idMeal)].slice(0, 30);
    localStorage.setItem("saved-recipes", JSON.stringify(next)); setSavedCount(next.length);
  }

  const groupedIngredients = ingredientRows.reduce<Record<string, Ingredient[]>>((groups, row) => {
    (groups[row.department] ||= []).push(row); return groups;
  }, {});

  return (
    <main className="min-h-screen bg-[#f7f4ec] text-[#21352d]">
      <header className="site-header no-print"><div className="brand-mark"><UtensilsCrossed size={22} /></div><div><p className="brand-name">מתכונים חכמים</p><p className="brand-subtitle">מהרעיון, דרך הקניות, ועד לצלחת</p></div><div className="saved-pill"><Heart size={16} /> {savedCount} שמורים</div></header>
      <section className="hero no-print"><div className="hero-copy"><span className="eyebrow"><Sparkles size={15} /> מתכון שמתאים בדיוק אליך</span><h1>מה מתחשק לך להכין היום?</h1><p>בחר סוג מנה, סמן רגישויות ומספר סועדים. נחפש בעולם, נתרגם לעברית ונארגן הכול לביצוע.</p></div><div className="hero-illustration" aria-hidden="true"><span className="plate">🍽️</span><span className="leaf leaf-one">🌿</span><span className="leaf leaf-two">🍋</span></div></section>

      <form onSubmit={handleSearch} className="search-panel no-print">
        <div className="section-heading"><span>1</span><div><h2>סוג המתכון</h2><p>אפשר לבחור קטגוריה ולהוסיף תיאור חופשי</p></div></div>
        <div className="type-grid">{recipeTypes.map((type) => <button key={type.value} type="button" onClick={() => setForm({ ...form, type: type.value })} className={`type-card ${form.type === type.value ? "selected" : ""}`}><b>{type.icon}</b><span>{type.label}</span>{form.type === type.value && <Check size={17} />}</button>)}</div>
        <div className="form-grid">
          <label className="field wide"><span>מה תרצה לחפש?</span><div className="input-with-icon"><Search size={18} /><input value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder="לדוגמה: סלמון בתנור, טארט תפוחים..." /></div></label>
          <label className="field"><span>שפת החיפוש</span><select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>{languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>מספר סועדים</span><div className="number-control"><button type="button" onClick={() => setForm({ ...form, servings: Math.max(1, form.servings - 1) })}><Minus size={16} /></button><strong>{form.servings}</strong><button type="button" onClick={() => setForm({ ...form, servings: Math.min(30, form.servings + 1) })}><Plus size={16} /></button></div></label>
          <label className="field"><span>זמן מרבי — העדפה</span><select value={form.maxTime} onChange={(event) => setForm({ ...form, maxTime: event.target.value })}><option value="">לא משנה</option><option value="30">עד 30 דקות</option><option value="60">עד שעה</option><option value="120">עד שעתיים</option></select></label>
        </div>
        <div className="section-heading products-title"><span>2</span><div><h2>מה יש לי בבית?</h2><p>הוסף עד חמישה מוצרים עיקריים מהמקרר או המזווה. אין צורך להוסיף מלח, שמן ותבלינים בסיסיים.</p></div></div>
        <div className="products-picker">
          <div className="product-entry">
            <input aria-label="מוצר זמין" value={ingredientDraft} onChange={(event) => setIngredientDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addIngredient(); } }} placeholder="לדוגמה: גבינת פטה, קישואים, קמח..." disabled={form.ingredients.length >= 5} />
            <button type="button" onClick={() => addIngredient()} disabled={!ingredientDraft.trim() || form.ingredients.length >= 5}><Plus size={17} /> הוסף מוצר</button>
          </div>
          <div className="selected-products">{form.ingredients.map((ingredient) => <span key={ingredient}>{ingredient}<button type="button" aria-label={`הסר ${ingredient}`} onClick={() => removeIngredient(ingredient)}>×</button></span>)}{!form.ingredients.length && <small>עדיין לא נבחרו מוצרים — אפשר לחפש גם לפי סוג המתכון בלבד.</small>}</div>
          <div className="suggestion-row"><b>הוספה מהירה:</b>{ingredientSuggestions.map((ingredient) => <button type="button" key={ingredient} disabled={form.ingredients.includes(ingredient) || form.ingredients.length >= 5} onClick={() => addIngredient(ingredient)}>{ingredient}</button>)}</div>
        </div>
        <div className="section-heading restrictions-title"><span>3</span><div><h2>העדפות ורגישויות</h2><p>רגישות מחמירה מסננת רכיבים ברורים, אך אינה מחליפה בדיקה רפואית</p></div></div>
        <div className="restriction-grid">{(Object.keys(restrictionLabels) as RestrictionKey[]).map((key) => <div className={`restriction-card ${form.restrictions[key] !== "off" ? "active" : ""}`} key={key}><div><b>{restrictionLabels[key].title}</b><small>{restrictionLabels[key].note}</small></div><select aria-label={`רמת ${restrictionLabels[key].title}`} value={form.restrictions[key]} onChange={(event) => setForm({ ...form, restrictions: { ...form.restrictions, [key]: event.target.value as RestrictionMode } })}><option value="off">לא נדרש</option><option value="preference">העדפה</option><option value="strict">רגישות / אלרגיה</option></select></div>)}</div>
        <button className="primary-button" disabled={loading} type="submit">{loading ? <LoaderCircle className="spin" size={19} /> : <Search size={19} />}{loading ? "מחפש ומתאים..." : "מצא מתכונים לפי הבחירות"}</button>
      </form>

      <section className="results-section no-print" aria-live="polite">
        {error && <div className="error-banner"><AlertTriangle size={20} />{error}</div>}
        {meals.length > 0 && <div className="results-head"><div><span className="eyebrow">תוצאות מהעולם</span><h2>מצאנו {visibleMeals.length} מתכונים לבדיקה</h2></div><p>הכותרות תורגמו אוטומטית. תמיד בדוק את המקור.</p></div>}
        <div className="recipe-grid">{visibleMeals.map((meal) => { const hits = activeRestrictions.flatMap((key) => restrictionHits(meal, key)); return <article className="recipe-card" key={meal.idMeal}><div className="recipe-image"><img src={meal.strMealThumb} alt="" /><span>{meal.strArea || meal.strCountry || "מטבח עולמי"}</span></div><div className="recipe-card-body"><p className="source-title">{meal.strMeal}</p><h3>{titles[meal.idMeal] || meal.strMeal}</h3><div className="meta-row"><span><BookOpen size={14} />{meal.strCategory || "מתכון"}</span><span><Clock3 size={14} />זמן לא צוין</span></div>{form.ingredients.length > 0 && <div className="match-note"><ShoppingBasket size={14} /> נמצאו {ingredientMatches[meal.idMeal] ?? 0} מתוך {form.ingredients.length} המוצרים שסימנת</div>}{activeRestrictions.length > 0 && <div className={`safety-note ${hits.length ? "warning" : "ok"}`}>{hits.length ? `נדרשת בדיקה: ${hits.slice(0, 2).join(", ")}` : "לא זוהה רכיב בעייתי ברור"}</div>}<button onClick={() => chooseMeal(meal)}>בחר והתאם <ChevronLeft size={17} /></button></div></article>; })}</div>
        {meals.length > 0 && visibleMeals.length === 0 && <div className="empty-state"><Fish size={32} /><h3>כל התוצאות סוננו בגלל רגישות מחמירה</h3><p>נסה חיפוש אחר או שנה רגישות ל״העדפה״ כדי לראות מתכונים עם אזהרות.</p></div>}
      </section>

      {selected && <section id="recipe-workspace" className="recipe-workspace">
        <div className="report-hero"><img src={selected.strMealThumb} alt="" /><div><span className="eyebrow">המתכון שבחרת</span><p className="source-title">{selected.strMeal}</p><h2>{translatedTitle || selected.strMeal}</h2><div className="meta-row"><span><BookOpen size={15} />{selected.strCategory}</span><span><UtensilsCrossed size={15} />ל־{form.servings} סועדים</span></div></div></div>
        {translating && <div className="translation-status no-print"><LoaderCircle className="spin" size={18} />מתרגם את המתכון לעברית...</div>}
        <div className="adjust-bar no-print"><div><b>התאמת כמויות</b><small>מאגר המקור אינו מציין מספר מנות. הזן את מספר המנות המקורי לפי שיקול דעתך.</small></div><label>מנות במקור <input type="number" min="1" max="30" value={originalServings} onChange={(event) => setOriginalServings(Math.max(1, Number(event.target.value)))} /></label><span className="factor-pill">מקדם ×{prettyNumber(factor)}</span></div>
        {warnings.length > 0 && <div className="warning-box"><AlertTriangle size={21} /><div><b>בדיקות בטיחות</b>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
        <div className="report-columns"><section className="ingredients-panel"><div className="panel-title"><ShoppingBasket size={20} /><h3>מצרכים ורשימת קניות</h3></div>{Object.entries(groupedIngredients).map(([department, rows]) => <div className="department" key={department}><h4>{department}</h4>{rows.map((row, index) => <label className="ingredient-row" key={`${row.originalName}-${index}`}><input type="checkbox" /><span><b>{row.hebrewName}</b><small>{row.originalName}</small></span><em>{row.scaledMeasure || "לפי הצורך"}</em></label>)}</div>)}</section><section className="steps-panel"><div className="panel-title"><UtensilsCrossed size={20} /><h3>אופן ההכנה</h3></div>{steps.map((step, index) => <div className="step" key={`${index}-${step.slice(0, 20)}`}><span>{index + 1}</span><p>{step}</p></div>)}</section></div>
        <div className="source-box"><b>מקור ושקיפות</b><p>המתכון הגיע מ־TheMealDB ותורגם אוטומטית. הכמויות הותאמו מתמטית; באפייה, זמני הכנה וגודל תבנית עשויים לדרוש התאמה ידנית.</p><a href={selected.strSource || `https://www.themealdb.com/meal/${selected.idMeal}`} target="_blank" rel="noreferrer">פתח את המקור <ExternalLink size={14} /></a></div>
        <div className="action-bar no-print"><button className="secondary-button" onClick={saveRecipe}><Heart size={18} />שמור במאגר שלי</button><button className="secondary-button" onClick={() => window.print()}><Printer size={18} />דוח PDF / הדפסה</button><button className="excel-button" onClick={exportExcel}><FileSpreadsheet size={18} />הורד Excel</button></div>
      </section>}
      <footer className="no-print"><span><Sparkles size={15} /> מתכונים חכמים</span><p>המידע מיועד לתכנון קולינרי. במקרה של אלרגיה יש לבדוק תוויות, סביבת ייצור וזיהום משני.</p><a href="https://www.themealdb.com/api.php" target="_blank" rel="noreferrer">Recipe data by TheMealDB</a></footer>
    </main>
  );
}
