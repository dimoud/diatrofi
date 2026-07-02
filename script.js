// ============================================================
// script.js — Main application logic
// ============================================================

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── STATE ──
let state = {
  profile: { ...DEFAULT_PROFILE },
  goals: { ...DEFAULT_GOALS },
  week: JSON.parse(JSON.stringify(EMPTY_WEEK)),
  weekCreatedAt: Date.now(),
  currentDay: 0,
  programCreated: false,
  planCreated: false,
  planStartDate: null,
  supplements: JSON.parse(JSON.stringify(SUPPLEMENTS_STATE_DEFAULT)),
  favorites: [],
  customFoods: [],
  customRecipes: [],
  dayTemplates: [],
  activeTab: 'today',
  optimizeMode: 1,
  bodyLog: [],
  wizardExcluded: {},
  wizardStyle: 'simple',
};

// ── MEAL TIME HELPER ──
// Επιστρέφει ώρες γευμάτων — υποστηρίζει ατομικές ώρες ανά γεύμα ή αυτόματη κατανομή από firstMealTime
function getMealTimes() {
  const p = state.profile || {};
  const mt = p.mealTimes || {};
  const first = p.firstMealTime || '08:00';
  const [h, m] = first.split(':').map(Number);
  const addMins = (mins) => {
    const total = h * 60 + m + mins;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };
  return {
    breakfast: mt.breakfast || first,
    snack:     mt.snack     || addMins(3 * 60),
    lunch:     mt.lunch     || addMins(5 * 60),
    afternoon: mt.afternoon || addMins(8 * 60),
    dinner:    mt.dinner    || addMins(11 * 60),
  };
}

// ── PERSISTENCE (localStorage cache + Supabase cloud) ──

let _saveTimer = null;

function saveState() {
  // Fast local cache for instant UI on reload — stamped with userId for ownership check
  try {
    const user = sbGetCurrentUser();
    const cacheEntry = user ? { ...state, _userId: user.id } : state;
    localStorage.setItem('nutriApp_v2', JSON.stringify(cacheEntry));
  } catch(e) {}
  // Debounced cloud save (1.5 s after last change)
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(syncToSupabase, 1500);
}

// Tracks the user id that initiated the current sync.
// Set to null on sign-out so in-flight syncs abort before writing.
let _syncOwner = null;

async function syncToSupabase() {
  const user = sbGetCurrentUser();
  if (!user) return;
  const syncUserId = user.id;
  _syncOwner = syncUserId;
  const snap = JSON.parse(JSON.stringify(state));
  const weekKey = getISOWeekKey();
  try {
    await Promise.all([
      sbSaveProfile(syncUserId, snap.profile),
      sbSaveGoals(syncUserId, snap.goals),
      sbSaveWeekPlan(syncUserId, weekKey, snap.week),
      sbSaveBodyLog(syncUserId, snap.bodyLog),
      sbSaveSupplements(syncUserId, snap.supplements),
      sbSaveCustomFoods(syncUserId, snap.customFoods),
      sbSaveCustomRecipes(syncUserId, snap.customRecipes),
      sbSaveUserState(syncUserId, {
        favorites:      snap.favorites,
        dayTemplates:   snap.dayTemplates,
        optimizeMode:   snap.optimizeMode,
        activeTab:      snap.activeTab,
        planCreated:    snap.planCreated,
        planStartDate:  snap.planStartDate,
        wizardExcluded: snap.wizardExcluded,
        wizardStyle:    snap.wizardStyle,
      }),
    ]);
    // After all awaits: verify the user hasn't changed during the async writes.
    // If it has, the data was written under the correct userId snapshot so it's
    // safe — but log a warning for debugging.
    if (_syncOwner !== syncUserId) {
      console.warn('syncToSupabase: user changed during sync — data written for', syncUserId);
    }
  } catch(e) {
    console.error('Supabase sync error:', e);
  }
}

let _isNewUser = false;

function _freshState() {
  return {
    profile: { ...DEFAULT_PROFILE },
    goals: { ...DEFAULT_GOALS },
    week: JSON.parse(JSON.stringify(EMPTY_WEEK)),
    weekCreatedAt: Date.now(),
    currentDay: 0,
    programCreated: false,
    planCreated: false,
    planStartDate: null,
    supplements: JSON.parse(JSON.stringify(SUPPLEMENTS_STATE_DEFAULT)),
    favorites: [],
    customFoods: [],
    customRecipes: [],
    dayTemplates: [],
    activeTab: 'today',
    optimizeMode: 1,
    bodyLog: [],
    wizardExcluded: {},
    wizardStyle: 'simple',
  };
}

async function loadState() {
  // Always start from a clean slate to prevent data bleed between users
  state = _freshState();
  const defaults = _freshState();

  // Use live session to avoid race where _currentUser hasn't been set yet
  let user = sbGetCurrentUser();
  if (!user) {
    try {
      const { data: { session } } = await _supabase.auth.getSession();
      user = session ? session.user : null;
    } catch(e) {}
  }

  // 1. Load from localStorage — only if cache belongs to this exact user
  let hasLocal = false;
  if (user) {
    try {
      const raw = localStorage.getItem('nutriApp_v2');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved._userId === user.id) {
          hasLocal = true;
          state = {
            ...defaults,
            ...saved,
            profile: { ...defaults.profile, ...(saved.profile || {}) },
            goals:   { ...defaults.goals,   ...(saved.goals   || {}) },
          };
        } else {
          // Stale cache from a different user — discard immediately
          try { localStorage.removeItem('nutriApp_v2'); } catch(e) {}
        }
      }
    } catch(e) {}
  }

  // 2. Fetch from Supabase (source of truth) and overwrite
  if (user) {
    try {
      const cloud = await sbLoadUserData(user.id);
      if (cloud && Object.keys(cloud).length > 0) {
        state = {
          ...defaults,
          ...cloud,
          profile: { ...defaults.profile, ...(cloud.profile || {}) },
          goals:   { ...defaults.goals,   ...(cloud.goals   || {}) },
        };
        // Stamp cache with userId so a future login can validate ownership
        try { localStorage.setItem('nutriApp_v2', JSON.stringify({ ...state, _userId: user.id })); } catch(e) {}
      } else if (!hasLocal) {
        // No data in cloud and no local cache → brand new user
        _isNewUser = true;
      }
    } catch(e) {
      console.error('Failed to load from Supabase:', e);
    }
  }
  // Migrate old activity multipliers → sessions/week integers
  if (state.profile && state.profile.activity) {
    const a = state.profile.activity;
    // Only migrate if it's a float (old format), not already an integer sessions value
    if (a > 1) {
      const oldToNew = { 1.15: 0, 1.20: 0, 1.25: 2, 1.35: 3, 1.45: 5, 1.50: 3, 1.55: 7, 1.65: 5, 1.80: 7 };
      const remapped = oldToNew[parseFloat(a.toFixed(2))];
      if (remapped !== undefined) state.profile.activity = remapped;
    }
  }

  // Migrate 16:00 snack → afternoon
  if (state.week) {
    state.week.forEach(day => {
      if (day.meals) day.meals.forEach(m => {
        if (m.type === 'snack' && m.time && m.time >= '14:00') m.type = 'afternoon';
      });
    });
  }

  // Migrate old array-based supplements to new object structure
  if (Array.isArray(state.supplements)) {
    state.supplements = { ...SUPPLEMENTS_STATE_DEFAULT };
  }
  if (!state.supplements || typeof state.supplements !== 'object' || Array.isArray(state.supplements)) {
    state.supplements = { ...SUPPLEMENTS_STATE_DEFAULT };
  }
  if (!state.supplements.done) state.supplements.done = {};
  if (!state.supplements.activeIds) state.supplements.activeIds = [];
  if (!state.supplements.custom) state.supplements.custom = [];
}

function checkWeekReset() {
  const weekKey = getISOWeekKey();
  const storedKey = state.weekKey;
  if (storedKey && storedKey !== weekKey) {
    // Sanity-check: only reset if at least 6 days have elapsed since week was stamped.
    // This prevents a backward clock adjustment from wiping the week's data.
    const MIN_ELAPSED_MS = 6 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - (state.weekCreatedAt || 0);
    if (elapsed < MIN_ELAPSED_MS) {
      console.warn('checkWeekReset: weekKey mismatch but elapsed < 6 days — skipping reset (clock skew?)');
      return;
    }
    state.week.forEach(day => {
      if (day.meals) day.meals.forEach(m => { m.done = false; });
      day.stepsDone = false;
      day.weightTraining = false;
      day.extraKcal = 0;
    });
    if (state.supplements) state.supplements.done = {};
    state.weekKey = weekKey;
    state.weekCreatedAt = Date.now();
    saveState();
    showToast(t('toast_new_week'), 4000);
  } else if (!storedKey) {
    state.weekKey = weekKey;
    if (!state.weekCreatedAt) state.weekCreatedAt = Date.now();
  }
}

// ── ACTIVITY & DEFICIT CALCULATIONS ──
function calcStepsKcal(steps, weight) {
  const w = (weight > 0) ? weight : 70;
  return Math.round((steps || 0) * 0.04 * (w / 70));
}

function calcWeightTrainingKcal(weight) {
  const w = (weight > 0) ? weight : 70;
  return Math.round(5 * 60 * (w / 70));
}

function calcDayActivityKcal(dayIdx) {
  const day = state.week?.[dayIdx];
  if (!day) return { stepsKcal: 0, trainingKcal: 0, totalActivityKcal: 0, stepsCount: 0, stepsDone: false };
  const w = state.profile?.weight || 80;
  const stepsCount = (day.stepsCount !== undefined && day.stepsCount !== null) ? day.stepsCount : 8000;
  const stepsDone = !!day.stepsDone;
  const stepsKcal = stepsDone ? calcStepsKcal(stepsCount, w) : 0;
  const trainingKcal = day.weightTraining ? calcWeightTrainingKcal(w) : 0;
  return { stepsKcal, trainingKcal, totalActivityKcal: stepsKcal + trainingKcal, stepsCount, stepsDone };
}

function calcDayDeficit(dayIdx) {
  const day = state.week?.[dayIdx];
  if (!day) return { totalBurn: 0, consumed: 0, deficit: 0, stepsKcal: 0, trainingKcal: 0 };
  const p = state.profile;
  const bmr = calcBMR(p);
  const { stepsKcal, trainingKcal } = calcDayActivityKcal(dayIdx);
  const totalBurn = bmr + stepsKcal + trainingKcal;
  const consumed = calcDayMacros(dayIdx, false).kcal + (day.extraKcal || 0);
  return { totalBurn, consumed, deficit: totalBurn - consumed, stepsKcal, trainingKcal };
}

// ── COMPUTED MACROS ──
function calcRecipeMacros(recipe, scaleFactor = 1) {
  if (recipe.fixedMacros) {
    const m = recipe.fixedMacros;
    return {
      kcal: Math.round(m.kcal * scaleFactor),
      p:    Math.round(m.p    * scaleFactor),
      c:    Math.round(m.c    * scaleFactor),
      f:    Math.round(m.f    * scaleFactor),
    };
  }
  let kcal = 0, p = 0, c = 0, f = 0;
  const allFoods = [...FOODS_DB, ...state.customFoods];
  recipe.ingredients.forEach(ing => {
    const food = allFoods.find(fd => fd.id === ing.foodId);
    if (!food) return;
    const qty = ing.qty * scaleFactor;
    let divisor;
    if (food.unit === 'τεμ') {
      // ανά τεμάχιο (αυγό, ριζογκοφρέτα κ.λπ.) — per100 είναι ανά τεμάχιο
      divisor = 1;
    } else if (food.unit === 'κ.γ.' || food.unit === 'κ.σ.') {
      // κ.γ. = κουταλάκι γλυκού (5ml) · κ.σ. = κουταλιά σούπας (10ml)
      const mlPerUnit = food.unit === 'κ.σ.' ? 10 : (food.sprayFactor || 5);
      const ml = qty * mlPerUnit;
      kcal += food.per100.kcal * ml / 100;
      p    += food.per100.p    * ml / 100;
      c    += food.per100.c    * ml / 100;
      f    += food.per100.f    * ml / 100;
      return; // skip κανονική divisor λογική
    } else {
      divisor = 100;
    }
    kcal += food.per100.kcal * qty / divisor;
    p    += food.per100.p    * qty / divisor;
    c    += food.per100.c    * qty / divisor;
    f    += food.per100.f    * qty / divisor;
  });
  return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

function calcDayMacros(dayIdx, doneOnly = false) {
  const day = state.week?.[dayIdx];
  if (!day) return { kcal: 0, p: 0, c: 0, f: 0 };
  let tot = { kcal: 0, p: 0, c: 0, f: 0 };
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  (day.meals || []).forEach(meal => {
    if (doneOnly && !meal.done) return;
    const sf = meal.scaleFactor || 1;
    if (meal.standardId) {
      const sm = STANDARD_MEALS.find(s => s.id === meal.standardId);
      if (sm) {
        tot.kcal += Math.round((sm.kcal_est || 0) * sf);
        tot.p    += Math.round((sm.p || 0) * sf);
        tot.c    += Math.round((sm.c || 0) * sf);
        tot.f    += Math.round((sm.f || 0) * sf);
      }
    } else {
      const recipe = allRecipes.find(r => r.id === meal.recipeId);
      if (!recipe) return;
      const m = calcRecipeMacros(recipe, sf);
      tot.kcal += m.kcal; tot.p += m.p; tot.c += m.c; tot.f += m.f;
    }
  });
  return tot;
}

// ── BODY MEASUREMENTS ──
function _parseDecimal(str) {
  // Normalize locale decimal separators: remove thousands dots/spaces, replace comma with dot
  if (str == null) return NaN;
  const s = String(str).trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, '') // remove thousands dot (e.g. 1.000,5 → 1000,5)
    .replace(',', '.');
  return parseFloat(s);
}

function addBodyMeasurement() {
  const dateEl = document.getElementById('bm-date');
  const weightEl = document.getElementById('bm-weight');
  const fatEl = document.getElementById('bm-fat');
  const muscleEl = document.getElementById('bm-muscle');
  if (!dateEl || !weightEl) return;
  const date = dateEl.value;
  const weight = _parseDecimal(weightEl.value);
  if (!date || isNaN(weight) || weight < 30 || weight > 300) { showToast('⚠️ Βάλε ημερομηνία και έγκυρο βάρος (30–300 kg)'); return; }
  const fat = fatEl && fatEl.value !== '' ? _parseDecimal(fatEl.value) : null;
  const muscle = muscleEl && muscleEl.value !== '' ? _parseDecimal(muscleEl.value) : null;
  if (!state.bodyLog) state.bodyLog = [];
  // Αντικατάσταση αν ίδια ημερομηνία
  const existingIdx = state.bodyLog.findIndex(e => e.date === date);
  const entry = { date, weight, fat, muscle };
  if (existingIdx >= 0) state.bodyLog[existingIdx] = entry;
  else state.bodyLog.push(entry);
  state.bodyLog.sort((a, b) => a.date.localeCompare(b.date));
  // Ενημέρωση profile.weight με το τελευταίο
  if (state.bodyLog.length > 0) {
    const latest = state.bodyLog[state.bodyLog.length - 1];
    state.profile.weight = latest.weight;
    // Sync settings weight field and recalculate derived stats without full re-render
    const wEl = document.getElementById('prof-weight');
    if (wEl) wEl.value = latest.weight;
    liveUpdateProfile();
  }
  saveState();
  const bodyCard = document.getElementById('body-page-content');
  if (bodyCard) bodyCard.innerHTML = renderBodyMeasurementsCard();
  showToast(t('toast_body_saved'));
}

function deleteBodyEntry(date) {
  if (!state.bodyLog) return;
  state.bodyLog = state.bodyLog.filter(e => e.date !== date);
  saveState();
  const bodyCard = document.getElementById('body-page-content');
  if (bodyCard) bodyCard.innerHTML = renderBodyMeasurementsCard();
  showToast(t('toast_body_deleted'));
}

function renderBodyChart(log) {
  if (!log || log.length < 2) return `<div style="font-size:0.78rem;color:var(--text3);text-align:center;padding:16px 0">${t('body_chart_min')}</div>`;

  const id = 'bchart_' + Date.now();
  const hasFat    = log.some(e => e.fat    != null);
  const hasMuscle = log.some(e => e.muscle != null);

  const html = `
  <div id="${id}_wrap" style="user-select:none">
    <!-- Period selector -->
    <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
      ${['7D','1M','3M','6M','1Y','MAX'].map(p =>
        `<button onclick="bchart_setPeriod('${id}','${p}')" id="${id}_p_${p}"
          style="padding:3px 9px;font-size:0.68rem;font-weight:700;border-radius:6px;border:1.5px solid #e5e7eb;background:#f9fafb;color:#374151;cursor:pointer">${p}</button>`
      ).join('')}
    </div>
    <!-- Series toggles -->
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <button onclick="bchart_toggleSeries('${id}','weight')" id="${id}_t_weight"
        style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;font-size:0.7rem;font-weight:700;border-radius:6px;border:2px solid #3b82f6;background:#eff6ff;color:#1d4ed8;cursor:pointer">
        <span style="width:12px;height:2px;background:#3b82f6;border-radius:1px;display:inline-block"></span>${t('body_weight_kg')}
      </button>
      ${hasFat ? `<button onclick="bchart_toggleSeries('${id}','fat')" id="${id}_t_fat"
        style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;font-size:0.7rem;font-weight:700;border-radius:6px;border:2px solid #ef4444;background:#fef2f2;color:#b91c1c;cursor:pointer">
        <span style="width:12px;height:2px;background:#ef4444;border-radius:1px;display:inline-block"></span>${t('body_fat_pct')}
      </button>` : ''}
      ${hasMuscle ? `<button onclick="bchart_toggleSeries('${id}','muscle')" id="${id}_t_muscle"
        style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;font-size:0.7rem;font-weight:700;border-radius:6px;border:2px solid #22c55e;background:#f0fdf4;color:#15803d;cursor:pointer">
        <span style="width:12px;height:2px;background:#22c55e;border-radius:1px;display:inline-block"></span>${t('body_muscle_pct')}
      </button>` : ''}
    </div>
    <!-- Canvas -->
    <div style="position:relative">
      <canvas id="${id}" style="width:100%;height:180px;display:block;touch-action:pan-y"></canvas>
      <div id="${id}_tip" style="display:none;position:absolute;background:rgba(17,24,39,0.88);color:#fff;font-size:0.7rem;padding:5px 9px;border-radius:8px;pointer-events:none;white-space:nowrap;z-index:10"></div>
    </div>
    <!-- Zoom controls -->
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
      <button onclick="bchart_zoom('${id}',0.7)" style="width:28px;height:28px;border-radius:7px;border:1.5px solid #e5e7eb;background:#f9fafb;font-size:1rem;cursor:pointer;font-weight:700;line-height:1">+</button>
      <button onclick="bchart_zoom('${id}',1.4)" style="width:28px;height:28px;border-radius:7px;border:1.5px solid #e5e7eb;background:#f9fafb;font-size:1rem;cursor:pointer;font-weight:700;line-height:1">−</button>
    </div>
  </div>`;

  setTimeout(() => {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const state = {
      log,
      series: { weight: true, fat: hasFat, muscle: hasMuscle },
      period: 'MAX',
      zoom: 1,
      panOffset: 0,
      dragging: false,
      dragStartX: 0,
      dragStartOffset: 0,
    };
    canvas._bcstate = state;

    function filterByPeriod(entries, period) {
      if (period === 'MAX') return entries;
      const days = { '7D':7,'1M':30,'3M':90,'6M':180,'1Y':365 }[period] || 9999;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cut = cutoff.toISOString().split('T')[0];
      const filtered = entries.filter(e => e.date >= cut);
      return filtered.length >= 2 ? filtered : entries.slice(-2);
    }

    function draw() {
      const rect = canvas.getBoundingClientRect();
      const W = rect.width * dpr, H = rect.height * dpr;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const rW = rect.width, rH = rect.height;

      // active series (computed early to determine padding)
      const active = [];
      if (state.series.weight) active.push({ key:'weight', field:'weight', color:'#3b82f6', suffix:'kg', dash:[], axis:'left' });
      if (state.series.fat && hasFat)    active.push({ key:'fat',    field:'fat',    color:'#ef4444', suffix:'%',  dash:[4,3], axis: state.series.weight ? 'right' : 'left' });
      if (state.series.muscle && hasMuscle) active.push({ key:'muscle', field:'muscle', color:'#22c55e', suffix:'%', dash:[6,3], axis: state.series.weight ? 'right' : 'left' });

      const hasPctSeries = active.some(s => s.suffix === '%');
      const hasKgSeries  = active.some(s => s.suffix === 'kg');
      const dualAxis = hasPctSeries && hasKgSeries;

      const PAD = { t: 14, r: dualAxis ? 44 : 12, b: 28, l: 44 };
      const iW = rW - PAD.l - PAD.r;
      const iH = rH - PAD.t - PAD.b;

      const filtered = filterByPeriod(state.log, state.period);
      const n = filtered.length;
      if (n < 2) return;

      // zoom & pan
      const visibleSpan = iW / state.zoom;
      const maxOffset = iW - visibleSpan;
      state.panOffset = Math.max(0, Math.min(maxOffset, state.panOffset));
      const xStart = state.panOffset;
      const xEnd   = xStart + visibleSpan;

      function toCanvasX(i) {
        const t = i / (n - 1);
        const rawX = t * iW;
        return PAD.l + (rawX - xStart) * (iW / visibleSpan);
      }

      ctx.clearRect(0, 0, rW, rH);

      // grid
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
      for (let t = 0; t <= 4; t++) {
        const y = PAD.t + iH * (1 - t / 4);
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(rW - PAD.r, y); ctx.stroke();
      }

      // clip to chart area
      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t, iW, iH + 2);
      ctx.clip();

      active.forEach(s => {
        const vals = filtered.map(e => e[s.field] ?? null);
        const valid = vals.filter(v => v !== null);
        if (!valid.length) return;
        const minV = Math.min(...valid), maxV = Math.max(...valid);
        const pad = (maxV - minV) * 0.15 || 1;
        const lo = minV - pad, hi = maxV + pad;
        const range = hi - lo;

        function toY(v) { return PAD.t + iH - ((v - lo) / range) * iH; }

        // line segments
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(s.dash);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        vals.forEach((v, i) => {
          if (v === null) { started = false; return; }
          const x = toCanvasX(i), y = toY(v);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        // dots
        vals.forEach((v, i) => {
          if (v === null) return;
          const x = toCanvasX(i), y = toY(v);
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      });

      ctx.restore(); // end clip

      // y-axis labels — left axis for kg (or sole series), right axis for % when dual
      const leftSeries  = active.find(s => s.axis === 'left');
      const rightSeries = dualAxis ? active.find(s => s.axis === 'right') : null;
      [[leftSeries, 'left'], [rightSeries, 'right']].forEach(([s, side]) => {
        if (!s) return;
        const vals = filtered.map(e => e[s.field] ?? null).filter(v => v !== null);
        if (!vals.length) return;
        const minV = Math.min(...vals), maxV = Math.max(...vals);
        const pad = (maxV - minV) * 0.15 || 1;
        const lo = minV - pad, hi = maxV + pad;
        ctx.fillStyle = s.color;
        ctx.font = `bold ${dpr > 1 ? 9 : 8}px system-ui,sans-serif`;
        for (let t = 0; t <= 4; t++) {
          const v = lo + (hi - lo) * (t / 4);
          const y = PAD.t + iH * (1 - t / 4);
          if (side === 'left') {
            ctx.textAlign = 'right';
            ctx.fillText(v.toFixed(1) + s.suffix, PAD.l - 4, y + 3);
          } else {
            ctx.textAlign = 'left';
            ctx.fillText(v.toFixed(1) + s.suffix, rW - PAD.r + 4, y + 3);
          }
        }
      });

      // x-axis labels
      ctx.fillStyle = '#9ca3af';
      ctx.font = `${dpr > 1 ? 9 : 8}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      const step = Math.ceil(n / 5);
      filtered.forEach((e, i) => {
        if (i % step !== 0 && i !== n - 1 && i !== 0) return;
        const x = toCanvasX(i);
        if (x < PAD.l - 5 || x > rW - PAD.r + 5) return;
        ctx.fillText(e.date.slice(5), x, rH - 6);
      });
    }

    canvas._bcdraw = draw;
    draw();

    // resize
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    // tooltip + pan
    function getPadR() {
      const s = canvas._bcstate.series;
      const hasPct = (s.fat && hasFat) || (s.muscle && hasMuscle);
      const hasKg  = s.weight;
      return (hasPct && hasKg) ? 44 : 12;
    }

    function getXFraction(clientX) {
      const rect = canvas.getBoundingClientRect();
      const padR = getPadR();
      return (clientX - rect.left - 44) / (rect.width - 44 - padR);
    }

    function showTooltipAt(clientX) {
      const filtered = filterByPeriod(state.log, state.period);
      const n = filtered.length;
      if (n < 2) return;
      const rect = canvas.getBoundingClientRect();
      const padR = getPadR();
      const iW = rect.width - 44 - padR;
      const visibleSpan = iW / state.zoom;
      const xFrac = (clientX - rect.left - 44) / iW;
      const dataFrac = (state.panOffset + xFrac * visibleSpan) / iW;
      const idx = Math.round(dataFrac * (n - 1));
      if (idx < 0 || idx >= n) return;
      const e = filtered[Math.max(0, Math.min(n-1, idx))];
      const parts = [`📅 ${fmtDateGr(e.date)}`];
      if (state.series.weight && e.weight != null) parts.push(`⚖️ ${e.weight} kg`);
      if (state.series.fat && hasFat && e.fat != null) parts.push(`🩸 ${e.fat}%`);
      if (state.series.muscle && hasMuscle && e.muscle != null) parts.push(`💪 ${e.muscle}%`);
      const tip = document.getElementById(id + '_tip');
      if (!tip) return;
      tip.innerHTML = parts.join('&nbsp;&nbsp;');
      tip.style.display = 'block';
      const tipW = tip.offsetWidth;
      let left = clientX - rect.left + 10;
      if (left + tipW > rect.width) left = clientX - rect.left - tipW - 10;
      tip.style.left = left + 'px';
      tip.style.top = '6px';
    }

    canvas.addEventListener('mousemove', e => {
      if (state.dragging) {
        const dx = e.clientX - state.dragStartX;
        const rect = canvas.getBoundingClientRect();
        const iW = rect.width - 44 - getPadR();
        const pxPerData = iW / state.zoom;
        state.panOffset = state.dragStartOffset - (dx / iW) * pxPerData;
        draw();
      } else {
        showTooltipAt(e.clientX);
      }
    });
    canvas.addEventListener('mousedown', e => {
      state.dragging = true;
      state.dragStartX = e.clientX;
      state.dragStartOffset = state.panOffset;
    });
    canvas.addEventListener('mouseup', () => { state.dragging = false; });
    canvas.addEventListener('mouseleave', () => {
      state.dragging = false;
      const tip = document.getElementById(id + '_tip');
      if (tip) tip.style.display = 'none';
    });

    // touch
    let lastTouchX = null;
    canvas.addEventListener('touchstart', e => {
      lastTouchX = e.touches[0].clientX;
      state.dragStartOffset = state.panOffset;
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (!lastTouchX) return;
      const dx = e.touches[0].clientX - lastTouchX;
      const rect = canvas.getBoundingClientRect();
      const iW = rect.width - 44 - getPadR();
      state.panOffset = state.dragStartOffset - (dx / iW) * (iW / state.zoom);
      lastTouchX = e.touches[0].clientX;
      state.dragStartOffset = state.panOffset;
      draw();
    }, { passive: true });

    // wheel zoom
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1.18;
      state.zoom = Math.max(1, Math.min(20, state.zoom * factor));
      draw();
    }, { passive: false });

    // period buttons init
    bchart_setPeriod(id, 'MAX', true);
  }, 0);

  return html;
}

function bchart_setPeriod(id, period, init) {
  const canvas = document.getElementById(id);
  if (!canvas || !canvas._bcstate) return;
  canvas._bcstate.period = period;
  canvas._bcstate.zoom = 1;
  canvas._bcstate.panOffset = 0;
  ['7D','1M','3M','6M','1Y','MAX'].forEach(p => {
    const btn = document.getElementById(id + '_p_' + p);
    if (!btn) return;
    btn.style.background = p === period ? '#111' : '#f9fafb';
    btn.style.color = p === period ? '#fff' : '#374151';
    btn.style.borderColor = p === period ? '#111' : '#e5e7eb';
  });
  if (!init) canvas._bcdraw && canvas._bcdraw();
}

function bchart_toggleSeries(id, key) {
  const canvas = document.getElementById(id);
  if (!canvas || !canvas._bcstate) return;
  const s = canvas._bcstate.series;
  const active = Object.values(s).filter(Boolean).length;
  if (s[key] && active === 1) return; // keep at least one
  s[key] = !s[key];
  const colors = { weight:'#3b82f6', fat:'#ef4444', muscle:'#22c55e' };
  const bgs    = { weight:'#eff6ff', fat:'#fef2f2', muscle:'#f0fdf4' };
  const btn = document.getElementById(id + '_t_' + key);
  if (btn) {
    btn.style.opacity = s[key] ? '1' : '0.35';
  }
  canvas._bcdraw && canvas._bcdraw();
}

function bchart_zoom(id, factor) {
  const canvas = document.getElementById(id);
  if (!canvas || !canvas._bcstate) return;
  canvas._bcstate.zoom = Math.max(1, Math.min(20, canvas._bcstate.zoom * factor));
  canvas._bcdraw && canvas._bcdraw();
}

function fmtDateGr(isoDate) {
  if (!isoDate) return '';
  const months = tMonths();
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function renderBodyMeasurementsCard() {
  const log = state.bodyLog || [];
  const today = new Date().toISOString().split('T')[0];
  const latest = log.length > 0 ? log[log.length - 1] : null;

  // ── Stat cards: icon box left | value+label right ──
  function statCard(bg, iconSvg, value, label, valueColor) {
    return `<div style="flex:1;background:${bg};border-radius:14px;padding:10px 6px;display:flex;align-items:center;gap:6px;min-width:0">
      <div style="width:28px;height:28px;background:rgba(255,255,255,0.75);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.85rem">${iconSvg}</div>
      <div style="min-width:0;flex:1">
        <div style="font-size:0.95rem;font-weight:800;color:${valueColor};line-height:1.1;white-space:nowrap">${value}</div>
        <div style="font-size:0.62rem;color:#6b7280;font-weight:500;margin-top:2px;line-height:1.2">${label}</div>
      </div>
    </div>`;
  }

  const weightVal = latest ? `${latest.weight} kg` : '—';
  const fatVal    = (latest && latest.fat    != null) ? `${latest.fat}%`    : '—';
  const muscleVal = (latest && latest.muscle != null) ? `${latest.muscle}%` : '—';

  const weightCard = statCard('#eff6ff', '⚖️', weightVal, t('body_weight'),  '#3b82f6');
  const fatCard    = statCard('#fef2f2', '🩸',  fatVal,    t('macro_fat'),    '#ef4444');
  const muscleCard = statCard('#f0fdf4', '💪',  muscleVal, t('body_muscle'),  '#16a34a');

  const dateChip = latest
    ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;border-radius:20px;padding:5px 12px;font-size:0.78rem;color:#374151;font-weight:500;margin-top:6px">
        <span style="font-size:0.8rem">📅</span><span>${fmtDateGr(latest.date)}</span>
       </div>` : '';

  const chartInfo = log.length < 2
    ? `<div style="display:flex;align-items:center;gap:10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;font-size:0.78rem;color:#0369a1;margin-top:10px">
        <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;border:1.5px solid #0369a1;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:0.72rem">i</span>
        <span>${t('body_chart_min')}</span>
       </div>`
    : `<div style="margin-top:10px">${renderBodyChart(log)}</div>`;

  // ── History rows ──
  const historyRows = log.length === 0
    ? `<div style="font-size:0.8rem;color:var(--text3);text-align:center;padding:16px 0">${t('body_log_empty')}</div>`
    : [...log].reverse().slice(0, 8).map(e => {
        const weightCol = `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;min-width:48px">
          <span style="font-size:0.85rem">⚖️</span>
          <span style="font-size:0.8rem;font-weight:700;color:#3b82f6;white-space:nowrap">${e.weight} kg</span>
          <span style="font-size:0.6rem;color:#9ca3af">${t('body_weight')}</span>
        </div>`;
        const fatCol = (e.fat != null)
          ? `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;min-width:36px">
              <span style="font-size:0.85rem">🩸</span>
              <span style="font-size:0.8rem;font-weight:700;color:#ef4444">${e.fat}%</span>
              <span style="font-size:0.6rem;color:#9ca3af">${t('body_fat')}</span>
             </div>` : '';
        const muscleCol = (e.muscle != null)
          ? `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;min-width:48px">
              <span style="font-size:0.85rem">💪</span>
              <span style="font-size:0.8rem;font-weight:700;color:#16a34a">${e.muscle}%</span>
              <span style="font-size:0.6rem;color:#9ca3af">${t('body_muscle')}</span>
             </div>` : '';
        return `<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;gap:8px">
          <div style="font-size:0.73rem;color:#6b7280;font-weight:500;min-width:68px;flex-shrink:0">${fmtDateGr(e.date)}</div>
          <div style="display:flex;align-items:center;gap:10px;flex:1">${weightCol}${fatCol}${muscleCol}</div>
          <button onclick="deleteBodyEntry('${e.date}')" style="border:none;background:none;cursor:pointer;color:#d1d5db;font-size:0.85rem;padding:4px;flex-shrink:0" title="Διαγραφή">✕</button>
          <span style="color:#d1d5db;font-size:1rem;flex-shrink:0">›</span>
        </div>`;
      }).join('');

  const showAll = log.length > 8
    ? `<div style="text-align:center;padding-top:12px">
        <span style="font-size:0.82rem;color:#16a34a;font-weight:600;cursor:pointer">${t('body_view_all')}</span>
       </div>` : '';

  const todayDisplay = fmtDateGr(today);

  return `
  <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:16px">

    <!-- Κάρτα 1: Header + Stats -->
    <div class="card card-lg fade-in" style="padding:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:42px;height:42px;background:linear-gradient(135deg,#e0e7ff,#f0fdf4);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">📊</div>
        <div>
          <div style="font-size:0.95rem;font-weight:800;color:#111;letter-spacing:0.02em">${t('body_page_title')}</div>
          <div style="font-size:0.72rem;color:#9ca3af;margin-top:2px">${t('body_page_subtitle')}</div>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:12px">
        ${weightCard}${fatCard}${muscleCard}
      </div>

      ${dateChip}
    </div>

    <!-- Κάρτα 2: Φόρμα -->
    <div class="card card-lg fade-in" style="padding:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:28px;height:28px;background:#dcfce7;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:#16a34a;line-height:1">+</div>
        <span style="font-size:0.95rem;font-weight:800;color:#16a34a;letter-spacing:0.03em">${t('body_new_entry')}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;align-items:start">
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">${t('body_date_label')}</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">📅</span>
            <input type="date" id="bm-date" value="${today}"
              onclick="this.showPicker()"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;height:100%;cursor:pointer">
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">${t('body_weight')} (kg)</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">⚖️</span>
            <input type="text" inputmode="decimal" id="bm-weight" placeholder="e.g. 95.5"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;width:100%;height:100%">
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">% ${t('body_fat')}</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">🩸</span>
            <input type="text" inputmode="decimal" id="bm-fat" placeholder="e.g. 22.5"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;width:100%;height:100%">
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">% ${t('body_muscle')}</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">💪</span>
            <input type="text" inputmode="decimal" id="bm-muscle" placeholder="e.g. 38.0"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;width:100%;height:100%">
          </div>
        </div>
      </div>
      <button onclick="addBodyMeasurement()" style="width:100%;padding:9px 14px;font-size:0.78rem;font-weight:600;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;background:#e5e7eb;color:#374151;border:1px solid #d1d5db;cursor:pointer;letter-spacing:0.01em">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        ${t('body_save_btn')}
      </button>
    </div>

    <!-- Κάρτα 3: Ιστορικό -->
    <div class="card card-lg fade-in" style="padding:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#f1f5f9;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.95rem">📋</div>
          <span style="font-size:0.85rem;font-weight:800;color:#111;letter-spacing:0.02em">${t('body_history_title')}</span>
        </div>
        ${log.length > 0 ? `<span style="background:#f1f5f9;border-radius:20px;padding:4px 10px;font-size:0.7rem;color:#6b7280;font-weight:600">${tFmt('body_count', {n: log.length})}</span>` : ''}
      </div>
      ${historyRows}
      ${showAll}
    </div>

  </div>`;
}

// ── PROFILE ──
function calcBMI(w, h) {
  const hm = h / 100;
  return (w / (hm * hm)).toFixed(1);
}

function bmiLabel(bmi) {
  if (bmi < 18.5) return { label: t('bmi_underweight'), color: '#3b82f6' };
  if (bmi < 25)   return { label: t('bmi_normal'),      color: '#22c55e' };
  if (bmi < 30)   return { label: t('bmi_overweight'),  color: '#f59e0b' };
  return { label: t('bmi_obese'), color: '#ef4444' };
}

// Mifflin-St Jeor BMR
function calcBMR(p) {
  if (p.gender === 'male') {
    return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + 5);
  } else {
    return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age - 161);
  }
}

// Βήματα → kcal βάσει biomechanics
// StepLength (m): άνδρας height×0.415, γυναίκα height×0.413
// Distance (km) = steps × stepLength / 1000
// Walking kcal = weight × distance × 0.53
function calcStepCalories(steps, weightKg, heightCm, gender) {
  const s = steps || 0;
  if (s === 0) return 0;
  const w = weightKg || 70;
  const h = (heightCm || 170) / 100; // σε μέτρα
  const stepLength = gender === 'female' ? h * 0.413 : h * 0.415;
  const distanceKm = (s * stepLength) / 1000;
  return Math.round(w * distanceKm * 0.53);
}

// Προπόνηση → kcal βάσει MET
// Το activity field: αριθμός sessions/εβδομάδα (0,2,3,5,7)
// MET βαρών μέτριας έντασης = 5.5, διάρκεια ~1h/session
// Exercise kcal/day = (MET × weight × hours × sessions) / 7
function calcExerciseCalories(sessionsPerWeek, weightKg) {
  const s = sessionsPerWeek || 0;
  if (s === 0) return 0;
  const w = weightKg || 70;
  const MET = 5.5;   // βάρη κανονικής έντασης
  const hours = 1.0; // ~1h/session
  return Math.round((MET * w * hours * s) / 7);
}

// TDEE = (BMR + Walking + Exercise) × 1.10  (TEF ~10%)
// Κάθε συνιστώσα μετράται μία φορά — χωρίς activity multiplier.
function calcSuggestedTDEE(p) {
  const bmr      = calcBMR(p);
  const walking  = calcStepCalories(p.dailySteps || 0, p.weight, p.height, p.gender);
  const exercise = calcExerciseCalories(p.activity || 0, p.weight);
  return Math.round((bmr + walking + exercise) * 1.10);
}

// Τελικό TDEE — χρησιμοποιεί custom τιμή αν ο χρήστης έχει ορίσει
function calcTDEE(p) {
  if (p.useCustomTDEE && p.customTDEE > 0) return p.customTDEE;
  return calcSuggestedTDEE(p);
}

function calcIdealProtein(w) {
  // 1.8–2g / kg σωματικού βάρους
  return Math.round(w * 1.9);
}

function renderProfile() {
  // Write to whichever container is currently live
  const target = (state.activeTab === 'settings')
    ? document.getElementById('settings-profile-content')
    : document.getElementById('page-profile');
  if (!target) return;
  _renderProfileInto(target);
  initGoalSliders();
}

function _renderProfileInto(target) {
  const p = state.profile;
  const g = state.goals;
  const bmi = calcBMI(p.weight, p.height);
  const { label: bmiLbl, color: bmiCol } = bmiLabel(parseFloat(bmi));
  const bmr  = calcBMR(p);
  const suggestedTDEE = calcSuggestedTDEE(p);
  const tdee = calcTDEE(p);
  const idealProt = calcIdealProtein(p.weight);
  const deficit = tdee - g.kcal;

  const activityLabels = {
    0: tActivity(0),
    2: tActivity(2),
    3: tActivity(3),
    5: tActivity(5),
    7: tActivity(7),
  };


  target.innerHTML = `
    <div class="container" style="padding-top:16px;padding-bottom:24px">

      <!-- AVATAR + NAME HEADER -->
      <div class="card card-lg fade-in" style="padding:24px 20px 20px;position:relative">
        <button onclick="saveProfile()" title="Επεξεργασία προφίλ" style="position:absolute;top:10px;right:10px;background:transparent;border:none;cursor:pointer;padding:4px;color:var(--text3);line-height:1;display:flex;align-items:center;justify-content:center">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <div style="display:flex;align-items:center;gap:18px">
          <div style="position:relative;flex-shrink:0">
            <div id="profile-avatar" onclick="triggerPhotoUpload()" style="width:88px;height:88px;border-radius:50%;background:var(--green-bg);display:flex;align-items:center;justify-content:center;font-size:2.4rem;overflow:hidden;border:3px solid var(--green);cursor:pointer">
              ${p.photoUrl
                ? `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover" alt="photo">`
                : '👤'}
            </div>
            <button onclick="triggerPhotoUpload()" style="position:absolute;bottom:2px;right:2px;background:var(--green-d);color:white;border:none;border-radius:50%;width:26px;height:26px;font-size:0.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2)">📷</button>
          </div>
          <input type="file" id="photo-input" accept="image/*" style="display:none" onchange="handlePhotoUpload(this)">
          <div style="flex:1;min-width:0">
            <input type="text" id="prof-name"
              value="${p.name || ''}"
              placeholder="${t('prof_name_placeholder')}"
              style="font-size:1.45rem;font-weight:800;border:none;background:transparent;width:100%;padding:0;outline:none;color:var(--text);display:block;margin-bottom:4px"
              oninput="liveUpdateName(this.value)">
            <div style="font-size:0.8rem;color:var(--text3);display:flex;align-items:center;gap:4px">${t('prof_click_edit')}</div>
          </div>
        </div>
      </div>

      <!-- ΣΩΜΑΤΙΚΑ ΣΤΟΙΧΕΙΑ -->
      <div class="card card-lg fade-in">
        <div class="section-title">${t('prof_body')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">${t('prof_weight')}</label>
            <input type="text" inputmode="decimal" id="prof-weight" value="${p.weight || ''}"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              onblur="liveUpdateProfile()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">${t('prof_height')}</label>
            <input type="text" inputmode="decimal" id="prof-height" value="${p.height || ''}"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              onblur="liveUpdateProfile()">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">${t('prof_age')}</label>
            <input type="text" inputmode="numeric" id="prof-age" value="${p.age || ''}"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              onblur="liveUpdateProfile()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">${t('prof_gender')}</label>
            <select id="prof-gender" style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;background:var(--bg2)" onchange="liveUpdateProfile()">
              <option value="male"   ${p.gender==='male'?'selected':''}>${t('prof_male')}</option>
              <option value="female" ${p.gender==='female'?'selected':''}>${t('prof_female')}</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">${t('prof_activity')}</label>
            <select id="prof-activity" style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.82rem;background:var(--bg2)" onchange="liveUpdateProfile()">
              ${Object.entries(activityLabels).map(([val, lbl]) =>
                `<option value="${val}" ${parseInt(p.activity)===parseInt(val)?'selected':''}>${lbl}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:0.75rem">${t('prof_steps')}</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="range" id="prof-steps" min="0" max="20000" step="500" value="${p.dailySteps||0}"
              style="flex:1" oninput="liveUpdateProfile();document.getElementById('prof-steps-val').textContent=this.value">
            <span id="prof-steps-val" style="font-size:0.95rem;font-weight:800;color:var(--text);min-width:52px;text-align:right">${p.dailySteps||0}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text3);margin-top:2px">
            <span>0</span><span>4k</span><span>6k</span><span>8k</span><span>10k</span><span>12k</span><span>20k</span>
          </div>
        </div>
      </div>

      <!-- STAT CHIPS: BMI / BMR / TDEE — only when profile is filled -->
      ${(p.weight > 0 && p.height > 0 && p.age > 0) ? `
      <div class="profile-stats-grid" id="profile-stats-card">
        <div class="card fade-in" style="margin:0;padding:16px 12px;text-align:center">
          <div style="width:44px;height:44px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 8px">⚖️</div>
          <div class="bmi-val" style="font-size:1.55rem;font-weight:900;color:${bmiCol};line-height:1">${bmi}</div>
          <div class="bmi-lbl" style="font-size:0.68rem;font-weight:700;color:${bmiCol};margin-top:2px">${bmiLbl}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:2px">BMI</div>
        </div>
        <div class="card fade-in" style="margin:0;padding:16px 12px;text-align:center">
          <div style="width:44px;height:44px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 8px">〰️</div>
          <div class="bmr-val" style="font-size:1.55rem;font-weight:900;color:#3b82f6;line-height:1">${bmr}</div>
          <div style="font-size:0.68rem;font-weight:700;color:#3b82f6;margin-top:2px">${t('prof_bmr_label')}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:2px">BMR kcal</div>
        </div>
        <div class="card fade-in" style="margin:0;padding:16px 12px;text-align:center;${p.useCustomTDEE?'border-color:#22c55e;background:#f0fdf4':''}">
          <div style="width:44px;height:44px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 8px">🌿</div>
          <div class="tdee-val" style="font-size:1.55rem;font-weight:900;color:var(--green-d);line-height:1">${tdee}</div>
          <div style="font-size:0.68rem;font-weight:700;color:var(--green-d);margin-top:2px">${p.useCustomTDEE ? t('tdee_custom') : t('tdee_label')}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:2px">TDEE kcal</div>
        </div>
      </div>` : ''}

      <!-- ΗΜΕΡΗΣΙΟΙ ΣΤΟΧΟΙ -->
      <div class="card card-lg fade-in">
        <div class="section-title">${t('prof_goals_title')}</div>

        ${(p.weight > 0 && p.height > 0 && p.age > 0) ? `
        <div id="pace-grid-wrap" style="margin-bottom:14px">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text2);margin-bottom:4px">${t('pace_loss_header')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            ${(()=>{
              const slowKcal  = Math.max(Math.round((tdee - 200) / 50) * 50, Math.round(bmr * 0.9));
              const modKcal   = Math.max(Math.round((tdee - 400) / 50) * 50, Math.round(bmr * 0.85));
              const fastKcal  = Math.max(Math.round((tdee - 600) / 50) * 50, Math.round(bmr * 0.80));
              const aggrKcal  = Math.max(Math.round((tdee - 900) / 50) * 50, Math.round(bmr * 0.75));
              const selected = state.goals.goalPace || null;
              return [
                ['slow',       t('pace_slow'),       tFmt('pace_hint_kcal', {n: tdee-slowKcal}),  slowKcal,  '#22c55e', '#f0fdf4'],
                ['moderate',   t('pace_moderate'),   tFmt('pace_hint_kcal', {n: tdee-modKcal}),   modKcal,   '#3b82f6', '#eff6ff'],
                ['fast',       t('pace_fast'),       tFmt('pace_hint_kcal', {n: tdee-fastKcal}),  fastKcal,  '#f59e0b', '#fffbeb'],
                ['aggressive', t('pace_aggressive'), tFmt('pace_hint_kcal', {n: tdee-aggrKcal}),  aggrKcal,  '#ef4444', '#fef2f2'],
              ].map(([mode, label, hint, kcalVal, color, bg]) => {
                const isSelected = mode === selected;
                const isGrey     = selected && !isSelected;
                const btnBorder  = isSelected ? `2px solid ${color}` : isGrey ? '2px solid var(--border)' : `2px solid ${color}33`;
                const btnBg      = isSelected ? bg : isGrey ? 'var(--bg2)' : bg;
                const btnOpacity = isGrey ? '0.45' : '1';
                const labelColor = isGrey ? 'var(--text3)' : 'var(--text)';
                const kcalColor  = isGrey ? 'var(--text3)' : color;
                return `
                <button onclick="applyGoalPace('${mode}')"
                  style="padding:8px 6px;border:${btnBorder};border-radius:var(--radius-sm);background:${btnBg};cursor:pointer;text-align:left;transition:all 0.15s;opacity:${btnOpacity}">
                  <div style="font-size:0.78rem;font-weight:800;color:${labelColor}">${label}${isSelected ? ' ✓' : ''}</div>
                  <div style="font-size:0.65rem;color:var(--text3);margin-top:1px">${hint}</div>
                  <div style="font-size:0.82rem;font-weight:900;color:${kcalColor};margin-top:2px">${kcalVal} kcal</div>
                </button>`;
              }).join('');
            })()}
          </div>
          <div style="font-size:0.72rem;font-weight:700;color:var(--text2);margin-bottom:4px">${t('pace_other_header')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${(()=>{
              const maintainKcal = Math.round(tdee / 50) * 50;
              const bulkKcal     = Math.round((tdee + 200) / 50) * 50;
              const bulkProt     = Math.round(p.weight * 2.2 / 5) * 5;
              const selected = state.goals.goalPace || null;
              return [
                ['maintain', t('pace_maintain'), tFmt('pace_hint_tdee', {n: tdee}),       maintainKcal, '#8b5cf6', '#f5f3ff'],
                ['bulk',     t('pace_bulk'),     tFmt('pace_hint_bulk', {n: bulkProt}),  bulkKcal,     '#0ea5e9', '#f0f9ff'],
              ].map(([mode, label, hint, kcalVal, color, bg]) => {
                const isSelected = mode === selected;
                const isGrey     = selected && !isSelected;
                const btnBorder  = isSelected ? `2px solid ${color}` : isGrey ? '2px solid var(--border)' : `2px solid ${color}33`;
                const btnBg      = isSelected ? bg : isGrey ? 'var(--bg2)' : bg;
                const btnOpacity = isGrey ? '0.45' : '1';
                const labelColor = isGrey ? 'var(--text3)' : 'var(--text)';
                const kcalColor  = isGrey ? 'var(--text3)' : color;
                return `
                <button onclick="applyGoalPace('${mode}')"
                  style="padding:8px 6px;border:${btnBorder};border-radius:var(--radius-sm);background:${btnBg};cursor:pointer;text-align:left;transition:all 0.15s;opacity:${btnOpacity}">
                  <div style="font-size:0.78rem;font-weight:800;color:${labelColor}">${label}${isSelected ? ' ✓' : ''}</div>
                  <div style="font-size:0.65rem;color:var(--text3);margin-top:1px">${hint}</div>
                  <div style="font-size:0.82rem;font-weight:900;color:${kcalColor};margin-top:2px">${kcalVal} kcal</div>
                </button>`;
              }).join('');
            })()}
          </div>
        </div>` : ''}

        <div style="margin-bottom:16px">
          ${(()=>{
            const paceColors = { slow:'#22c55e', moderate:'#3b82f6', fast:'#f59e0b', aggressive:'#ef4444' };
            const activePace = state.goals.goalPace || 'fast';
            const kcalColor = paceColors[activePace] || '#f59e0b';
            const sliderClass = activePace === 'slow' ? 'prof-range-green'
              : activePace === 'moderate' ? 'prof-range-blue'
              : activePace === 'fast' ? 'prof-range-amber'
              : activePace === 'aggressive' ? 'prof-range-red'
              : 'prof-range-amber';
            return `
          <div class="slider-label" style="margin-bottom:6px">
            <span style="display:flex;align-items:center;gap:6px">🔥 <span>${t('prof_kcal_label')}</span></span>
            <strong id="prof-kcal-val" style="color:${kcalColor}">${g.kcal} kcal</strong>
          </div>
          <input type="range" id="prof-kcal" min="1000" max="3500" step="50" value="${g.kcal}"
            class="${sliderClass} goal-slider"
            oninput="updateGoalFromProfile('kcal',this.value)" style="width:100%;accent-color:${kcalColor}">`;
          })()}
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text3);margin-top:3px">
            <span>1000</span><span></span><span>3500</span>
          </div>
        </div>

        <div style="margin-bottom:4px">
          <div class="slider-label" style="margin-bottom:6px">
            <span style="display:flex;align-items:center;gap:6px">🥩 <span>${t('prof_protein_label')}</span></span>
            <strong id="prof-prot-val" style="color:var(--blue)">${g.protein}g</strong>
          </div>
          <input type="range" id="prof-prot" min="60" max="300" step="5" value="${g.protein}"
            class="prof-range-blue goal-slider"
            oninput="updateGoalFromProfile('protein',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text3);margin-top:3px">
            <span>60g</span><span id="td-prot-hint" style="color:var(--blue);font-weight:700">${tFmt('prof_protein_hint', {val: idealProt})}</span><span>300g</span>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button onclick="applyTDEEGoal()" title="Επαναφορά από TDEE"
            style="background:none;border:none;padding:4px 2px;cursor:pointer;opacity:0.35;transition:opacity 0.15s;line-height:1"
            onmouseenter="this.style.opacity='0.8'" onmouseleave="this.style.opacity='0.35'">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- ΩΡΕΣ ΓΕΥΜΑΤΩΝ -->
      <div class="card card-lg fade-in">
        <div class="section-title">${t('prof_meal_times_title')}</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">
          ${t('prof_meal_times_desc')}
        </p>
        ${(()=>{
          const mt = getMealTimes();
          const slots = [
            ['breakfast', '🌅 ' + tMeal('breakfast'), mt.breakfast],
            ['snack',     '🍎 ' + tMeal('snack'),     mt.snack],
            ['lunch',     '☀️ ' + tMeal('lunch'),     mt.lunch],
            ['afternoon', '🧃 ' + tMeal('afternoon'), mt.afternoon],
            ['dinner',    '🌙 ' + tMeal('dinner'),    mt.dinner],
          ];
          return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">` +
            slots.map(([key, lbl, val]) => `
              <div style="display:flex;flex-direction:column;gap:3px">
                <label style="font-size:0.72rem;font-weight:700;color:var(--text2)">${lbl}</label>
                <input type="time" data-meal="${key}"
                  value="${val}"
                  style="padding:6px 9px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.82rem;font-weight:700;background:var(--bg2)"
                  oninput="updateMealTime('${key}', this.value)">
              </div>`).join('') + `</div>`;
        })()}
      </div>

      <!-- ΕΝΑΡΞΗ ΠΛΑΝΟΥ -->
      <div class="card card-lg fade-in">
        <div class="section-title">${t('prof_plan_start_title')}</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">
          ${t('prof_plan_start_desc')}
        </p>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="date" id="plan-start-date"
            value="${state.planStartDate || ''}"
            style="flex:1;padding:10px 12px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.92rem;background:var(--bg2)"
            onchange="setPlanStartDate(this.value)">
          <button class="btn btn-green btn-sm" onclick="setPlanStartDate(new Date().toISOString().split('T')[0])">${t('prof_today_btn')}</button>
        </div>
        ${state.planStartDate ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--text3)">
          Ημ1: ${formatPlanDay(0)} &nbsp;·&nbsp; Ημ4: ${formatPlanDay(3)} &nbsp;·&nbsp; Ημ7: ${formatPlanDay(6)}
        </div>` : ''}
        ${(() => {
          const p = state.profile;
          const profileReady = p.weight > 0 && p.height > 0 && p.age > 0;
          if (!profileReady) return `
            <div style="margin-top:14px;padding:10px 12px;background:var(--amber-bg,#fffbeb);border:1.5px solid var(--amber,#f59e0b);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--amber,#b45309)">
              ${t('prof_fill_first')}
            </div>
            <button class="btn btn-full" style="font-weight:800;margin-top:10px;opacity:0.4;cursor:not-allowed;background:var(--green)" disabled>
              ${t('prof_create_plan_btn')}
            </button>`;
          return `
            <button id="create-plan-btn" class="btn btn-green btn-full" style="font-weight:800;margin-top:14px" onclick="createPlan()">
              ${t('prof_create_plan_btn')}
            </button>`;
        })()}
      </div>

      <!-- ΕΚΤΥΠΩΣΗ & ΣΥΝΟΨΗ -->
      ${state.planCreated ? `
      <div class="card card-lg fade-in">
        <div class="section-title">${t('prof_print_title')}</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:14px">${t('prof_print_desc')}</p>
        <button class="btn btn-blue btn-full" onclick="exportPDF()" style="margin-bottom:10px">
          ${t('prof_print_btn')}
        </button>
      </div>` : ''}

    </div>`;
}

function initGoalSliders() {
  const sliders = document.querySelectorAll('.goal-slider');
  sliders.forEach(s => {
    s.addEventListener('pointerdown', () => {
      sliders.forEach(other => {
        if (other !== s) other.classList.add('goal-slider--locked');
      });
    });
    s.addEventListener('pointerup', () => {
      sliders.forEach(other => other.classList.remove('goal-slider--locked'));
    });
    s.addEventListener('pointercancel', () => {
      sliders.forEach(other => other.classList.remove('goal-slider--locked'));
    });
  });
}

function _isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('data:image/');
}

function _setAvatarImg(el, photoUrl, altText) {
  if (_isSafeUrl(photoUrl)) {
    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = altText || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    el.innerHTML = '';
    el.appendChild(img);
    el.style.padding = '0';
  } else {
    el.textContent = '';
    el.style.padding = '';
  }
}

function updateSidebarAvatar() {
  const p = state.profile;
  const avatarEl = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-user-name');
  if (!avatarEl) return;
  if (_isSafeUrl(p.photoUrl)) {
    _setAvatarImg(avatarEl, p.photoUrl, 'photo');
  } else {
    avatarEl.textContent = (p.name || 'Δ').charAt(0).toUpperCase();
    avatarEl.style.padding = '';
  }
  if (nameEl && p.name) nameEl.textContent = p.name;
  const dAvatar = document.getElementById('drawer-avatar');
  const dName   = document.getElementById('drawer-user-name');
  if (dAvatar) {
    if (_isSafeUrl(p.photoUrl)) {
      _setAvatarImg(dAvatar, p.photoUrl, '');
    } else {
      dAvatar.textContent = (p.name || 'Δ').charAt(0).toUpperCase();
    }
  }
  if (dName && p.name) dName.textContent = p.name;
}

function liveUpdateName(val) {
  state.profile.name = val;
  document.getElementById('top-app-title').textContent = val ? `🥗 ${val}` : '🥗 Vivon';
  updateSidebarAvatar();
  saveState();
  autoSaveSettings();
}

function liveUpdateProfile() {
  const p = state.profile;
  const wEl  = document.getElementById('prof-weight');
  const hEl  = document.getElementById('prof-height');
  const aEl  = document.getElementById('prof-age');
  const gEl  = document.getElementById('prof-gender');
  const acEl = document.getElementById('prof-activity');
  const stEl = document.getElementById('prof-steps');

  // Weight: locale-safe decimal parse, clamp 30–200
  if (wEl) {
    const w = _parseDecimal(wEl.value);
    if (!isNaN(w) && w >= 30 && w <= 200) {
      p.weight = w;
      wEl.style.borderColor = '';
    } else if (wEl.value !== '') {
      wEl.style.borderColor = '#ef4444';
    }
  }

  // Height: 100–250 cm
  if (hEl) {
    const h = _parseDecimal(hEl.value);
    if (!isNaN(h) && h >= 100 && h <= 250) {
      p.height = h;
      hEl.style.borderColor = '';
    } else if (hEl.value !== '') {
      hEl.style.borderColor = '#ef4444';
    }
  }

  if (aEl)  p.age        = parseInt(aEl.value)     || p.age;
  if (gEl)  p.gender     = gEl.value;
  if (acEl) p.activity   = parseInt(acEl.value);
  if (stEl) p.dailySteps = parseInt(stEl.value)    || 0;

  if (!p.useCustomTDEE) p.customTDEE = 0;

  // Show/hide stat chips based on whether profile is complete
  const profileReady = p.weight > 0 && p.height > 0 && p.age > 0;
  const statsCard = document.getElementById('profile-stats-card');
  if (statsCard) statsCard.style.display = profileReady ? '' : 'none';

  saveState();

  // Re-render pace buttons when profile becomes complete (or TDEE changes)
  const paceWrap = document.getElementById('pace-grid-wrap');
  if (profileReady && !paceWrap) {
    // First time profile is complete — defer re-render so current input keeps focus
    setTimeout(() => renderProfile(), 0);
    return;
  }
  if (profileReady && paceWrap) {
    // Re-render pace section so TDEE-based values stay current
    setTimeout(() => renderProfile(), 0);
  }

  // Δυναμική ενημέρωση BMR / TDEE / BMI χωρίς full re-render
  const bmr  = calcBMR(p);
  const tdee = calcTDEE(p);
  const bmi  = calcBMI(p.weight, p.height);
  const { label: bmiLbl, color: bmiCol } = bmiLabel(parseFloat(bmi));

  // Stat chips
  const bmrEl  = document.querySelector('.bmr-val');
  const tdeeEl = document.querySelector('.tdee-val');
  const bmiEl  = document.querySelector('.bmi-val');
  const bmiLblEl = document.querySelector('.bmi-lbl');
  if (bmrEl)   { bmrEl.textContent  = bmr; }
  if (tdeeEl)  { tdeeEl.textContent = tdee; }
  if (bmiEl)   { bmiEl.textContent  = bmi;    bmiEl.style.color   = bmiCol; }
  if (bmiLblEl){ bmiLblEl.textContent = bmiLbl; bmiLblEl.style.color = bmiCol; }

  // Protein ideal hint
  const protHintEl = document.getElementById('td-prot-hint');
  if (protHintEl) protHintEl.textContent = tFmt('prof_protein_hint', { val: calcIdealProtein(p.weight) });

  // TDEE label on kcal slider
  const tdeeSliderLbl = document.getElementById('td-slider-tdee');
  if (tdeeSliderLbl) tdeeSliderLbl.textContent = `TDEE: ${tdee}`;

  // Update steps value label
  const stepsValEl = document.getElementById('prof-steps-val');
  if (stepsValEl) stepsValEl.textContent = p.dailySteps || 0;

  autoSaveSettings();
}

function updateGoalFromProfile(key, val) {
  const v = parseInt(val);
  state.goals[key] = v;
  // Manual slider move → clear pace selection
  if (key === 'kcal') {
    state.goals.goalPace = null;
    const kcalEl = document.getElementById('prof-kcal-val');
    if (kcalEl) kcalEl.style.color = 'var(--amber)';
    const slider = document.getElementById('prof-kcal');
    if (slider) { slider.className = slider.className.replace(/prof-range-\w+/, 'prof-range-amber'); slider.style.accentColor = 'var(--amber)'; }
  }
  const labels = { kcal: 'prof-kcal-val', protein: 'prof-prot-val', carbs: 'prof-carb-val', fat: 'prof-fat-val' };
  const suffixes = { kcal: ' kcal', protein: 'g', carbs: 'g', fat: 'g' };
  const el = document.getElementById(labels[key]);
  if (el) el.textContent = v + suffixes[key];
  saveState();
  autoSaveSettings();
}

function updateFirstMealTime(val) {
  if (!val) return;
  state.profile.firstMealTime = val;
  _applyMealTimesToWeek();
}

function updateMealTime(mealKey, val) {
  if (!val) return;
  if (!state.profile.mealTimes) state.profile.mealTimes = {};
  state.profile.mealTimes[mealKey] = val;
  // Keep firstMealTime in sync when breakfast changes
  if (mealKey === 'breakfast') state.profile.firstMealTime = val;
  _applyMealTimesToWeek();
}

function _applyMealTimesToWeek() {
  const times = getMealTimes();
  state.week.forEach(day => {
    day.meals.forEach(meal => {
      if (times[meal.type]) meal.time = times[meal.type];
    });
  });
  saveState();
  autoSaveSettings();
  renderToday();
  renderWeekPage();
}

function toggleCustomTDEE(val) {
  state.profile.useCustomTDEE = val;
  if (val && (!state.profile.customTDEE || state.profile.customTDEE === 0)) {
    // Προ-συμπλήρωση με την προτεινόμενη τιμή
    state.profile.customTDEE = calcSuggestedTDEE(state.profile);
  }
  if (!val) state.profile.customTDEE = 0;
  saveState();
  renderProfile();
  autoSaveSettings();
}

function updateCustomTDEE(val) {
  const v = parseInt(val);
  if (v >= 1000) {
    state.profile.customTDEE = v;
    saveState();
    const tdeeEl = document.querySelector('#profile-stats-card .tdee-val');
    if (tdeeEl) tdeeEl.textContent = v;
    autoSaveSettings();
  }
}

function resetToSuggestedTDEE() {
  state.profile.useCustomTDEE = false;
  state.profile.customTDEE = 0;
  saveState();
  renderProfile();
  showToast('↺ Επιστροφή σε αυτόματο TDEE');
  autoSaveSettings();
}

function applyTDEEGoal() {
  applyGoalPace('fast');
}

function applyGoalPace(mode) {
  const p = state.profile;
  const bmr = calcBMR(p);
  const tdee = calcTDEE(p);

  let kcal, prot;

  if (mode === 'maintain') {
    kcal = Math.round(tdee / 50) * 50;
    prot = calcIdealProtein(p.weight);
    state.goals.kcal     = kcal;
    state.goals.protein  = prot;
    state.goals.carbs    = Math.round((kcal * 0.40) / 4 / 5) * 5;
    state.goals.fat      = Math.round((kcal * 0.30) / 9 / 5) * 5;
  } else if (mode === 'bulk') {
    kcal = Math.round((tdee + 200) / 50) * 50;
    // Υψηλότερη πρωτεΐνη για αύξηση μάζας: 2.2g/kg
    prot = Math.round(p.weight * 2.2 / 5) * 5;
    state.goals.kcal     = kcal;
    state.goals.protein  = prot;
    state.goals.carbs    = Math.round((kcal * 0.45) / 4 / 5) * 5;
    state.goals.fat      = Math.round((kcal * 0.25) / 9 / 5) * 5;
  } else {
    const deficits = { slow: 200, moderate: 400, fast: 600, aggressive: 900 };
    const floors   = { slow: 0.90, moderate: 0.85, fast: 0.80, aggressive: 0.75 };
    const deficit  = deficits[mode] || 400;
    const floor    = floors[mode]   || 0.85;
    kcal = Math.max(Math.round((tdee - deficit) / 50) * 50, Math.round(bmr * floor));
    prot = calcIdealProtein(p.weight);
    state.goals.kcal     = kcal;
    state.goals.protein  = prot;
    state.goals.carbs    = Math.round((kcal * 0.35) / 4 / 5) * 5;
    state.goals.fat      = Math.round((kcal * 0.25) / 9 / 5) * 5;
  }

  state.goals.goalPace = mode;
  saveState();
  renderProfile();
  const modeLabels = { slow: t('pace_slow'), moderate: t('pace_moderate'), fast: t('pace_fast'), aggressive: t('pace_aggressive'), maintain: t('pace_maintain'), bulk: t('pace_bulk') };
  showToast(`✅ ${modeLabels[mode]}: ${kcal} kcal · ${prot}g ${t('macro_p_abbr')}.`);
  autoSaveSettings();
}

function saveProfile() {
  saveState();
  autoSaveSettings();
}

function shareProfile() {
  const p = state.profile;
  const g = state.goals;
  const tdee = calcTDEE(p);
  const text = `Vivon ${t('share_plan_title')} — ${p.name || t('share_user')}\n🎯 ${g.kcal} kcal | 🥩 ${g.protein}g ${t('macro_p_abbr')}. | 🍚 ${g.carbs}g ${t('macro_c_abbr')}. | 🫒 ${g.fat}g ${t('macro_f_abbr')}.\nTDEE: ${tdee} kcal`;
  if (navigator.share) {
    navigator.share({ title: 'Vivon Πλάνο', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ Αντιγράφηκε στο clipboard!'));
  } else {
    showToast('ℹ️ Sharing δεν υποστηρίζεται');
  }
}

function triggerPhotoUpload() {
  document.getElementById('photo-input').click();
}

function handlePhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 250 * 1024) {
    showToast('❌ Η φωτογραφία δεν μπορεί να υπερβαίνει τα 250KB');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.profile.photoUrl = e.target.result;
    saveState();
    renderProfile();
    updateSidebarAvatar();
    showToast('✅ Φωτογραφία αποθηκεύτηκε');
  };
  reader.readAsDataURL(file);
}

// ── PLAN DATE ──
function setPlanStartDate(dateStr) {
  state.planStartDate = dateStr;
  saveState();
  renderProfile();
  autoSaveSettings();
}

// ── GOURMET IDS — defined before wizard so _renderWizardStep can use it ──
const GOURMET_IDS = new Set([
  'r48','r45','r40',
  'sm55','sm56','sm73',
  'cb_b4','cb_b5','cb_b6','cb_b7',
  'cb_l1','cb_l2','cb_l3','cb_l4','cb_l5','cb_l7','cb_l9','cb_l11','cb_l13','cb_l14','cb_l15',
  'cb_d1','cb_d4','cb_d5','cb_d7','cb_d8','cb_d10',
  'ex_l54','ex_l55','ex_l56','ex_l57','ex_d21','ex_d22','ex_d23','ex_d24',
]);

// ── PLAN WIZARD ──────────────────────────────────────────────
// Step 0: style (simple/gourmet/mixed)
// Steps 1-4: meal exclusions per slot
// Step 5: confirm → generate
function getWizardMeals() {
  return [
    { key: 'breakfast', label: tMeal('breakfast'), sublabel: t('wizard_meal_sublabel_breakfast'), emoji: '🌅' },
    { key: 'snack',     label: tMeal('snack'),     sublabel: t('wizard_meal_sublabel_snack'),     emoji: '🍎' },
    { key: 'lunch',     label: tMeal('lunch'),     sublabel: t('wizard_meal_sublabel_lunch'),     emoji: '🍽️' },
    { key: 'dinner',    label: tMeal('dinner'),    sublabel: t('wizard_meal_sublabel_dinner'),    emoji: '🌙' },
  ];
}
const WIZARD_MEALS = getWizardMeals();
// step 0 = style, steps 1..4 = meals, step 5 = confirm
const WIZARD_STYLE_STEP   = 0;
const WIZARD_CONFIRM_STEP = WIZARD_MEALS.length + 1;

let _wizardStep = 0;
let _wizardExcluded = {};  // { mealKey: Set<mealId> }

function _allMeals() {
  return [
    ...(typeof RECIPES_DB !== 'undefined' ? RECIPES_DB : []),
    ...(typeof STANDARD_MEALS !== 'undefined' ? STANDARD_MEALS : []),
  ];
}

function createPlan() {
  _wizardExcluded = {};
  WIZARD_MEALS.forEach(m => {
    _wizardExcluded[m.key] = new Set(state.wizardExcluded?.[m.key] || []);
  });
  _wizardStep = 0;
  _renderWizardStep();
  document.getElementById('wizard-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function wizardSetStyle(s) {
  state.wizardStyle = s;
  document.querySelectorAll('.wstyle-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.style === s);
  });
}

function _renderWizardStep() {
  if (!document.getElementById('wizard-overlay')) return;

  const dots    = document.getElementById('wizard-step-dots');
  const titleEl = document.getElementById('wizard-step-title');
  const labelEl = document.getElementById('wizard-meal-label');
  const subEl   = document.getElementById('wizard-meal-sublabel');
  const body    = document.getElementById('wizard-body');
  const btnBack = document.getElementById('wizard-btn-back');
  const btnNext = document.getElementById('wizard-btn-next');
  const _wizardMeals = getWizardMeals();
  const total   = WIZARD_CONFIRM_STEP + 1; // style + 4 meals + confirm

  dots.innerHTML = Array.from({ length: total }, (_, i) =>
    `<div class="wizard-step-dot ${i < _wizardStep ? 'done' : i === _wizardStep ? 'active' : ''}"></div>`
  ).join('');

  btnBack.style.display = _wizardStep === 0 ? 'none' : '';

  // ── Step 0: Style selection ──
  if (_wizardStep === WIZARD_STYLE_STEP) {
    titleEl.textContent = '🍽️ ' + t('wizard_style_title');
    labelEl.textContent = tFmt('wizard_step_label', { n: 1, total });
    subEl.textContent   = t('wizard_style_desc');
    btnNext.textContent = t('btn_next') + ' →';
    const cur = state.wizardStyle || 'simple';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">
        <div class="wstyle-card${cur==='simple'?' selected':''}" data-style="simple" onclick="wizardSetStyle('simple')">
          <div class="wstyle-icon">🥗</div>
          <div class="wstyle-info">
            <div class="wstyle-title">${t('wizard_simple_title')}</div>
            <div class="wstyle-sub">${t('wizard_simple_sub')}</div>
          </div>
          <div class="wstyle-check">${cur==='simple'?'✓':''}</div>
        </div>
        <div class="wstyle-card${cur==='mixed'?' selected':''}" data-style="mixed" onclick="wizardSetStyle('mixed')">
          <div class="wstyle-icon">🍲</div>
          <div class="wstyle-info">
            <div class="wstyle-title">${t('wizard_mixed_title')}</div>
            <div class="wstyle-sub">${t('wizard_mixed_sub')}</div>
          </div>
          <div class="wstyle-check">${cur==='mixed'?'✓':''}</div>
        </div>
        <div class="wstyle-card${cur==='gourmet'?' selected':''}" data-style="gourmet" onclick="wizardSetStyle('gourmet')">
          <div class="wstyle-icon">👨‍🍳</div>
          <div class="wstyle-info">
            <div class="wstyle-title">${t('wizard_gourmet_title')}</div>
            <div class="wstyle-sub">${t('wizard_gourmet_sub')}</div>
          </div>
          <div class="wstyle-check">${cur==='gourmet'?'✓':''}</div>
        </div>
      </div>`;
    return;
  }

  // ── Steps 1-4: Meal exclusions ──
  const mealIdx = _wizardStep - 1; // 0-based into WIZARD_MEALS
  if (mealIdx < _wizardMeals.length) {
    const meal = _wizardMeals[mealIdx];
    titleEl.textContent = `${meal.emoji} ${meal.label}`;
    labelEl.textContent = tFmt('wizard_step_label', { n: _wizardStep + 1, total });
    subEl.textContent   = meal.sublabel;
    btnNext.textContent = mealIdx < _wizardMeals.length - 1 ? t('btn_next') + ' →' : t('btn_done') + ' →';

    const style    = state.wizardStyle || 'simple';
    const excluded = _wizardExcluded[meal.key];
    let meals = _allMeals().filter(r =>
      r.meal === meal.key || (meal.key === 'snack' && r.meal === 'afternoon')
    );
    // Filter by style
    if (style === 'simple')  meals = meals.filter(r => !GOURMET_IDS.has(r.id));
    if (style === 'gourmet') {
      const hasGourmet = meals.some(r => GOURMET_IDS.has(r.id));
      if (hasGourmet) meals = meals.filter(r => GOURMET_IDS.has(r.id));
    }

    // Deduplicate by foodGroup: show one representative per group (the first entry with wizardName or lowest kcal)
    const seenGroups = new Set();
    const wizardMeals = []; // representative entries shown in wizard
    const groupToIds  = {}; // foodGroup → all sibling ids in this filtered set
    meals.forEach(r => {
      const g = r.foodGroup;
      if (g) {
        if (!groupToIds[g]) groupToIds[g] = [];
        groupToIds[g].push(r.id);
        if (!seenGroups.has(g)) {
          seenGroups.add(g);
          wizardMeals.push(r); // first entry = representative
        }
      } else {
        wizardMeals.push(r);
      }
    });

    if (!wizardMeals.length) {
      body.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:20px 0">Δεν βρέθηκαν γεύματα.</div>';
      return;
    }

    // A group is "excluded" when ALL sibling ids are excluded
    function isRowExcluded(r) {
      const g = r.foodGroup;
      if (!g) return excluded.has(r.id);
      return (groupToIds[g] || [r.id]).every(id => excluded.has(id));
    }

    const excCount = wizardMeals.filter(r => isRowExcluded(r)).length;
    const selCount = wizardMeals.length - excCount;

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:0.75rem;color:var(--text3)">${tFmt('wizard_selected_count', { sel: selCount, exc: excCount })}</span>
      <button onclick="_wizardSelectAll('${meal.key}')" style="font-size:0.72rem;color:var(--green-d);background:none;border:none;cursor:pointer;font-weight:700">${t('wizard_select_all')}</button>
    </div><div class="wizard-meal-list">`;

    wizardMeals.forEach(r => {
      const ex = isRowExcluded(r);
      const displayName = r.wizardName ? (tName(r, 'wizardName') || r.wizardName) : tName(r);
      const kcalStr = r.kcal_est ? `${r.kcal_est} kcal` : (r.fixedMacros ? `${r.fixedMacros.kcal} kcal` : '');
      const siblings = r.foodGroup ? JSON.stringify(groupToIds[r.foodGroup] || [r.id]) : JSON.stringify([r.id]);
      const siblingsAttr = siblings.replace(/"/g, '&quot;');
      html += `<div class="wizard-meal-row${ex?' excluded':''}" onclick="wizardToggleGroup('${meal.key}',JSON.parse(this.dataset.ids),this)" data-ids="${siblingsAttr}">
        <div class="wmr-left">
          <div class="wfood-chip-check">${ex
            ?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
            :'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'}</div>
          <span class="wmr-emoji">${r.emoji||'🍽️'}</span>
          <span class="wmr-name">${displayName}</span>
        </div>
        <span class="wmr-kcal">${kcalStr}</span>
      </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
    return;
  }

  // ── Step 5: Confirm ──
  titleEl.textContent = '✅ ' + t('wizard_confirm_title');
  labelEl.textContent = `${t('wizard_style_title')}: ${{ simple: t('wizard_simple_title'), mixed: t('wizard_mixed_title'), gourmet: t('wizard_gourmet_title') }[state.wizardStyle||'simple']}`;
  subEl.textContent   = t('wizard_confirm_sub');
  btnNext.textContent = '📋 ' + t('btn_generate');

  let html = '<div class="wizard-confirm-list">';
  _wizardMeals.forEach(meal => {
    const excSet = _wizardExcluded[meal.key];
    const allForMeal = _allMeals().filter(r => r.meal===meal.key||(meal.key==='snack'&&r.meal==='afternoon'));
    // Deduplicate to get wizard-level rows
    const seenG2 = new Set();
    const wizRows = [];
    allForMeal.forEach(r => {
      const g = r.foodGroup;
      if (g && seenG2.has(g)) return;
      if (g) seenG2.add(g);
      wizRows.push(r);
    });
    const excRows = wizRows.filter(r => {
      const siblings = r.foodGroup ? allForMeal.filter(x=>x.foodGroup===r.foodGroup).map(x=>x.id) : [r.id];
      return siblings.every(id => excSet.has(id));
    });
    const excNames = excRows.map(r => r.wizardName ? (tName(r, 'wizardName') || r.wizardName) : tName(r));
    html += `<div class="wizard-confirm-meal">
      <div class="wizard-confirm-meal-title">${meal.emoji} ${meal.label}
        <span style="font-weight:400;color:var(--text3)">(${wizRows.length-excRows.length}/${wizRows.length})</span>
      </div>
      ${excNames.length
        ? `<div class="wizard-confirm-excluded">❌ ${excNames.slice(0,4).join(', ')}${excNames.length>4?' '+tFmt('wizard_more',{n:excNames.length-4}):''}</div>`
        : `<div class="wizard-confirm-ok">${t('wizard_all_ok')}</div>`}
    </div>`;
  });
  html += '</div>';
  body.innerHTML = html;
}

// Toggle a food group (or single meal) in the wizard exclusion set.
// ids[] = all sibling ids that belong to the same foodGroup.
function wizardToggleGroup(mealKey, ids, el) {
  const excSet = _wizardExcluded[mealKey];
  const checkEl = el.querySelector('.wfood-chip-check');
  // Group is excluded when ALL siblings are excluded
  const allExcluded = ids.every(id => excSet.has(id));
  if (allExcluded) {
    // Re-include: remove all siblings
    ids.forEach(id => excSet.delete(id));
    el.classList.remove('excluded');
    if (checkEl) checkEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
  } else {
    // Exclude: add all siblings
    ids.forEach(id => excSet.add(id));
    el.classList.add('excluded');
    if (checkEl) checkEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }
  // Update the counter display
  const meal = WIZARD_MEALS[_wizardStep - 1];
  if (meal) {
    const ctr = document.querySelector('.wizard-meal-list')?.previousElementSibling?.querySelector('span');
    if (ctr) {
      // Recalculate using deduplication (same logic as render)
      const all = _allMeals().filter(r => r.meal === meal.key || (meal.key === 'snack' && r.meal === 'afternoon'));
      const seenG = new Set();
      let totalRows = 0, excRows = 0;
      all.forEach(r => {
        const g = r.foodGroup;
        if (g && seenG.has(g)) return;
        if (g) seenG.add(g);
        totalRows++;
        const siblings = g ? all.filter(x => x.foodGroup === g).map(x => x.id) : [r.id];
        if (siblings.every(id => excSet.has(id))) excRows++;
      });
      ctr.textContent = tFmt('wizard_selected_count', { sel: totalRows - excRows, exc: excRows });
    }
  }
}

function _wizardSelectAll(mealKey) {
  _wizardExcluded[mealKey].clear();
  _renderWizardStep();
}

function wizardNext() {
  if (_wizardStep < WIZARD_CONFIRM_STEP) {
    _wizardStep++;
    _renderWizardStep();
  } else {
    _closeWizard();
    state.planCreated = true;
    state.wizardExcluded = {};
    WIZARD_MEALS.forEach(m => { state.wizardExcluded[m.key] = [..._wizardExcluded[m.key]]; });
    // Run smart generator using wizard style + exclusions
    const style = state.wizardStyle || 'simple';
    state.week = generateSmartWeek(style, state.wizardExcluded);
    saveState();
    updatePlanCreatedUI();
    showToast('✅ Το πλάνο δημιουργήθηκε βάσει των προτιμήσεών σου!');
    navigateTo('week');
  }
}

function wizardBack() {
  if (_wizardStep > 0) { _wizardStep--; _renderWizardStep(); }
}

function _closeWizard() {
  document.getElementById('wizard-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function _guessSlotMealKey(slotIdx, totalSlots) {
  if (totalSlots <= 3) return ['breakfast','lunch','dinner'][slotIdx] || 'lunch';
  return ['breakfast','snack','lunch','afternoon','dinner'][slotIdx] || 'lunch';
}

// ── SMART WEEK GENERATOR ──────────────────────────────────────
const MEAL_SLOT_TYPES = ['breakfast','snack','lunch','afternoon','dinner'];
function getWaterNotes() {
  return [
    tFmt('water_note_500ml', { total: '0.5L' }),
    tFmt('water_note_500ml', { total: '1.0L' }),
    tFmt('water_note_500ml', { total: '1.5L' }),
    tFmt('water_note_500ml', { total: '2.0L' }),
    t('water_note_1l'),
  ];
}
const WATER_NOTES = getWaterNotes();
const SLOT_TIMES = ['07:00','10:00','13:00','16:00','19:30'];

/**
 * Generate a randomised 7-day week plan.
 * @param {string} style  'simple' | 'gourmet' | 'mixed'
 * @param {Object} excludedPerMeal  { breakfast: ['id',...], lunch: [...], ... }
 */
function generateSmartWeek(style = 'simple', excludedPerMeal = {}) {
  const pool = _allMeals();

  // Normalise excluded sets
  const excSets = {};
  MEAL_SLOT_TYPES.forEach(t => {
    excSets[t] = new Set(excludedPerMeal[t] || []);
  });
  // snack excludes also count for afternoon
  excSets['afternoon'] = excSets['snack'];

  // Gourmet ratio per style: fraction of meals that should be gourmet
  // simple → 0, mixed → ~1/5, gourmet → ~2/3
  const GOURMET_RATIO = { simple: 0, mixed: 1/5, gourmet: 2/3 };
  const gourmetRatio = GOURMET_RATIO[style] ?? 0;

  // Track how many meals picked so far and how many were gourmet, per slot type
  const pickCount   = {}; // slotType → total picks
  const gourmetCount = {}; // slotType → gourmet picks
  MEAL_SLOT_TYPES.forEach(t => { pickCount[t] = 0; gourmetCount[t] = 0; });

  // Base candidates: slot-type match + exclusion filter + no side dishes
  // afternoon slot accepts both meal:"afternoon" and meal:"snack" entries
  function candidates(slotType) {
    return pool.filter(r => {
      const matchesSlot = r.meal === slotType
        || (slotType === 'afternoon' && (r.meal === 'afternoon' || r.meal === 'snack'));
      if (!matchesSlot) return false;
      if (r.side) return false;
      if (excSets[slotType] && excSets[slotType].has(r.id)) return false;
      return true;
    });
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // No-repeat-within-3-days: track by foodGroup (if set) or id
  // so that different size variants of the same food are treated as one
  const recentPickKeys = {}; // slotType → [last 3 group-or-id keys]
  MEAL_SLOT_TYPES.forEach(t => { recentPickKeys[t] = []; });

  function mealKey(r) { return r.foodGroup || r.id; }

  function pickOne(slotType) {
    const all = candidates(slotType);
    const simple  = all.filter(r => !GOURMET_IDS.has(r.id));
    const gourmet = all.filter(r =>  GOURMET_IDS.has(r.id));

    // Decide whether this pick should be gourmet based on running ratio
    const total  = pickCount[slotType];
    const gCount = gourmetCount[slotType];
    const targetGourmet = Math.round((total + 1) * gourmetRatio);
    const wantGourmet   = gCount < targetGourmet;

    let preferred = wantGourmet
      ? (gourmet.length ? gourmet : simple)
      : (simple.length  ? simple  : gourmet);
    if (!preferred.length) preferred = all;

    // Filter out food groups seen in the last 3 days; relax if nothing left
    const recent = recentPickKeys[slotType];
    let pool2 = preferred.filter(r => !recent.includes(mealKey(r)));
    if (!pool2.length) pool2 = preferred;
    if (!pool2.length) return null;

    const picked = shuffle(pool2)[0];
    recent.push(mealKey(picked));
    if (recent.length > 3) recent.shift();
    pickCount[slotType]++;
    if (GOURMET_IDS.has(picked.id)) gourmetCount[slotType]++;
    return picked;
  }

  const week = [];
  for (let di = 0; di < 7; di++) {
    const meals = MEAL_SLOT_TYPES.map((slotType, si) => {
      const picked = pickOne(slotType);
      return {
        time: SLOT_TIMES[si],
        type: slotType,
        recipeId: picked ? picked.id : DEFAULT_WEEK[di].meals[si]?.recipeId,
        done: false,
        waterNoteIdx: si,
        ...(picked && picked.kcal_est ? { standardId: picked.id } : {}),
      };
    });
    week.push({
      day: di + 1,
      label: tFmt('week_day_prefix', { n: di + 1 }),
      meals,
      stepsCount: DEFAULT_WEEK[di]?.stepsCount,
      stepsDone: false,
      weightTraining: false,
      extraKcal: 0,
    });
  }

  // Optimise each day independently to hit calorie + protein targets
  const targets = state?.goals || DEFAULT_GOALS;
  week.forEach(day => _optimiseDayMacros(day, targets));

  return week;
}

/**
 * Adjust meal scaleFactor values so the day hits calorie + protein targets.
 * Priority: 1-protein  2-calories  3-fat  4-carbs
 * Scale bounds: 0.6–1.6 (realistic portion range).
 * Strategy:
 *   Pass 1 — global uniform scale to hit kcal target
 *   Pass 2 — protein fine-tune: shift scale on high-protein meals to nail protein target
 *            while keeping kcal within ±50 kcal tolerance
 */
function _optimiseDayMacros(day, targets) {
  const KCAL_TOL  = 50;
  const PROT_TOL  = 5;
  const SF_MIN    = 0.6;
  const SF_MAX    = 1.6;

  const allMeals = [...RECIPES_DB, ...(state?.customRecipes || []), ...STANDARD_MEALS];

  // Helper: get base macros (at scaleFactor=1) for a meal slot object
  function baseMacros(m) {
    if (m.standardId) {
      const sm = STANDARD_MEALS.find(s => s.id === m.standardId);
      if (sm) return { kcal: sm.kcal_est || 0, p: sm.p || 0, c: sm.c || 0, f: sm.f || 0 };
    }
    if (m.recipeId) {
      const r = allMeals.find(x => x.id === m.recipeId);
      if (r && r.kcal_est) return { kcal: r.kcal_est || 0, p: r.p || 0, c: r.c || 0, f: r.f || 0 };
      if (r && r.fixedMacros) return { ...r.fixedMacros };
      if (r) return calcRecipeMacros(r, 1);
    }
    return { kcal: 0, p: 0, c: 0, f: 0 };
  }

  // Initialise scaleFactor to 1 for all meals
  day.meals.forEach(m => { if (m.scaleFactor === undefined) m.scaleFactor = 1; });

  // Sum raw day totals (at current scale)
  function dayTotals() {
    return day.meals.reduce((acc, m) => {
      const b = baseMacros(m);
      const sf = m.scaleFactor || 1;
      acc.kcal += b.kcal * sf;
      acc.p    += b.p    * sf;
      acc.c    += b.c    * sf;
      acc.f    += b.f    * sf;
      return acc;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }

  const raw = dayTotals();
  if (raw.kcal < 1) return; // no data, skip

  // ── Pass 1: Uniform scale to hit kcal target ──────────────────
  const uniformSF = Math.min(SF_MAX, Math.max(SF_MIN, targets.kcal / raw.kcal));
  day.meals.forEach(m => { m.scaleFactor = Math.round(uniformSF * 100) / 100; });

  // ── Pass 2: Protein fine-tune ──────────────────────────────────
  // Sort meals by protein density (p per kcal) descending — these are best levers
  const mealBases = day.meals.map(m => ({ m, b: baseMacros(m) }));
  const proteinRich = [...mealBases]
    .filter(({ b }) => b.kcal > 0 && b.p > 0)
    .sort((a, b) => (b.b.p / b.b.kcal) - (a.b.p / a.b.kcal));

  for (let iter = 0; iter < 8; iter++) {
    const cur = dayTotals();
    const proteinErr = targets.protein - cur.p;   // positive = need more protein
    const kcalErr    = targets.kcal    - cur.kcal; // positive = need more kcal

    // Within tolerance — stop early
    if (Math.abs(proteinErr) <= PROT_TOL && Math.abs(kcalErr) <= KCAL_TOL) break;

    // Pick the best lever: protein-rich meals if protein is off,
    // otherwise use all meals for a calorie-only correction
    const levers = Math.abs(proteinErr) > PROT_TOL ? proteinRich : mealBases;
    if (!levers.length) break;

    for (const { m, b } of levers) {
      if (b.kcal === 0) continue;
      const curSF  = m.scaleFactor || 1;
      const curP   = day.meals.reduce((s, x) => s + baseMacros(x).p * (x.scaleFactor || 1), 0);
      const curK   = day.meals.reduce((s, x) => s + baseMacros(x).kcal * (x.scaleFactor || 1), 0);

      const pErr = targets.protein - curP;
      const kErr = targets.kcal   - curK;

      // How much to change this meal's SF to correct protein, capped so kcal stays in tolerance
      let deltaSF = 0;
      if (Math.abs(pErr) > PROT_TOL) {
        deltaSF = pErr / b.p; // ideal delta to fix protein
        // Check resulting kcal impact
        const newK = curK + b.kcal * deltaSF;
        if (newK - targets.kcal > KCAL_TOL) {
          // Cap: how much headroom do we have on kcal?
          deltaSF = (targets.kcal + KCAL_TOL - curK) / b.kcal;
        } else if (targets.kcal - newK > KCAL_TOL) {
          deltaSF = (targets.kcal - KCAL_TOL - curK) / b.kcal;
        }
      } else if (Math.abs(kErr) > KCAL_TOL) {
        // Protein OK, fix kcal using this meal
        deltaSF = kErr / b.kcal;
      }

      const newSF = Math.min(SF_MAX, Math.max(SF_MIN, curSF + deltaSF));
      m.scaleFactor = Math.round(newSF * 100) / 100;
    }
  }

  // Final clamp — round to 2 dp for clean storage
  day.meals.forEach(m => {
    m.scaleFactor = Math.round(Math.min(SF_MAX, Math.max(SF_MIN, m.scaleFactor || 1)) * 100) / 100;
  });
}
// ─────────────────────────────────────────────────────────────

function updatePlanCreatedUI() {
  const created = !!state.planCreated;
  const displayVal = created ? '' : 'none';

  const sidebarPdf = document.getElementById('sidebar-pdf-btn');
  if (sidebarPdf) sidebarPdf.style.display = displayVal;

  const drawerPdf = document.getElementById('drawer-pdf-btn');
  if (drawerPdf) drawerPdf.style.display = displayVal;

  // today and week tabs — visually disabled when no plan
  ['today', 'week'].forEach(tab => {
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => {
      el.disabled = !created;
      el.style.opacity = created ? '' : '0.35';
      el.style.pointerEvents = created ? '' : 'none';
    });
  });
}

function saveDayStepsCount(val) {
  const day = state.week?.[state.currentDay];
  if (!day) return;
  const v = parseInt(val);
  day.stepsCount = isNaN(v) ? 8000 : Math.max(0, v);
  saveState();
  updateActivitySection();
}

function saveDayStepsDone(checked) {
  const day = state.week?.[state.currentDay];
  if (!day) return;
  day.stepsDone = !!checked;
  saveState();
  updateActivitySection();
}

function saveDayTraining(checked) {
  const day = state.week?.[state.currentDay];
  if (!day) return;
  day.weightTraining = !!checked;
  saveState();
  updateActivitySection();
}

function updateActivitySection() {
  const el = document.getElementById('act-section');
  if (!el) return;
  const day = state.week?.[state.currentDay];
  if (!day) return;
  const hasTraining = !!day.weightTraining;
  const { stepsKcal, trainingKcal, stepsCount, stepsDone } = calcDayActivityKcal(state.currentDay);
  const { totalBurn, consumed, deficit } = calcDayDeficit(state.currentDay);
  const deficitPos = deficit >= 0;
  const deficitColor = deficitPos ? '#22c55e' : '#ef4444';
  const weeklyStepsKcal = stepsKcal * 7;
  const motivMsg = deficitPos
    ? { icon: '🎯', title: t('deficit_on_track'), text: t('deficit_help') }
    : { icon: '⚠️', title: t('surplus_today'), text: t('surplus_help') };

  el.innerHTML = `
    <div class="card card-sm" style="padding:14px 16px;margin-bottom:10px">
      <div class="act-header" style="margin-bottom:14px">
        <span class="act-header-icon">🏃</span>
        <span class="act-header-title">${t('act_section_title')}</span>
      </div>
      <div class="act-inner-row">
        <div class="act-row-top">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="act-icon-badge" style="background:#ede9fe">🏋️</span>
            <span class="act-label">${t('act_training')}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${hasTraining ? 'checked' : ''} onchange="saveDayTraining(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        ${hasTraining ? `<div style="font-size:0.72rem;color:var(--text3);margin-bottom:4px">${tFmt('act_training_kcal', { kcal: trainingKcal })}</div>` : ''}
      </div>
      <div class="act-divider"></div>
      <div class="act-inner-row">
        <div class="act-row-top">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="act-icon-badge" style="background:#fef3c7">🔥</span>
            <span class="act-label">${t('act_neat')} <span style="color:var(--text3);font-weight:500">(NEAT)</span></span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${stepsDone ? 'checked' : ''} onchange="saveDayStepsDone(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="act-big-num" id="act-steps-display">${stepsCount.toLocaleString()} <span class="act-big-unit">${t('act_steps_unit')}</span></div>
        ${stepsDone ? `<div id="act-steps-kcal" style="font-size:0.72rem;color:var(--text3);margin-bottom:6px">${tFmt('act_steps_kcal_today', { kcal: stepsKcal, weekly: weeklyStepsKcal })}</div>` : '<div id="act-steps-kcal" style="height:6px"></div>'}
        <input type="range" id="act-steps-slider" min="1000" max="20000" step="500" value="${stepsCount}"
          class="act-slider"
          oninput="onStepsSliderInput(this.value)"
          onchange="saveDayStepsCount(this.value)">
        <div class="act-slider-ticks">
          <span>0k</span><span>2k</span><span>5k</span><span style="color:${stepsCount>=7000?'var(--green-d)':'var(--text3)'}">7k</span><span>10k</span><span>15k</span><span>20k+</span>
        </div>
      </div>
      <div class="act-divider"></div>
      <div class="act-inner-row">
        <div style="font-size:0.78rem;color:var(--text2);margin-bottom:10px">
          ${tFmt('act_total_burn', { kcal: totalBurn, bmr: consumed })}
        </div>
        <div style="font-size:1.6rem;font-weight:900;color:${deficitColor}">${deficitPos ? '−' : '+'}${Math.abs(deficit)} kcal</div>
        <div style="font-size:0.82rem;font-weight:600;color:${deficitColor};margin-top:2px">${deficitPos ? t('deficit_label') : t('surplus_label')}</div>
      </div>
      <div class="act-divider"></div>
      <div class="act-motiv" style="margin-bottom:0">
        <span class="act-motiv-icon">${motivMsg.icon}</span>
        <div>
          <div style="font-weight:700;font-size:0.88rem">${motivMsg.title}</div>
          <div style="font-size:0.78rem;color:var(--text2);margin-top:2px">${motivMsg.text}</div>
        </div>
      </div>
    </div>`;
}

function onStepsSliderInput(val) {
  const v = parseInt(val);
  const stepsEl = document.getElementById('act-steps-display');
  if (stepsEl) stepsEl.innerHTML = v.toLocaleString() + ' <span class="act-big-unit">' + t('act_steps_unit') + '</span>';
}

function saveDayKcalGoal(val) {
  const v = parseInt(val);
  if (v > 0 && v !== state.goals.kcal) {
    state.week[state.currentDay].kcalGoal = v;
  } else {
    delete state.week[state.currentDay].kcalGoal;
  }
  saveState();
  renderToday();
}

function saveExtraKcal() {
  const val = Math.round(_parseDecimal(document.getElementById('extra-kcal-input').value)) || 0;
  state.week[state.currentDay].extraKcal = val;
  saveState();
  renderToday();
  if (val > 0) showToast(tFmt('today_extra_added', { n: val }));
  else showToast(t('today_extra_cleared'));
}

function clearPrevExtra(dayIdx) {
  if (dayIdx >= 0) state.week[dayIdx].extraKcal = 0;
  saveState();
  renderToday();
}

function formatPlanDay(dayOffset) {
  if (!state.planStartDate) return tFmt('week_day_prefix', { n: dayOffset + 1 });
  const d = new Date(state.planStartDate);
  d.setDate(d.getDate() + dayOffset);
  const days = tDaysShort();
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
}

function getPlanDayLabel(dayIdx) {
  const base = tFmt('week_day_prefix', { n: dayIdx + 1 });
  if (!state.planStartDate) return base;
  return `${base} · ${formatPlanDay(dayIdx)}`;
}

// ── QUOTE — διαφορετική ανά άνοιγμα (timestamp-based) ──
function getTodayQuote() {
  // Αλλάζει κάθε φορά που φορτώνει η εφαρμογή (αλλά σταθερή εντός session)
  if (typeof _quoteIdx === 'undefined') {
    window._quoteIdx = Math.floor(Date.now() / (4 * 3600000)) % PHILOSOPHY_QUOTES.length;
  }
  return PHILOSOPHY_QUOTES[_quoteIdx];
}

// ── RENDER HELPERS ──
function mealTypePill(type) {
  const map = { breakfast: [tMeal('breakfast'),'pill-breakfast'], lunch: [tMeal('lunch'),'pill-lunch'], dinner: [tMeal('dinner'),'pill-dinner'], snack: [tMeal('snack'),'pill-snack'], afternoon: [tMeal('afternoon'),'pill-afternoon'] };
  const [label, cls] = map[type] || ['',''];
  return `<span class="meal-type-pill ${cls}">${label}</span>`;
}

function macroBar(val, max, color) {
  const pct = Math.min(100, Math.round((val / max) * 100));
  return `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function ring(pct) {
  const r = 38, circ = 2 * Math.PI * r;
  const dash = Math.min(pct, 100) / 100 * circ;
  return `<svg width="90" height="90" viewBox="0 0 90 90">
    <circle cx="45" cy="45" r="${r}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8"/>
    <circle cx="45" cy="45" r="${r}" fill="none" stroke="#fff" stroke-width="8"
      stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
  </svg>`;
}

// ── PAGE: TODAY ──
function renderToday() {
  const day = state.week[state.currentDay];
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const goals = state.goals;
  const effectiveKcal = day.kcalGoal || goals.kcal;  // per-day override
  const dayMacros = calcDayMacros(state.currentDay, false);
  const doneMacros = calcDayMacros(state.currentDay, true);
  const remaining = {
    kcal: Math.max(0, effectiveKcal - doneMacros.kcal),
    p: Math.max(0, goals.protein - doneMacros.p),
    c: Math.max(0, goals.carbs - doneMacros.c),
    f: Math.max(0, goals.fat - doneMacros.f),
  };
  const q = getTodayQuote();
  const kcalPct = Math.round((doneMacros.kcal / effectiveKcal) * 100);

  const mealDisplayTimes = getMealTimes();
  let runningKcal = 0;
  let mealsHtml = '';
  day.meals.forEach((meal, mi) => {
    // Υποστήριξη στάνταρ γεύματος
    const isStandard = !!meal.standardId;
    const sm = isStandard ? STANDARD_MEALS.find(s => s.id === meal.standardId) : null;
    const recipe = isStandard ? null : allRecipes.find(r => r.id === meal.recipeId);
    if (!recipe && !sm) return;

    const sf = meal.scaleFactor || 1;
    let m;
    if (isStandard) {
      m = {
        kcal: Math.round((sm.kcal_est || 0) * sf),
        p:    Math.round((sm.p   || 0) * sf),
        c:    Math.round((sm.c   || 0) * sf),
        f:    Math.round((sm.f   || 0) * sf),
      };
    } else {
      m = calcRecipeMacros(recipe, sf);
    }
    if (meal.done) runningKcal += m.kcal;

    const emoji = isStandard ? sm.emoji : recipe.emoji;
    const name  = isStandard ? (tName(sm) || sm.name) : tName(recipe);

    let bodyHtml = '';
    if (isStandard) {
      // Εμφάνιση items λίστας
      bodyHtml = `<div class="meal-ingredients">
        ${sm.items.map(it => `<div class="ingredient-row"><span class="ingredient-name">${it}</span></div>`).join('')}
      </div>
      <div class="meal-macros">
        <div class="macro-chip"><div class="macro-chip-val" style="color:#22c55e">~${m.kcal}</div><div class="macro-chip-lbl">kcal</div></div>
        <div class="macro-chip"><div class="macro-chip-val" style="color:#3b82f6">${m.p > 0 ? m.p + 'g' : '—'}</div><div class="macro-chip-lbl">${t('chip_prot')}</div></div>
        <div class="macro-chip"><div class="macro-chip-val" style="color:#8b5cf6">${m.c > 0 ? m.c + 'g' : '—'}</div><div class="macro-chip-lbl">${t('chip_carb')}</div></div>
        <div class="macro-chip"><div class="macro-chip-val" style="color:#f59e0b">${m.f > 0 ? m.f + 'g' : '—'}</div><div class="macro-chip-lbl">${t('chip_fat')}</div></div>
      </div>
      ${sf !== 1 ? `<div style="font-size:0.7rem;color:var(--text3);margin:4px 0">📏 ${t('chip_portion')} ×${sf}</div>` : ''}
      ${sm.note ? `
      <button class="recipe-expand-btn" onclick="toggleRecipeExpand(this)" aria-expanded="false">
        ${t('meal_serving_btn')} <span class="recipe-expand-arrow">▼</span>
      </button>
      <div class="recipe-expand-body">
        <div>
          <div class="recipe-serving"><span class="recipe-serving-icon">💡</span> ${sm.note}</div>
        </div>
      </div>` : ''}`;
    } else {
      const allFoods = [...FOODS_DB, ...state.customFoods];
      const ingHtml = recipe.ingredients.map(ing => {
        const food = allFoods.find(f => f.id === ing.foodId);
        if (!food) return '';
        let qty = ing.qty * sf;
        // Στρογγυλοποίηση: g→δεκάδα, κ.γ./κ.σ.→0.5, τεμ→1
        if (food.unit === 'g') qty = Math.round(qty / 10) * 10;
        else if (food.unit === 'κ.γ.' || food.unit === 'κ.σ.') qty = Math.round(qty * 2) / 2;
        else qty = Math.round(qty);
        // Whey πάντα 30g
        if (ing.foodId === 'f9' && food.unit === 'g') qty = 30;
        return `<div class="ingredient-row"><span class="ingredient-name">${esc(tName(food))}</span><span class="ingredient-qty">${qty}${food.unit}</span></div>`;
      }).join('');
      bodyHtml = `
        <div class="meal-macros">
          <div class="macro-chip"><div class="macro-chip-val" style="color:#22c55e">${m.kcal}</div><div class="macro-chip-lbl">kcal</div></div>
          <div class="macro-chip"><div class="macro-chip-val" style="color:#3b82f6">${m.p}g</div><div class="macro-chip-lbl">${t('chip_prot')}</div></div>
          <div class="macro-chip"><div class="macro-chip-val" style="color:#8b5cf6">${m.c}g</div><div class="macro-chip-lbl">${t('chip_carb')}</div></div>
          <div class="macro-chip"><div class="macro-chip-val" style="color:#f59e0b">${m.f}g</div><div class="macro-chip-lbl">${t('chip_fat')}</div></div>
        </div>
        <div class="meal-ingredients">${ingHtml}</div>
        ${(recipe.instructions || recipe.serving) ? `
        <button class="recipe-expand-btn" onclick="toggleRecipeExpand(this)" aria-expanded="false">
          ${t('meal_recipe_btn')} <span class="recipe-expand-arrow">▼</span>
        </button>
        <div class="recipe-expand-body">
          <div>
            ${recipe.instructions ? `<div class="recipe-instructions">${(tName(recipe,'instructions')||recipe.instructions).replace(/\n/g,'<br>')}</div>` : ''}
            ${recipe.serving ? `<div class="recipe-serving"><span class="recipe-serving-icon">🍽️</span> ${tName(recipe,'serving')||recipe.serving}</div>` : ''}
          </div>
        </div>` : ''}`;
    }

    mealsHtml += `
      <div class="meal-card ${meal.done ? 'done-card' : ''} fade-in" data-mi="${mi}">
        <div class="meal-card-header">
          <div class="meal-emoji">${emoji}</div>
          <div class="meal-meta">
            <div class="meal-time-row">
              <div class="meal-time-badge">🕐 ${mealDisplayTimes[meal.type] || meal.time}</div>
              ${mealTypePill(meal.type)}
            </div>
            <div class="meal-name">${name}</div>
          </div>
          <button class="meal-check ${meal.done ? 'checked' : ''}" onclick="toggleMealDone(${mi})">
            ${meal.done ? '✓' : ''}
          </button>
        </div>
        ${bodyHtml}
        ${meal.waterNoteIdx !== undefined ? `<div class="water-note">💧 ${getWaterNotes()[meal.waterNoteIdx]}</div>` : (meal.waterNote ? `<div class="water-note">💧 ${getWaterNotes()[meal.waterNote.includes('1L') ? 4 : ['0.5L','1.0L','1.5L','2.0L'].findIndex(x => meal.waterNote.includes(x))]||meal.waterNote}</div>` : '')}
        <div class="running-kcal">${t('today_running_total')}: <strong>${runningKcal} kcal</strong></div>
        <div class="meal-actions">
          <button class="btn btn-ghost btn-sm" onclick="openSwapMeal(${mi})">${t('meal_swap_btn')}</button>
          <button class="btn btn-ghost btn-sm" onclick="openScaleModal(${mi})">${t('meal_scale_btn')}</button>
        </div>
      </div>`;
  });

  document.getElementById('page-today').innerHTML = `
    <div class="container">
      <!-- Donate -->
      <div style="display:flex;justify-content:flex-end;padding-top:10px;padding-bottom:2px">
        <a href="https://revolut.me/dimitrtxl" target="_blank" rel="noopener" title="Υποστήριξε το VIVON" style="display:flex;align-items:center;gap:4px;padding:5px 13px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:#3b82f6;font-size:0.82rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:border-color 0.15s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border)'">&#9829; Δωρεά</a>
      </div>
      <!-- Day selector -->
      <div class="card card-sm fade-in">
        <div class="week-grid">
          ${state.week.map((d,i) => {
            const allDone = d.meals.length > 0 && d.meals.every(me => me.done);
            const hasExtra = (d.extraKcal || 0) > 0;
            const btnStyle = allDone
              ? 'background:var(--green);color:#fff;border-color:var(--green)'
              : hasExtra
              ? 'background:#ef4444;color:#fff;border-color:#ef4444'
              : '';
            const dateStr = state.planStartDate
              ? `<div style="font-size:0.55rem;opacity:0.85">${formatPlanDay(i)}</div>` : '';
            return `<button class="week-day-btn ${i===state.currentDay?'active':''}" onclick="setDay(${i})" style="${btnStyle}">
              <div class="wday">Η${d.day}</div>
              ${dateStr}
            </button>`;
          }).join('')}
        </div>
      </div>

      <!-- Quote -->
      <div class="quote-banner fade-in">
        <div class="quote-text">«${q.text}»</div>
        <div class="quote-author">— ${q.author}</div>
        <div class="quote-translation">${q.translation}</div>
      </div>

      <!-- Kcal Hero -->
      <div class="kcal-hero fade-in">
        <div class="kcal-hero-left">
          <h2>${t('today_remaining')}</h2>
          <div class="big-num">${remaining.kcal} <span style="font-size:1rem;font-weight:600;opacity:0.75">${t('today_kcal_day')}</span></div>
          <div class="sub">kcal · ${t('today_consumed')}: ${doneMacros.kcal} / ${goals.kcal}</div>
        </div>
        <div class="kcal-ring">
          ${ring(kcalPct)}
          <div class="kcal-ring-label">${kcalPct}%</div>
        </div>
      </div>

      <!-- Kcal ημέρας override -->
      <div class="card card-sm fade-in" style="padding:8px 12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.7rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">🎯 ${t('today_kcal_day_goal')}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span id="day-kcal-display" style="font-size:0.88rem;font-weight:700;color:var(--text1)">${effectiveKcal}</span>
            ${day.kcalGoal
              ? `<button class="btn btn-ghost btn-sm" onclick="saveDayKcalGoal(0)" style="font-size:0.68rem;padding:2px 6px" title="Reset">↺</button>`
              : `<span style="font-size:0.68rem;color:var(--text3)">default</span>`}
          </div>
        </div>
        <div style="position:relative;margin-bottom:4px">
          <input type="range" id="day-kcal-slider"
            min="${goals.kcal - 500}" max="${goals.kcal + 500}" step="50"
            value="${effectiveKcal}"
            style="width:100%;accent-color:var(--green)"
            oninput="
              document.getElementById('day-kcal-display').textContent = this.value;
              const offset = this.value - ${goals.kcal};
              const el = document.getElementById('day-kcal-offset');
              el.textContent = offset === 0 ? 'default' : (offset > 0 ? '+' + offset : offset) + ' kcal';
              el.style.color = offset === 0 ? 'var(--text3)' : offset > 0 ? '#f59e0b' : 'var(--green)';
            "
            onchange="saveDayKcalGoal(this.value)">
          <div style="display:flex;justify-content:space-between;font-size:0.58rem;color:var(--text3);margin-top:1px">
            <span>${goals.kcal - 500}</span>
            <span id="day-kcal-offset" style="font-weight:700;color:${day.kcalGoal ? (day.kcalGoal > goals.kcal ? '#f59e0b' : 'var(--green)') : 'var(--text3)'}">${day.kcalGoal ? (day.kcalGoal - goals.kcal > 0 ? '+' : '') + (day.kcalGoal - goals.kcal) + ' kcal' : 'default'}</span>
            <span>${goals.kcal + 500}</span>
          </div>
        </div>
        <div style="height:4px;border-radius:2px;background:var(--border);overflow:hidden">
          <div style="height:100%;border-radius:2px;background:var(--green);width:${Math.min(100,Math.round(doneMacros.kcal/effectiveKcal*100))}%;transition:width 0.4s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:0.62rem;color:var(--text3)">
          <span>${doneMacros.kcal} kcal</span>
          <span>${effectiveKcal} kcal</span>
        </div>
      </div>

      <!-- Activity & Deficit -->
      <div class="act-section fade-in" id="act-section"></div>


      <!-- Meals header + reset -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div class="section-title" style="margin:0">${day.label} — ${t('today_meals_header')}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="exportDayPDF(${state.currentDay})">🖨️</button>
          <button class="btn btn-ghost btn-sm" onclick="resetDayDone()">${t('today_reset_checks')}</button>
          <button class="btn btn-ghost btn-sm" onclick="resetDayMeals()">${t('today_reset_meals')}</button>
        </div>
      </div>
      ${mealsHtml}

      <!-- Add Meal Button -->
      <button class="btn btn-ghost btn-full" style="margin-bottom:10px" onclick="openAddMealModal()">${t('today_add_meal')}</button>

      <!-- Macros Dashboard -->
      <div class="dashboard-grid fade-in" style="margin-bottom:10px">
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">${t('macro_protein')}</div>
          <div class="macro-card-value" style="color:#3b82f6;font-size:1.1rem;margin:2px 0">${doneMacros.p}g</div>
          <div class="macro-card-sub" style="font-size:0.62rem">${goals.protein}g · −${remaining.p}g</div>
          ${macroBar(doneMacros.p, goals.protein, '#3b82f6')}
        </div>
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">${t('macro_carbs')}</div>
          <div class="macro-card-value" style="color:#8b5cf6;font-size:1.1rem;margin:2px 0">${doneMacros.c}g</div>
          <div class="macro-card-sub" style="font-size:0.62rem">${goals.carbs}g · −${remaining.c}g</div>
          ${macroBar(doneMacros.c, goals.carbs, '#8b5cf6')}
        </div>
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">${t('macro_fat')}</div>
          <div class="macro-card-value" style="color:#f59e0b;font-size:1.1rem;margin:2px 0">${doneMacros.f}g</div>
          <div class="macro-card-sub" style="font-size:0.62rem">${goals.fat}g · −${remaining.f}g</div>
          ${macroBar(doneMacros.f, goals.fat, '#f59e0b')}
        </div>
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">${t('today_consumed')}</div>
          <div class="macro-card-value" style="color:#22c55e;font-size:1.1rem;margin:2px 0">${doneMacros.kcal}</div>
          <div class="macro-card-sub" style="font-size:0.62rem">kcal · ${day.meals.filter(m=>m.done).length}/${day.meals.length} ${t('today_meals_header')}</div>
          ${macroBar(doneMacros.kcal, effectiveKcal, '#22c55e')}
        </div>
      </div>

      <!-- EXTRA KCAL ΕΚΤΟΣ ΠΛΑΝΟΥ -->
      ${(() => {
        const extraKcal = day.extraKcal || 0;
        // Reminder από χθες
        const prevDayIdx = state.currentDay > 0 ? state.currentDay - 1 : -1;
        const prevExtra = prevDayIdx >= 0 ? (state.week[prevDayIdx].extraKcal || 0) : 0;
        const reminderHtml = prevExtra > 0
          ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;font-size:0.82rem">
              ${tFmt('today_yesterday_extra', {n: prevExtra})}
              <button onclick="clearPrevExtra(${prevDayIdx})" style="border:none;background:none;cursor:pointer;color:var(--text3);float:right;font-size:0.75rem">✕</button>
            </div>`
          : '';
        return `<div class="card card-sm fade-in" style="margin-bottom:14px">
          <div class="section-title">${t('today_extra_kcal')}</div>
          ${reminderHtml}
          <p style="font-size:0.8rem;color:var(--text2);margin-bottom:10px">${t('today_extra_kcal_desc') || 'Φάγατε κάτι παραπάνω; Καταγράψτε το εδώ.'}</p>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="extra-kcal-input" value="${extraKcal||''}" min="0" max="5000" step="50"
              placeholder="e.g. 400"
              style="flex:1;padding:10px 12px;border:2px solid ${extraKcal>0?'#ef4444':'var(--border)'};border-radius:var(--radius-sm);font-size:1rem;font-weight:700;background:var(--bg2)">
            <span style="font-size:0.85rem;color:var(--text3);white-space:nowrap">kcal</span>
            <button class="btn btn-sm" style="background:${extraKcal>0?'#ef4444':'var(--green)'};color:#fff"
              onclick="saveExtraKcal()">💾</button>
          </div>
          ${extraKcal > 0 ? `<div style="margin-top:8px;font-size:0.78rem;color:#ef4444;font-weight:700">${t('today_day_total')}: ${dayMacros.kcal + extraKcal} kcal (+${extraKcal} ${t('today_outside_plan')})</div>` : ''}
        </div>`;
      })()}

      <!-- Supplements -->
      ${(() => {
        const supp = state.supplements || {};
        if (!supp.enabled) return '';
        const activeIds = supp.activeIds || [];
        if (activeIds.length === 0) return `<div class="card fade-in" style="padding:14px 16px">
          <div class="section-title" style="margin-bottom:6px">${t('suppl_section')}</div>
          <div style="font-size:0.8rem;color:var(--text3)">${t('suppl_no_active')}</div>
        </div>`;
        const done = supp.done || {};
        const active = SUPPLEMENTS_LIBRARY.filter(s => activeIds.includes(s.id));
        const custom = (supp.custom || []).filter(s => activeIds.includes(s.id));
        const allActive = [...active, ...custom];
        if (allActive.length === 0) return `<div class="card fade-in" style="padding:14px 16px">
          <div class="section-title" style="margin-bottom:6px">${t('suppl_section')}</div>
          <div style="font-size:0.8rem;color:var(--text3)">${t('suppl_no_active')}</div>
        </div>`;
        return `<div class="card fade-in">
          <div class="section-title" style="margin-bottom:10px">${t('suppl_section')}</div>
          ${active.map(s => {
            const isDone = !!done[s.id];
            return `<div class="supp-item">
              <button class="supp-check ${isDone?'checked':''}" onclick="toggleSupp('${s.id}')">${isDone?'✓':''}</button>
              <div class="supp-info" style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="supp-name">${tName(s)}</span>
                  <span style="font-size:0.68rem;color:var(--text3);font-weight:600">${tName(s,'timing')}</span>
                </div>
                <div class="supp-note">${tName(s,'intake')} · ${tName(s,'qty')}</div>
              </div>
              <button onclick="toggleSuppInfo('${s.id}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:1rem;padding:4px;flex-shrink:0">ℹ️</button>
            </div>
            <div id="supp-info-${s.id}" class="supp-guide" style="display:none">
              <div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_timing')}</span><span>${tName(s,'timing')}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_intake')}</span><span>${tName(s,'intake')}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_boosts')}</span><span>${tName(s,'boosts')}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_reduces')}</span><span>${tName(s,'reduces')}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_avoid')}</span><span>${tName(s,'avoid')}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_drinks')}</span><span>${tName(s,'drinks')}</span></div>
              ${(tName(s,'gap') || s.gap) !== '—' ? `<div class="supp-guide-row"><span class="supp-guide-label">${t('suppl_guide_gap')}</span><span>${tName(s,'gap')}</span></div>` : ''}
              <div class="supp-guide-tip">${tName(s,'tip')}</div>
              <div style="margin-top:6px;font-size:0.65rem;color:var(--text3)">${t('suppl_evidence_label')}: <strong>${tName(s,'evidence')}</strong> · ${tName(s,'ideal')}</div>
            </div>`;
          }).join('')}
          ${custom.map(s => {
            const isDone = !!done[s.id];
            return `<div class="supp-item">
              <button class="supp-check ${isDone?'checked':''}" onclick="toggleSupp('${s.id}')">${isDone?'✓':''}</button>
              <div class="supp-info" style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="supp-name">${esc(s.name)}</span>
                  ${s.timing ? `<span style="font-size:0.68rem;color:var(--text3);font-weight:600">${esc(s.timing)}</span>` : ''}
                </div>
                ${s.qty ? `<div class="supp-note">${esc(s.qty)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>`;
      })()}
    </div>`;
  updateActivitySection();
}

// ── PAGE: WEEK ──
function renderWeek() {
  const allR = [...RECIPES_DB, ...state.customRecipes];
  const mealOrder = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealMeta = {
    breakfast:  { label:tMeal('breakfast'),  color:'#f59e0b', bg:'#fffbeb', border:'#f59e0b' },
    snack:      { label:tMeal('snack'),      color:'#10b981', bg:'#f0fdf4', border:'#10b981' },
    lunch:      { label:tMeal('lunch'),      color:'#3b82f6', bg:'#eff6ff', border:'#3b82f6' },
    afternoon:  { label:tMeal('afternoon'),  color:'#06b6d4', bg:'#ecfeff', border:'#06b6d4' },
    dinner:     { label:tMeal('dinner'),     color:'#8b5cf6', bg:'#f5f3ff', border:'#8b5cf6' },
  };
  const dayNamesLong = tDays();
  function getDayTitle(di) {
    if (!state.planStartDate) return tFmt('week_day_prefix', { n: di + 1 });
    const d = new Date(state.planStartDate);
    d.setDate(d.getDate() + di);
    return dayNamesLong[d.getDay()];
  }

  // ── Εβδομαδιαία stats ──
  let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0, daysWithMeals = 0;
  const uniqueFoods = new Set();
  state.week.forEach((day, di) => {
    const m = calcDayMacros(di);
    if (m.kcal > 0) { totalKcal += m.kcal; daysWithMeals++; }
    totalP += m.p; totalC += m.c; totalF += m.f;
    day.meals.forEach(me => {
      if (me.standardId) return;
      const r = allR.find(x => x.id === me.recipeId);
      if (r) r.ingredients.forEach(ing => uniqueFoods.add(ing.foodId));
    });
  });
  const avgKcal = daysWithMeals > 0 ? Math.round(totalKcal / daysWithMeals) : 0;
  const goalKcal = state.goals.kcal;
  const avgPct = Math.round((avgKcal / goalKcal) * 100);
  const avgP = daysWithMeals > 0 ? Math.round(totalP / daysWithMeals) : 0;
  const avgC = daysWithMeals > 0 ? Math.round(totalC / daysWithMeals) : 0;
  const avgF = daysWithMeals > 0 ? Math.round(totalF / daysWithMeals) : 0;

  // Gauge SVG
  function weekGauge(pct) {
    const r = 52, circ = 2 * Math.PI * r;
    const clampedPct = Math.min(pct, 100);
    const dash = clampedPct / 100 * circ;
    const color = pct > 105 ? '#ef4444' : pct > 90 ? '#22c55e' : '#f59e0b';
    return `<svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="10"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="${color}" stroke-width="10"
        stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
        transform="rotate(-90 65 65)"/>
      <text x="65" y="60" text-anchor="middle" font-size="20" font-weight="800" fill="${color}">${pct}%</text>
      <text x="65" y="78" text-anchor="middle" font-size="9" fill="#9ca3af">${t('stats_avg_intake_svg')}</text>
    </svg>`;
  }

  function macroRow(label, val, goal, color) {
    const pct = Math.min(100, Math.round((val / goal) * 100));
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;font-weight:700;margin-bottom:4px">
        <span style="color:var(--text2)">${label}</span>
        <span style="color:var(--text3)">${val}g / ${goal}g &nbsp; <span style="color:${color}">${pct}%</span></span>
      </div>
      <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
        <div style="height:8px;width:${pct}%;background:${color};border-radius:4px"></div>
      </div>
    </div>`;
  }

  function weekBalance() {
    if (avgPct >= 88 && avgPct <= 108) return { label:t('week_balance_good'), sub:t('week_keep_going'), color:'#22c55e', bg:'rgba(34,197,94,0.08)' };
    if (avgPct < 88) return { label:t('week_balance_low'), sub:t('week_increase_kcal'), color:'#f59e0b', bg:'rgba(245,158,11,0.08)' };
    return { label:t('week_balance_high'), sub:t('week_decrease_kcal'), color:'#ef4444', bg:'rgba(239,68,68,0.08)' };
  }
  const bal = weekBalance();
  const balScore = Math.min(Math.round(avgPct), 999);
  const balArcR = 22, balCirc = 2 * Math.PI * balArcR;
  const balDash = Math.min(avgPct, 100) / 100 * balCirc;

  function getWeekRange() {
    if (!state.planStartDate) return '';
    const start = new Date(state.planStartDate);
    const end = new Date(state.planStartDate);
    end.setDate(end.getDate() + 6);
    const months = tMonths();
    return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
  }
  const weekRange = getWeekRange();
  const weightChange = state.profile ? ((avgKcal - (goalKcal || avgKcal)) * 7 / 7700).toFixed(1) : '0.0';

  // ── 7 ημερήσιες στήλες ──
  const cols = state.week.map((day, di) => {
    const m = calcDayMacros(di);
    const pct = Math.round((m.kcal / goalKcal) * 100);
    const allDone = day.meals.length > 0 && day.meals.every(me => me.done);
    const extraKcal = day.extraKcal || 0;
    const barColor = pct > 105 ? '#ef4444' : pct > 90 ? '#22c55e' : '#f59e0b';
    const borderTop = allDone ? '3px solid #22c55e' : extraKcal > 0 ? '3px solid #ef4444' : '3px solid transparent';
    const dateStr = state.planStartDate ? `<div style="font-size:0.62rem;color:var(--text3);margin-top:1px">${formatPlanDay(di)}</div>` : '';

    const byType = {};
    day.meals.forEach(me => {
      if (!byType[me.type]) byType[me.type] = [];
      byType[me.type].push(me);
    });

    const mealSections = mealOrder.map(type => {
      const meals = byType[type];
      if (!meals || meals.length === 0) return '';
      const meta = mealMeta[type];
      const typeKcal = meals.reduce((acc, me) => {
        if (me.standardId) {
          const sm = STANDARD_MEALS.find(s => s.id === me.standardId);
          return acc + (sm ? Math.round(sm.kcal_est * (me.scaleFactor||1)) : 0);
        }
        const r = allR.find(x => x.id === me.recipeId);
        return acc + (r ? calcRecipeMacros(r, me.scaleFactor||1).kcal : 0);
      }, 0);

      return meals.map(me => {
        const mi = day.meals.indexOf(me);
        let name = '', kcal = 0, emoji = '';
        if (me.standardId) {
          const sm = STANDARD_MEALS.find(s => s.id === me.standardId);
          if (!sm) return '';
          name = tName(sm) || sm.name; emoji = sm.emoji;
          kcal = Math.round(sm.kcal_est * (me.scaleFactor||1));
        } else {
          const r = allR.find(x => x.id === me.recipeId);
          if (!r) return '';
          const mac = calcRecipeMacros(r, me.scaleFactor||1);
          name = tName(r); emoji = r.emoji; kcal = mac.kcal;
        }
        return `<div style="margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-size:0.6rem;font-weight:800;color:${meta.color};text-transform:uppercase;letter-spacing:0.04em">${meta.label}</span>
            <span style="font-size:0.6rem;font-weight:700;color:${meta.color}">${typeKcal} kcal</span>
          </div>
          <div class="week-meal-chip" style="--chip-bg:${meta.bg};--chip-border:${meta.border};--chip-color:${meta.color}" onclick="openSwapMeal(${mi},${di})">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:1px">
              <span style="font-size:1.15rem;flex-shrink:0">${emoji}</span>
              <span style="font-size:0.7rem;font-weight:700;color:var(--text);line-height:1.3;flex:1">${name}</span>
              <span class="week-meal-edit-icon">✎</span>
            </div>
            <div style="font-size:0.62rem;color:${meta.color};font-weight:700">${kcal} kcal</div>
          </div>
        </div>`;
      }).join('');
    }).join('');

    return `<div class="week-day-card" style="border-top:${borderTop}">
      <div class="week-day-card-header" onclick="goToDay(${di})" title="${t('week_go_to_day')}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:900;font-size:0.85rem;color:var(--text)">${getDayTitle(di)}</div>
          <span style="font-size:0.6rem;color:var(--text3)">→</span>
        </div>
        ${dateStr}
        <div style="margin-top:6px">
          <div style="font-size:1rem;font-weight:900;color:${barColor}">${m.kcal > 0 ? m.kcal.toLocaleString() : '—'} kcal</div>
        </div>
      </div>
      <div class="week-day-card-body">
        ${mealSections || `<div style="font-size:0.65rem;color:var(--text3);text-align:center;padding:12px 0">${t('week_no_meal')}</div>`}
        ${allDone ? `<div style="margin-top:6px;text-align:center"><span style="font-size:0.62rem;color:#22c55e;font-weight:700;background:#dcfce7;border-radius:20px;padding:2px 8px">${t('week_completed')}</span></div>` : ''}
        ${extraKcal > 0 ? `<div style="margin-top:4px;font-size:0.62rem;color:#ef4444;font-weight:700;text-align:center">${tFmt('week_extra_kcal', {n: extraKcal})}</div>` : ''}
        ${(() => {
          const { deficit } = calcDayDeficit(di);
          const dc = deficit >= 0 ? '#22c55e' : '#ef4444';
          const sc = (day.stepsCount !== undefined && day.stepsCount !== null) ? day.stepsCount : 8000;
          return `<div style="margin-top:5px;font-size:0.6rem;text-align:center;color:${dc};font-weight:700">${deficit >= 0 ? '−' : '+'}${Math.abs(deficit)} kcal ${deficit >= 0 ? t('deficit_abbr') : t('surplus_abbr')}</div>
          <div style="font-size:0.55rem;color:var(--text3);text-align:center">${day.stepsDone ? `👣${(sc/1000).toFixed(1)}k` : ''}${day.weightTraining?' 🏋️':''}</div>`;
        })()}
      </div>
    </div>`;
  }).join('');

  document.getElementById('page-week').innerHTML = `
    <div style="padding:0 0 24px;background:var(--bg);min-height:100vh">

      <!-- Header -->
      <div class="week-page-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <h1 style="font-size:1.4rem;font-weight:900;color:var(--text);margin-bottom:4px">${t('week_title')}</h1>
            <div style="font-size:0.78rem;color:var(--text3)">${tFmt('week_days_kcal', { kcal: avgKcal.toLocaleString() })}</div>
          </div>
          <a href="https://revolut.me/dimitrtxl" target="_blank" rel="noopener" title="Υποστήριξε το VIVON" style="display:flex;align-items:center;gap:4px;padding:5px 13px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:#3b82f6;font-size:0.82rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:border-color 0.15s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border)'">&#9829; Δωρεά</a>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px">
          <div style="display:flex;align-items:center;gap:2px;background:var(--bg);border-radius:10px;padding:4px 8px;border:1px solid var(--border)">
            <button onclick="shiftWeek(-1)" style="border:none;background:none;cursor:pointer;font-size:1.1rem;color:var(--text2);padding:2px 6px;min-height:36px">‹</button>
            <button class="btn btn-ghost btn-sm" onclick="goToToday()">${t('week_today_btn')}</button>
            <button onclick="shiftWeek(1)" style="border:none;background:none;cursor:pointer;font-size:1.1rem;color:var(--text2);padding:2px 6px;min-height:36px">›</button>
          </div>
          ${weekRange ? `<div style="font-size:0.78rem;font-weight:700;color:var(--text2)">${weekRange}</div>` : ''}
          <div style="display:flex;gap:5px;margin-left:auto;align-items:center">
            <button id="week-regen-btn" onclick="confirmRegenerateInline()" title="Δημιούργησε Ξανά"
              style="display:flex;align-items:center;gap:5px;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:0.78rem;font-weight:700;cursor:pointer;transition:background .15s;white-space:nowrap"
              onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background=this.dataset.active==='1'?'var(--green)':'#3b82f6'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <span class="week-btn-label">${t('week_regen')}</span>
            </button>
            <button onclick="resetWeekPlan()" title="${t('week_reset')}"
              style="display:flex;align-items:center;gap:5px;background:none;border:1.5px solid var(--border);border-radius:8px;padding:5px 10px;font-size:0.78rem;font-weight:700;color:var(--text3);cursor:pointer;transition:all .15s;white-space:nowrap"
              onmouseover="this.style.borderColor='#ef4444';this.style.color='#ef4444'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
              <span class="week-btn-label">${t('week_reset')}</span>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="exportPDF()" title="PDF">🖨️ <span class="week-btn-label">PDF</span></button>
            <button class="btn btn-ghost btn-sm" onclick="copyDay()" title="${t('week_copy_btn')}">📋</button>
          </div>
        </div>
      </div>

      <!-- Summary strip -->
      <div style="background:var(--card);border-bottom:1px solid var(--border);padding:16px 20px">
        <div class="week-summary-inner" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          <!-- Gauge -->
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
            ${weekGauge(avgPct)}
            <div style="font-size:0.8rem;font-weight:800;color:var(--text);margin-top:2px">${t('week_avg_intake')}</div>
            <div style="font-size:1.1rem;font-weight:900;color:var(--text)">${avgKcal.toLocaleString()} kcal</div>
            <div style="font-size:0.72rem;color:var(--text3)">${t('stats_goal')}: ${goalKcal.toLocaleString()} kcal</div>
          </div>
          <!-- Macros -->
          <div style="flex:1;min-width:200px">
            <div style="font-size:0.75rem;font-weight:800;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">${t('week_macros_avg')}</div>
            ${macroRow(t('macro_protein'), avgP, state.goals.protein || 160, '#3b82f6')}
            ${macroRow(t('macro_carbs'),   avgC, state.goals.carbs || 200,   '#8b5cf6')}
            ${macroRow(t('macro_fat'),     avgF, state.goals.fat || 60,     '#f59e0b')}
          </div>
          <!-- Balance -->
          <div style="background:${bal.bg};border-radius:12px;padding:14px 18px;min-width:160px;text-align:center;border:1px solid ${bal.color}33;display:flex;flex-direction:column;align-items:center;gap:6px">
            <div style="font-size:0.65rem;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.08em">${t('week_balance_title')}</div>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="${balArcR}" fill="none" stroke="var(--border)" stroke-width="5"/>
              <circle cx="30" cy="30" r="${balArcR}" fill="none" stroke="${bal.color}" stroke-width="5"
                stroke-dasharray="${balDash} ${balCirc}" stroke-dashoffset="${balCirc * 0.25}"
                stroke-linecap="round" style="transition:stroke-dasharray 0.5s ease"/>
              <text x="30" y="35" text-anchor="middle" font-size="13" font-weight="800" fill="${bal.color}" font-family="inherit">${balScore}%</text>
            </svg>
            <div style="font-size:0.78rem;font-weight:700;color:${bal.color};line-height:1.2">${bal.label}</div>
            <div style="font-size:0.68rem;color:var(--text3);line-height:1.3">${bal.sub}</div>
          </div>
        </div>
      </div>

      <!-- 7-day grid -->
      <div style="padding:12px 12px 8px">
        <div class="week-days-grid">
          ${cols}
        </div>
      </div>

      <!-- Weekly Deficit Summary -->
      ${(() => {
        let weeklyDeficit = 0, weeklyBurn = 0, weeklyConsumed = 0;
        const dayDeficits = state.week.map((d, di) => {
          const { totalBurn, consumed, deficit } = calcDayDeficit(di);
          weeklyDeficit += deficit;
          weeklyBurn += totalBurn;
          weeklyConsumed += consumed;
          const { stepsKcal, trainingKcal, stepsCount, stepsDone } = calcDayActivityKcal(di);
          return { deficit, stepsCount, stepsDone, hasTraining: !!d.weightTraining, stepsKcal, trainingKcal };
        });
        const deficitColor = weeklyDeficit >= 0 ? '#22c55e' : '#ef4444';
        const kgEquiv = (weeklyDeficit / 7700).toFixed(2);
        const kgColor = parseFloat(kgEquiv) >= 0 ? '#22c55e' : '#ef4444';
        const dayNames7Short = tDaysShort();
        function getShortDayTitle(di) {
          if (!state.planStartDate) return tFmt('week_day_prefix', { n: di + 1 }).substring(0,2);
          const d = new Date(state.planStartDate);
          d.setDate(d.getDate() + di);
          return dayNames7Short[d.getDay()];
        }
        const barCells = dayDeficits.map((dd, i) => {
          const dColor = dd.deficit >= 0 ? '#22c55e' : '#ef4444';
          return `<div style="text-align:center;flex:1">
            <div style="font-size:0.6rem;color:var(--text3);margin-bottom:3px">${getShortDayTitle(i)}</div>
            <div style="font-size:0.7rem;font-weight:800;color:${dColor}">${dd.deficit >= 0 ? '-' : '+'}${Math.abs(dd.deficit)}</div>
            <div style="font-size:0.55rem;color:var(--text3)">${dd.stepsDone ? `👣${(dd.stepsCount/1000).toFixed(1)}k` : ''}${dd.hasTraining ? ' 🏋️' : ''}</div>
          </div>`;
        }).join('');

        // ── Πρόβλεψη βάσει TDEE συντήρησης ──
        const tdee = calcTDEE(state.profile);
        const goalKcalPerDay = state.goals.kcal || tdee;
        const tdeeWeeklyDeficit = (tdee - goalKcalPerDay) * 7;
        const tdeeKgEquiv = (tdeeWeeklyDeficit / 7700).toFixed(2);
        const tdeeColor = tdeeWeeklyDeficit >= 0 ? '#22c55e' : '#ef4444';

        // ── Πραγματική μεταβολή βάρους από bodyLog ──
        let actualWeightHtml = '';
        if (state.planStartDate && (state.bodyLog || []).length >= 2) {
          const startDate = state.planStartDate;
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 6);
          const endDateStr = endDate.toISOString().split('T')[0];
          const log = state.bodyLog;
          // Βρες μέτρηση πριν/στην αρχή και μέτρηση μετά/στο τέλος της εβδομάδας
          const before = [...log].reverse().find(e => e.date <= startDate);
          const after  = [...log].find(e => e.date >= startDate && e.date <= endDateStr);
          const afterOrLatest = after || (log[log.length - 1].date > startDate ? log[log.length - 1] : null);
          if (before && afterOrLatest && before.date !== afterOrLatest.date) {
            const actualDelta = afterOrLatest.weight - before.weight;
            const actualColor = actualDelta <= 0 ? '#22c55e' : '#ef4444';
            const sign = actualDelta <= 0 ? '' : '+';
            actualWeightHtml = `
              <div style="background:#f8fafc;border-radius:10px;padding:12px 14px;border:1.5px solid #e2e8f0;margin-top:12px">
                <div style="font-size:0.68rem;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${t('week_real_weight')}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                  <div style="font-size:0.75rem;color:var(--text2)">
                    ${before.date}: <strong>${before.weight}kg</strong> → ${afterOrLatest.date}: <strong>${afterOrLatest.weight}kg</strong>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:1.2rem;font-weight:900;color:${actualColor}">${sign}${actualDelta.toFixed(1)} kg</div>
                    <div style="font-size:0.62rem;color:var(--text3)">${t('week_real_change')}</div>
                  </div>
                </div>
              </div>`;
          }
        }

        return `<div style="padding:0 16px;margin-bottom:10px">
          <div style="background:var(--card);border-radius:12px;padding:16px;box-shadow:var(--shadow);border:1px solid var(--border)">
            <div style="font-size:0.75rem;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">${t('week_activity_title')}</div>
            <div style="display:flex;gap:0;margin-bottom:14px">${barCells}</div>
            <div style="font-size:0.78rem;color:var(--text2)">
              ${t('week_total_burn')} <strong>${weeklyBurn.toLocaleString()} kcal</strong><br>
              ${t('week_total_consumed')} <strong>${weeklyConsumed.toLocaleString()} kcal</strong>
            </div>

            <!-- Προβλέψεις απώλειας -->
            <div class="week-deficit-grid" style="margin-top:10px">
              <!-- Πρόβλεψη βάσει TDEE συντήρησης -->
              <div style="background:#f0fdf4;border-radius:8px;padding:8px 10px;border:1.5px solid #bbf7d0">
                <div style="font-size:0.6rem;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${t('week_tdee_based')}</div>
                <div style="font-size:0.65rem;color:#166534;margin-bottom:3px">${tFmt('week_tdee_goal', {tdee: tdee.toLocaleString(), goal: goalKcalPerDay.toLocaleString()})}</div>
                <div style="display:flex;align-items:baseline;gap:6px">
                  <div style="font-size:1rem;font-weight:900;color:${tdeeColor}">${tdeeWeeklyDeficit >= 0 ? '−' : '+'}${Math.abs(tdeeWeeklyDeficit).toLocaleString()} kcal</div>
                  <div style="font-size:0.7rem;font-weight:700;color:${tdeeColor}">≈ ${parseFloat(tdeeKgEquiv) >= 0 ? '-' : '+'}${Math.abs(parseFloat(tdeeKgEquiv))} kg</div>
                </div>
              </div>
              <!-- Πρόβλεψη βάσει πραγματικής καύσης -->
              <div style="background:#eff6ff;border-radius:8px;padding:8px 10px;border:1.5px solid #bfdbfe">
                <div style="font-size:0.6rem;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${t('week_real_burn')}</div>
                <div style="font-size:0.65rem;color:#1e3a8a;margin-bottom:3px">${tFmt('week_real_burn_detail', {burn: weeklyBurn.toLocaleString(), consumed: weeklyConsumed.toLocaleString()})}</div>
                <div style="display:flex;align-items:baseline;gap:6px">
                  <div style="font-size:1rem;font-weight:900;color:${deficitColor}">${weeklyDeficit >= 0 ? '−' : '+'}${Math.abs(weeklyDeficit).toLocaleString()} kcal</div>
                  <div style="font-size:0.7rem;font-weight:700;color:${kgColor}">≈ ${parseFloat(kgEquiv) >= 0 ? '-' : '+'}${Math.abs(parseFloat(kgEquiv))} kg</div>
                </div>
              </div>
            </div>

            ${actualWeightHtml}
          </div>
        </div>`;
      })()}

      <!-- Footer stats -->
      <div style="padding:0 16px">
        <div class="week-footer-grid" style="background:var(--card);border-radius:12px;padding:16px;box-shadow:var(--shadow);border:1px solid var(--border)">
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">🔥</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">${t('week_total')}</div>
            <div style="font-size:1rem;font-weight:900;color:var(--text)">${totalKcal.toLocaleString()} kcal</div>
            <div style="font-size:0.65rem;color:var(--text3)">${tFmt('week_avg_kcal_day', { kcal: avgKcal.toLocaleString() })}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">🌿</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">${t('week_food_variety')}</div>
            <div style="font-size:1rem;font-weight:900;color:var(--text)">${tFmt('week_food_variety_count', { n: uniqueFoods.size })}</div>
            <div style="font-size:0.65rem;color:${uniqueFoods.size >= 30 ? '#22c55e' : '#f59e0b'}">${uniqueFoods.size >= 30 ? t('diversity_great') : t('diversity_more')}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">💧</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">${t('week_hydration')}</div>
            <div style="font-size:1rem;font-weight:900;color:var(--text)">${(state.profile.weight * 0.035).toFixed(1)}L</div>
            <div style="font-size:0.65rem;color:var(--text3)">${tFmt('week_hydration_goal', { ml: Math.round(state.profile.weight * 35) })}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">🎯</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">${t('week_goal_progress')}</div>
            <div style="font-size:1rem;font-weight:900;color:${parseFloat(weightChange) <= 0 ? '#22c55e' : '#ef4444'}">${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange} kg</div>
            <div style="font-size:0.65rem;color:var(--text3)">${t('week_this_week')}</div>
          </div>
        </div>
      </div>


    </div>`;
}

function confirmRegenerateInline() {
  const style = state.wizardStyle || 'simple';
  const excPerMeal = state.wizardExcluded || {};
  state.week = generateSmartWeek(style, excPerMeal);
  saveState();
  renderWeek();
  showToast(`🎲 ${tFmt('toast_plan_style', { style: { simple: t('wizard_simple_title'), mixed: t('wizard_mixed_title'), gourmet: t('wizard_gourmet_title') }[style] })}`);
  // Flash button green
  const btn = document.getElementById('week-regen-btn');
  if (btn) {
    btn.dataset.active = '1';
    btn.style.background = 'var(--green)';
    setTimeout(() => {
      btn.dataset.active = '';
      btn.style.background = '#3b82f6';
    }, 2000);
  }
}

function regeneratePlan() {
  const cur = state.wizardStyle || 'simple';
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${t('week_regen_title')}</div>
    <p style="font-size:0.83rem;color:var(--text2);margin-bottom:14px">${t('week_regen_desc')}</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">
      ${[['simple','🥗',t('wizard_simple_title'),t('wizard_simple_sub').substring(0,40)],
         ['mixed','🍲',t('wizard_mixed_title'),t('wizard_mixed_sub').substring(0,40)],
         ['gourmet','👨‍🍳',t('wizard_gourmet_title'),t('wizard_gourmet_sub').substring(0,40)]].map(([s,e,sl,d]) => `
        <div id="rg_${s}" onclick="document.querySelectorAll('[id^=rg_]').forEach(x=>x.style.borderColor='var(--border)');this.style.borderColor='var(--green)';_tmpRgStyle='${s}'"
          style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:2px solid ${s===cur?'var(--green)':'var(--border)'};border-radius:12px;cursor:pointer;transition:border-color .15s">
          <span style="font-size:1.3rem">${e}</span>
          <div><div style="font-weight:700;font-size:0.88rem">${sl}</div><div style="font-size:0.74rem;color:var(--text3)">${d}</div></div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:10px">
      <button onclick="closeModal()" class="btn btn-ghost" style="flex:1">${t('btn_cancel')}</button>
      <button onclick="confirmRegenerate()" class="btn btn-green" style="flex:1">${t('week_regen_btn')}</button>
    </div>
  `);
  window._tmpRgStyle = cur;
}

function confirmRegenerate() {
  closeModal();
  const style = window._tmpRgStyle || state.wizardStyle || 'simple';
  state.wizardStyle = style;
  const excPerMeal = state.wizardExcluded || {};
  state.week = generateSmartWeek(style, excPerMeal);
  saveState();
  renderWeek();
  showToast(`🎲 ${tFmt('toast_plan_style', { style: { simple: t('wizard_simple_title'), mixed: t('wizard_mixed_title'), gourmet: t('wizard_gourmet_title') }[style] })}`);
}

function resetWeekPlan() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${t('week_reset_title')}</div>
    <p style="font-size:0.85rem;color:var(--text2);line-height:1.6;margin-bottom:20px">
      ${t('week_reset_desc')}
    </p>
    <div style="display:flex;gap:10px">
      <button onclick="closeModal()" class="btn btn-ghost" style="flex:1">${t('btn_cancel')}</button>
      <button onclick="confirmResetWeekPlan()" class="btn" style="flex:1;background:#ef4444;color:#fff;border:none">${t('week_reset_btn')}</button>
    </div>
  `);
}
function confirmResetWeekPlan() {
  closeModal();
  state.week = JSON.parse(JSON.stringify(DEFAULT_WEEK));
  saveState();
  renderWeek();
  showToast(t('week_reset_done'));
}

// ── PAGE: RECIPES ──
function renderRecipes(filter = '') {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const mealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealLabels = {
    breakfast: '☀️ ' + t('meal_breakfasts'),
    snack:     '🍎 ' + t('meal_snacks'),
    lunch:     '🥗 ' + t('meal_lunches'),
    afternoon: '☕ ' + t('meal_afternoons'),
    dinner:    '🌙 ' + t('meal_dinners'),
  };

  let html = `
    <div class="rc-card">
        <div class="rc-header">
          <span class="rc-title">${t('recipes_title')}</span>
          <button class="rc-new-btn" onclick="openAddRecipeModal()">${t('btn_new_recipe')}</button>
        </div>
        <div class="rc-search">
          <svg class="rc-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="${t('search_recipe')}" value="${filter}" oninput="renderRecipes(this.value)">
        </div>
        <div class="recipe-filter-pills">
          <button class="recipe-pill active" onclick="filterRecipeType('all',this)">${t('filter_all')}</button>
          <button class="recipe-pill" onclick="filterRecipeType('breakfast',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> ${t('meal_breakfasts')}</button>
          <button class="recipe-pill" onclick="filterRecipeType('snack',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 2c-1 2-1.5 4-1.5 6s.5 4 1.5 6"/><path d="M2 12h20"/></svg> ${t('meal_snacks')}</button>
          <button class="recipe-pill" onclick="filterRecipeType('lunch',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> ${t('meal_lunches')}</button>
          <div class="recipe-filter-pills-break"></div>
          <button class="recipe-pill" onclick="filterRecipeType('afternoon',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg> ${t('meal_afternoons')}</button>
          <button class="recipe-pill" onclick="filterRecipeType('dinner',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> ${t('meal_dinners')}</button>
        </div>
      </div>`;

  mealTypes.forEach(type => {
    const recipes = allRecipes.filter(r => r.meal === type && (!filter || tName(r).toLowerCase().includes(filter.toLowerCase())));
    if (!recipes.length) return;
    html += `<div class="section-title" data-type="${type}">${mealLabels[type]}</div>
      <div class="recipes-grid" data-type="${type}">
        ${recipes.map(r => {
          const m = calcRecipeMacros(r);
          const isFav = state.favorites.includes(r.id);
          return `<div class="recipe-card ${isFav?'favorite':''}" onclick="openRecipeDetail('${r.id}')">
            <div class="recipe-card-emoji">${r.emoji}</div>
            <div class="recipe-card-name">${esc(tName(r))}</div>
            <div class="recipe-card-kcal">${m.kcal} kcal</div>
            <div class="recipe-card-meal">${t('macro_p_abbr')}:${m.p}g | ${t('macro_c_abbr')}:${m.c}g | ${t('macro_f_abbr')}:${m.f}g</div>
            <button style="margin-top:6px;font-size:0.8rem;border:none;background:none;cursor:pointer" onclick="event.stopPropagation();toggleFavorite('${r.id}')">${isFav?'⭐':'☆'}</button>
          </div>`;
        }).join('')}
      </div>`;
  });
  html += '</div>';
  document.getElementById('page-recipes').innerHTML = html;
}

function filterRecipeType(type, btn) {
  document.querySelectorAll('.recipe-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('[data-type]').forEach(el => {
    el.style.display = (type === 'all' || el.dataset.type === type) ? '' : 'none';
  });
}

// ── PAGE: FOODS / LEXIKO ──
function renderFoods(filter = '') {
  const allFoods = [...FOODS_DB, ...state.customFoods];
  const categories = {
    protein: '🥩 ' + tCategory('protein'),
    carbs:   '🍚 ' + tCategory('carbs'),
    veggie:  '🥦 ' + tCategory('veggie'),
    fat:     '🫒 ' + tCategory('fat'),
    dairy:   '🥛 ' + tCategory('dairy'),
    fruit:   '🍎 ' + tCategory('fruit'),
    other:   '🧂 ' + tCategory('other'),
  };
  const q = filter.toLowerCase();

  let html = `
    <div class="foods-wrap">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2>${t('foods_title')}</h2>
        <button class="btn btn-green btn-sm" onclick="openAddFoodModal()">${t('foods_new_btn')}</button>
      </div>
      <div class="search-wrap"><span class="search-icon">🔍</span>
        <input type="text" placeholder="${t('search_food')}" value="${filter}" oninput="renderFoods(this.value)">
      </div>`;

  Object.entries(categories).forEach(([cat, label]) => {
    const foods = allFoods.filter(f => f.category === cat && (!q || f.name.toLowerCase().includes(q)));
    if (!foods.length) return;
    html += `<div class="food-section">
      <div class="food-section-title">${label}</div>
      ${foods.map(f => {
        const per = f.unit === 'τεμ' ? `/ ${t('unit_piece')}` : `/ 100${f.unit}`;
        return `<div class="food-row" onclick="openFoodDetail('${f.id}')">
          <div>
            <div class="food-row-name">${tName(f)}</div>
            <div class="food-row-sub">${t('macro_p_abbr')}:${f.per100.p}g · ${t('macro_c_abbr')}:${f.per100.c}g · ${t('macro_f_abbr')}:${f.per100.f}g ${per}</div>
          </div>
          <div class="food-row-kcal">${f.per100.kcal} kcal</div>
        </div>`;
      }).join('')}
    </div>`;
  });
  html += '</div>';
  document.getElementById('page-foods').innerHTML = html;
}

// ── PAGE: OPTIMIZE ──
function renderOptimize() {
  const g = state.goals;
  const savedTemplates = state.dayTemplates || [];

  document.getElementById('page-optimize').innerHTML = `
    <div class="container">
      <h2 style="margin-bottom:14px">⚡ Βελτιστοποίηση & Πλάνο</h2>

      <!-- Τρέχοντες στόχοι (read-only, από ρυθμίσεις) -->
      <div class="card card-lg fade-in" style="margin-bottom:14px">
        <div class="section-title">🎯 Τρέχοντες Στόχοι</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.82rem">
          <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:10px;text-align:center">
            <div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">🔥 Θερμίδες</div>
            <strong style="color:var(--amber)">${g.kcal} kcal</strong>
          </div>
          <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:10px;text-align:center">
            <div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">🥩 Πρωτεΐνη</div>
            <strong style="color:var(--blue)">${g.protein}g</strong>
          </div>
          <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:10px;text-align:center">
            <div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">🍚 Υδατάνθρακες</div>
            <strong style="color:var(--green-d)">${g.carbs}g</strong>
          </div>
          <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:10px;text-align:center">
            <div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">🫒 Λίπος</div>
            <strong style="color:var(--purple)">${g.fat}g</strong>
          </div>
        </div>
        <div style="margin-top:10px;font-size:0.72rem;color:var(--text3);text-align:center">
          Για αλλαγή στόχων πήγαινε στις <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;padding:4px 10px" onclick="showSettingsTab('profile');document.querySelectorAll('[data-tab=settings]').forEach(b=>b.click())">⚙️ Ρυθμίσεις</button>
        </div>
      </div>

      <!-- AI Optimization -->
      <div class="card card-lg fade-in" style="margin-bottom:14px">
        <div class="section-title">✨ AI Βελτιστοποίηση Εβδομάδας</div>
        <div style="font-size:0.8rem;color:var(--text2);margin-bottom:12px;line-height:1.5">
          Αναλύει το τρέχον πλάνο και αναδιατάσσει τα γεύματα ώστε να αποφύγει επαναλήψεις (π.χ. γιαούρτι πρωί <em>και</em> βράδυ) και να μεγιστοποιήσει την ποικιλία.
        </div>
        <button id="ai-optimize-btn-settings" class="btn btn-green" style="width:100%;font-size:0.95rem;font-weight:800;padding:12px" onclick="optimizeWeekWithAI()">
          ${t('builder_optimize_ai')}
        </button>
      </div>

      <!-- Mode + Apply -->
      <div class="card card-lg fade-in">
        <div class="section-title">🤖 Αυτόματη Κλιμάκωση</div>
        <div class="mode-tabs">
          <button class="mode-tab ${state.optimizeMode===1?'active':''}" onclick="setMode(1)">${t('optimize_mode1')}<br><span style="font-size:0.65rem;font-weight:400">${t('builder_mode1_label')}</span></button>
          <button class="mode-tab ${state.optimizeMode===2?'active':''}" onclick="setMode(2)">Mode 2<br><span style="font-size:0.65rem;font-weight:400">Νέος Στόχος kcal</span></button>
          <button class="mode-tab ${state.optimizeMode===3?'active':''}" onclick="setMode(3)">Mode 3<br><span style="font-size:0.65rem;font-weight:400">Custom Macros</span></button>
        </div>
        <div id="mode-desc" style="background:var(--bg);border-radius:var(--radius-sm);padding:10px;margin-bottom:14px;font-size:0.82rem;color:var(--text2)">
          ${getModeDesc(state.optimizeMode)}
        </div>
        <!-- Εφαρμογή: μία ή όλες -->
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="runOptimize(false)">▶ Ημέρα ${state.currentDay+1}</button>
          <button class="btn btn-green btn-sm" style="flex:1" onclick="runOptimize(true)">▶▶ Όλες οι Ημέρες</button>
        </div>
      </div>

      <!-- 💾 Αποθήκευση Ημέρας ως Template -->
      <div class="card card-lg fade-in">
        <div class="section-title">💾 Αποθήκευση Ημέρας ως Πρότυπο</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="text" id="template-name" placeholder="Όνομα προτύπου (π.χ. Ημέρα Αδύνατη)"
            style="flex:1;padding:9px 12px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;background:var(--bg2)">
          <button class="btn btn-green btn-sm" onclick="saveDayAsTemplate()">💾</button>
        </div>

        <!-- Saved templates -->
        ${savedTemplates.length ? `
          <div class="section-title" style="margin-bottom:8px">📂 Αποθηκευμένα Πρότυπα</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${savedTemplates.map((tpl, ti) => {
              const kcal = tpl.meals.reduce((acc, m) => {
                if (m.standardId) {
                  const sm = STANDARD_MEALS.find(s => s.id === m.standardId);
                  return acc + (sm ? sm.kcal_est : 0);
                }
                const allR = [...RECIPES_DB, ...state.customRecipes];
                const r = allR.find(x => x.id === m.recipeId);
                if (!r) return acc;
                return acc + calcRecipeMacros(r, m.scaleFactor||1).kcal;
              }, 0);
              return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg2);border-radius:var(--radius-sm);padding:10px 12px;border:1px solid var(--border)">
                <div>
                  <div style="font-weight:700;font-size:0.88rem">${tpl.name}</div>
                  <div style="font-size:0.72rem;color:var(--text3)">${tpl.meals.length} γεύματα · ~${kcal} kcal</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" onclick="loadTemplate(${ti})">▶ Εφάρμοσε</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteTemplate(${ti})">🗑</button>
                </div>
              </div>`;
            }).join('')}
          </div>` : `<div style="font-size:0.82rem;color:var(--text3)">Δεν υπάρχουν αποθηκευμένα πρότυπα ακόμα.</div>`}
      </div>
    </div>`;
}

function getModeDesc(mode) {
  const descs = {
    1: '💡 <strong>Mode 1:</strong> Κρατά ίδιες θερμίδες και αυξάνει την πρωτεΐνη όσο γίνεται, τροποποιώντας τις ποσότητες.',
    2: '💡 <strong>Mode 2:</strong> Προσαρμόζει αυτόματα όλες τις ποσότητες για να επιτύχει τον νέο θερμιδικό στόχο.',
    3: '💡 <strong>Mode 3:</strong> Αναπροσαρμόζει τις ποσότητες ώστε να επιτευχθούν οι custom στόχοι macros.'
  };
  return descs[mode] || '';
}

function setMode(m) {
  state.optimizeMode = m;
  document.querySelectorAll('.mode-tab').forEach((b,i) => b.classList.toggle('active', i===m-1));
  document.getElementById('mode-desc').innerHTML = getModeDesc(m);
  saveState();
}

function optimizeSingleDay(dayIdx) {
  const day = state.week[dayIdx];
  const currentMacros = calcDayMacros(dayIdx);
  const g = state.goals;
  const factor = g.kcal / (currentMacros.kcal || 1);
  day.meals.forEach(meal => {
    if (!meal.standardId) { // Μόνο σε συνταγές, όχι στάνταρ
      meal.scaleFactor = Math.round(((meal.scaleFactor || 1) * factor) * 100) / 100;
    }
  });
}

function runOptimize(allDays = false) {
  if (allDays) {
    state.week.forEach((_, i) => optimizeSingleDay(i));
    showToast(t('week_applied_all'));
  } else {
    optimizeSingleDay(state.currentDay);
    showToast(`✅ Ημέρα ${state.currentDay+1} βελτιστοποιήθηκε`);
  }
  saveState();
  _refreshAfterMealEdit(state.currentDay);
  navigateTo('today');
}

// ── DAY BUILDER PAGE ──
function renderBuilderPage(typeFilter) {
  typeFilter = typeFilter || state._builderFilter || 'all';
  state._builderFilter = typeFilter;
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const savedTemplates = state.dayTemplates || [];

  const _mt = getMealTimes();
  const mealTypeMeta = {
    breakfast:  { label: tMeal('breakfast'),  icon: '🌅', cls: 'breakfast', color: '#f59e0b', time: _mt.breakfast },
    snack:      { label: tMeal('snack'),      icon: '🍎', cls: 'snack',     color: '#22c55e', time: _mt.snack },
    lunch:      { label: tMeal('lunch'),      icon: '☀️', cls: 'lunch',     color: '#3b82f6', time: _mt.lunch },
    afternoon:  { label: tMeal('afternoon'),  icon: '🧃', cls: 'afternoon', color: '#06b6d4', time: _mt.afternoon },
    dinner:     { label: tMeal('dinner'),     icon: '🌙', cls: 'dinner',    color: '#8b5cf6', time: _mt.dinner },
  };
  const filterLabels = [
    { key: 'all',       label: t('filter_all'),         icon: '' },
    { key: 'breakfast', label: tMealPlural('breakfast'), icon: '☀️' },
    { key: 'snack',     label: tMealPlural('snack'),     icon: '🍎' },
    { key: 'lunch',     label: tMealPlural('lunch'),     icon: '🥗' },
    { key: 'afternoon', label: tMealPlural('afternoon'), icon: '☕' },
    { key: 'dinner',    label: tMealPlural('dinner'),    icon: '🌙' },
  ];
  const allMealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealTypes = typeFilter === 'all' ? allMealTypes : [typeFilter];

  // ── LEFT: meal library ──
  const libSearch = (window._builderSearch || '').toLowerCase();
  const _pAbbr = t('macro_p_abbr'), _cAbbr = t('macro_c_abbr'), _fAbbr = t('macro_f_abbr');
  let libHtml = '';
  mealTypes.forEach(mType => {
    const meta = mealTypeMeta[mType];
    const standards = STANDARD_MEALS.filter(s => s.meal === mType && (!libSearch || (tName(s)||s.name).toLowerCase().includes(libSearch)));
    const recipes   = allRecipes.filter(r => r.meal === mType && (!libSearch || tName(r).toLowerCase().includes(libSearch)));
    if (!standards.length && !recipes.length) return;

    libHtml += `<div class="dplanner-lib-section-header">
      <span class="dplanner-lib-section-icon ${mType}">${meta.icon}</span>
      <span class="dplanner-lib-section-label">${meta.label.toUpperCase()}</span>
    </div>`;
    libHtml += `<div class="dplanner-lib-grid">`;
    standards.forEach(s => {
      const sel = builderMeals.find(x => x.id === s.id && x.isStandard);
      libHtml += `<div class="dplanner-meal-card ${sel ? 'selected-dp' : ''}" onclick="builderPageToggle('${s.id}',true)">
        <div class="dplanner-meal-emoji">${s.emoji}</div>
        <div class="dplanner-meal-info">
          <div class="dplanner-meal-name">${tName(s) || s.name}</div>
          <div class="dplanner-meal-meta">${_pAbbr}:${s.p||'?'}g · ${_cAbbr}:${s.c||'?'}g · ${_fAbbr}:${s.f||'?'}g</div>
        </div>
        <div class="dplanner-meal-kcal">~${s.kcal_est} kcal</div>
        <button class="dplanner-add-btn dplanner-add-btn--visible" onclick="event.stopPropagation();builderPageToggle('${s.id}',true)">${sel ? '✕' : '+'}</button>
      </div>`;
    });
    recipes.forEach(r => {
      const m = calcRecipeMacros(r);
      const sel = builderMeals.find(x => x.id === r.id && !x.isStandard);
      libHtml += `<div class="dplanner-meal-card ${sel ? 'selected-dp' : ''}" onclick="builderPageToggle('${r.id}',false)">
        <div class="dplanner-meal-emoji">${r.emoji}</div>
        <div class="dplanner-meal-info">
          <div class="dplanner-meal-name">${esc(tName(r))}</div>
          <div class="dplanner-meal-meta">${_pAbbr}:${m.p}g · ${_cAbbr}:${m.c}g · ${_fAbbr}:${m.f}g</div>
        </div>
        <div class="dplanner-meal-kcal">${m.kcal} kcal</div>
        <button class="dplanner-add-btn dplanner-add-btn--visible" onclick="event.stopPropagation();builderPageToggle('${r.id}',false)">${sel ? '✕' : '+'}</button>
      </div>`;
    });
    libHtml += `</div>`;
  });
  if (!libHtml) libHtml = `<div class="empty-state"><div class="empty-icon">🍽️</div><p>${t('builder_empty_meals')}</p></div>`;

  // ── MIDDLE: day plan slots ──
  let middleHtml = '';
  let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0;

  // Collect macro totals first
  builderMeals.forEach(bm => {
    if (bm.isStandard) {
      const sm = STANDARD_MEALS.find(s => s.id === bm.id);
      if (sm) {
        totalKcal += sm.kcal_est;
        totalP += sm.p || 0;
        totalC += sm.c || 0;
        totalF += sm.f || 0;
      }
    } else {
      const r = allRecipes.find(x => x.id === bm.id);
      if (r) { const m = calcRecipeMacros(r); totalKcal += m.kcal; totalP += m.p; totalC += m.c; totalF += m.f; }
    }
  });

  // Middle always shows all 5 meal slots regardless of filter
  const _addFoodBtn = t('builder_add_food_btn');
  const _removeTitle = t('builder_remove_title');
  allMealTypes.forEach(mType => {
    const meta = mealTypeMeta[mType];
    const mealsOfType = builderMeals.filter(bm => {
      if (bm.isStandard) { const sm = STANDARD_MEALS.find(s => s.id === bm.id); return sm && sm.meal === mType; }
      const r = allRecipes.find(x => x.id === bm.id); return r && r.meal === mType;
    });

    let slotKcal = 0;
    let entriesHtml = '';
    mealsOfType.forEach(bm => {
      let name, emoji, kcal;
      if (bm.isStandard) {
        const sm = STANDARD_MEALS.find(s => s.id === bm.id); if (!sm) return;
        name = tName(sm) || sm.name; emoji = sm.emoji; kcal = sm.kcal_est;
      } else {
        const r = allRecipes.find(x => x.id === bm.id); if (!r) return;
        const m = calcRecipeMacros(r); name = tName(r); emoji = r.emoji; kcal = m.kcal;
      }
      slotKcal += kcal;
      entriesHtml += `<div class="dplanner-entry">
        <span class="dplanner-entry-emoji">${emoji}</span>
        <span class="dplanner-entry-name">${name}</span>
        <span class="dplanner-entry-kcal">${kcal} kcal</span>
        <button class="dplanner-entry-rm" onclick="builderPageToggle('${bm.id}',${bm.isStandard})" title="${_removeTitle}">×</button>
      </div>`;
    });

    middleHtml += `<div class="dplanner-slot">
      <div class="dplanner-slot-header">
        <div class="dplanner-slot-left">
          <span class="dplanner-slot-dot ${meta.cls}"></span>
          <div class="dplanner-slot-icon ${meta.cls}">${meta.icon}</div>
          <div>
            <div class="dplanner-slot-time">${meta.time}</div>
            <div class="dplanner-slot-title">${meta.label}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${slotKcal > 0 ? `<div class="dplanner-slot-kcal">${slotKcal} kcal</div>` : ''}
          <button class="dplanner-slot-add-btn" onclick="dpHighlightType('${mType}')" title="${_addFoodBtn}">+</button>
        </div>
      </div>
      ${entriesHtml ? `<div class="dplanner-slot-entries">${entriesHtml}</div>` : ''}
      <button class="dplanner-add-slot-btn" onclick="dpHighlightType('${mType}')">${_addFoodBtn}</button>
    </div>`;
  });

  // ── RIGHT: summary ──
  const goals = state.goals;
  const pPct = Math.min(100, goals.protein > 0 ? Math.round(totalP / goals.protein * 100) : 0);
  const cPct = Math.min(100, goals.carbs   > 0 ? Math.round(totalC / goals.carbs   * 100) : 0);
  const fPct = Math.min(100, goals.fat     > 0 ? Math.round(totalF / goals.fat     * 100) : 0);
  const kPct = Math.min(100, goals.kcal    > 0 ? Math.round(totalKcal / goals.kcal * 100) : 0);

  const totalMacroKcal = totalP * 4 + totalC * 4 + totalF * 9;
  const r = 58, circ = 2 * Math.PI * r;
  let donutSvg;
  if (totalMacroKcal > 0) {
    const pSh = (totalP * 4 / totalMacroKcal) * circ;
    const cSh = (totalC * 4 / totalMacroKcal) * circ;
    const fSh = (totalF * 9 / totalMacroKcal) * circ;
    const pPctT = Math.round(totalP * 4 / totalMacroKcal * 100);
    const cPctT = Math.round(totalC * 4 / totalMacroKcal * 100);
    const fPctT = Math.round(totalF * 9 / totalMacroKcal * 100);
    donutSvg = `<svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="13"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#22c55e" stroke-width="13" stroke-dasharray="${pSh} ${circ}" stroke-dashoffset="0"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#3b82f6" stroke-width="13" stroke-dasharray="${cSh} ${circ}" stroke-dashoffset="${-pSh}"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#f59e0b" stroke-width="13" stroke-dasharray="${fSh} ${circ}" stroke-dashoffset="${-(pSh+cSh)}"/>
    </svg>`;
    window._dpMacroPcts = { p: pPctT, c: cPctT, f: fPctT };
  } else {
    donutSvg = `<svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="13"/></svg>`;
    window._dpMacroPcts = { p: 0, c: 0, f: 0 };
  }
  const mp = window._dpMacroPcts;

  const avgPct = (pPct + cPct + fPct + kPct) / 4;
  const score = Math.round(avgPct / 10 * 10) / 10;
  const qualLabel = avgPct >= 85 ? t('builder_quality_great') : avgPct >= 60 ? t('builder_quality_good') : t('builder_quality_start');
  const qualDesc  = avgPct >= 85 ? t('builder_quality_great_desc') : avgPct >= 60 ? t('builder_quality_good_desc') : t('builder_quality_start_desc');

  // Templates HTML (inside right panel)
  const tplHtml = savedTemplates.length
    ? savedTemplates.map((tpl, ti) => {
        const tKcal = tpl.meals.reduce((acc, m) => {
          if (m.standardId) { const sm = STANDARD_MEALS.find(s=>s.id===m.standardId); return acc+(sm?sm.kcal_est:0); }
          const rx = allRecipes.find(x=>x.id===m.recipeId); return rx ? acc+calcRecipeMacros(rx,m.scaleFactor||1).kcal : acc;
        }, 0);
        return `<div class="dplanner-tpl-row">
          <div>
            <div class="dplanner-tpl-name">${tpl.name}</div>
            <div class="dplanner-tpl-meta">${tFmt('builder_tpl_meals', {n: tpl.meals.length})} · ~${tKcal} kcal · ${tpl.savedAt}</div>
          </div>
          <div style="display:flex;gap:5px">
            <button class="btn btn-ghost btn-sm" onclick="loadTemplate(${ti})">▶</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteTemplate(${ti})">🗑</button>
          </div>
        </div>`;
      }).join('')
    : `<div style="font-size:0.8rem;color:var(--text3)">${t('builder_tpl_empty')}</div>`;

  const dayLabel = state.planStartDate
    ? `${state.week[state.currentDay].label} · ${formatPlanDay(state.currentDay)}`
    : state.week[state.currentDay].label;

  if (typeof state._builderApplyDay === 'undefined') state._builderApplyDay = state.currentDay || 0;
  const applyDayIdx = Math.max(0, Math.min(state.week.length - 1, state._builderApplyDay || 0));
  state._builderApplyDay = applyDayIdx;
  const applyDayLabel = state.planStartDate
    ? (() => { const d = new Date(state.planStartDate); d.setDate(d.getDate() + applyDayIdx); const months = tMonths(); const dayNames = tDays(); return `${dayNames[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`; })()
    : state.week[applyDayIdx].label;

  document.getElementById('page-builder').innerHTML = `
  <div class="dplanner-wrap">

    <!-- TOP CARD (mobile-first) -->
    <div class="dplanner-topcard">
      <div class="dplanner-topcard-header">
        <button class="dplanner-back-btn" onclick="navigateTo('today')" title="Πίσω">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style="flex:1">
          <h2 class="dplanner-topcard-title">${t('builder_topcard_title')}</h2>
          <p class="dplanner-topcard-sub">${t('builder_topcard_sub')}</p>
        </div>
        <button class="dplanner-topcard-icon-btn" onclick="exportPDF()" title="PDF">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
          <span style="font-size:0.65rem;font-weight:700;display:block;margin-top:1px">PDF</span>
        </button>
        <a href="https://revolut.me/dimitrtxl" target="_blank" rel="noopener" title="Υποστήριξε το VIVON" style="display:flex;align-items:center;gap:4px;padding:5px 13px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:#3b82f6;font-size:0.82rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:border-color 0.15s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border)'">&#9829; Δωρεά</a>
      </div>
      <div class="dplanner-status-row ${totalKcal > 0 ? '' : 'dplanner-status-empty'}">
        <div class="dplanner-status-left">
          <div class="dplanner-status-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green-d)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#dcfce7"/><path d="M3 11c0 0 2-3 9-3s9 3 9 3v2c0 4.42-3.58 8-8 8H11c-4.42 0-8-3.58-8-8v-2z" fill="none"/><ellipse cx="12" cy="13" rx="5" ry="4" fill="none" stroke="var(--green-d)" stroke-width="1.5"/></svg>
          </div>
          <div>
            <div class="dplanner-status-title">${totalKcal > 0 ? t('builder_plan_ready') : t('builder_quality_start')}</div>
            <div class="dplanner-status-meta">${tFmt('builder_meals_count', {n: builderMeals.length})} &nbsp;·&nbsp; ${totalKcal} kcal</div>
          </div>
        </div>
        ${totalKcal > 0 ? `<button class="dplanner-preview-btn" onclick="dpHighlightType('all')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          ${t('builder_preview_btn')}
        </button>` : ''}
      </div>
      <button class="dplanner-btn-clear" onclick="builderPageClear()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        ${t('builder_clear_btn')}
      </button>
    </div>

    <!-- WEEK PLAN CARD (mobile) -->
    <div class="dplanner-daycard">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="dplanner-daycard-title" style="font-size:0.95rem;font-weight:800">${t('builder_week_plan_title')}</div>
      </div>
      <div style="font-size:0.75rem;color:var(--text3);margin-bottom:14px">${t('builder_week_plan_desc')}</div>
      <div class="dplanner-week-grid">
        ${(() => {
          const saved = state._builderSavedDays || [];
          return state.week.map((d, i) => {
            const isSaved = saved.includes(i);
            return `<button class="dplanner-week-day ${isSaved ? 'has-meals' : ''}"
              onclick="builderSaveToDay(${i},'${typeFilter}')">
              <div class="dplanner-week-day-check">
                ${isSaved
                  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                  : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`}
              </div>
              <div class="dplanner-week-day-name">Η${i+1}</div>
            </button>`;
          }).join('');
        })()}
      </div>
      ${(state._builderSavedDays && state._builderSavedDays.length > 0) ? `
      <button class="dplanner-btn-apply" onclick="builderConfirmApply('${typeFilter}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ${tFmt('builder_apply_days', { n: state._builderSavedDays.length })}
      </button>` : ''}
    </div>

    <!-- 3 COLUMNS -->
    <div class="dplanner-cols">

      <!-- LEFT: Meal Library -->
      <div class="dplanner-col">
        <div class="dplanner-col-head">
          <div class="dplanner-col-title"><h3>${t('builder_lib_title')}</h3></div>
          <div class="dplanner-col-subhead">
            <div class="dplanner-search-wrap">
              <span class="dplanner-search-icon">🔍</span>
              <input type="text" placeholder="${t('search_meal')}"
                value="${window._builderSearch || ''}"
                oninput="window._builderSearch=this.value;renderBuilderPage('${typeFilter}')">
            </div>
            <div class="recipe-filter-pills" style="margin-top:8px">
              ${filterLabels.map(fl => `<button class="recipe-pill ${typeFilter===fl.key?'active':''}"
                onclick="renderBuilderPage('${fl.key}')">${fl.icon ? fl.icon+' ' : ''}${fl.label}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="dplanner-col-body">${libHtml}</div>
      </div>

      <!-- MIDDLE: Day Plan -->
      <div class="dplanner-col">
        <div class="dplanner-col-head">
          <div class="dplanner-col-title"><h3>${t('builder_day_plan_title')}</h3></div>
          <div class="dplanner-col-subhead">
            <div class="dplanner-day-nav" style="margin-top:0">
              <button class="dplanner-nav-btn" onclick="state.currentDay=Math.max(0,state.currentDay-1);renderBuilderPage('${typeFilter}')">‹</button>
              <div class="dplanner-day-label">${dayLabel}</div>
              <button class="dplanner-nav-btn" onclick="state.currentDay=Math.min(state.week.length-1,state.currentDay+1);renderBuilderPage('${typeFilter}')">›</button>
            </div>
          </div>
        </div>
        <div class="dplanner-col-body">
          ${middleHtml || `<div class="empty-state"><div class="empty-icon">🍽️</div><p>${t('builder_empty_select')}</p></div>`}
        </div>
      </div>

      <!-- RIGHT: Summary -->
      <div class="dplanner-col">
        <div class="dplanner-col-head">
          <div class="dplanner-col-title"><h3>${t('builder_summary_title')}</h3></div>
        </div>
        <div class="dplanner-col-body">

          <!-- Donut -->
          <div class="card card-sm" style="margin-bottom:12px;text-align:center">
            <div class="dplanner-donut-wrap">
              ${donutSvg}
              <div class="dplanner-donut-center">
                <div class="dplanner-donut-kcal">${totalKcal.toLocaleString()}</div>
                <div class="dplanner-donut-lbl">kcal</div>
              </div>
            </div>
            <div class="dplanner-legend">
              <div class="dplanner-legend-row">
                <span><span class="dplanner-legend-dot" style="background:#22c55e"></span>${t('macro_protein')}</span>
                <span style="font-weight:700">${totalP}g (${mp.p}%)</span>
              </div>
              <div class="dplanner-legend-row">
                <span><span class="dplanner-legend-dot" style="background:#3b82f6"></span>${t('macro_carbs')}</span>
                <span style="font-weight:700">${totalC}g (${mp.c}%)</span>
              </div>
              <div class="dplanner-legend-row">
                <span><span class="dplanner-legend-dot" style="background:#f59e0b"></span>${t('macro_fat')}</span>
                <span style="font-weight:700">${totalF}g (${mp.f}%)</span>
              </div>
            </div>
            <div style="font-size:0.72rem;color:var(--text3)">
              ${t('builder_goal_label')}: ${goals.kcal} kcal &nbsp;·&nbsp;
              <span style="color:var(--green-d);font-weight:700">${t('builder_remaining_label')}: ${Math.max(0,goals.kcal-totalKcal)} kcal</span>
            </div>
          </div>

          <!-- Macro bars -->
          <div class="card card-sm" style="margin-bottom:12px">
            <div class="section-title" style="margin-bottom:10px">${t('builder_macros_title')}</div>
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label"><span style="color:#22c55e">${t('macro_protein')}</span><span>${totalP}g / ${goals.protein}g &nbsp; ${pPct}%</span></div>
              <div class="dplanner-mbar-track"><div class="dplanner-mbar-fill" style="width:${pPct}%;background:#22c55e"></div></div>
            </div>
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label"><span style="color:#3b82f6">${t('macro_carbs')}</span><span>${totalC}g / ${goals.carbs}g &nbsp; ${cPct}%</span></div>
              <div class="dplanner-mbar-track"><div class="dplanner-mbar-fill" style="width:${cPct}%;background:#3b82f6"></div></div>
            </div>
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label"><span style="color:#f59e0b">${t('macro_fat')}</span><span>${totalF}g / ${goals.fat}g &nbsp; ${fPct}%</span></div>
              <div class="dplanner-mbar-track"><div class="dplanner-mbar-fill" style="width:${fPct}%;background:#f59e0b"></div></div>
            </div>
          </div>

          <!-- Quality -->
          <div class="dplanner-quality" style="margin-bottom:12px">
            <div class="dplanner-quality-icon">${avgPct >= 85 ? '😊' : avgPct >= 60 ? '🙂' : '💪'}</div>
            <div>
              <div class="dplanner-quality-title">${qualLabel}</div>
              <div class="dplanner-quality-desc">${qualDesc}</div>
            </div>
          </div>

          <!-- Stats -->
          <div class="card card-sm" style="margin-bottom:12px">
            <div class="section-title" style="margin-bottom:8px">${t('builder_energy_title')}</div>
            <div class="dplanner-stat">
              <div class="dplanner-stat-row"><span>${t('builder_total_kcal')}</span><strong>${totalKcal} / ${goals.kcal} kcal</strong></div>
              <div class="dplanner-stat-row"><span>${t('builder_meals_selected')}</span><strong>${builderMeals.length}</strong></div>
              <div class="dplanner-stat-row"><span>${t('builder_hydration')}</span><strong style="color:var(--blue)">— / 3L</strong></div>
              <div class="dplanner-stat-row"><span>${t('builder_score')}</span><strong>${score.toFixed(1)} / 10</strong></div>
            </div>
          </div>

          <!-- Templates -->
          <div class="card card-sm">
            <div class="section-title" style="margin-bottom:8px">${t('builder_templates_title')}</div>
            <div style="display:flex;gap:6px;margin-bottom:10px">
              <input type="text" id="builder-tpl-name" placeholder="${t('builder_tpl_placeholder')}"
                style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.82rem;background:var(--bg2)">
              <button class="btn btn-green btn-sm" onclick="saveDayAsTemplate()">💾</button>
            </div>
            ${tplHtml}
          </div>

        </div>
      </div>

    </div>

    <!-- FLOATING KCAL BUBBLE (mobile only) -->
    <div class="builder-kcal-bubble" id="builder-kcal-bubble" style="${totalKcal > 0 ? '' : 'opacity:0;pointer-events:none'}">
      🔥 ${totalKcal} kcal
    </div>

  </div>`;
}

function dpHighlightType(t) {
  renderBuilderPage(t);
}

function builderPageToggle(id, isStandard) {
  const idx = builderMeals.findIndex(x => x.id === id && x.isStandard === isStandard);
  if (idx >= 0) builderMeals.splice(idx, 1);
  else builderMeals.push({ id, isStandard });
  renderBuilderPage(state._builderFilter || 'all');
  _updateBuilderBubble();
}

function _updateBuilderBubble() {
  const bubble = document.getElementById('builder-kcal-bubble');
  if (!bubble) return;
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  let total = 0;
  builderMeals.forEach(bm => {
    if (bm.isStandard) {
      const sm = STANDARD_MEALS.find(s => s.id === bm.id);
      if (sm) total += sm.kcal_est;
    } else {
      const r = allRecipes.find(x => x.id === bm.id);
      if (r) total += calcRecipeMacros(r).kcal;
    }
  });
  if (total > 0) {
    bubble.textContent = '🔥 ' + total + ' kcal';
    bubble.style.opacity = '1';
    bubble.style.pointerEvents = 'auto';
    bubble.classList.add('builder-kcal-bubble--pop');
    setTimeout(() => bubble.classList.remove('builder-kcal-bubble--pop'), 300);
  } else {
    bubble.style.opacity = '0';
    bubble.style.pointerEvents = 'none';
  }
}

function builderPageApply() {
  if (!builderMeals.length) { showToast(t('builder_no_meals_toast')); return; }
  const dayIdx = typeof state._builderApplyDay !== 'undefined'
    ? Math.max(0, Math.min(state.week.length - 1, state._builderApplyDay))
    : state.currentDay;
  applyBuilderToDayIdx(dayIdx);
}

function _builderMealsToMealList() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const typeTime = getMealTimes();
  return builderMeals.map(bm => {
    if (bm.isStandard) {
      const sm = STANDARD_MEALS.find(x => x.id === bm.id); if (!sm) return null;
      return { time: typeTime[sm.meal]||'12:00', type: sm.meal, standardId: sm.id, done: false, scaleFactor: 1 };
    } else {
      const r = allRecipes.find(x => x.id === bm.id); if (!r) return null;
      return { time: typeTime[r.meal]||'12:00', type: r.meal, recipeId: r.id, done: false, scaleFactor: 1 };
    }
  }).filter(Boolean);
}

function builderSaveToDay(dayIdx, typeFilter) {
  if (!builderMeals.length) { showToast('⚠️ Επίλεξε πρώτα γεύματα'); return; }
  if (!state._builderSavedDays) state._builderSavedDays = [];
  if (!state._builderWeek) state._builderWeek = state.week.map(d => ({ ...d, meals: [] }));

  // Toggle: αν η μέρα είναι ήδη αποθηκευμένη → αφαίρεση
  if (state._builderSavedDays.includes(dayIdx)) {
    state._builderSavedDays = state._builderSavedDays.filter(i => i !== dayIdx);
    state._builderWeek[dayIdx].meals = [];
    showToast(`↩ Η${dayIdx+1} αφαιρέθηκε`);
    renderBuilderPage(typeFilter || state._builderFilter || 'breakfast');
    return;
  }

  state._builderWeek[dayIdx].meals = _builderMealsToMealList();
  state._builderSavedDays.push(dayIdx);
  showToast(`✅ Η${dayIdx+1} αποθηκεύτηκε στο σχέδιο`);
  renderBuilderPage(typeFilter || state._builderFilter || 'breakfast');
}

function builderConfirmApply(typeFilter) {
  if (!state._builderSavedDays || !state._builderSavedDays.length) {
    showToast('⚠️ ' + t('builder_no_days_selected')); return;
  }
  const dayNames = state._builderSavedDays.map(i => state.week[i]?.label || tFmt('week_day_prefix', { n: i + 1 })).join(', ');
  showConfirmModal(
    t('builder_apply_confirm_title'),
    tFmt('builder_apply_confirm_body', { days: `<strong>${dayNames}</strong>` }),
    () => builderApplyWeekToSchedule(typeFilter)
  );
}

function builderApplyWeekToSchedule(typeFilter) {
  if (!state._builderSavedDays || !state._builderSavedDays.length) {
    showToast('⚠️ Δεν έχεις αποθηκεύσει καμία ημέρα'); return;
  }
  state._builderSavedDays.forEach(i => {
    if (state._builderWeek && state._builderWeek[i]) {
      state.week[i].meals = state._builderWeek[i].meals;
    }
  });
  state._builderSavedDays = [];
  state._builderWeek = null;
  builderMeals = [];
  state.programCreated = true;
  saveState();
  showToast('✅ Το πρόγραμμα ενημερώθηκε!');
  renderBuilderPage(typeFilter || state._builderFilter || 'breakfast');
}

function applyBuilderToDayIdx(dayIdx) {
  // desktop: άμεση αποθήκευση στο state.week (παλιά συμπεριφορά desktop)
  const newMeals = _builderMealsToMealList();
  state.week[dayIdx].meals = newMeals;
  builderMeals = [];
  state.programCreated = true;
  saveState();
  closeModal();
  showToast(`✅ Αποθηκεύτηκε — Η${dayIdx+1}!`);
  renderBuilderPage(state._builderFilter || 'breakfast');
}

function builderPageClear() {
  builderMeals = [];
  renderBuilderPage(state._builderFilter || 'all');
}

// ── DAY BUILDER (inline — legacy, kept for optimize page) ──
function renderBuilderRecipeList(typeFilter) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const allStandard = STANDARD_MEALS;
  const _mealLabels = {
    breakfast: '☀️ ' + t('meal_breakfasts'),
    snack:     '🍎 ' + t('meal_snacks'),
    lunch:     '🥗 ' + t('meal_lunches'),
    afternoon: '☕ ' + t('meal_afternoons'),
    dinner:    '🌙 ' + t('meal_dinners'),
  };
  let html = '';
  const types = typeFilter === 'all' ? ['breakfast','snack','lunch','afternoon','dinner'] : [typeFilter];
  types.forEach(mType => {
    const recipes = allRecipes.filter(r => r.meal === mType);
    const standards = allStandard.filter(s => s.meal === mType);
    if (!recipes.length && !standards.length) return;
    html += `<div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin:8px 0 4px">${_mealLabels[mType]}</div>`;
    standards.forEach(s => {
      const inBuilder = builderMeals.find(x => x.id === s.id && x.isStandard);
      html += `<div class="swap-row ${inBuilder?'selected-builder':''}" onclick="builderToggle('${s.id}',true)">
        <div class="swap-row-left"><span class="swap-emoji">${s.emoji}</span>
          <div><div class="swap-name">⭐ ${tName(s) || s.name}</div><div class="swap-items">${s.items.slice(0,2).join(' · ')}</div></div>
        </div>
        <div class="swap-kcal">~${s.kcal_est}<span>kcal</span></div>
      </div>`;
    });
    recipes.forEach(r => {
      const m = calcRecipeMacros(r);
      const inBuilder = builderMeals.find(x => x.id === r.id && !x.isStandard);
      html += `<div class="swap-row ${inBuilder?'selected-builder':''}" onclick="builderToggle('${r.id}',false)">
        <div class="swap-row-left"><span class="swap-emoji">${r.emoji}</span>
          <div><div class="swap-name">${esc(tName(r))}</div><div class="swap-items">${t('macro_p_abbr')}:${m.p}g · ${t('macro_c_abbr')}:${m.c}g · ${t('macro_f_abbr')}:${m.f}g</div></div>
        </div>
        <div class="swap-kcal">${m.kcal}<span>kcal</span></div>
      </div>`;
    });
  });
  return html || `<div style="padding:10px;color:var(--text3)">${t('empty_meals')}</div>`;
}

function builderFilterType(type, btn) {
  document.querySelectorAll('#day-builder-card .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById('builder-recipe-list');
  if (el) el.innerHTML = renderBuilderRecipeList(type);
}

function builderToggle(id, isStandard) {
  const idx = builderMeals.findIndex(x => x.id === id && x.isStandard === isStandard);
  if (idx >= 0) {
    builderMeals.splice(idx, 1);
  } else {
    builderMeals.push({ id, isStandard });
  }
  updateBuilderUI();
}

function updateBuilderUI() {
  // Update macros bar
  const bar = document.getElementById('builder-macros-bar');
  const sel = document.getElementById('builder-selected');
  if (!bar || !sel) return;

  if (!builderMeals.length) {
    bar.innerHTML = `<span class="chip">${t('week_no_meal')}</span>`;
    sel.innerHTML = '';
    return;
  }

  let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0;
  const selHtml = builderMeals.map((bm, bi) => {
    let name, emoji, kcal, p = 0, c = 0, f = 0;
    if (bm.isStandard) {
      const sm = STANDARD_MEALS.find(s => s.id === bm.id);
      if (!sm) return '';
      name = sm.name; emoji = sm.emoji; kcal = sm.kcal_est;
    } else {
      const allR = [...RECIPES_DB, ...state.customRecipes];
      const r = allR.find(x => x.id === bm.id);
      if (!r) return '';
      const m = calcRecipeMacros(r);
      name = r.name; emoji = r.emoji; kcal = m.kcal; p = m.p; c = m.c; f = m.f;
    }
    totalKcal += kcal; totalP += p; totalC += c; totalF += f;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--green-bg);border-radius:6px;margin-bottom:4px">
      <span style="font-size:0.82rem">${emoji} ${name}</span>
      <span style="font-size:0.75rem;font-weight:700;color:var(--green-d)">${kcal} kcal <button onclick="builderToggle('${bm.id}',${bm.isStandard})" style="border:none;background:none;cursor:pointer;color:var(--red);margin-left:4px">✕</button></span>
    </div>`;
  }).join('');

  bar.innerHTML = `
    <span class="chip chip-green">${totalKcal} kcal</span>
    <span class="chip chip-blue">Π:${totalP}g</span>
    <span class="chip">Υ:${totalC}g</span>
    <span class="chip">Λ:${totalF}g</span>
    <span class="chip">${builderMeals.length} γεύματα</span>`;
  sel.innerHTML = `<div style="font-size:0.72rem;font-weight:700;color:var(--text3);margin-bottom:6px;text-transform:uppercase">Επιλεγμένα:</div>${selHtml}`;

  // Refresh recipe list highlights
  const listEl = document.getElementById('builder-recipe-list');
  if (listEl) {
    listEl.querySelectorAll('.swap-row').forEach(row => row.classList.remove('selected-builder'));
    builderMeals.forEach(bm => {
      // can't easily target by id here — full re-render is simpler
    });
  }
}

function clearBuilder() {
  builderMeals = [];
  updateBuilderUI();
  const listEl = document.getElementById('builder-recipe-list');
  if (listEl) {
    const activeBtn = document.querySelector('#day-builder-card .seg-btn.active');
    const type = activeBtn ? activeBtn.textContent.trim() : 'all';
    listEl.innerHTML = renderBuilderRecipeList('all');
  }
}

// ── DAY TEMPLATES ──
function saveDayAsTemplate() {
  const nameEl = document.getElementById('template-name') || document.getElementById('builder-tpl-name');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { showToast('⚠️ Δώσε όνομα πρώτα!'); return; }
  if (!state.dayTemplates) state.dayTemplates = [];
  const meals = JSON.parse(JSON.stringify(state.week[state.currentDay].meals));
  meals.forEach(m => m.done = false);
  state.dayTemplates.push({ name, meals, savedAt: new Date().toLocaleDateString('el-GR') });
  saveState();
  showToast(`💾 Αποθηκεύτηκε ως "${name}"`);
  // Refresh σωστής σελίδας
  if (state.activeTab === 'builder') renderBuilderPage();
  else renderSettingsPage();
}

function deleteTemplate(ti) {
  if (!confirm(t('confirm_delete_template'))) return;
  state.dayTemplates.splice(ti, 1);
  saveState();
  if (state.activeTab === 'builder') renderBuilderPage();
  else renderSettingsPage();
  showToast('🗑 Πρότυπο διαγράφηκε');
}

function loadTemplate(ti) {
  const tpl = (state.dayTemplates || [])[ti];
  if (!tpl) return;
  // Ποια μέρα να φορτωθεί — ρώτα
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">▶ Φόρτωση: ${tpl.name}</div>
    <p style="font-size:0.82rem;color:var(--text2);margin-bottom:14px">${tpl.meals.length} γεύματα · Επίλεξε ημέρα:</p>
    <div class="recipes-grid">
      ${state.week.map((d,i) => `
        <div class="recipe-card" onclick="applyTemplateToDay(${ti},${i})">
          <div class="recipe-card-emoji">📅</div>
          <div class="recipe-card-name">${d.label}</div>
        </div>`).join('')}
    </div>`);
}

function applyTemplateToDay(ti, dayIdx) {
  const tpl = (state.dayTemplates || [])[ti];
  if (!tpl) return;
  state.week[dayIdx].meals = JSON.parse(JSON.stringify(tpl.meals));
  saveState();
  closeModal();
  showToast(`✅ "${tpl.name}" → Ημέρα ${dayIdx+1}`);
  if (dayIdx === state.currentDay) { navigateTo('today'); } else { renderSettingsPage(); }
  const weekPage = document.getElementById('page-week');
  if (weekPage && weekPage.classList.contains('active')) renderWeek();
}


function updateGoal(key, val) {
  const numVal = parseInt(val);
  // Αποθήκευση στο state
  if (key === 'protein') state.goals.protein = numVal;
  else if (key === 'carbs') state.goals.carbs = numVal;
  else if (key === 'fat') state.goals.fat = numVal;
  else state.goals.kcal = numVal;
  // Live update label (χωρίς re-render — δεν χάνεται η μπάρα)
  const labelMap = { kcal:'sl-kcal-val', protein:'sl-prot-val', carbs:'sl-carb-val', fat:'sl-fat-val' };
  const sufMap = { kcal:' kcal', protein:'g', carbs:'g', fat:'g' };
  const labelEl = document.getElementById(labelMap[key]);
  if (labelEl) labelEl.textContent = numVal + sufMap[key];
  saveState();
}

function resetGoals() {
  state.goals = { ...DEFAULT_GOALS };
  saveState();
  renderSettingsPage();
  showToast('↺ Στόχοι επαναφέρθηκαν');
}

// ── ACTIONS ──
function setDay(i) {
  state.currentDay = i;
  saveState();
  renderToday();
}

function goToDay(i) {
  state.currentDay = i;
  saveState();
  navigateTo('today');
}

function toggleRecipeExpand(btn) {
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', !expanded);
  const body = btn.nextElementSibling;
  body.classList.toggle('open', !expanded);
}

function toggleMealDone(mi) {
  state.week[state.currentDay].meals[mi].done = !state.week[state.currentDay].meals[mi].done;
  saveState();
  _refreshAfterMealEdit(state.currentDay);
}

function toggleSupp(id) {
  if (!state.supplements.done) state.supplements.done = {};
  state.supplements.done[id] = !state.supplements.done[id];
  saveState();
  renderToday();
}

function toggleSuppFeature(enabled) {
  state.supplements.enabled = enabled;
  saveState();
  renderSettingsSupplements();
  renderToday();
  autoSaveSettings();
}

function toggleSuppActive(id) {
  if (!state.supplements.activeIds) state.supplements.activeIds = [];
  const idx = state.supplements.activeIds.indexOf(id);
  if (idx === -1) state.supplements.activeIds.push(id);
  else state.supplements.activeIds.splice(idx, 1);
  saveState();
  renderSettingsSupplements();
  renderToday();
  autoSaveSettings();
}

function toggleSuppInfo(id) {
  const el = document.getElementById('supp-info-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

let _suppActiveCat = 'all';

function filterSupplements() {
  const q = (document.getElementById('supp-search')?.value || '').toLowerCase().trim();
  document.querySelectorAll('#supp-list .supp-item').forEach(el => {
    const name = el.dataset.name || '';
    const cat = el.dataset.cat || '';
    const matchQ = !q || name.includes(q);
    const matchCat = _suppActiveCat === 'all' || cat === _suppActiveCat;
    el.style.display = matchQ && matchCat ? '' : 'none';
  });
}

function filterSupplementsCat(cat) {
  _suppActiveCat = cat;
  document.querySelectorAll('#supp-cats button').forEach(btn => {
    const active = btn.id === 'supp-cat-' + cat;
    btn.style.borderColor = active ? 'var(--green)' : 'var(--border)';
    btn.style.background = active ? 'var(--green-bg)' : 'var(--bg2)';
    btn.style.color = active ? 'var(--green-d)' : 'var(--text2)';
  });
  filterSupplements();
}

function showCustomSuppForm() {
  document.getElementById('supp-custom-form').style.display = '';
  document.getElementById('supp-custom-name').focus();
}

function cancelCustomSupp() {
  document.getElementById('supp-custom-form').style.display = 'none';
  ['supp-custom-name','supp-custom-qty','supp-custom-timing'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

function saveCustomSupp() {
  const name = (document.getElementById('supp-custom-name')?.value || '').trim();
  if (!name) { showToast('⚠️ ' + t('supp_custom_name_required')); return; }
  const qty    = (document.getElementById('supp-custom-qty')?.value    || '').trim();
  const timing = (document.getElementById('supp-custom-timing')?.value || '').trim();
  const id = 'custom_' + Date.now();
  if (!state.supplements.custom) state.supplements.custom = [];
  state.supplements.custom.push({ id, name, qty, timing });
  if (!state.supplements.activeIds) state.supplements.activeIds = [];
  state.supplements.activeIds.push(id);
  saveState();
  autoSaveSettings();
  renderSettingsSupplements();
  renderToday();
}

function deleteCustomSupp(id) {
  state.supplements.custom = (state.supplements.custom || []).filter(s => s.id !== id);
  state.supplements.activeIds = (state.supplements.activeIds || []).filter(i => i !== id);
  if (state.supplements.done) delete state.supplements.done[id];
  saveState();
  autoSaveSettings();
  renderSettingsSupplements();
  renderToday();
}

function toggleFavorite(rid) {
  const idx = state.favorites.indexOf(rid);
  if (idx === -1) state.favorites.push(rid);
  else state.favorites.splice(idx, 1);
  saveState();
  renderRecipes();
  showToast(idx === -1 ? '⭐ Προστέθηκε στα αγαπημένα' : '☆ Αφαιρέθηκε');
}

// ── MODALS ──
function showConfirmModal(title, bodyHtml, onConfirm) {
  const id = 'confirm_cb_' + Date.now();
  window[id] = () => { closeModal(); onConfirm(); delete window[id]; };
  openModal(`
    <div style="padding:20px">
      <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px">${title}</h3>
      <div style="font-size:0.88rem;color:var(--text2);line-height:1.6;margin-bottom:20px">${bodyHtml}</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Ακύρωση</button>
        <button class="btn btn-green" style="flex:1" onclick="window['${id}']()" >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Εφαρμογή
        </button>
      </div>
    </div>
  `);
}

function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const sheet = overlay.querySelector('.modal-sheet');
  document.getElementById('modal-content').innerHTML = html;
  sheet.classList.remove('modal-closing');
  overlay.classList.add('open');
}
function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const sheet = overlay.querySelector('.modal-sheet');
  sheet.classList.add('modal-closing');
  setTimeout(() => {
    overlay.classList.remove('open');
    sheet.classList.remove('modal-closing');
  }, 220);
}

function openRecipeDetail(rid) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const recipe = allRecipes.find(r => r.id === rid);
  if (!recipe) return;
  const m = calcRecipeMacros(recipe);
  const allFoods = [...FOODS_DB, ...state.customFoods];
  const isFav = state.favorites.includes(rid);

  const ingredientsHtml = recipe.ingredients.map(ing => {
    const food = allFoods.find(f => f.id === ing.foodId);
    if (!food) return '';
    return `<div class="ingredient-row"><span class="ingredient-name">${esc(tName(food))}</span><span class="ingredient-qty">${ing.qty}${food.unit}</span></div>`;
  }).join('');

  // Μετατροπή "\n" σε αριθμημένα βήματα
  function stepsHtml(text) {
    if (!text) return '';
    return text.split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:0.85rem;line-height:1.5">${l}</div>`)
      .join('');
  }

  const cookingHtml = stepsHtml(tName(recipe,'instructions') || recipe.instructions);
  const servingHtml = recipe.serving
    ? `<div class="section-title" style="margin-top:14px">🍽️ ${t('recipe_serving')}</div>
       <div style="background:var(--green-bg);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:16px;font-size:0.85rem;color:var(--text2);line-height:1.5">${tName(recipe,'serving') || recipe.serving}</div>`
    : '';

  openModal(`
    <div class="modal-handle"></div>
    <div style="text-align:center;font-size:3rem;margin-bottom:8px">${recipe.emoji}</div>
    <div class="modal-title" style="text-align:center">${esc(tName(recipe))}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">
      <span class="chip chip-green">${m.kcal} kcal</span>
      <span class="chip chip-blue">${t('macro_p_abbr')}: ${m.p}g</span>
      <span class="chip">${t('macro_c_abbr')}: ${m.c}g</span>
      <span class="chip">${t('macro_f_abbr')}: ${m.f}g</span>
    </div>
    <div class="section-title">🧂 ${t('recipe_ingred')}</div>
    ${ingredientsHtml}
    <div class="section-title" style="margin-top:14px">👨‍🍳 ${t('recipe_instruct')}</div>
    <div style="margin-bottom:${recipe.serving ? '4px' : '16px'}">${cookingHtml}</div>
    ${servingHtml}
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-ghost btn-sm" onclick="toggleFavorite('${rid}');closeModal()">${isFav ? '☆ ' + t('btn_delete') : '⭐ ' + t('btn_add')}</button>
      <button class="btn btn-green" style="flex:1" onclick="addRecipeToDay('${rid}');closeModal()">➕ ${t('add_to_day')}</button>
    </div>`);
}

function openFoodDetail(fid) {
  const allFoods = [...FOODS_DB, ...state.customFoods];
  const food = allFoods.find(f => f.id === fid);
  if (!food) return;
  const per = food.unit === 'τεμ' ? t('unit_piece') : '100' + food.unit;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${tName(food)}</div>
    <div class="section-title">${t('form_nutrients')} / ${per}</div>
    <div class="meal-macros" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:16px">
      <div class="macro-chip"><div class="macro-chip-val" style="color:#22c55e">${food.per100.kcal}</div><div class="macro-chip-lbl">kcal</div></div>
      <div class="macro-chip"><div class="macro-chip-val" style="color:#3b82f6">${food.per100.p}g</div><div class="macro-chip-lbl">${t('chip_prot')}</div></div>
      <div class="macro-chip"><div class="macro-chip-val" style="color:#8b5cf6">${food.per100.c}g</div><div class="macro-chip-lbl">${t('chip_carb')}</div></div>
      <div class="macro-chip"><div class="macro-chip-val" style="color:#f59e0b">${food.per100.f}g</div><div class="macro-chip-lbl">${t('chip_fat')}</div></div>
    </div>
    <button class="btn btn-ghost btn-full" onclick="closeModal()">${t('btn_close')}</button>`);
}


// State for the swap modal pending selection
let _swapPending = { mi: null, dayIdx: null, type: null, id: null, isStd: false, sf: 1 };

function openSwapMeal(mi, dayIdx) {
  if (dayIdx === undefined) dayIdx = state.currentDay;
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const currentMeal = state.week[dayIdx].meals[mi];
  const currentType = currentMeal.type;
  const snackTypes = currentType === 'afternoon' ? ['afternoon', 'snack'] : [currentType];
  const recipes = allRecipes.filter(r => snackTypes.includes(r.meal));
  const standards = STANDARD_MEALS.filter(s => snackTypes.includes(s.meal));
  const mealTypeLabel = tMealPlural(currentType) || '';

  const currentId = currentMeal.standardId || currentMeal.recipeId;
  const currentSf = currentMeal.scaleFactor || 1;

  // Init pending state
  _swapPending = { mi, dayIdx, type: currentType, id: currentId, isStd: !!currentMeal.standardId, sf: currentSf };

  const standardItems = standards.map(s => ({
    key: 'std:' + s.id,
    html: `<div class="swap-row${s.id === currentId ? ' swap-row-selected' : ''}" data-name="${(tName(s)||s.name).toLowerCase()}" data-id="${s.id}" data-isstd="1" data-kcal="${s.kcal_est}" data-p="${s.p||0}" data-c="${s.c||0}" data-f="${s.f||0}" onclick="_swapRowClick(this)">
      <div class="swap-row-left">
        <span class="swap-emoji">${s.emoji}</span>
        <div>
          <div class="swap-name">${tName(s) || s.name}</div>
          <div class="swap-items">${s.items.join(' · ')}</div>
          ${s.note ? `<div class="swap-note">${s.note}</div>` : ''}
        </div>
      </div>
      <div class="swap-kcal">~${s.kcal_est}<br><span>kcal</span></div>
    </div>`
  }));

  const recipeItems = recipes.map(r => {
    const m = calcRecipeMacros(r);
    return {
      key: 'rec:' + r.id,
      html: `<div class="swap-row${r.id === currentId ? ' swap-row-selected' : ''}" data-name="${esc(tName(r).toLowerCase())}" data-id="${r.id}" data-isstd="0" data-kcal="${m.kcal}" data-p="${m.p}" data-c="${m.c}" data-f="${m.f}" onclick="_swapRowClick(this)">
        <div class="swap-row-left">
          <span class="swap-emoji">${r.emoji}</span>
          <div>
            <div class="swap-name">${esc(tName(r))}</div>
            <div class="swap-items">${t('macro_p_abbr')}:${m.p}g · ${t('macro_c_abbr')}:${m.c}g · ${t('macro_f_abbr')}:${m.f}g</div>
          </div>
        </div>
        <div class="swap-kcal">${m.kcal}<br><span>kcal</span></div>
      </div>`
    };
  });

  const allItems = [...standardItems, ...recipeItems];
  const listHTML = allItems.map(i => i.html).join('');

  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="modal-title" style="margin:0">${t('swap_title')} — ${mealTypeLabel}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <button onclick="_openAddRecipeFromSwap()" title="${t('btn_new_recipe')}" style="display:flex;align-items:center;gap:4px;background:var(--green-bg);border:1.5px solid var(--green-d);border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:700;color:var(--green-d);padding:4px 10px;line-height:1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Νέα
        </button>
        <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text3);padding:4px;line-height:1">✕</button>
      </div>
    </div>
    <div class="swap-search-wrap">
      <input class="swap-search" id="swap-search-input" type="text" placeholder="${t('search_meal')}" oninput="filterSwapList(this.value)" autocomplete="off">
    </div>
    <div class="swap-list" id="swap-list-inner">
      ${listHTML || `<div class="empty-state"><p>${t('empty_meals')}</p></div>`}
    </div>
    <div class="swap-scale-bar" id="swap-scale-bar">
      <div class="swap-scale-preview" id="swap-scale-preview"></div>
      <div class="swap-scale-slider-wrap">
        <span class="swap-scale-label">½x</span>
        <input type="range" class="swap-scale-slider" id="swap-sf-slider"
          min="0.5" max="2.5" step="0.05" value="${currentSf}"
          oninput="_swapSfChange(this.value)">
        <span class="swap-scale-label">2½x</span>
      </div>
      <button class="swap-apply-btn" onclick="_swapApply()">${t('swap_apply')}</button>
    </div>`);

  setTimeout(() => {
    const inp = document.getElementById('swap-search-input');
    if (inp) inp.focus();
    const sel = document.querySelector('#swap-list-inner .swap-row-selected');
    if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Init slider gradient
    _swapSfChange(currentSf);
    _swapUpdatePreview();
  }, 120);
}

function _openAddRecipeFromSwap() {
  const { mi, dayIdx } = _swapPending;
  openAddRecipeModal(function() {
    openSwapMeal(mi, dayIdx);
  });
}

function _swapRowClick(el) {
  document.querySelectorAll('#swap-list-inner .swap-row').forEach(r => r.classList.remove('swap-row-selected', 'swap-row-picking'));
  el.classList.add('swap-row-selected', 'swap-row-picking');
  setTimeout(() => el.classList.remove('swap-row-picking'), 300);
  _swapPending.id    = el.dataset.id;
  _swapPending.isStd = el.dataset.isstd === '1';
  _swapUpdatePreview();
}

const SF_MIN_VAL = 0.5, SF_MAX_VAL = 2.5;
function _clampSF(v) { const n = parseFloat(v); return Math.round(Math.min(SF_MAX_VAL, Math.max(SF_MIN_VAL, isNaN(n) ? 1 : n)) * 100) / 100; }

function _swapSfChange(val) {
  _swapPending.sf = _clampSF(val);
  // Update track fill: (val - 0.5) / (2.5 - 0.5) * 100
  const slider = document.getElementById('swap-sf-slider');
  if (slider) {
    const pct = ((parseFloat(val) - 0.5) / 2) * 100;
    slider.style.background = `linear-gradient(to right, var(--green) ${pct}%, var(--border) ${pct}%)`;
  }
  _swapUpdatePreview();
}

function _swapUpdatePreview() {
  const bar = document.getElementById('swap-scale-bar');
  const prev = document.getElementById('swap-scale-preview');
  const slider = document.getElementById('swap-sf-slider');
  if (!bar || !prev) return;

  const sf = _swapPending.sf;
  if (slider) slider.value = sf;

  const sel = document.querySelector('#swap-list-inner .swap-row-selected');
  if (!sel) { prev.innerHTML = ''; return; }

  const baseKcal = parseFloat(sel.dataset.kcal) || 0;
  const baseP    = parseFloat(sel.dataset.p)    || 0;
  const baseC    = parseFloat(sel.dataset.c)    || 0;
  const baseF    = parseFloat(sel.dataset.f)    || 0;
  const kcal = Math.round(baseKcal * sf);
  const p    = Math.round(baseP * sf);
  const c    = Math.round(baseC * sf);
  const f    = Math.round(baseF * sf);
  const sfLabel = sf === 1 ? t('swap_sf_normal') : sf < 1 ? tFmt('swap_sf_smaller', { sf: sf.toFixed(2) }) : tFmt('swap_sf_larger', { sf: sf.toFixed(2) });

  prev.innerHTML = `
    <div class="swap-preview-row">
      <span class="swap-preview-sf">${sfLabel}</span>
      <div class="swap-preview-macros">
        <span style="color:#22c55e;font-weight:800">${kcal} kcal</span>
        <span style="color:#3b82f6">${t('macro_p_abbr')} ${p}g</span>
        <span style="color:#8b5cf6">${t('macro_c_abbr')} ${c}g</span>
        <span style="color:#f59e0b">${t('macro_f_abbr')} ${f}g</span>
      </div>
    </div>`;
}

function _swapApply() {
  const { mi, dayIdx, id, isStd, sf } = _swapPending;
  if (!id) { closeModal(); return; }
  if (isStd) {
    state.week[dayIdx].meals[mi].standardId = id;
    delete state.week[dayIdx].meals[mi].recipeId;
  } else {
    state.week[dayIdx].meals[mi].recipeId = id;
    delete state.week[dayIdx].meals[mi].standardId;
  }
  state.week[dayIdx].meals[mi].scaleFactor = _clampSF(sf);
  saveState();
  closeModal();
  _refreshAfterMealEdit(dayIdx);
  showToast(t('swap_saved'));
}

window.filterSwapList = function(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('#swap-list-inner .swap-row');
  rows.forEach(row => {
    const name = (row.dataset.name || '') + row.textContent.toLowerCase();
    row.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
};

function swapMeal(mi, rid, dayIdx) {
  if (dayIdx === undefined) dayIdx = state.currentDay;
  state.week[dayIdx].meals[mi].recipeId = rid;
  state.week[dayIdx].meals[mi].scaleFactor = 1;
  delete state.week[dayIdx].meals[mi].standardId;
  saveState();
  closeModal();
  _refreshAfterMealEdit(dayIdx);
  showToast('✅ Γεύμα αλλάχθηκε');
}

function swapMealStandard(mi, sid, dayIdx) {
  if (dayIdx === undefined) dayIdx = state.currentDay;
  state.week[dayIdx].meals[mi].standardId = sid;
  delete state.week[dayIdx].meals[mi].recipeId;
  saveState();
  closeModal();
  _refreshAfterMealEdit(dayIdx);
  showToast('✅ Στάνταρ γεύμα επιλέχθηκε');
}

function _refreshAfterMealEdit(dayIdx) {
  if (dayIdx === state.currentDay) renderToday();
  const weekPage = document.getElementById('page-week');
  if (weekPage && weekPage.classList.contains('active')) renderWeek();
}

function openScaleModal(mi, dayIdx) {
  if (dayIdx === undefined) dayIdx = state.currentDay;
  const sf = state.week[dayIdx].meals[mi].scaleFactor || 1;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">⚖️ Προσαρμογή Ποσοτήτων</div>
    <div class="form-group">
      <label>Συντελεστής Ποσότητας</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="range" id="sf-slider" min="0.5" max="2.5" step="0.05" value="${sf}" oninput="document.getElementById('sf-val').textContent=parseFloat(this.value).toFixed(2)+'x'">
        <span id="sf-val" style="font-weight:800;color:var(--green-d);min-width:44px">${sf.toFixed(2)}x</span>
      </div>
    </div>
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:14px">0.5x = μισή μερίδα · 1x = κανονική · 2x = διπλή</div>
    <button class="btn btn-green btn-full" onclick="applyScale(${mi},parseFloat(document.getElementById('sf-slider').value),${dayIdx})">✓ Εφαρμογή</button>`);
}

function applyScale(mi, sf, dayIdx) {
  if (dayIdx === undefined) dayIdx = state.currentDay;
  state.week[dayIdx].meals[mi].scaleFactor = _clampSF(sf);
  saveState();
  closeModal();
  _refreshAfterMealEdit(dayIdx);
  showToast(`✅ Ποσότητα: ${sf.toFixed(2)}x`);
}

function openAddMealModal() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const mealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealLabels = { breakfast:tMeal('breakfast'), lunch:tMeal('lunch'), dinner:tMeal('dinner'), snack:tMeal('snack'), afternoon:tMeal('afternoon') };
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${t('add_meal_modal_title')}</div>
    <div class="form-group">
      <label>${t('prof_first_meal')}</label>
      <input type="time" id="new-meal-time" value="12:00">
    </div>
    <div class="form-group">
      <label>${t('form_meal_type')}</label>
      <select id="new-meal-type">
        ${mealTypes.map(mt => `<option value="${mt}">${mealLabels[mt]}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>${t('recipes_title').replace('📖 ','')}</label>
      <select id="new-meal-recipe">
        ${allRecipes.map(r => `<option value="${r.id}">${esc(tName(r))}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-green btn-full" onclick="addMealFromModal()">➕ ${t('btn_add')}</button>`);
}

function addMealFromModal() {
  const time     = (document.getElementById('new-meal-time')?.value   || '').trim();
  const type     = (document.getElementById('new-meal-type')?.value   || '').trim();
  const recipeId = (document.getElementById('new-meal-recipe')?.value || '').trim();
  const VALID_TYPES = ['breakfast', 'snack', 'lunch', 'afternoon', 'dinner'];
  if (!time || !type || !recipeId) { showToast('⚠️ Συμπλήρωσε όλα τα πεδία'); return; }
  if (!VALID_TYPES.includes(type)) { showToast('⚠️ Μη έγκυρος τύπος γεύματος'); return; }
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  if (!allRecipes.some(r => r.id === recipeId)) { showToast('⚠️ Η συνταγή δεν βρέθηκε'); return; }
  const day = state.week[state.currentDay];
  if (!day) { showToast('⚠️ Μη έγκυρη ημέρα'); return; }
  day.meals.push({ time, type, recipeId, done: false, scaleFactor: 1 });
  day.meals.sort((a,b) => a.time.localeCompare(b.time));
  saveState();
  closeModal();
  _refreshAfterMealEdit(state.currentDay);
  showToast(t('toast_added'));
}

function addRecipeToDay(rid) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const recipe = allRecipes.find(r => r.id === rid);
  if (!recipe) return;
  const typeTime = getMealTimes();
  state.week[state.currentDay].meals.push({
    time: typeTime[recipe.meal] || '12:00',
    type: recipe.meal,
    recipeId: rid,
    done: false,
    scaleFactor: 1
  });
  state.week[state.currentDay].meals.sort((a,b) => a.time.localeCompare(b.time));
  saveState();
  _refreshAfterMealEdit(state.currentDay);
  showToast(t('toast_added'));
}

let _addRecipeAfterSave = null;

function openAddRecipeModal(afterSaveFn) {
  _addRecipeAfterSave = afterSaveFn || null;
  const allFoods = [...FOODS_DB, ...state.customFoods];
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">➕ ${t('btn_new_recipe')}</div>
    <div class="form-group"><label>${t('form_name')}</label><input type="text" id="nr-name" placeholder="${t('form_recipe_placeholder')}"></div>
    <div class="form-group"><label>Emoji</label><input type="text" id="nr-emoji" value="🍽️" maxlength="2"></div>
    <div class="form-group"><label>${t('form_meal_type')}</label>
      <select id="nr-meal">
        <option value="breakfast">${tMeal('breakfast')}</option>
        <option value="snack">${tMeal('snack')}</option>
        <option value="afternoon">${tMeal('afternoon')}</option>
        <option value="lunch">${tMeal('lunch')}</option>
        <option value="dinner">${tMeal('dinner')}</option>
      </select>
    </div>
    <div class="form-group"><label>${t('form_instructions')}</label><textarea id="nr-inst" placeholder="${t('form_instructions_placeholder')}"></textarea></div>
    <div style="display:flex;align-items:center;gap:8px;margin:10px 0 4px">
      <span style="font-size:0.82rem;color:var(--text2)">${t('form_kcal_per_serving')}</span>
      <button id="ai-estimate-recipe-btn" class="btn btn-ghost btn-sm" onclick="estimateRecipeCaloriesWithAI(document.getElementById('nr-name').value)" style="font-size:0.75rem;padding:3px 10px">✨ AI</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div class="form-group"><label>${t('macro_kcal')}</label><input type="number" id="nr-kcal" placeholder="0"></div>
      <div class="form-group"><label>${t('macro_protein')} (g)</label><input type="number" id="nr-p" placeholder="0"></div>
      <div class="form-group"><label>${t('macro_carbs')} (g)</label><input type="number" id="nr-c" placeholder="0"></div>
      <div class="form-group"><label>${t('macro_fat')} (g)</label><input type="number" id="nr-f" placeholder="0"></div>
    </div>
    <div class="section-title">${t('recipe_ingred')} (1)</div>
    <div style="display:flex;gap:8px">
      <select id="nr-food1" style="flex:1">${allFoods.map(f=>`<option value="${f.id}">${esc(tName(f))}</option>`).join('')}</select>
      <input type="number" id="nr-qty1" placeholder="qty" style="width:70px" value="100">
    </div>
    <div style="margin-top:10px">
      <button class="btn btn-green btn-full" onclick="saveNewRecipe()">💾 ${t('btn_save')}</button>
    </div>`);
}

function saveNewRecipe() {
  const name = document.getElementById('nr-name').value.trim();
  if (!name) { showToast('⚠️ Βάλε όνομα!'); return; }
  const kcal = _parseDecimal(document.getElementById('nr-kcal').value) || 0;
  const p    = _parseDecimal(document.getElementById('nr-p').value)    || 0;
  const c    = _parseDecimal(document.getElementById('nr-c').value)    || 0;
  const f    = _parseDecimal(document.getElementById('nr-f').value)    || 0;
  const newRecipe = {
    id: 'cr_' + Date.now(),
    name,
    emoji: document.getElementById('nr-emoji').value || '🍽️',
    meal: document.getElementById('nr-meal').value,
    instructions: document.getElementById('nr-inst').value,
    ingredients: [{ foodId: document.getElementById('nr-food1').value, qty: Math.round(_parseDecimal(document.getElementById('nr-qty1').value)) || 100 }],
    ...(kcal || p || c || f ? { fixedMacros: { kcal, p, c, f } } : {}),
  };
  state.customRecipes.push(newRecipe);
  saveState();
  closeModal();
  showToast('✅ Συνταγή αποθηκεύτηκε');
  if (_addRecipeAfterSave) {
    const cb = _addRecipeAfterSave;
    _addRecipeAfterSave = null;
    setTimeout(cb, 260);
  } else {
    renderRecipes();
  }
}

function openAddFoodModal() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">➕ Νέο Τρόφιμο</div>
    <div class="form-group"><label>${t('form_name')}</label><input type="text" id="nf-name" placeholder="${t('form_food_placeholder')}"></div>
    <div class="form-group"><label>${t('form_category')}</label>
      <select id="nf-cat">
        <option value="protein">${tCategory('protein')}</option><option value="carbs">${tCategory('carbs')}</option>
        <option value="veggie">${tCategory('veggie')}</option><option value="fat">${tCategory('fat')}</option>
        <option value="dairy">${tCategory('dairy')}</option><option value="fruit">${tCategory('fruit')}</option><option value="other">${tCategory('other')}</option>
      </select>
    </div>
    <div class="form-group"><label>${t('form_unit')}</label>
      <select id="nf-unit"><option value="g">${t('unit_grams')}</option><option value="ml">ml</option><option value="τεμ">${t('unit_piece_pl')}</option></select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:0.82rem;color:var(--text2)">${t('form_nutrients')}</span>
      <button id="ai-estimate-food-btn" class="btn btn-ghost btn-sm" onclick="estimateFoodCaloriesWithAI(document.getElementById('nf-name').value, document.getElementById('nf-unit').value)" style="font-size:0.75rem;padding:3px 10px">✨ AI</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="form-group"><label>${t('macro_kcal')}</label><input type="number" id="nf-kcal" placeholder="0"></div>
      <div class="form-group"><label>${t('macro_protein')} (g)</label><input type="number" id="nf-p" placeholder="0"></div>
      <div class="form-group"><label>${t('macro_carbs')} (g)</label><input type="number" id="nf-c" placeholder="0"></div>
      <div class="form-group"><label>${t('macro_fat')} (g)</label><input type="number" id="nf-f" placeholder="0"></div>
    </div>
    <button class="btn btn-green btn-full" onclick="saveNewFood()">💾 Αποθήκευση</button>`);
}

function saveNewFood() {
  const name = document.getElementById('nf-name').value.trim();
  if (!name) { showToast('⚠️ Βάλε όνομα!'); return; }
  const newFood = {
    id: 'cf_' + Date.now(),
    name,
    unit: document.getElementById('nf-unit').value,
    category: document.getElementById('nf-cat').value,
    per100: {
      kcal: _parseDecimal(document.getElementById('nf-kcal').value) || 0,
      p:    _parseDecimal(document.getElementById('nf-p').value)    || 0,
      c:    _parseDecimal(document.getElementById('nf-c').value)    || 0,
      f:    _parseDecimal(document.getElementById('nf-f').value)    || 0,
    }
  };
  state.customFoods.push(newFood);
  saveState();
  closeModal();
  renderFoods();
  showToast('✅ Τρόφιμο αποθηκεύτηκε');
}

// ── DAY BUILDER ──
let builderMeals = [];
if (typeof state._builderApplyDay === 'undefined') state._builderApplyDay = 0;
function openDayBuilder() {
  builderMeals = [];
  renderBuilderModal();
}

function renderBuilderModal() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const m = builderMeals.reduce((acc, rid) => {
    const r = allRecipes.find(x => x.id === rid);
    if (!r) return acc;
    const mac = calcRecipeMacros(r);
    return { kcal: acc.kcal+mac.kcal, p: acc.p+mac.p, c: acc.c+mac.c, f: acc.f+mac.f };
  }, { kcal:0, p:0, c:0, f:0 });

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">🏗️ ${t('builder_title')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="chip chip-green">${m.kcal} kcal</span>
      <span class="chip chip-blue">${t('macro_p_abbr')}:${m.p}g</span>
      <span class="chip">${t('macro_c_abbr')}:${m.c}g</span>
      <span class="chip">${t('macro_f_abbr')}:${m.f}g</span>
    </div>
    <div class="section-title">${t('builder_meals_selected')} (${builderMeals.length})</div>
    ${builderMeals.map((rid,i) => {
      const r = allRecipes.find(x => x.id === rid);
      return r ? `<div class="food-row" style="cursor:default">
        <span>${r.emoji} ${esc(tName(r))}</span>
        <button class="btn btn-ghost btn-sm" onclick="builderRemove(${i})">✕</button>
      </div>` : '';
    }).join('') || `<p style="font-size:0.8rem;color:var(--text3);margin-bottom:8px">${t('builder_empty_select')}</p>`}
    <div class="section-title" style="margin-top:12px">${t('recipes_title')}</div>
    <div class="recipes-grid">
      ${allRecipes.map(r => {
        const mac = calcRecipeMacros(r);
        return `<div class="recipe-card" onclick="builderAdd('${r.id}')">
          <div class="recipe-card-emoji">${r.emoji}</div>
          <div class="recipe-card-name">${esc(tName(r))}</div>
          <div class="recipe-card-kcal">${mac.kcal} kcal</div>
        </div>`;
      }).join('')}
    </div>
    <button class="btn btn-green btn-full" style="margin-top:12px" onclick="applyBuilderToDay()">✅ ${t('builder_apply_day')} ${state.currentDay+1}</button>`);
}

function builderAdd(rid) {
  builderMeals.push(rid);
  renderBuilderModal();
}

function builderRemove(i) {
  builderMeals.splice(i, 1);
  renderBuilderModal();
}

function applyBuilderToDay() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const typeTime = getMealTimes();
  const newMeals = builderMeals.map(bm => {
    if (bm.isStandard) {
      const sm = STANDARD_MEALS.find(x => x.id === bm.id);
      if (!sm) return null;
      return { time: typeTime[sm.meal]||'12:00', type: sm.meal, standardId: sm.id, done: false, scaleFactor: 1 };
    } else {
      const r = allRecipes.find(x => x.id === bm.id);
      if (!r) return null;
      return { time: typeTime[r.meal]||'12:00', type: r.meal, recipeId: r.id, done: false, scaleFactor: 1 };
    }
  }).filter(Boolean);
  state.week[state.currentDay].meals = newMeals.sort((a,b)=>a.time.localeCompare(b.time));
  saveState();
  showToast('✅ Ημέρα αντικαταστάθηκε!');
  navigateTo('today');
}

function updateBuilderSummary() {
  const el = document.getElementById('builder-summary');
  if (!el) return;
  if (!builderMeals.length) {
    el.innerHTML = `<span class="chip">${t('week_no_meal')}</span>`;
    return;
  }
  el.innerHTML = `<span class="chip chip-green">${tFmt('builder_meals_count', {n: builderMeals.length})}</span>`;
}

// ── RESET DAY ──
function resetDayDone() {
  state.week[state.currentDay].meals.forEach(m => m.done = false);
  saveState();
  _refreshAfterMealEdit(state.currentDay);
  showToast('↺ Checkboxes μηδενίστηκαν');
}

function resetDayMeals() {
  if (!confirm(tFmt('confirm_reset_day', { n: state.currentDay + 1 }))) return;
  state.week[state.currentDay].meals = JSON.parse(JSON.stringify(DEFAULT_WEEK[state.currentDay].meals));
  saveState();
  _refreshAfterMealEdit(state.currentDay);
  showToast(t('day_reset_ok'));
}

// ── COPY DAY ──
function copyDay() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📋 Αντιγραφή — Επέλεξε Πηγή</div>
    <div style="font-size:0.8rem;color:var(--text3);margin-bottom:10px;text-align:center">Από ποια ημέρα θέλεις να αντιγράψεις;</div>
    <div class="recipes-grid">
      ${state.week.map(d => `
        <div class="recipe-card" onclick="copyDayPickTarget(${d.day-1})">
          <div class="recipe-card-emoji">📅</div>
          <div class="recipe-card-name">${d.label}</div>
        </div>`).join('')}
    </div>`);
}

function copyDayPickTarget(originIdx) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📋 Αντιγραφή ${state.week[originIdx].label} σε...</div>
    <div style="font-size:0.8rem;color:var(--text3);margin-bottom:10px;text-align:center">Σε ποια ημέρα θέλεις να επικολλήσεις;</div>
    <div class="recipes-grid">
      ${state.week.filter((_,i)=>i!==originIdx).map(d => `
        <div class="recipe-card" onclick="doCopyDay(${originIdx},${d.day-1})">
          <div class="recipe-card-emoji">📅</div>
          <div class="recipe-card-name">${d.label}</div>
        </div>`).join('')}
    </div>`);
}

function doCopyDay(originIdx, targetIdx) {
  state.week[targetIdx].meals = JSON.parse(JSON.stringify(state.week[originIdx].meals));
  state.week[targetIdx].meals.forEach(m => m.done = false);
  saveState();
  closeModal();
  const weekPage = document.getElementById('page-week');
  if (weekPage && weekPage.classList.contains('active')) renderWeek();
  showToast(`✅ Αντιγράφηκε στην ${state.week[targetIdx].label}`);
}

// ── PDF helper: person badge fixed at bottom-left ──
function _pdfPersonBadge() {
  const p = state.profile;
  const name = p.name || '';
  const photoUrl = p.photoUrl;
  const avatarHtml = _isSafeUrl(photoUrl)
    ? `<img src="${photoUrl}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">`
    : `<div style="width:52px;height:52px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#6b7280;flex-shrink:0">${(name || 'V').charAt(0).toUpperCase()}</div>`;
  return `<div style="position:fixed;bottom:6mm;left:7mm;display:flex;align-items:center;gap:10px;opacity:0.7;z-index:100">
    ${avatarHtml}
    ${name ? `<span style="font-size:18px;font-weight:800;color:#374151;white-space:nowrap">${esc(name)}</span>` : ''}
  </div>`;
}

// ── PDF ΕΚΤΥΠΩΣΗ ΗΜΕΡΑΣ ──
function exportDayPDF(dayIdx) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const allFoodsLocal = [...FOODS_DB, ...state.customFoods];
  const p = state.profile;
  const g = state.goals;
  const day = state.week[dayIdx];
  const tot = calcDayMacros(dayIdx, false);
  const extraKcal = day.extraKcal || 0;
  const pct = Math.min(100, Math.round((tot.kcal / g.kcal) * 100));
  const barColor = pct > 105 ? '#ef4444' : pct > 95 ? '#22c55e' : '#f59e0b';
  const dateLabel = state.planStartDate ? ' · ' + formatPlanDay(dayIdx) : '';

  const mealRows = day.meals.map(m => {
    let name = '', kcal = 0, macStr = '', detailHtml = '';
    if (m.standardId) {
      const sm = STANDARD_MEALS.find(s => s.id === m.standardId);
      if (!sm) return '';
      name = sm.emoji + ' ' + sm.name;
      kcal = Math.round(sm.kcal_est * (m.scaleFactor||1));
      macStr = '— / — / —';
      const itemsList = sm.items.join(' · ') + (sm.note ? ' · ' + sm.note : '');
      detailHtml = `<tr><td colspan="5" style="padding:1px 12px 7px;font-size:9px;color:#6b7280;line-height:1.5;white-space:normal;word-break:break-word">${itemsList}</td></tr>`;
    } else {
      const r = allRecipes.find(x => x.id === m.recipeId);
      if (!r) return '';
      const mac = calcRecipeMacros(r, m.scaleFactor||1);
      name = r.emoji + ' ' + tName(r);
      kcal = mac.kcal;
      macStr = `${t('macro_p_abbr')}:${mac.p}g / ${t('macro_c_abbr')}:${mac.c}g / ${t('macro_f_abbr')}:${mac.f}g`;
      const ingList = r.ingredients.map(ing => {
        const food = allFoodsLocal.find(f => f.id === ing.foodId);
        if (!food) return '';
        let qty = ing.qty * (m.scaleFactor||1);
        if (food.unit === 'g') qty = Math.round(qty / 10) * 10;
        else qty = Math.round(qty);
        if (ing.foodId === 'f9' && food.unit === 'g') qty = 30;
        return tName(food) + ' ' + qty + food.unit;
      }).filter(Boolean).join(' · ');
      detailHtml = `<tr><td colspan="5" style="padding:1px 12px 4px;font-size:9px;color:#6b7280;line-height:1.5;white-space:normal;word-break:break-word">${ingList}</td></tr>`;
      if (r.instructions) {
        detailHtml += `<tr><td colspan="5" style="padding:1px 12px 7px;font-size:8.5px;color:#9ca3af;font-style:italic;line-height:1.5;white-space:normal;word-break:break-word">${tName(r,'instructions')||r.instructions}</td></tr>`;
      }
    }
    const mealTypeLabel = tMeal(m.type) || m.type;
    const typeColor = { breakfast:'#f59e0b', snack:'#10b981', lunch:'#3b82f6', afternoon:'#06b6d4', dinner:'#8b5cf6' }[m.type] || '#6b7280';
    const rowBg = { breakfast:'#fffbeb', snack:'#f0fdf4', lunch:'#eff6ff', afternoon:'#ecfeff', dinner:'#f5f3ff' }[m.type] || '#fff';
    return `<tr style="border-bottom:1px solid #e5e7eb;background:${rowBg}">
      <td style="padding:6px 8px;font-size:9.5px;color:${typeColor};font-weight:700;white-space:nowrap;vertical-align:top">${mealTypeLabel}</td>
      <td style="padding:6px 8px;font-size:10px;font-weight:700;color:#111;vertical-align:top">${name}</td>
      <td style="padding:6px 8px;font-size:10px;font-weight:700;color:#374151;text-align:right;white-space:nowrap;vertical-align:top">${kcal}</td>
      <td style="padding:6px 8px;font-size:9px;color:#6b7280;white-space:nowrap;vertical-align:top">${macStr}</td>
      <td style="padding:6px 8px;font-size:9px;color:#9ca3af;vertical-align:top">${m.time||''}</td>
    </tr>${detailHtml}`;
  }).join('');

  const extraRow = extraKcal > 0
    ? `<tr style="background:#fef2f2"><td colspan="5" style="padding:6px 8px;font-size:9px;color:#ef4444;font-weight:700">${tFmt('pdf_extra_kcal', { n: extraKcal })}</td></tr>`
    : '';

  const html = `<style>@page { size: A4 portrait; margin: 0; }</style>
    ${_pdfPersonBadge()}
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;padding:10mm 12mm;min-height:277mm;box-sizing:border-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:28px;font-weight:800;color:#111">${day.label}${dateLabel}</div>
          <div style="font-size:13px;font-weight:700;color:#374151;margin-top:4px">${t('stats_goal')}: ${g.kcal} kcal · Plan: ${tot.kcal} kcal (${pct}%) · ${p.name||'Vivon'}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div style="display:flex;align-items:center;gap:5px">
            <img src="logo.png" alt="" style="height:54px;width:auto;object-fit:contain;opacity:0.85" onerror="this.style.display='none'">
            <span style="font-size:39px;font-weight:900;color:#b8940a;letter-spacing:-0.5px">VIVON</span>
          </div>
          <div style="font-size:11px;font-weight:700;color:#3b82f6">${t('macro_protein')}: ${tot.p}g</div>
          <div style="font-size:11px;font-weight:700;color:#8b5cf6">${t('macro_carbs')}: ${tot.c}g</div>
          <div style="font-size:11px;font-weight:700;color:#f59e0b">${t('macro_fat')}: ${tot.f}g</div>
        </div>
      </div>
      <div style="height:6px;background:#e5e7eb;border-radius:3px;margin-bottom:12px">
        <div style="height:6px;width:${pct}%;background:${barColor};border-radius:3px"></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9.5px">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700;width:85px">${t('pdf_meal_col')}</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700">${t('pdf_recipe_col')}</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;color:#475569;font-weight:700;width:55px">KCAL</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700;width:130px">MACROS</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700;width:45px">${t('pdf_time_col')}</th>
          </tr>
        </thead>
        <tbody>${mealRows}${extraRow}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;border-top:2px solid #22c55e">
            <td colspan="2" style="padding:8px;font-weight:800;font-size:11px;color:#111">${t('pdf_day_total')}</td>
            <td style="padding:8px;font-weight:800;font-size:12px;color:#22c55e;text-align:right">${tot.kcal + extraKcal}</td>
            <td style="padding:8px;font-size:9.5px;color:#374151">${t('macro_p_abbr')}:${tot.p}g · ${t('macro_c_abbr')}:${tot.c}g · ${t('macro_f_abbr')}:${tot.f}g</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  document.getElementById('print-view').innerHTML = html;
  showToast(t('pdf_open_print'));
  setTimeout(() => window.print(), 400);
}

// ── PDF EXPORT ──
function exportPDF() {
  const tab = state.activeTab || 'week';

  if (tab === 'today') {
    exportPDF_today();
    return;
  }
  if (tab === 'stats') {
    exportPDF_stats();
    return;
  }
  if (tab === 'body') {
    exportPDF_body();
    return;
  }
  // Default: weekly (tab === 'week' ή οποιοδήποτε άλλο)
  exportPDF_week();
}

function exportPDF_today() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const allFoodsForPrint = [...FOODS_DB, ...state.customFoods];
  const g = state.goals;
  const di = state.currentDay;
  const day = state.week[di];
  const tot = calcDayMacros(di, false);
  const pct = Math.min(100, Math.round((tot.kcal / g.kcal) * 100));
  const barColor = pct > 105 ? '#ef4444' : pct > 95 ? '#22c55e' : '#f59e0b';
  const dateLabel = state.planStartDate ? ` · ${formatPlanDay(di)}` : '';
  const extraKcal = day.extraKcal || 0;
  const mealTypeLabel = { breakfast:tMeal('breakfast'), snack:tMeal('snack'), lunch:tMeal('lunch'), afternoon:tMeal('afternoon'), dinner:tMeal('dinner') };
  const typeColor = { breakfast:'#f59e0b', snack:'#10b981', lunch:'#3b82f6', afternoon:'#06b6d4', dinner:'#8b5cf6' };
  const rowBg = { breakfast:'#fffbeb', snack:'#f0fdf4', lunch:'#eff6ff', afternoon:'#ecfeff', dinner:'#f5f3ff' };

  const mealRows = day.meals.map(m => {
    let name = '', kcal = 0, macStr = '', detailHtml = '';
    if (m.standardId) {
      const sm = STANDARD_MEALS.find(s => s.id === m.standardId);
      if (!sm) return '';
      name = sm.emoji + ' ' + sm.name;
      kcal = Math.round(sm.kcal_est * (m.scaleFactor||1));
      macStr = '— / — / —';
      const itemsList = sm.items.join(' · ') + (sm.note ? ' · ' + sm.note : '');
      detailHtml = `<tr><td colspan="5" style="padding:1px 12px 7px;font-size:10px;color:#6b7280;line-height:1.5;white-space:normal;word-break:break-word">${itemsList}</td></tr>`;
    } else {
      const r = allRecipes.find(x => x.id === m.recipeId);
      if (!r) return '';
      const mac = calcRecipeMacros(r, m.scaleFactor||1);
      name = r.emoji + ' ' + tName(r);
      kcal = mac.kcal;
      macStr = `${t('macro_p_abbr')}:${mac.p}g / ${t('macro_c_abbr')}:${mac.c}g / ${t('macro_f_abbr')}:${mac.f}g`;
      const ingList = r.ingredients.map(ing => {
        const food = allFoodsForPrint.find(f => f.id === ing.foodId);
        if (!food) return '';
        let qty = ing.qty * (m.scaleFactor||1);
        if (food.unit === 'g') qty = Math.round(qty / 10) * 10;
        else qty = Math.round(qty);
        if (ing.foodId === 'f9' && food.unit === 'g') qty = 30;
        return tName(food) + ' ' + qty + food.unit;
      }).filter(Boolean).join(' · ');
      detailHtml = `<tr><td colspan="5" style="padding:1px 12px 4px;font-size:10px;color:#6b7280;line-height:1.5;white-space:normal;word-break:break-word">${ingList}</td></tr>`;
      if (r.instructions) {
        detailHtml += `<tr><td colspan="5" style="padding:1px 12px 7px;font-size:9.5px;color:#9ca3af;font-style:italic;line-height:1.5;white-space:normal;word-break:break-word">${tName(r,'instructions')||r.instructions}</td></tr>`;
      }
    }
    const tl = mealTypeLabel[m.type] || m.type;
    const tc = typeColor[m.type] || '#6b7280';
    const rb = rowBg[m.type] || '#fff';
    return `<tr style="border-bottom:1px solid #e5e7eb;background:${rb}">
      <td style="padding:8px 10px;font-size:11px;color:${tc};font-weight:700;white-space:nowrap;vertical-align:top">${tl}</td>
      <td style="padding:8px 10px;font-size:12px;font-weight:700;color:#111;vertical-align:top">${name}</td>
      <td style="padding:8px 10px;font-size:12px;font-weight:700;color:#374151;text-align:right;white-space:nowrap;vertical-align:top">${kcal}</td>
      <td style="padding:8px 10px;font-size:10.5px;color:#6b7280;white-space:nowrap;vertical-align:top">${macStr}</td>
      <td style="padding:8px 10px;font-size:10.5px;color:#9ca3af;vertical-align:top">${m.time||''}</td>
    </tr>${detailHtml}`;
  }).join('');

  const extraRow = extraKcal > 0
    ? `<tr style="background:#fef2f2"><td colspan="5" style="padding:8px 10px;font-size:10px;color:#ef4444;font-weight:700">${tFmt('pdf_extra_kcal', { n: extraKcal })}</td></tr>`
    : '';

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page { size: A4 portrait; margin: 10mm; }
    </style>
    ${_pdfPersonBadge()}
    <div style="padding:8mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:30px;font-weight:900;color:#111">${day.label}${dateLabel}</div>
          <div style="font-size:14px;color:#6b7280;margin-top:3px">${t('stats_goal')}: ${g.kcal} kcal · Plan: ${tot.kcal} kcal (${pct}%)</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <img src="logo.png" alt="" style="height:66px;width:auto;object-fit:contain;opacity:0.85" onerror="this.style.display='none'">
            <span style="font-size:54px;font-weight:900;color:#b8940a;letter-spacing:-1px">VIVON</span>
          </div>
          <div style="font-size:13px;font-weight:700;color:#3b82f6">${t('macro_protein')}: ${tot.p}g</div>
          <div style="font-size:13px;font-weight:700;color:#8b5cf6">${t('macro_carbs')}: ${tot.c}g</div>
          <div style="font-size:13px;font-weight:700;color:#f59e0b">${t('macro_fat')}: ${tot.f}g</div>
        </div>
      </div>
      <div style="height:7px;background:#e5e7eb;border-radius:3px;margin-bottom:14px">
        <div style="height:7px;width:${pct}%;background:${barColor};border-radius:3px"></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700;width:95px">${t('pdf_meal_col').toUpperCase()}</th>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">${t('pdf_recipe_col').toUpperCase()}</th>
            <th style="padding:9px 10px;text-align:right;font-size:10.5px;color:#475569;font-weight:700;width:60px">KCAL</th>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700;width:140px">MACROS</th>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700;width:50px">${t('pdf_time_col').toUpperCase()}</th>
          </tr>
        </thead>
        <tbody>${mealRows}${extraRow}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;border-top:2px solid #22c55e">
            <td colspan="2" style="padding:10px;font-weight:800;font-size:13px;color:#111">${t('pdf_day_total').toUpperCase()}</td>
            <td style="padding:10px;font-weight:800;font-size:14px;color:#22c55e;text-align:right">${tot.kcal + extraKcal}</td>
            <td style="padding:10px;font-size:11px;color:#374151">${t('macro_p_abbr')}:${tot.p}g · ${t('macro_c_abbr')}:${tot.c}g · ${t('macro_f_abbr')}:${tot.f}g</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  showToast(t('pdf_open_print'));
  setTimeout(() => window.print(), 400);
}

function exportPDF_stats() {
  const g = state.goals;
  const DAYS_EL = tDaysWeek();
  const weekData = state.week.map((day, i) => {
    const m = calcDayMacros(i, false);
    const { deficit, stepsKcal, trainingKcal } = calcDayDeficit(i);
    return { day, idx: i, ...m, deficit, stepsKcal, trainingKcal };
  });
  const avgKcal = Math.round(weekData.reduce((s,d) => s + d.kcal, 0) / 7);
  const avgP    = Math.round(weekData.reduce((s,d) => s + d.p,   0) / 7);
  const avgC    = Math.round(weekData.reduce((s,d) => s + d.c,   0) / 7);
  const avgF    = Math.round(weekData.reduce((s,d) => s + d.f,   0) / 7);
  const totalDeficit = weekData.reduce((s,d) => s + d.deficit, 0);
  const totalStepsKcal    = weekData.reduce((s,d) => s + d.stepsKcal, 0);
  const totalTrainingKcal = weekData.reduce((s,d) => s + d.trainingKcal, 0);
  const trainingDays      = weekData.filter(d => d.day.weightTraining).length;
  const stepsDoneDays     = weekData.filter(d => d.day.stepsDone).length;

  function barRow(label, val, goal, col) {
    const pct = Math.min(100, Math.round((val / goal) * 100));
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:4px">
        <span style="color:#374151">${label}</span>
        <span style="color:#6b7280">${val}g / ${goal}g <span style="color:${col}">${pct}%</span></span>
      </div>
      <div style="height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden">
        <div style="height:7px;width:${pct}%;background:${col};border-radius:4px"></div>
      </div>
    </div>`;
  }

  const dayRows = weekData.map((d, i) => {
    const pct = Math.min(100, Math.round((d.kcal / (g.kcal || 2000)) * 100));
    const col = pct >= 90 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
    return `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 10px;font-size:13px;font-weight:800;color:#111">${DAYS_EL[i]}</td>
      <td style="padding:8px 10px;font-size:12px;color:#374151">${d.kcal > 0 ? d.kcal.toLocaleString()+' kcal' : '—'}</td>
      <td style="padding:8px 10px;font-size:12px;color:${col};font-weight:700">${d.kcal > 0 ? pct+'%' : '—'}</td>
      <td style="padding:8px 10px;font-size:11px;color:#6b7280">${t('macro_p_abbr')}:${d.p}g ${t('macro_c_abbr')}:${d.c}g ${t('macro_f_abbr')}:${d.f}g</td>
      <td style="padding:8px 10px;font-size:11px;color:#6b7280">${d.day.stepsDone ? '👟 '+( d.day.stepsCount||8000).toLocaleString() : '—'} ${d.day.weightTraining ? '🏋️' : ''}</td>
      <td style="padding:8px 10px;font-size:12px;font-weight:700;color:${d.deficit>0?'#22c55e':'#ef4444'}">${d.deficit > 0 ? '-' : '+'}${Math.abs(Math.round(d.deficit))} kcal</td>
    </tr>`;
  }).join('');

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page { size: A4 portrait; margin: 10mm; }
    </style>
    ${_pdfPersonBadge()}
    <div style="padding:8mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:30px;font-weight:900;color:#111">${t('pdf_stats_title')}</div>
          <div style="font-size:14px;color:#6b7280;margin-top:3px">${t('pdf_stats_subtitle')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <img src="logo.png" alt="" style="height:66px;width:auto;object-fit:contain;opacity:0.85" onerror="this.style.display='none'">
          <span style="font-size:54px;font-weight:900;color:#b8940a;letter-spacing:-1px">VIVON</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
        <div style="background:#eff6ff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('stats_avg_kcal_day')}</div>
          <div style="font-size:22px;font-weight:900;color:#22c55e">${avgKcal.toLocaleString()}</div>
          <div style="font-size:10px;color:#9ca3af">${t('stats_goal')} ${g.kcal||'—'}</div>
        </div>
        <div style="background:#eff6ff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('stats_avg_protein')}</div>
          <div style="font-size:22px;font-weight:900;color:#3b82f6">${avgP}g</div>
          <div style="font-size:10px;color:#9ca3af">${t('stats_goal')} ${g.protein||'—'}g</div>
        </div>
        <div style="background:${totalDeficit>0?'#f0fdf4':'#fef2f2'};border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('stats_week_deficit')}</div>
          <div style="font-size:22px;font-weight:900;color:${totalDeficit>0?'#22c55e':'#ef4444'}">${Math.abs(Math.round(totalDeficit))}</div>
          <div style="font-size:10px;color:#9ca3af">${totalDeficit>0?t('stats_deficit_kcal'):t('stats_surplus_kcal')}</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:18px">
        <div style="font-size:13px;font-weight:800;color:#111;margin-bottom:12px">${t('stats_macros_avg')}</div>
        ${barRow(t('macro_protein_abbr'), avgP, g.protein||180, '#3b82f6')}
        ${barRow(t('macro_carbs_abbr'), avgC, g.carbs||200, '#f59e0b')}
        ${barRow(t('macro_fat_abbr'), avgF, g.fat||60, '#8b5cf6')}
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:18px">
        <div style="padding:12px 14px;font-size:13px;font-weight:800;color:#111;border-bottom:1px solid #e5e7eb">${t('pdf_per_day')}</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">${t('pdf_col_day')}</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">KCAL</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">%</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">MACROS</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">${t('pdf_col_activity')}</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">${t('pdf_col_balance')}</th>
            </tr>
          </thead>
          <tbody>${dayRows}</tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#ecfeff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('pdf_steps_kcal')}</div>
          <div style="font-size:20px;font-weight:900;color:#06b6d4">${totalStepsKcal}</div>
          <div style="font-size:10px;color:#9ca3af">${tFmt('stats_days_steps', { n: stepsDoneDays })}</div>
        </div>
        <div style="background:#f5f3ff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('pdf_gym_kcal')}</div>
          <div style="font-size:20px;font-weight:900;color:#8b5cf6">${totalTrainingKcal}</div>
          <div style="font-size:10px;color:#9ca3af">${tFmt('pdf_workouts', { n: trainingDays })}</div>
        </div>
      </div>
    </div>`;
  showToast(t('pdf_open_print'));
  setTimeout(() => window.print(), 400);
}

function exportPDF_body() {
  const log = state.bodyLog || [];
  const p = state.profile;

  const logRows = log.length === 0
    ? `<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">${t('body_log_empty')}</td></tr>`
    : [...log].reverse().map(e => {
        const fatStr = e.fat !== null && e.fat !== undefined ? `${e.fat}%` : '—';
        const muscleStr = e.muscle !== null && e.muscle !== undefined ? `${e.muscle}%` : '—';
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:9px 12px;font-size:12px;font-weight:700;color:#374151">${e.date}</td>
          <td style="padding:9px 12px;font-size:13px;font-weight:800;color:#111">${e.weight} kg</td>
          <td style="padding:9px 12px;font-size:12px;color:#ef4444">${fatStr}</td>
          <td style="padding:9px 12px;font-size:12px;color:#16a34a">${muscleStr}</td>
        </tr>`;
      }).join('');

  const latest = log.length > 0 ? log[log.length - 1] : null;

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page { size: A4 portrait; margin: 10mm; }
    </style>
    ${_pdfPersonBadge()}
    <div style="padding:8mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:3px solid #f5c842">
        <div>
          <div style="font-size:30px;font-weight:900;color:#111">${t('pdf_body_title')}</div>
          <div style="font-size:14px;color:#6b7280;margin-top:3px">${p.name || ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <img src="logo.png" alt="" style="height:66px;width:auto;object-fit:contain;opacity:0.85" onerror="this.style.display='none'">
          <span style="font-size:54px;font-weight:900;color:#b8940a;letter-spacing:-1px">VIVON</span>
        </div>
      </div>

      ${latest ? `<div style="display:flex;gap:14px;margin-bottom:18px">
        <div style="background:#eff6ff;border-radius:10px;padding:12px 18px;text-align:center;flex:1">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('pdf_last_weight')}</div>
          <div style="font-size:24px;font-weight:900;color:#3b82f6">${latest.weight} kg</div>
          <div style="font-size:12px;font-weight:700;color:#374151;margin-top:2px">${latest.date}</div>
        </div>
        ${latest.fat !== null && latest.fat !== undefined ? `<div style="background:#fef2f2;border-radius:10px;padding:12px 18px;text-align:center;flex:1">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('pdf_fat_pct')}</div>
          <div style="font-size:24px;font-weight:900;color:#ef4444">${latest.fat}%</div>
        </div>` : ''}
        ${latest.muscle !== null && latest.muscle !== undefined ? `<div style="background:#f0fdf4;border-radius:10px;padding:12px 18px;text-align:center;flex:1">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">${t('pdf_muscle_pct')}</div>
          <div style="font-size:24px;font-weight:900;color:#16a34a">${latest.muscle}%</div>
        </div>` : ''}
      </div>` : ''}

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <div style="padding:12px 14px;font-size:13px;font-weight:800;color:#111;border-bottom:1px solid #e5e7eb">${t('pdf_body_history')}</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">${t('pdf_col_date').toUpperCase()}</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">${t('pdf_col_weight').toUpperCase()}</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">${t('pdf_col_fat').toUpperCase()}</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">${t('pdf_col_muscle').toUpperCase()}</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
    </div>`;
  showToast(t('pdf_open_print'));
  setTimeout(() => window.print(), 400);
}

function exportPDF_week() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const p = state.profile;
  const g = state.goals;

  // ── Εβδομαδιαία stats ──
  let totalKcalW = 0, totalPW = 0, totalCW = 0, totalFW = 0, daysWithMealsW = 0;
  const uniqueFoodsW = new Set();
  state.week.forEach((day, di) => {
    const m = calcDayMacros(di);
    if (m.kcal > 0) { totalKcalW += m.kcal; daysWithMealsW++; }
    totalPW += m.p; totalCW += m.c; totalFW += m.f;
    day.meals.forEach(me => {
      if (me.standardId) return;
      const r = allRecipes.find(x => x.id === me.recipeId);
      if (r) r.ingredients.forEach(ing => uniqueFoodsW.add(ing.foodId));
    });
  });
  const avgKcalW = daysWithMealsW > 0 ? Math.round(totalKcalW / daysWithMealsW) : 0;
  const avgPctW = Math.round((avgKcalW / g.kcal) * 100);
  const avgPW = daysWithMealsW > 0 ? Math.round(totalPW / daysWithMealsW) : 0;
  const avgCW = daysWithMealsW > 0 ? Math.round(totalCW / daysWithMealsW) : 0;
  const avgFW = daysWithMealsW > 0 ? Math.round(totalFW / daysWithMealsW) : 0;
  const weightChangeW = p ? ((avgKcalW - (g.kcal || avgKcalW)) * 7 / 7700).toFixed(1) : '0.0';

  function getWeekRangePrint() {
    if (!state.planStartDate) return '';
    const start = new Date(state.planStartDate);
    const end = new Date(state.planStartDate);
    end.setDate(end.getDate() + 6);
    const months = tMonths();
    return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
  }
  const weekRangePrint = getWeekRangePrint();

  const balColor = avgPctW >= 88 && avgPctW <= 108 ? '#22c55e' : avgPctW < 88 ? '#f59e0b' : '#ef4444';
  const balEmoji = avgPctW >= 88 && avgPctW <= 108 ? '😊' : avgPctW < 88 ? '😟' : '⚠️';
  const balLabel = avgPctW >= 88 && avgPctW <= 108 ? t('stats_balance_great') : avgPctW < 88 ? t('stats_balance_low') : t('stats_balance_high');
  const balSub   = avgPctW >= 88 && avgPctW <= 108 ? t('week_keep_going') : avgPctW < 88 ? t('week_increase_kcal') : t('week_decrease_kcal');

  function printGauge(pct, size) {
    const r = size * 0.38, circ = 2 * Math.PI * r;
    const dash = Math.min(pct, 100) / 100 * circ;
    const col = pct > 105 ? '#ef4444' : pct > 90 ? '#22c55e' : '#f59e0b';
    const cx = size / 2, cy = size / 2;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${size*0.075}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${size*0.075}"
        stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="${size*0.17}" font-weight="900" fill="${col}">${pct}%</text>
      <text x="${cx}" y="${cy + size*0.14}" text-anchor="middle" font-size="${size*0.085}" fill="#9ca3af">${t('pdf_gauge_avg')}</text>
    </svg>`;
  }

  function printMacroBar(label, val, goal, col) {
    const pct = Math.min(100, Math.round((val / goal) * 100));
    return `<div style="margin-bottom:5px">
      <div style="display:flex;justify-content:space-between;font-size:8px;font-weight:700;margin-bottom:2px">
        <span style="color:#374151">${label}</span>
        <span style="color:#6b7280">${val}g / ${goal}g &nbsp;<span style="color:${col}">${pct}%</span></span>
      </div>
      <div style="height:4px;background:#e5e7eb;border-radius:3px;overflow:hidden">
        <div style="height:4px;width:${pct}%;background:${col};border-radius:3px"></div>
      </div>
    </div>`;
  }

  const mealOrderP = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealMetaP = {
    breakfast: { label:tMeal('breakfast'),  color:'#f59e0b', bg:'#fffbeb', border:'#f59e0b' },
    snack:     { label:tMeal('snack'),      color:'#10b981', bg:'#f0fdf4', border:'#10b981' },
    lunch:     { label:tMeal('lunch'),      color:'#3b82f6', bg:'#eff6ff', border:'#3b82f6' },
    afternoon: { label:tMeal('afternoon'),  color:'#06b6d4', bg:'#ecfeff', border:'#06b6d4' },
    dinner:    { label:tMeal('dinner'),     color:'#8b5cf6', bg:'#f5f3ff', border:'#8b5cf6' },
  };
  const dayNamesAllP = tDays();
  function getPdfDayTitle(di) {
    if (!state.planStartDate) return tFmt('week_day_prefix', { n: di + 1 });
    const d = new Date(state.planStartDate);
    d.setDate(d.getDate() + di);
    return dayNamesAllP[d.getDay()];
  }

  const weekCols = state.week.map((day, di) => {
    const tot = calcDayMacros(di, false);
    const pct = Math.round((tot.kcal / g.kcal) * 100);
    const allDone = day.meals.length > 0 && day.meals.every(me => me.done);
    const barColor = pct > 105 ? '#ef4444' : pct > 90 ? '#22c55e' : '#f59e0b';
    const dateStr = state.planStartDate ? `<div style="font-size:9px;color:#6b7280;font-weight:600;margin-top:1px">${formatPlanDay(di)}</div>` : '';

    const byType = {};
    day.meals.forEach(me => {
      if (!byType[me.type]) byType[me.type] = [];
      byType[me.type].push(me);
    });

    const mealCards = mealOrderP.map(type => {
      const meals = byType[type];
      if (!meals || meals.length === 0) return '';
      const meta = mealMetaP[type];
      return meals.map(me => {
        let name = '', kcal = 0, emoji = '';
        if (me.standardId) {
          const sm = STANDARD_MEALS.find(s => s.id === me.standardId);
          if (!sm) return '';
          name = tName(sm) || sm.name; emoji = sm.emoji;
          kcal = Math.round(sm.kcal_est * (me.scaleFactor||1));
        } else {
          const r = allRecipes.find(x => x.id === me.recipeId);
          if (!r) return '';
          const mac = calcRecipeMacros(r, me.scaleFactor||1);
          name = tName(r); emoji = r.emoji; kcal = mac.kcal;
        }
        return `<div style="margin-bottom:4px">
          <div style="font-size:7.5px;font-weight:800;color:${meta.color};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:1px">${meta.label}</div>
          <div style="background:${meta.bg};border-left:2px solid ${meta.border};border-radius:0 4px 4px 0;padding:3px 5px">
            <div style="display:flex;align-items:center;gap:3px;margin-bottom:1px">
              <span style="font-size:13px;flex-shrink:0;line-height:1">${emoji}</span>
              <span style="font-size:8.5px;font-weight:700;color:#111;line-height:1.2;flex:1">${name}</span>
            </div>
            <div style="font-size:7.5px;color:${meta.color};font-weight:700">${kcal} kcal</div>
          </div>
        </div>`;
      }).join('');
    }).join('');

    return `<div style="flex:1;min-width:0;background:#fff;border-radius:6px;border:1px solid #e5e7eb;border-top:3px solid ${barColor};overflow:hidden">
      <div style="padding:5px 6px 4px;border-bottom:1px solid #f3f4f6">
        <div style="font-weight:900;font-size:10px;color:#111">${getPdfDayTitle(di)}</div>
        ${dateStr}
        <div style="margin-top:3px">
          <div style="font-size:11px;font-weight:900;color:${barColor}">${tot.kcal > 0 ? tot.kcal.toLocaleString() : '—'} kcal</div>
          <div style="font-size:8px;color:${barColor};font-weight:700">${tot.kcal > 0 ? pct+'%' : ''}</div>
        </div>
        <div style="height:2px;background:#e5e7eb;border-radius:2px;margin-top:3px;overflow:hidden">
          <div style="height:2px;width:${Math.min(pct,100)}%;background:${barColor};border-radius:2px"></div>
        </div>
      </div>
      <div style="padding:4px 5px 5px">
        ${mealCards || `<div style="font-size:8px;color:#9ca3af;text-align:center;padding:8px 0">${t('week_no_meal_pdf')}</div>`}
        ${allDone ? `<div style="margin-top:3px;text-align:center"><span style="font-size:7.5px;color:#22c55e;font-weight:700;background:#dcfce7;border-radius:20px;padding:1px 6px">${t('week_completed_short')}</span></div>` : ''}
      </div>
    </div>`;
  }).join('');

  const summaryPage = `
    ${_pdfPersonBadge()}
    <div style="padding:5mm 5mm 4mm;font-family:'Helvetica Neue',Arial,sans-serif;background:#f8fafc;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid #e5e7eb">
        <div>
          <div style="font-size:18px;font-weight:900;color:#111;letter-spacing:-0.5px">${t('pdf_week_title')}</div>
          <div style="font-size:9px;color:#6b7280;margin-top:1px">${tFmt('pdf_week_subtitle', { kcal: avgKcalW.toLocaleString() })}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          ${weekRangePrint ? `<div style="font-size:8px;color:#6b7280">${weekRangePrint}</div>` : ''}
          <div style="display:flex;align-items:center;gap:5px">
            <img src="logo.png" alt="" style="height:48px;width:auto;object-fit:contain;opacity:0.85" onerror="this.style.display='none'">
            <span style="font-size:45px;font-weight:900;color:#b8940a;letter-spacing:-1px">VIVON</span>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:stretch;gap:8px;margin-bottom:6px;background:#fff;border-radius:8px;padding:6px 10px;border:1px solid #e5e7eb">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;min-width:76px">
          ${printGauge(avgPctW, 66)}
          <div style="font-size:7px;font-weight:800;color:#111;margin-top:2px">${t('week_avg_intake')}</div>
          <div style="font-size:10px;font-weight:900;color:#111">${avgKcalW.toLocaleString()} kcal</div>
          <div style="font-size:6.5px;color:#9ca3af">${t('stats_goal')}: ${g.kcal.toLocaleString()} kcal</div>
        </div>
        <div style="width:1px;background:#f3f4f6;flex-shrink:0"></div>
        <div style="flex:1;padding:0 5px">
          <div style="font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">${t('week_macros_avg')}</div>
          ${printMacroBar(t('macro_protein'), avgPW, g.protein || 160, '#3b82f6')}
          ${printMacroBar(t('macro_carbs'),   avgCW, g.carbs || 200,   '#8b5cf6')}
          ${printMacroBar(t('macro_fat'),     avgFW, g.fat || 60,     '#f59e0b')}
        </div>
        <div style="width:1px;background:#f3f4f6;flex-shrink:0"></div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:95px;text-align:center">
          <div style="font-size:7px;font-weight:800;color:${balColor};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px">${t('week_balance_title')}</div>
          <div style="font-size:18px;margin-bottom:3px">${balEmoji}</div>
          <div style="font-size:8px;font-weight:800;color:${balColor}">${balLabel}</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-top:1px">${balSub}</div>
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:flex-start;margin-bottom:6px">
        ${weekCols}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">🔥</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">${t('pdf_week_total')}</div>
          <div style="font-size:10px;font-weight:900;color:#111">${totalKcalW.toLocaleString()} kcal</div>
          <div style="font-size:6.5px;color:#9ca3af">${tFmt('week_avg_kcal_day', { kcal: avgKcalW.toLocaleString() })}</div>
        </div>
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">🌿</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">${t('week_food_variety')}</div>
          <div style="font-size:10px;font-weight:900;color:#111">${tFmt('week_food_variety_count', { n: uniqueFoodsW.size })}</div>
          <div style="font-size:6.5px;color:${uniqueFoodsW.size >= 30 ? '#22c55e' : '#f59e0b'}">${uniqueFoodsW.size >= 30 ? t('diversity_great') : t('diversity_more')}</div>
        </div>
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">💧</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">${t('week_hydration')}</div>
          <div style="font-size:10px;font-weight:900;color:#111">${(state.profile.weight * 0.035).toFixed(1)}L</div>
          <div style="font-size:6.5px;color:#9ca3af">${tFmt('week_hydration_goal', { ml: Math.round(state.profile.weight * 35) })}</div>
        </div>
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">🎯</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">${t('week_goal_progress')}</div>
          <div style="font-size:10px;font-weight:900;color:${parseFloat(weightChangeW) <= 0 ? '#22c55e' : '#ef4444'}">${parseFloat(weightChangeW) > 0 ? '+' : ''}${weightChangeW} kg</div>
          <div style="font-size:6.5px;color:#9ca3af">${t('pdf_this_week')}</div>
        </div>
      </div>
    </div>`;

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page { size: A4 landscape; margin: 5mm; }
      * { box-sizing: border-box; }
    </style>
    ${summaryPage}`;
  showToast(t('pdf_open_print'));
  setTimeout(() => window.print(), 400);
}

// ── NAVIGATION & UTILITIES ──

function navigateTo(tab) {
  // Map legacy tabs to new structure
  const legacyMap = { profile: 'settings', optimize: 'settings', recipes: 'ideas', foods: 'ideas' };
  if (legacyMap[tab]) tab = legacyMap[tab];

  // Block today/week until plan is created
  if (!state.planCreated && (tab === 'today' || tab === 'week')) {
    tab = 'settings';
  }

  // Flush + confirm save only when leaving settings
  if (state.activeTab === 'settings' && tab !== 'settings') {
    flushSettingsWithConfirm();
  }

  state.activeTab = tab;
  saveState();

  // Show/hide pages (only the new top-level pages)
  const newPages = ['today','week','ideas','builder','body','stats','settings'];
  newPages.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.remove('active');
  });
  const page = document.getElementById('page-' + tab);
  if (page) page.classList.add('active');

  // Update bottom bar + sidebar + drawer
  document.querySelectorAll('.tab-item, .sidebar-item, .drawer-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));

  if (tab === 'today')    renderToday();
  if (tab === 'week')     renderWeek();
  if (tab === 'ideas')    renderIdeasPage();
  if (tab === 'builder')  { state._builderFilter = 'breakfast'; state._builderSavedDays = []; state._builderWeek = null; builderMeals = []; renderBuilderPage('breakfast'); }
  if (tab === 'body')     renderBodyPage();
  if (tab === 'stats')    renderStatsPage();
  if (tab === 'settings') renderSettingsPage();
}

function renderIdeasPage() {
  const el = document.getElementById('page-ideas');
  if (!el) return;
  // Render sub-tabs: Συνταγές | Τρόφιμα
  el.innerHTML = `
    <div class="fade-in ideas-page-wrap">
      <div class="ideas-tabs-bar" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="segment">
          <button class="seg-btn active" id="ideas-tab-recipes" onclick="showIdeasTab('recipes')">📖 ${t('nav_ideas_recipes')}</button>
          <button class="seg-btn" id="ideas-tab-foods" onclick="showIdeasTab('foods')">🥦 ${t('nav_ideas_foods')}</button>
        </div>
        <a href="https://revolut.me/dimitrtxl" target="_blank" rel="noopener" title="Υποστήριξε το VIVON" style="display:flex;align-items:center;gap:4px;padding:5px 13px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:#3b82f6;font-size:0.82rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:border-color 0.15s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border)'">&#9829; Δωρεά</a>
      </div>
      <div id="ideas-recipes-content"></div>
      <div id="ideas-foods-content" style="display:none"></div>
    </div>`;
  renderRecipesInto(document.getElementById('ideas-recipes-content'));
  renderFoodsInto(document.getElementById('ideas-foods-content'));
}

function showIdeasTab(which) {
  document.getElementById('ideas-tab-recipes').classList.toggle('active', which === 'recipes');
  document.getElementById('ideas-tab-foods').classList.toggle('active', which === 'foods');
  document.getElementById('ideas-recipes-content').style.display = which === 'recipes' ? '' : 'none';
  document.getElementById('ideas-foods-content').style.display   = which === 'foods'   ? '' : 'none';
}

function renderStatsPage() {
  const el = document.getElementById('page-stats');
  if (!el) return;

  // ── data ──
  const weekData = state.week.map((day, i) => {
    const m = calcDayMacros(i, false);
    const { deficit, stepsKcal, trainingKcal } = calcDayDeficit(i);
    return { day, idx: i, ...m, deficit, stepsKcal, trainingKcal };
  });
  const DAYS_EL = tDaysWeek();
  const goals = state.goals;
  const avgKcal = Math.round(weekData.reduce((s,d) => s + d.kcal, 0) / 7);
  const avgP    = Math.round(weekData.reduce((s,d) => s + d.p,   0) / 7);
  const avgC    = Math.round(weekData.reduce((s,d) => s + d.c,   0) / 7);
  const avgF    = Math.round(weekData.reduce((s,d) => s + d.f,   0) / 7);
  const totalDeficit       = weekData.reduce((s,d) => s + d.deficit, 0);
  const totalStepsKcal     = weekData.reduce((s,d) => s + d.stepsKcal, 0);
  const totalTrainingKcal  = weekData.reduce((s,d) => s + d.trainingKcal, 0);
  const trainingDays       = weekData.filter(d => d.day.weightTraining).length;
  const stepsDoneDays      = weekData.filter(d => d.day.stepsDone).length;

  // ── bar chart ──
  const barsHtml = weekData.map((d, i) => {
    const pct = Math.min(100, Math.round((d.kcal / (goals.kcal || 2000)) * 100));
    const isToday = i === state.currentDay;
    const color = isToday ? 'var(--purple)' : (pct >= 90 ? 'var(--green-d)' : pct >= 60 ? 'var(--amber)' : 'var(--red)');
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
        <div style="font-size:0.62rem;font-weight:700;color:${isToday?'var(--purple)':'var(--text3)'};height:14px;line-height:14px">${d.kcal > 0 ? pct+'%' : '—'}</div>
        <div style="width:100%;background:var(--border);border-radius:5px 5px 0 0;height:80px;position:relative;overflow:hidden">
          <div style="position:absolute;bottom:0;left:0;right:0;height:${pct}%;background:${color};border-radius:4px 4px 0 0;transition:height 0.5s ease"></div>
        </div>
        <div style="font-size:0.65rem;font-weight:${isToday?'800':'600'};color:${isToday?'var(--purple)':'var(--text2)'}">${DAYS_EL[i]}</div>
      </div>`;
  }).join('');

  // ── body chart ──
  const log = state.bodyLog || [];
  const latest = log.length > 0 ? log[log.length - 1] : null;
  const weightVal = latest ? `${latest.weight} kg` : '—';
  const fatVal    = (latest && latest.fat    != null) ? `${latest.fat}%`    : '—';
  const muscleVal = (latest && latest.muscle != null) ? `${latest.muscle}%` : '—';
  function bodyStatCard(bg, icon, value, label, valueColor) {
    return `<div style="flex:1;background:${bg};border-radius:14px;padding:10px 6px;display:flex;align-items:center;gap:6px;min-width:0">
      <div style="width:28px;height:28px;background:rgba(255,255,255,0.75);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.85rem">${icon}</div>
      <div style="min-width:0;flex:1">
        <div style="font-size:0.95rem;font-weight:800;color:${valueColor};line-height:1.1;white-space:nowrap">${value}</div>
        <div style="font-size:0.62rem;color:#6b7280;font-weight:500;margin-top:2px">${label}</div>
      </div>
    </div>`;
  }
  const bodyChartHtml = log.length < 2
    ? `<div style="display:flex;align-items:center;gap:10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;font-size:0.78rem;color:#0369a1;margin-top:10px">
        <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;border:1.5px solid #0369a1;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:0.72rem">i</span>
        <span>${t('body_chart_min')}</span>
       </div>`
    : `<div style="margin-top:10px">${renderBodyChart(log)}</div>`;
  const dateChip = latest
    ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;border-radius:20px;padding:5px 12px;font-size:0.78rem;color:#374151;font-weight:500;margin-top:6px">
        <span>📅</span><span>${fmtDateGr(latest.date)}</span>
       </div>` : '';

  el.innerHTML = `
    <div class="container fade-in" style="padding-top:14px;display:flex;flex-direction:column;gap:14px;padding-bottom:20px">

      <!-- Donate -->
      <div style="display:flex;justify-content:flex-end">
        <a href="https://revolut.me/dimitrtxl" target="_blank" rel="noopener" title="Υποστήριξε το VIVON" style="display:flex;align-items:center;gap:4px;padding:5px 13px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:#3b82f6;font-size:0.82rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:border-color 0.15s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border)'">&#9829; Δωρεά</a>
      </div>

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="macro-card">
          <div class="macro-card-label">${t('stats_avg_kcal_short')}</div>
          <div class="macro-card-value" style="color:var(--green-d)">${avgKcal}</div>
          <div class="macro-card-sub">${t('stats_goal')} ${goals.kcal || '—'}</div>
        </div>
        <div class="macro-card">
          <div class="macro-card-label">${t('stats_avg_protein')}</div>
          <div class="macro-card-value" style="color:var(--blue)">${avgP}g</div>
          <div class="macro-card-sub">${t('stats_goal')} ${goals.protein || '—'}g</div>
        </div>
        <div class="macro-card">
          <div class="macro-card-label">${t('stats_week_deficit')}</div>
          <div class="macro-card-value" style="color:${totalDeficit>0?'var(--green-d)':'var(--red)'}">${Math.abs(Math.round(totalDeficit))}</div>
          <div class="macro-card-sub">${totalDeficit>0?t('stats_deficit_kcal'):t('stats_surplus_kcal')}</div>
        </div>
      </div>

      <!-- Kcal bar chart -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3>${t('stats_kcal_per_day')}</h3>
          <span style="font-size:0.72rem;color:var(--text3)">${t('stats_goal')}: ${goals.kcal||'—'} kcal</span>
        </div>
        <div style="display:flex;gap:5px;align-items:flex-end">
          ${barsHtml}
        </div>
      </div>

      <!-- Macros avg -->
      <div class="card">
        <h3 style="margin-bottom:12px">${t('stats_macros_avg')}</h3>
        ${[
          { lbl:t('macro_protein_abbr'), val:avgP, goal: goals.protein||180, color:'var(--blue)' },
          { lbl:t('macro_carbs_abbr'), val:avgC, goal: goals.carbs||200, color:'var(--amber)' },
          { lbl:t('macro_fat_abbr'), val:avgF, goal: goals.fat||60, color:'var(--purple)' },
        ].map(m => {
          const pct = Math.min(100, Math.round((m.val / m.goal) * 100));
          return `
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label">
                <span>${m.lbl}</span>
                <span>${m.val}g / ${m.goal}g <span style="color:var(--text3)">(${pct}%)</span></span>
              </div>
              <div class="dplanner-mbar-track">
                <div class="dplanner-mbar-fill" style="width:${pct}%;background:${m.color}"></div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <!-- Activity -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="macro-card">
          <div class="macro-card-label">${t('stats_steps_kcal')}</div>
          <div class="macro-card-value" style="color:var(--cyan)">${totalStepsKcal}</div>
          <div class="macro-card-sub">${tFmt('stats_days_steps', { n: stepsDoneDays })}</div>
        </div>
        <div class="macro-card">
          <div class="macro-card-label">${t('stats_gym_kcal')}</div>
          <div class="macro-card-value" style="color:var(--purple)">${totalTrainingKcal}</div>
          <div class="macro-card-sub">${tFmt('stats_workouts', { n: trainingDays })}</div>
        </div>
      </div>

      <!-- Body measurements chart -->
      <div class="card">
        <h3 style="margin-bottom:12px">${t('stats_body_progress')}</h3>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          ${bodyStatCard('#eff6ff','⚖️',weightVal,t('body_weight'),'#3b82f6')}
          ${bodyStatCard('#fef2f2','🩸',fatVal,t('body_fat'),'#ef4444')}
          ${bodyStatCard('#f0fdf4','💪',muscleVal,t('body_muscle'),'#16a34a')}
        </div>
        ${dateChip}
        ${bodyChartHtml}
      </div>

    </div>`;
}

function renderBodyPage() {
  const el = document.getElementById('page-body');
  if (!el) return;
  el.innerHTML = `<div class="container fade-in" style="padding-top:14px"><div id="body-page-content"></div></div>`;
  document.getElementById('body-page-content').innerHTML = renderBodyMeasurementsCard();
}

let _autoSaveTimer = null;
let _settingsDirty = false;
function autoSaveSettings() {
  _settingsDirty = true;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => syncToSupabase().catch(() => {}), 1200);
}
function flushSettingsWithConfirm() {
  if (!_settingsDirty) return Promise.resolve();
  return syncToSupabase().then(() => {
    _settingsDirty = false;
    showToast(t('settings_saved'), 1800);
  }).catch(() => {});
}

function renderSettingsPage() {
  const el = document.getElementById('page-settings');
  if (!el) return;
  el.innerHTML = `
    <div class="container fade-in" style="padding-top:14px">
      <div class="settings-icon-tabs">
        <button class="sit-btn active" id="settings-tab-profile" onclick="showSettingsTab('profile')">
          <span class="sit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>
          <span class="sit-label">${t('settings_profile')}</span>
        </button>
        <button class="sit-btn" id="settings-tab-supplements" onclick="showSettingsTab('supplements')">
          <span class="sit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5 A4 7 -45 0 1 13.5 21.5 M13.5 2.5 A4 7 45 0 1 10.5 21.5"/><line x1="7" y1="12" x2="17" y2="12"/></svg></span>
          <span class="sit-label">${t('settings_supplements')}</span>
        </button>
        <button class="sit-btn" id="settings-tab-language" onclick="showSettingsTab('language')">
          <span class="sit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
          <span class="sit-label">${t('settings_language')}</span>
        </button>
        <button class="sit-btn" id="settings-tab-feedback" onclick="showSettingsTab('feedback')">
          <span class="sit-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
          <span class="sit-label">${t('settings_feedback')}</span>
        </button>
      </div>
      <div id="settings-profile-content"></div>
      <div id="settings-supplements-content" style="display:none"></div>
      <div id="settings-language-content" style="display:none"></div>
      <div id="settings-feedback-content" style="display:none"></div>
    </div>`;
  renderProfileInto(document.getElementById('settings-profile-content'));
  renderSettingsSupplements();
  renderSettingsLanguage();
  renderSettingsFeedback();
}

function renderSettingsSupplements() {
  const el = document.getElementById('settings-supplements-content');
  if (!el) return;
  const supp = state.supplements || {};
  const enabled = !!supp.enabled;
  const activeIds = supp.activeIds || [];
  el.innerHTML = `
    <div style="margin-top:16px">
      <div class="card card-sm" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:0.9rem;font-weight:700">${t('suppl_title')}</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${t('suppl_subtitle')}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSuppFeature(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      ${enabled ? `
      <div style="margin-bottom:12px">
        <input type="text" id="supp-search" placeholder="${t('search_supplement')}"
          oninput="filterSupplements()"
          style="width:100%;padding:10px 14px;border:2px solid var(--border);border-radius:12px;
          font-size:0.9rem;font-family:inherit;background:var(--bg2);color:var(--text);
          box-sizing:border-box;transition:border-color 0.15s;outline:none"
          onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div id="supp-cats" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${[['all',t('supp_cat_all')],['sport',t('supp_cat_sport')],['health',t('supp_cat_health')],['wellness',t('supp_cat_wellness')],['fatburn',t('supp_cat_fatburn')],['personal',t('supp_cat_personal')]].map(([cat,lbl]) =>
          `<button id="supp-cat-${cat}" onclick="filterSupplementsCat('${cat}')"
            style="padding:5px 12px;border-radius:20px;border:1.5px solid ${cat==='all'?'var(--green)':'var(--border)'};
            background:${cat==='all'?'var(--green-bg)':'var(--bg2)'};cursor:pointer;
            font-size:0.75rem;font-weight:600;color:${cat==='all'?'var(--green-d)':'var(--text2)'};
            transition:all 0.15s">${lbl}</button>`
        ).join('')}
      </div>
      <!-- Custom supplements (above library) -->
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:0.78rem;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em">${t('supp_custom_title')}</div>
          <!-- Mobile: icon only; Desktop: full text button -->
          <button id="supp-custom-add-btn" onclick="showCustomSuppForm()"
            style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text2);font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.15s;flex-shrink:0"
            onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green-d)';this.style.background='var(--green-bg)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)';this.style.background='var(--bg2)'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span class="supp-add-label">${t('supp_custom_add')}</span>
          </button>
        </div>
        <div id="supp-custom-list">
          ${(state.supplements.custom||[]).map(s => {
            const isActive = activeIds.includes(s.id);
            return `<div class="card card-sm" style="margin-bottom:8px;padding:10px 14px;display:grid;grid-template-columns:1fr auto 52px;align-items:center;gap:8px">
              <div style="min-width:0">
                <div style="font-size:0.88rem;font-weight:700">${esc(s.name)}</div>
                <div style="font-size:0.7rem;color:var(--text3);margin-top:1px">${s.timing ? esc(s.timing) : ''}${s.timing && s.qty ? ' · ' : ''}${s.qty ? esc(s.qty) : ''}</div>
              </div>
              <button onclick="deleteCustomSupp('${s.id}')" title="${t('supp_custom_delete')}"
                style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.9rem;padding:4px 6px;border-radius:6px;transition:color 0.15s"
                onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text3)'">🗑️</button>
              <label class="toggle-switch" style="justify-self:end;flex-shrink:0">
                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleSuppActive('${s.id}')">
                <span class="toggle-slider"></span>
              </label>
            </div>`;
          }).join('')}
        </div>
        <div id="supp-custom-form" style="display:none;margin-top:8px">
          <div class="card card-sm" style="padding:14px;display:flex;flex-direction:column;gap:10px">
            <input id="supp-custom-name" type="text" placeholder="${t('supp_custom_name_ph')}" maxlength="60"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:0.88rem;font-family:inherit;background:var(--bg2);color:var(--text);box-sizing:border-box;outline:none;transition:border-color 0.15s"
              onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <input id="supp-custom-qty" type="text" placeholder="${t('supp_custom_qty_ph')}" maxlength="40"
                style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:0.85rem;font-family:inherit;background:var(--bg2);color:var(--text);box-sizing:border-box;outline:none;transition:border-color 0.15s"
                onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'">
              <input id="supp-custom-timing" type="text" placeholder="${t('supp_custom_timing_ph')}" maxlength="40"
                style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:0.85rem;font-family:inherit;background:var(--bg2);color:var(--text);box-sizing:border-box;outline:none;transition:border-color 0.15s"
                onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'">
            </div>
            <div style="display:flex;gap:8px">
              <button onclick="saveCustomSupp()" style="flex:1;padding:9px;border-radius:10px;background:var(--green);color:#fff;border:none;font-size:0.88rem;font-weight:700;cursor:pointer">${t('supp_custom_save')}</button>
              <button onclick="cancelCustomSupp()" style="padding:9px 14px;border-radius:10px;background:var(--bg2);color:var(--text2);border:1.5px solid var(--border);font-size:0.88rem;font-weight:600;cursor:pointer">${t('supp_custom_cancel')}</button>
            </div>
          </div>
        </div>
      </div>

      <div id="supp-list">
      ${[...SUPPLEMENTS_LIBRARY].sort((a,b) => (tName(a)||a.name).localeCompare(tName(b)||b.name)).map(s => {
        const isActive = activeIds.includes(s.id);
        return `<div class="card card-sm supp-item" data-cat="${s.category||'personal'}" data-name="${(tName(s)||s.name).toLowerCase()}" style="margin-bottom:8px;padding:10px 14px;display:grid;grid-template-columns:1fr 52px;align-items:center;gap:10px">
          <div style="min-width:0">
            <div style="font-size:0.88rem;font-weight:700">${tName(s)}</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-top:1px">${tName(s,'timing')} · ${tName(s,'qty')}</div>
            <div style="font-size:0.68rem;margin-top:3px">${tName(s,'ideal')}</div>
          </div>
          <label class="toggle-switch" style="justify-self:end;flex-shrink:0">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleSuppActive('${s.id}')">
            <span class="toggle-slider"></span>
          </label>
        </div>`;
      }).join('')}
      </div>
      ` : ''}
    </div>`;
}

function renderSettingsLanguage() {
  const el = document.getElementById('settings-language-content');
  if (!el) return;
  const cur = getLang();
  el.innerHTML = `
    <div style="margin-top:16px">
      <div class="card card-lg fade-in" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:#e8f0fe;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
          <div>
            <div style="font-size:1rem;font-weight:800;color:var(--text)">${t('lang_title')}</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${t('lang_subtitle')}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${Object.entries(LANGUAGES).map(([code, info]) => `
            <button onclick="changeLang('${code}')" style="
              padding:14px 12px;border-radius:12px;border:2px solid ${cur===code?'var(--green)':'var(--border)'};
              background:${cur===code?'var(--green-bg)':'var(--bg2)'};cursor:pointer;
              display:flex;align-items:center;gap:10px;transition:all 0.15s;
              font-size:0.92rem;font-weight:${cur===code?'800':'600'};color:${cur===code?'var(--green-d)':'var(--text)'}">
              <span style="font-size:1.5rem">${info.flag}</span>
              <span>${info.label}</span>
              ${cur===code ? '<span style="margin-left:auto;font-size:0.8rem">&#10003;</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function changeLang(code) {
  if (typeof setLang === 'function') setLang(code);
  renderSettingsLanguage();
  const tabMap = {
    profile: 'settings_profile', optimize: 'settings_optimize',
    supplements: 'settings_supplements', language: 'settings_language', feedback: 'settings_feedback'
  };
  Object.entries(tabMap).forEach(([tab, key]) => {
    const btn = document.getElementById('settings-tab-' + tab);
    if (btn) { const lbl = btn.querySelector('.sit-label'); if (lbl) lbl.textContent = t(key); }
  });
  autoSaveSettings();
}

function renderSettingsFeedback() {
  const el = document.getElementById('settings-feedback-content');
  if (!el) return;
  el.innerHTML = `
    <div style="margin-top:16px">
      <div class="card card-lg fade-in" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:#fef3c7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
          <div>
            <div style="font-size:1rem;font-weight:800;color:var(--text)">${t('feedback_title')}</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${t('feedback_subtitle')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <span style="font-size:0.8rem;font-weight:600;color:var(--text2)">${t('feedback_type_label')}</span>
          ${[['general', t('feedback_type_general')],['bug', t('feedback_type_bug')],['idea', t('feedback_type_idea')]].map(([val, lbl]) => `
            <button id="fb-type-${val}" onclick="selectFeedbackType('${val}')"
              style="padding:6px 12px;border-radius:20px;border:1.5px solid var(--border);background:var(--bg2);
              cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--text2);transition:all 0.15s">
              ${lbl}
            </button>
          `).join('')}
        </div>
        <textarea id="feedback-text" rows="4"
          placeholder="${t('feedback_placeholder')}"
          style="width:100%;padding:12px;border:2px solid var(--border);border-radius:12px;font-size:0.9rem;
          font-family:inherit;background:var(--bg2);color:var(--text);resize:vertical;min-height:100px;
          box-sizing:border-box;transition:border-color 0.15s"
          onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'"></textarea>
        <button id="feedback-send-btn" onclick="sendFeedback()"
          class="btn btn-primary"
          style="width:100%;margin-top:10px;padding:13px;font-size:0.95rem;font-weight:700;border-radius:12px">
          ${t('feedback_send')}
        </button>
      </div>

      <div class="card card-lg fade-in" style="margin-bottom:14px;background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border-color:#fcd34d">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:40px;height:40px;border-radius:10px;background:#fef08a;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">&#10084;&#65039;</div>
          <div>
            <div style="font-size:1rem;font-weight:800;color:#92400e">${t('donate_title')}</div>
            <div style="font-size:0.75rem;color:#a16207;margin-top:2px">${t('donate_subtitle')}</div>
          </div>
        </div>
        <a href="https://revolut.me/dimitrtxl" target="_blank" rel="noopener"
          style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px;
          border-radius:12px;background:#191C1F;color:#fff;font-size:0.95rem;font-weight:800;
          text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.18);transition:opacity 0.15s"
          onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          ${t('donate_revolut')}
        </a>
        <div style="text-align:center;font-size:0.82rem;color:#92400e;font-weight:700;margin-top:14px">${t('donate_thanks')}</div>
      </div>
    </div>`;

  selectFeedbackType('general');
}

let _selectedFeedbackType = 'general';

function selectFeedbackType(type) {
  _selectedFeedbackType = type;
  ['general','bug','idea'].forEach(v => {
    const btn = document.getElementById('fb-type-' + v);
    if (!btn) return;
    if (v === type) {
      btn.style.background = 'var(--green-bg)';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green-d)';
    } else {
      btn.style.background = 'var(--bg2)';
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text2)';
    }
  });
}

async function sendFeedback() {
  const text = (document.getElementById('feedback-text')?.value || '').trim();
  if (!text) { showToast(t('feedback_empty'), 2500); return; }
  const btn = document.getElementById('feedback-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('feedback_sending'); }
  try {
    const user = typeof sbGetCurrentUser === 'function' ? sbGetCurrentUser() : null;
    const payload = {
      type: _selectedFeedbackType,
      message: text,
      lang: getLang(),
      user_email: user?.email || 'anonymous',
      created_at: new Date().toISOString(),
      app: 'VIVON',
    };

    // Save to Supabase table
    let saved = false;
    if (typeof supabase !== 'undefined') {
      try {
        const { error } = await supabase.from('feedback').insert([payload]);
        if (!error) saved = true;
      } catch(e) {}
    }
    if (!saved) {
      try {
        const prev = JSON.parse(localStorage.getItem('vivon_feedback') || '[]');
        prev.push(payload);
        localStorage.setItem('vivon_feedback', JSON.stringify(prev));
      } catch(e) {}
    }

    // Send email notification via Google Apps Script
    try {
      const GAS_URL = 'https://script.google.com/macros/s/AKfycbx6XHAAeJMIUVUBtHmjNqu6NGSKvFWgkWeUT4x6x_UMsmEaoPXFPMqlhXLKH5dJ0aGlag/exec';
      const fd = new FormData();
      fd.append('_to', 'moudiotis.meng@gmail.com');
      fd.append('_key', 'MyPrivateAgencyKey_99');
      fd.append('_hp', '');
      fd.append('subject', `[VIVON Feedback] ${payload.type} from ${payload.user_email}`);
      fd.append('message', `Type: ${payload.type}\nFrom: ${payload.user_email}\nLang: ${payload.lang}\nApp: ${payload.app}\nDate: ${payload.created_at}\n\n${payload.message}`);
      fd.append('name', payload.user_email);
      await fetch(GAS_URL, { method: 'POST', body: fd });
    } catch(e) {}

    showToast(t('feedback_sent'), 3000);
    const ta = document.getElementById('feedback-text');
    if (ta) ta.value = '';
  } catch(e) {
    showToast(t('feedback_error'), 3000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('feedback_send'); }
  }
}

function showSettingsTab(which) {
  ['profile','supplements','language','feedback'].forEach(tab => {
    const btn = document.getElementById('settings-tab-' + tab);
    const content = document.getElementById('settings-' + tab + '-content');
    if (btn) btn.classList.toggle('active', tab === which);
    if (content) content.style.display = tab === which ? '' : 'none';
  });
}

async function saveSettingsToCloud() {
  const btns = ['settings-save-top', 'settings-save-bottom'];
  btns.forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = true; b.textContent = t('settings_saving'); }
  });
  try {
    await syncToSupabase();
    showToast(t('settings_saved'), 2500);
  } catch (e) {
    showToast(t('settings_save_error'), 3000);
  } finally {
    btns.forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = false; b.innerHTML = t('settings_save'); }
    });
  }
}

// Wrappers: temporarily mount a hidden page, render, move innerHTML (onclick attrs survive)
function _renderInto(targetEl, hiddenPageId, renderFn) {
  if (!targetEl) return;
  renderFn();
  const src = document.getElementById(hiddenPageId);
  if (src) targetEl.innerHTML = src.innerHTML;
}
function renderProfileInto(el)  { if (!el) return; _renderProfileInto(el); initGoalSliders(); }
function renderOptimizeInto(el) { _renderInto(el, 'page-optimize', renderOptimize); }
function renderRecipesInto(el)  { _renderInto(el, 'page-recipes',  renderRecipes);  }
function renderFoodsInto(el)    { _renderInto(el, 'page-foods',    renderFoods);    }

let _toastTimer = null;
function showToast(msg, dur = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// -- INIT --
// Called by auth.js after the user successfully signs in.
async function initApp() {
  initLang();
  await loadState();
  // Seed initial history state so popstate always has a tab to land on
  history.replaceState({ vivon: 'tab', tab: state.activeTab || 'today' }, '', location.pathname + location.search);
  checkWeekReset();
  updateSidebarAvatar();
  updateUILanguage();

  // Update sidebar + drawer with signed-in user's name or email
  const user = sbGetCurrentUser();
  if (user) {
    const _emailShort = (email) => email ? email.split('@')[0] : t('share_user');
    const displayLabel = state.profile.name || _emailShort(user.email);
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = displayLabel;
    const dName  = document.getElementById('drawer-user-name');
    const dEmail = document.getElementById('drawer-user-email');
    if (dName)  dName.textContent  = displayLabel;
    if (dEmail) dEmail.textContent = user.email || '';
  }

  updatePlanCreatedUI();

  document.querySelectorAll('.tab-item, .sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) { navigateTo(tab); _historyPushTab(tab); }
    });
  });
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
  // Map legacy saved tabs to new tabs
  const legacyMap = { profile: 'settings', optimize: 'settings', recipes: 'ideas', foods: 'ideas' };
  if (_isNewUser) {
    _isNewUser = false;
    navigateTo('settings');
  } else {
    const savedTab = state.activeTab || 'today';
    navigateTo(legacyMap[savedTab] || savedTab);
  }

  // Reveal shell only after correct tab is active — prevents flicker
  const shell = document.getElementById('app-shell');
  if (shell) shell.classList.remove('app-hidden');

  // Κρύψιμο top nav με scroll-down
  let lastScrollY = window.scrollY;
  const topNav = document.querySelector('.top-nav');
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 10) {
      topNav && topNav.classList.add('hidden');
    } else {
      topNav && topNav.classList.remove('hidden');
    }
    lastScrollY = currentScrollY;
  }, { passive: true });
}

// DOMContentLoaded is intentionally empty here.
// auth.js boots first, checks the session, then calls initApp().
document.addEventListener('DOMContentLoaded', () => {});

/* ── HISTORY API (back-button support) ── */
function _historyPushTab(tab) {
  history.pushState({ vivon: 'tab', tab }, '', location.pathname + location.search);
}
function _historyPushDrawer() {
  history.pushState({ vivon: 'drawer' }, '', location.pathname + location.search);
}
function _isDrawerOpen() {
  return document.getElementById('drawer')?.classList.contains('open');
}
window.addEventListener('popstate', (e) => {
  if (_isDrawerOpen()) {
    closeDrawer(true);
    return;
  }
  const s = e.state;
  if (s && s.vivon === 'tab' && s.tab) {
    navigateTo(s.tab);
  }
});

/* ── SIDE DRAWER ── */
function openDrawer() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  updateDrawerUser();
  drawer.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  _historyPushDrawer();
}

function closeDrawer(fromPopstate) {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  if (!fromPopstate) history.back();
}

function switchTabFromDrawer(tab) {
  closeDrawer(true);
  // Replace the drawer history entry with the new tab so back goes to the previous tab, not the drawer
  history.replaceState({ vivon: 'tab', tab }, '', location.pathname + location.search);
  navigateTo(tab);
  document.querySelectorAll('.drawer-item[data-tab]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
}

function updateDrawerUser() {
  const user = sbGetCurrentUser ? sbGetCurrentUser() : null;
  const p = (typeof state !== 'undefined') ? state.profile : {};
  const avatarEl = document.getElementById('drawer-avatar');
  const nameEl   = document.getElementById('drawer-user-name');
  const emailEl  = document.getElementById('drawer-user-email');
  if (avatarEl) {
    if (p && p.photoUrl) {
      avatarEl.innerHTML = `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">`;
    } else {
      avatarEl.textContent = (p && p.name ? p.name : (user ? user.email : 'Δ')).charAt(0).toUpperCase();
    }
  }
  if (nameEl) nameEl.textContent = (p && p.name) || (user && user.email) || t('share_user');
  if (emailEl) emailEl.textContent = (user && user.email) || '';
}

/* ── LEGAL MODAL ── */
function openLegalModal() {
  document.getElementById('legal-modal-overlay').classList.add('open');
}
function closeLegalModal() {
  document.getElementById('legal-modal-overlay').classList.remove('open');
}
