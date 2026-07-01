// ============================================================
// ai.js — Gemini AI for meal plan generation & optimization
// ============================================================

const GEMINI_PROXY_URL = 'https://tqasuwcnzfxjkthmjooz.supabase.co/functions/v1/quick-endpoint';
const AI_COOLDOWN_MS = 30 * 1000; // 30 δευτερόλεπτα
const AI_LAST_CALL_KEY = 'vivon_ai_last_call';

async function _checkRateLimit() {
  const user = sbGetCurrentUser();
  let last = 0;

  // Prefer server-side timestamp (user-scoped, not bypassable via DevTools)
  if (user) {
    const serverLast = await sbGetAILastCall(user.id);
    if (serverLast !== null) {
      last = serverLast;
    } else {
      // Fall back to localStorage if server returned nothing (first call ever)
      last = parseInt(localStorage.getItem(AI_LAST_CALL_KEY) || '0', 10);
    }
  } else {
    last = parseInt(localStorage.getItem(AI_LAST_CALL_KEY) || '0', 10);
  }

  const elapsed = Date.now() - last;
  if (elapsed < AI_COOLDOWN_MS) {
    const remaining = Math.ceil((AI_COOLDOWN_MS - elapsed) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    throw new Error(`Περίμενε ${mins}:${String(secs).padStart(2,'0')} λεπτά πριν την επόμενη βελτιστοποίηση`);
  }

  // Record the call before making the AI request — prevents double-calls if
  // the caller doesn't await and fires again during the in-flight request.
  const now = Date.now().toString();
  localStorage.setItem(AI_LAST_CALL_KEY, now);
  if (user) await sbSetAILastCall(user.id);
}

// ── Shared helpers ──────────────────────────────────────────

function _buildRecipesByType() {
  const map = {};
  RECIPES_DB.forEach(r => {
    if (!map[r.meal]) map[r.meal] = [];
    map[r.meal].push({ id: r.id, name: r.name });
  });
  return map;
}

function _buildRecipeGroups() {
  const groups = {};
  RECIPES_DB.forEach(r => {
    const cats = new Set();
    r.ingredients.forEach(ing => {
      const food = FOODS_DB.find(f => f.id === ing.foodId);
      if (food) cats.add(food.category);
    });
    groups[r.id] = {
      name: r.meal_type || r.meal,
      meal: r.meal,
      hasYogurt: r.ingredients.some(i => i.foodId === 'd1'),
      categories: [...cats],
    };
  });
  return groups;
}

function _applyAIWeek(optimized) {
  const mealTimes = getMealTimes();
  const typeToTime = {
    breakfast: mealTimes.breakfast,
    snack:     mealTimes.snack,
    lunch:     mealTimes.lunch,
    afternoon: mealTimes.afternoon,
    dinner:    mealTimes.dinner,
  };
  const waterNotes = [
    "Πιες 500ml νερό 💧 — Σύνολο ως τώρα: 0.5L",
    "Πιες 500ml νερό 💧 — Σύνολο ως τώρα: 1.0L",
    "Πιες 500ml νερό 💧 — Σύνολο ως τώρα: 1.5L",
    "Πιες 500ml νερό 💧 — Σύνολο ως τώρα: 2.0L",
    "Πιες 1L νερό 💧 — Στόχος: 3L ✅",
  ];

  optimized.forEach((optDay, di) => {
    if (!state.week[di]) return;
    optDay.meals.forEach((optMeal, mi) => {
      const recipe = RECIPES_DB.find(r => r.id === optMeal.recipeId);
      if (!recipe) return;
      if (!state.week[di].meals[mi]) return;
      const m = state.week[di].meals[mi];
      m.recipeId    = optMeal.recipeId;
      m.type        = optMeal.type;
      m.time        = typeToTime[optMeal.type] || m.time;
      m.waterNote   = waterNotes[mi] || m.waterNote;
      m.done        = false;
      m.scaleFactor = undefined;
    });
  });
}

async function _callGemini(prompt) {
  const response = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ prompt })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  if (data.error) {
    const code = data.error.code;
    if (code === 429) throw new Error('Το AI όριο χρήσης εξαντλήθηκε. Δοκίμασε αύριο ή αναβάθμισε το Gemini API plan.');
    throw new Error(data.error.message || `Gemini error ${code}`);
  }
  const rawText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '')
    .replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Δεν βρέθηκε έγκυρο JSON στην απάντηση');
  const result = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(result) || result.length !== 7) throw new Error('Αναμενόταν 7 ημέρες');
  return result;
}

// ── Estimate nutrition for a food/recipe with AI ────────────

async function _callGeminiObject(prompt) {
  const response = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ prompt })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  const rawText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '')
    .replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Δεν βρέθηκε έγκυρο JSON στην απάντηση');
  return JSON.parse(jsonMatch[0]);
}

async function estimateFoodCaloriesWithAI(foodName, unit) {
  const btn = document.getElementById('ai-estimate-food-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    const per = unit === 'τεμ' ? 'ανά τεμάχιο' : 'ανά 100' + (unit || 'g');
    const result = await _callGeminiObject(
      `Είσαι διατροφολόγος. Εκτίμησε τα μακροθρεπτικά του τροφίμου "${foodName}" ${per}.\n` +
      `Επίστρεψε ΜΟΝΟ JSON object χωρίς markdown:\n{"kcal": <number>, "p": <number>, "c": <number>, "f": <number>}`
    );
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = Math.round(val * 10) / 10; };
    set('nf-kcal', result.kcal ?? 0);
    set('nf-p',    result.p    ?? 0);
    set('nf-c',    result.c    ?? 0);
    set('nf-f',    result.f    ?? 0);
    showToast('✅ AI εκτίμηση θερμίδων!');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Σφάλμα AI'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ AI'; }
  }
}

async function estimateRecipeCaloriesWithAI(recipeName) {
  const btn = document.getElementById('ai-estimate-recipe-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    const result = await _callGeminiObject(
      `Είσαι διατροφολόγος. Εκτίμησε τα μακροθρεπτικά της συνταγής/γεύματος "${recipeName}" για μία μερίδα.\n` +
      `Επίστρεψε ΜΟΝΟ JSON object χωρίς markdown:\n{"kcal": <number>, "p": <number>, "c": <number>, "f": <number>}`
    );
    ['kcal','p','c','f'].forEach(k => {
      const el = document.getElementById('nr-' + k);
      if (el) el.value = Math.round((result[k] ?? 0) * 10) / 10;
    });
    showToast('✅ AI εκτίμηση θερμίδων!');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Σφάλμα AI'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ AI'; }
  }
}

const _RULES = `ΚΑΝΟΝΕΣ:
1. Αν πρωινό hasYogurt:true → βραδινό ΚΑΙ σνακ ΔΕΝ πρέπει να έχουν hasYogurt:true
2. Μέγιστη επανάληψη ίδιου recipeId: 2 φορές σε ΟΛΗ την εβδομάδα
3. Ποικιλία protein: μην επαναλαμβάνεις κοτόπουλο >3 ημέρες
4. Κάθε γεύμα να παραμένει στο σωστό meal type (breakfast→breakfast, snack→snack, κλπ)
5. Κάθε ημέρα έχει ακριβώς 5 γεύματα: breakfast, snack, lunch, afternoon, dinner`;

const _FORMAT = `Επίστρεψε ΜΟΝΟ JSON array, χωρίς markdown, χωρίς εξήγηση:
[
  { "day": 1, "meals": [
    { "type": "breakfast", "recipeId": "rXX" },
    { "type": "snack",     "recipeId": "rXX" },
    { "type": "lunch",     "recipeId": "rXX" },
    { "type": "afternoon", "recipeId": "rXX" },
    { "type": "dinner",    "recipeId": "rXX" }
  ]},
  ... (7 ημέρες συνολικά)
]`;

// ── Optimize existing plan ───────────────────────────────────

async function optimizeWeekWithAI() {
  const btns = [
    document.getElementById('ai-optimize-btn'),
    document.getElementById('ai-optimize-btn-settings'),
  ].filter(Boolean);
  btns.forEach(b => { b.disabled = true; b.innerHTML = '⏳ Βελτιστοποίηση...'; });

  try {
    await _checkRateLimit();
    const recipesByType = _buildRecipesByType();
    const recipeGroups  = _buildRecipeGroups();

    const currentWeek = state.week.map(day => ({
      day: day.day,
      meals: day.meals.map(m => {
        const r = RECIPES_DB.find(x => x.id === m.recipeId);
        return { type: m.type, recipeId: m.recipeId, name: r ? r.name : m.recipeId };
      })
    }));

    const prompt = `Είσαι διατροφολόγος AI. Βελτιστοποίησε το παρακάτω εβδομαδιαίο πλάνο.

${_RULES}

ΔΙΑΘΕΣΙΜΕΣ ΣΥΝΤΑΓΕΣ:
breakfast: ${JSON.stringify(recipesByType['breakfast'] || [])}
snack: ${JSON.stringify(recipesByType['snack'] || [])}
lunch: ${JSON.stringify(recipesByType['lunch'] || [])}
afternoon: ${JSON.stringify(recipesByType['snack'] || [])}
dinner: ${JSON.stringify(recipesByType['dinner'] || [])}

ΠΛΗΡΟΦΟΡΙΕΣ ΣΥΝΤΑΓΩΝ:
${JSON.stringify(recipeGroups)}

ΤΡΕΧΟΝ ΠΛΑΝΟ (άλλαξε μόνο ό,τι χρειάζεται):
${JSON.stringify(currentWeek)}

${_FORMAT}`;

    const optimized = await _callGemini(prompt);
    _applyAIWeek(optimized);
    saveState();
    renderWeek();
    showToast('✅ Το πλάνο βελτιστοποιήθηκε με AI!');

  } catch (e) {
    console.error('AI optimize error:', e);
    showToast('❌ ' + (e.message || 'Σφάλμα AI'));
  } finally {
    const b1 = document.getElementById('ai-optimize-btn');
    const b2 = document.getElementById('ai-optimize-btn-settings');
    if (b1) { b1.disabled = false; b1.innerHTML = '✨ AI'; }
    if (b2) { b2.disabled = false; b2.innerHTML = '✨ Βελτιστοποίηση με AI'; }
  }
}

// ── Generate brand-new plan from settings ───────────────────

async function generateWeekWithAI() {
  const btn = document.getElementById('ai-generate-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Δημιουργία...'; }

  try {
    await _checkRateLimit();
    const recipesByType = _buildRecipesByType();
    const recipeGroups  = _buildRecipeGroups();
    const g = state.goals;
    const p = state.profile;

    const prompt = `Είσαι διατροφολόγος AI. Δημιούργησε εβδομαδιαίο πλάνο 7 ημερών από την αρχή.

ΣΤΟΧΟΙ ΧΡΗΣΤΗ:
- Θερμίδες/ημέρα: ${g.kcal} kcal
- Πρωτεΐνη: ${g.protein}g
- Υδατάνθρακες: ${g.carbs}g
- Λίπος: ${g.fat}g
- Βάρος: ${p.weight}kg, Ύψος: ${p.height}cm, Ηλικία: ${p.age}

${_RULES}

ΔΙΑΘΕΣΙΜΕΣ ΣΥΝΤΑΓΕΣ:
breakfast: ${JSON.stringify(recipesByType['breakfast'] || [])}
snack: ${JSON.stringify(recipesByType['snack'] || [])}
lunch: ${JSON.stringify(recipesByType['lunch'] || [])}
afternoon: ${JSON.stringify(recipesByType['snack'] || [])}
dinner: ${JSON.stringify(recipesByType['dinner'] || [])}

ΠΛΗΡΟΦΟΡΙΕΣ ΣΥΝΤΑΓΩΝ (hasYogurt, categories, meal type):
${JSON.stringify(recipeGroups)}

Επίλεξε συνταγές που μαζί πλησιάζουν τον ημερήσιο στόχο θερμίδων και μακροθρεπτικών.

${_FORMAT}`;

    const generated = await _callGemini(prompt);
    _applyAIWeek(generated);
    state.programCreated = true;
    saveState();
    navigateTo('today');
    showToast('✅ Το εβδομαδιαίο πλάνο δημιουργήθηκε επιτυχώς!', 4000);

  } catch (e) {
    console.error('AI generate error:', e);
    showToast('❌ ' + (e.message || 'Σφάλμα AI'));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✨ Δημιουργία Πλάνου με AI'; }
  }
}
