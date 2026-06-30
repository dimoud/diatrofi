// ============================================================
// script.js — Main application logic
// ============================================================

// ── STATE ──
let state = {
  profile: { ...DEFAULT_PROFILE },
  goals: { ...DEFAULT_GOALS },
  week: JSON.parse(JSON.stringify(DEFAULT_WEEK)),
  weekCreatedAt: Date.now(),
  currentDay: 0,
  supplements: JSON.parse(JSON.stringify(SUPPLEMENTS_STATE_DEFAULT)),
  favorites: [],
  customFoods: [],
  customRecipes: [],
  dayTemplates: [],
  activeTab: 'today',
  optimizeMode: 1,
  bodyLog: [],
};

// ── MEAL TIME HELPER ──
// Επιστρέφει ώρες γευμάτων βάσει firstMealTime του profile (+3h ανά γεύμα)
function getMealTimes() {
  const first = (state.profile && state.profile.firstMealTime) ? state.profile.firstMealTime : '08:00';
  const [h, m] = first.split(':').map(Number);
  const addMins = (mins) => {
    const total = h * 60 + m + mins;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };
  return {
    breakfast: first,
    snack:     addMins(3 * 60),    // +3h
    lunch:     addMins(5 * 60),    // +5h
    afternoon: addMins(8 * 60),    // +8h (απόγευμα, όχι βραδινό)
    dinner:    addMins(11 * 60),   // +11h
  };
}

// ── PERSISTENCE (localStorage cache + Supabase cloud) ──

let _saveTimer = null;

function saveState() {
  // Fast local cache for instant UI on reload
  try { localStorage.setItem('nutriApp_v2', JSON.stringify(state)); } catch(e) {}
  // Debounced cloud save (1.5 s after last change)
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(syncToSupabase, 1500);
}

async function syncToSupabase() {
  const user = sbGetCurrentUser();
  if (!user) return;
  const weekKey = getISOWeekKey();
  try {
    await Promise.all([
      sbSaveProfile(user.id, state.profile),
      sbSaveGoals(user.id, state.goals),
      sbSaveWeekPlan(user.id, weekKey, state.week),
      sbSaveBodyLog(user.id, state.bodyLog),
      sbSaveSupplements(user.id, state.supplements),
      sbSaveCustomFoods(user.id, state.customFoods),
      sbSaveCustomRecipes(user.id, state.customRecipes),
      sbSaveUserState(user.id, {
        favorites:    state.favorites,
        dayTemplates: state.dayTemplates,
        optimizeMode: state.optimizeMode,
        activeTab:    state.activeTab,
      }),
    ]);
  } catch(e) {
    console.error('Supabase sync error:', e);
  }
}

async function loadState() {
  // 1. Load from localStorage first for instant render
  try {
    const raw = localStorage.getItem('nutriApp_v2');
    if (raw) {
      const saved = JSON.parse(raw);
      state = {
        ...state,
        ...saved,
        profile: { ...state.profile, ...(saved.profile || {}) },
        goals:   { ...state.goals,   ...(saved.goals   || {}) },
      };
    }
  } catch(e) {}

  // 2. Fetch from Supabase (source of truth) and overwrite
  const user = sbGetCurrentUser();
  if (user) {
    try {
      const cloud = await sbLoadUserData(user.id);
      if (cloud && Object.keys(cloud).length > 0) {
        state = {
          ...state,
          ...cloud,
          profile: { ...state.profile, ...(cloud.profile || {}) },
          goals:   { ...state.goals,   ...(cloud.goals   || {}) },
        };
        // Update localStorage cache with fresh cloud data
        try { localStorage.setItem('nutriApp_v2', JSON.stringify(state)); } catch(e) {}
      }
    } catch(e) {
      console.error('Failed to load from Supabase:', e);
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
}

function checkWeekReset() {
  const weekKey = getISOWeekKey();
  // Use weekKey stored in state to detect week change (replaces time-based check)
  const storedKey = state.weekKey;
  if (storedKey && storedKey !== weekKey) {
    // New week — archive old week is already in Supabase under the old weekKey.
    // Reset all daily done flags.
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
    showToast('Νέα εβδομάδα! Τα ημερήσια checkboxes έγιναν reset.', 4000);
  } else if (!storedKey) {
    // First run — stamp the current week key
    state.weekKey = weekKey;
    if (!state.weekCreatedAt) state.weekCreatedAt = Date.now();
  }
}

// ── ACTIVITY & DEFICIT CALCULATIONS ──
function calcStepsKcal(steps, weight) {
  // ~0.04 kcal ανά βήμα για 70kg, γραμμική κλιμάκωση
  return Math.round(steps * 0.04 * (weight / 70));
}

function calcWeightTrainingKcal(weight) {
  // ~5 kcal/λεπτό για 60 λεπτά, κλιμάκωση βάρους
  return Math.round(5 * 60 * (weight / 70));
}

function calcDayActivityKcal(dayIdx) {
  const day = state.week[dayIdx];
  const w = state.profile.weight || 80;
  const stepsCount = (day.stepsCount !== undefined && day.stepsCount !== null) ? day.stepsCount : 8000;
  const stepsDone = !!day.stepsDone;
  const stepsKcal = stepsDone ? calcStepsKcal(stepsCount, w) : 0;
  const trainingKcal = day.weightTraining ? calcWeightTrainingKcal(w) : 0;
  return { stepsKcal, trainingKcal, totalActivityKcal: stepsKcal + trainingKcal, stepsCount, stepsDone };
}

function calcDayDeficit(dayIdx) {
  const day = state.week[dayIdx];
  const p = state.profile;
  // Βασικός TDEE μόνο με sedentary factor (1.2) — η υπόλοιπη δραστηριότητα μετριέται via βήματα/προπόνηση
  const bmr = calcBMR(p);
  const { stepsKcal, trainingKcal } = calcDayActivityKcal(dayIdx);
  const totalBurn = bmr + stepsKcal + trainingKcal;
  const consumed = calcDayMacros(dayIdx, false).kcal + (day.extraKcal || 0);
  return { totalBurn, consumed, deficit: totalBurn - consumed, stepsKcal, trainingKcal };
}

// ── COMPUTED MACROS ──
function calcRecipeMacros(recipe, scaleFactor = 1) {
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
    } else if (food.unit === 'ψεκ') {
      // ψεκασμός ελαιόλαδου: 1 ψεκ = 0.25ml ≈ 0.23g · per100 βάσει ml
      // qty ψεκ → qty * 0.25ml → /100 * per100
      const mlPerSpray = food.sprayFactor || 0.25;
      const ml = qty * mlPerSpray;
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
  const day = state.week[dayIdx];
  let tot = { kcal: 0, p: 0, c: 0, f: 0 };
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  day.meals.forEach(meal => {
    if (doneOnly && !meal.done) return;
    const sf = meal.scaleFactor || 1;
    if (meal.standardId) {
      const sm = STANDARD_MEALS.find(s => s.id === meal.standardId);
      if (sm) tot.kcal += Math.round(sm.kcal_est * sf);
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
function addBodyMeasurement() {
  const dateEl = document.getElementById('bm-date');
  const weightEl = document.getElementById('bm-weight');
  const fatEl = document.getElementById('bm-fat');
  const muscleEl = document.getElementById('bm-muscle');
  if (!dateEl || !weightEl) return;
  const date = dateEl.value;
  const weight = parseFloat(weightEl.value);
  if (!date || isNaN(weight) || weight <= 0) { showToast('⚠️ Βάλε ημερομηνία και βάρος'); return; }
  const fat = fatEl && fatEl.value !== '' ? parseFloat(fatEl.value) : null;
  const muscle = muscleEl && muscleEl.value !== '' ? parseFloat(muscleEl.value) : null;
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
  }
  saveState();
  const bodyCard = document.getElementById('body-page-content');
  if (bodyCard) bodyCard.innerHTML = renderBodyMeasurementsCard();
  showToast('✅ Μέτρηση αποθηκεύτηκε!');
}

function deleteBodyEntry(date) {
  if (!state.bodyLog) return;
  state.bodyLog = state.bodyLog.filter(e => e.date !== date);
  saveState();
  const bodyCard = document.getElementById('body-page-content');
  if (bodyCard) bodyCard.innerHTML = renderBodyMeasurementsCard();
  showToast('🗑 Εγγραφή διαγράφηκε');
}

function renderBodyChart(log) {
  if (!log || log.length < 2) return '<div style="font-size:0.78rem;color:var(--text3);text-align:center;padding:16px 0">Χρειάζονται τουλάχιστον 2 μετρήσεις για διάγραμμα</div>';

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
        <span style="width:12px;height:2px;background:#3b82f6;border-radius:1px;display:inline-block"></span>Βάρος (kg)
      </button>
      ${hasFat ? `<button onclick="bchart_toggleSeries('${id}','fat')" id="${id}_t_fat"
        style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;font-size:0.7rem;font-weight:700;border-radius:6px;border:2px solid #ef4444;background:#fef2f2;color:#b91c1c;cursor:pointer">
        <span style="width:12px;height:2px;background:#ef4444;border-radius:1px;display:inline-block"></span>% Λίπος
      </button>` : ''}
      ${hasMuscle ? `<button onclick="bchart_toggleSeries('${id}','muscle')" id="${id}_t_muscle"
        style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;font-size:0.7rem;font-weight:700;border-radius:6px;border:2px solid #22c55e;background:#f0fdf4;color:#15803d;cursor:pointer">
        <span style="width:12px;height:2px;background:#22c55e;border-radius:1px;display:inline-block"></span>% Μυϊκή Μάζα
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

      const PAD = { t: 14, r: 12, b: 28, l: 44 };
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

      // active series
      const active = [];
      if (state.series.weight) active.push({ key:'weight', field:'weight', color:'#3b82f6', suffix:'kg', dash:[] });
      if (state.series.fat && hasFat)    active.push({ key:'fat',    field:'fat',    color:'#ef4444', suffix:'%',  dash:[4,3] });
      if (state.series.muscle && hasMuscle) active.push({ key:'muscle', field:'muscle', color:'#22c55e', suffix:'%', dash:[6,3] });

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

      // y-axis labels — one set per active series, left side only, color-coded
      active.forEach((s, si) => {
        const vals = filtered.map(e => e[s.field] ?? null).filter(v => v !== null);
        if (!vals.length) return;
        const minV = Math.min(...vals), maxV = Math.max(...vals);
        const pad = (maxV - minV) * 0.15 || 1;
        const lo = minV - pad, hi = maxV + pad;
        ctx.fillStyle = s.color;
        ctx.font = `bold ${dpr > 1 ? 9 : 8}px system-ui,sans-serif`;
        ctx.textAlign = 'right';
        for (let t = 0; t <= 4; t++) {
          const v = lo + (hi - lo) * (t / 4);
          const y = PAD.t + iH * (1 - t / 4);
          if (active.length === 1 || si === 0) {
            ctx.fillText(v.toFixed(1) + s.suffix, PAD.l - 4, y + 3);
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
    function getXFraction(clientX) {
      const rect = canvas.getBoundingClientRect();
      return (clientX - rect.left - 44) / (rect.width - 44 - 12);
    }

    function showTooltipAt(clientX) {
      const filtered = filterByPeriod(state.log, state.period);
      const n = filtered.length;
      if (n < 2) return;
      const rect = canvas.getBoundingClientRect();
      const iW = rect.width - 44 - 12;
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
        const iW = rect.width - 44 - 12;
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
      const iW = rect.width - 44 - 12;
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
  const months = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
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

  const weightCard = statCard('#eff6ff', '⚖️', weightVal, 'Βάρος',      '#3b82f6');
  const fatCard    = statCard('#fef2f2', '🩸',  fatVal,    'Λίπος',      '#ef4444');
  const muscleCard = statCard('#f0fdf4', '💪',  muscleVal, 'Μυϊκή μάζα','#16a34a');

  const dateChip = latest
    ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;border-radius:20px;padding:5px 12px;font-size:0.78rem;color:#374151;font-weight:500;margin-top:6px">
        <span style="font-size:0.8rem">📅</span><span>${fmtDateGr(latest.date)}</span>
       </div>` : '';

  const chartInfo = log.length < 2
    ? `<div style="display:flex;align-items:center;gap:10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;font-size:0.78rem;color:#0369a1;margin-top:10px">
        <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;border:1.5px solid #0369a1;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:0.72rem">i</span>
        <span>Χρειάζονται τουλάχιστον 2 μετρήσεις για διάγραμμα</span>
       </div>`
    : `<div style="margin-top:10px">${renderBodyChart(log)}</div>`;

  // ── History rows ──
  const historyRows = log.length === 0
    ? `<div style="font-size:0.8rem;color:var(--text3);text-align:center;padding:16px 0">Δεν υπάρχουν μετρήσεις ακόμα</div>`
    : [...log].reverse().slice(0, 8).map(e => {
        const weightCol = `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;min-width:48px">
          <span style="font-size:0.85rem">⚖️</span>
          <span style="font-size:0.8rem;font-weight:700;color:#3b82f6;white-space:nowrap">${e.weight} kg</span>
          <span style="font-size:0.6rem;color:#9ca3af">Βάρος</span>
        </div>`;
        const fatCol = (e.fat != null)
          ? `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;min-width:36px">
              <span style="font-size:0.85rem">🩸</span>
              <span style="font-size:0.8rem;font-weight:700;color:#ef4444">${e.fat}%</span>
              <span style="font-size:0.6rem;color:#9ca3af">Λίπος</span>
             </div>` : '';
        const muscleCol = (e.muscle != null)
          ? `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;min-width:48px">
              <span style="font-size:0.85rem">💪</span>
              <span style="font-size:0.8rem;font-weight:700;color:#16a34a">${e.muscle}%</span>
              <span style="font-size:0.6rem;color:#9ca3af">Μυϊκή μάζα</span>
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
        <span style="font-size:0.82rem;color:#16a34a;font-weight:600;cursor:pointer">Προβολή όλων των μετρήσεων ›</span>
       </div>` : '';

  const todayDisplay = fmtDateGr(today);

  return `
  <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:16px">

    <!-- Κάρτα 1: Header + Stats -->
    <div class="card card-lg fade-in" style="padding:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:42px;height:42px;background:linear-gradient(135deg,#e0e7ff,#f0fdf4);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">📊</div>
        <div>
          <div style="font-size:0.95rem;font-weight:800;color:#111;letter-spacing:0.02em">ΜΕΤΡΗΣΕΙΣ ΣΩΜΑΤΟΣ</div>
          <div style="font-size:0.72rem;color:#9ca3af;margin-top:2px">Παρακολούθησε την πρόοδό σου</div>
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
        <span style="font-size:0.95rem;font-weight:800;color:#16a34a;letter-spacing:0.03em">ΝΕΑ ΜΕΤΡΗΣΗ</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;align-items:start">
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">Ημερομηνία</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">📅</span>
            <input type="date" id="bm-date" value="${today}"
              onclick="this.showPicker()"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;height:100%;cursor:pointer">
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">Βάρος (kg)</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">⚖️</span>
            <input type="number" id="bm-weight" placeholder="π.χ. 95.5" step="0.1" min="30" max="300"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;width:100%;height:100%">
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">% Λίπους</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">🩸</span>
            <input type="number" id="bm-fat" placeholder="π.χ. 22.5" step="0.1" min="3" max="60"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;width:100%;height:100%">
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:5px">% Μυϊκής Μάζας</div>
          <div style="display:flex;align-items:center;gap:7px;border:1.5px solid #e5e7eb;border-radius:10px;padding:0 11px;background:#fff;height:42px;box-sizing:border-box">
            <span style="font-size:0.85rem;flex-shrink:0">💪</span>
            <input type="number" id="bm-muscle" placeholder="π.χ. 38.0" step="0.1" min="10" max="80"
              style="border:none;outline:none;font-size:0.78rem;background:transparent;color:#111;flex:1;min-width:0;width:100%;height:100%">
          </div>
        </div>
      </div>
      <button onclick="addBodyMeasurement()" style="width:100%;padding:9px 14px;font-size:0.78rem;font-weight:600;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;background:#e5e7eb;color:#374151;border:1px solid #d1d5db;cursor:pointer;letter-spacing:0.01em">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Αποθήκευση Μέτρησης
      </button>
    </div>

    <!-- Κάρτα 3: Ιστορικό -->
    <div class="card card-lg fade-in" style="padding:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#f1f5f9;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.95rem">📋</div>
          <span style="font-size:0.85rem;font-weight:800;color:#111;letter-spacing:0.02em">ΙΣΤΟΡΙΚΟ ΜΕΤΡΗΣΕΩΝ</span>
        </div>
        ${log.length > 0 ? `<span style="background:#f1f5f9;border-radius:20px;padding:4px 10px;font-size:0.7rem;color:#6b7280;font-weight:600">${log.length} μετρήσεις</span>` : ''}
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
  if (bmi < 18.5) return { label: 'Λιποβαρής', color: '#3b82f6' };
  if (bmi < 25)   return { label: 'Κανονικό', color: '#22c55e' };
  if (bmi < 30)   return { label: 'Υπέρβαρος', color: '#f59e0b' };
  return { label: 'Παχυσαρκία', color: '#ef4444' };
}

// Mifflin-St Jeor BMR
function calcBMR(p) {
  if (p.gender === 'male') {
    return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + 5);
  } else {
    return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age - 161);
  }
}

// Προσαρμογή βημάτων (ημερήσιος μέσος όρος)
function calcStepAdjustment(steps) {
  const s = steps || 0;
  if (s < 4000)  return 0;
  if (s < 6000)  return 80;
  if (s < 8000)  return 150;
  if (s < 10000) return 250;
  if (s < 12000) return 350;
  return 450;
}

// Προτεινόμενο TDEE βάσει επιστημονικού μοντέλου
function calcSuggestedTDEE(p) {
  const bmr = calcBMR(p);
  const actMultiplier = p.activity || 1.50;
  const stepAdj = calcStepAdjustment(p.dailySteps || 0);
  return Math.round(bmr * actMultiplier + stepAdj);
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
    1.20: 'Καθιστική ζωή (χωρίς άσκηση)',
    1.35: 'Ελαφριά (1–2 προπονήσεις/εβδ.)',
    1.50: 'Μέτρια (3 προπονήσεις/εβδ.)',
    1.65: 'Έντονη (4–5 προπονήσεις/εβδ.)',
    1.80: 'Πολύ έντονη (6–7 προπονήσεις/εβδ.)',
  };


  document.getElementById('page-profile').innerHTML = `
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
              placeholder="Το όνομά σου..."
              style="font-size:1.45rem;font-weight:800;border:none;background:transparent;width:100%;padding:0;outline:none;color:var(--text);display:block;margin-bottom:4px"
              oninput="liveUpdateName(this.value)">
            <div style="font-size:0.8rem;color:var(--text3);display:flex;align-items:center;gap:4px">Πάτα για επεξεργασία ✏️</div>
          </div>
        </div>
      </div>

      <!-- STAT CHIPS: BMI / BMR / TDEE -->
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
          <div style="font-size:0.68rem;font-weight:700;color:#3b82f6;margin-top:2px">Mifflin-St Jeor</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:2px">BMR kcal</div>
        </div>
        <div class="card fade-in" style="margin:0;padding:16px 12px;text-align:center;${p.useCustomTDEE?'border-color:#22c55e;background:#f0fdf4':''}">
          <div style="width:44px;height:44px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 8px">🌿</div>
          <div class="tdee-val" style="font-size:1.55rem;font-weight:900;color:var(--green-d);line-height:1">${tdee}</div>
          <div style="font-size:0.68rem;font-weight:700;color:var(--green-d);margin-top:2px">${p.useCustomTDEE?'Χειροκίνητο':'Υπολογισμένο'}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:2px">TDEE kcal</div>
        </div>
      </div>

      <!-- ΣΩΜΑΤΙΚΑ ΣΤΟΙΧΕΙΑ -->
      <div class="card card-lg fade-in">
        <div class="section-title">🏃 Σωματικά Στοιχεία</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Βάρος (kg)</label>
            <input type="number" id="prof-weight" value="${p.weight}" step="0.1" min="30" max="300"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              oninput="liveUpdateProfile()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Ύψος (cm)</label>
            <input type="number" id="prof-height" value="${p.height}" step="1" min="100" max="250"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              oninput="liveUpdateProfile()">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Ηλικία</label>
            <input type="number" id="prof-age" value="${p.age}" step="1" min="15" max="100"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              oninput="liveUpdateProfile()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Φύλο</label>
            <select id="prof-gender" style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;background:var(--bg2)" onchange="liveUpdateProfile()">
              <option value="male"   ${p.gender==='male'?'selected':''}>👤 Άνδρας</option>
              <option value="female" ${p.gender==='female'?'selected':''}>👤 Γυναίκα</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Επίπεδο Δραστηριότητας (προπονήσεις)</label>
            <select id="prof-activity" style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.82rem;background:var(--bg2)" onchange="liveUpdateProfile()">
              ${Object.entries(activityLabels).map(([val, lbl]) =>
                `<option value="${val}" ${parseFloat(p.activity)===parseFloat(val)?'selected':''}>${lbl}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:0.75rem">👣 Μέσα Βήματα / Ημέρα</label>
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

      <!-- ΘΕΡΜΙΔΕΣ ΣΥΝΤΗΡΗΣΗΣ (TDEE) -->
      <div class="card card-lg fade-in">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">🌿</div>
          <div style="font-size:1rem;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:0.03em">Θερμίδες Συντήρησης (TDEE)</div>
        </div>

        <!-- Αυτόματος Υπολογισμός block -->
        <div style="background:var(--bg2);border-radius:var(--radius);padding:16px;margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <div style="width:36px;height:36px;border-radius:8px;background:#1a56db;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">🔢</div>
            <div style="font-size:0.95rem;font-weight:700;color:var(--text)">Αυτόματος Υπολογισμός</div>
          </div>

          <!-- BMR row -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f0fe;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">🔥</div>
            <div style="flex:1;font-size:0.85rem;color:var(--text2)">BMR (Mifflin-St Jeor)</div>
            <strong id="td-bmr" style="font-size:0.95rem;color:var(--text);white-space:nowrap">${bmr} kcal</strong>
          </div>

          <!-- Activity row -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f0fe;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">🏃</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:0.85rem;color:var(--text2)" id="td-act-lbl">× Συντελεστής δραστηριότητας</div>
              <div style="font-size:0.75rem;color:var(--blue)">(${parseFloat(p.activity||1.50).toFixed(2)})</div>
            </div>
            <strong id="td-act" style="font-size:0.95rem;color:var(--text);white-space:nowrap">${Math.round(bmr * (p.activity||1.50))} kcal</strong>
          </div>

          <!-- Steps row -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1.5px dashed var(--border)">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f0fe;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">📊</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:0.85rem;color:var(--text2)" id="td-steps-lbl">+ Διόρθωση βημάτων</div>
              <div style="font-size:0.75rem;color:var(--blue)">(${(p.dailySteps||0).toLocaleString()} βήμ/ημ)</div>
            </div>
            <strong id="td-steps" style="font-size:0.95rem;color:var(--blue);white-space:nowrap">+${calcStepAdjustment(p.dailySteps||0)} kcal</strong>
          </div>

          <!-- TDEE result row -->
          <div style="display:flex;align-items:center;gap:12px;padding:14px 0 2px;background:var(--bg2)">
            <div style="width:32px;height:32px;border-radius:50%;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900;color:var(--green-d);flex-shrink:0">=</div>
            <div style="flex:1;font-size:0.95rem;font-weight:700;color:var(--green-d)">Προτεινόμενο TDEE</div>
            <strong id="td-result" style="font-size:1.15rem;font-weight:900;color:var(--green-d);white-space:nowrap">${suggestedTDEE} kcal</strong>
          </div>
        </div>

        <!-- Toggle χειροκίνητης τιμής -->
        <div style="background:var(--bg2);border-radius:var(--radius);padding:14px 16px">
          <div style="display:flex;align-items:center;justify-content:space-between;${p.useCustomTDEE?'margin-bottom:12px':''}">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:32px;height:32px;border-radius:50%;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">🎯</div>
              <div>
                <div style="font-size:0.9rem;font-weight:700;color:var(--text)">Χειροκίνητη Τιμή TDEE</div>
                <div style="font-size:0.72rem;color:var(--text3)">Παράκαμψη αυτόματου υπολογισμού</div>
              </div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="prof-use-custom-tdee" ${p.useCustomTDEE?'checked':''} onchange="toggleCustomTDEE(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          ${p.useCustomTDEE ? `
          <div style="border-top:1px solid var(--border);padding-top:12px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <input type="number" id="prof-custom-tdee" value="${p.customTDEE||suggestedTDEE}" min="1000" max="7000" step="50"
                style="flex:1;padding:10px 12px;border:2px solid var(--green);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:#f0fdf4"
                oninput="updateCustomTDEE(this.value)">
              <span style="font-size:0.82rem;color:var(--text2);white-space:nowrap">kcal/ημέρα</span>
            </div>
            <button class="btn btn-ghost btn-sm" style="font-size:0.72rem" onclick="resetToSuggestedTDEE()">↺ Επιστροφή σε αυτόματο (${suggestedTDEE} kcal)</button>
          </div>` : `
          <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;font-size:0.82rem;color:var(--text3)">
            Ενεργό TDEE: <strong style="color:var(--green-d)">${p.useCustomTDEE ? (p.customTDEE||suggestedTDEE) : suggestedTDEE} kcal/ημέρα</strong>
          </div>`}
        </div>
      </div>

      <!-- ΗΜΕΡΗΣΙΟΙ ΣΤΟΧΟΙ -->
      <div class="card card-lg fade-in">
        <div class="section-title">🎯 Ημερήσιοι Στόχοι</div>

        <div style="margin-bottom:16px">
          <div class="slider-label" style="margin-bottom:6px">
            <span style="display:flex;align-items:center;gap:6px">🔥 <span>Θερμίδες</span></span>
            <strong id="prof-kcal-val" style="color:var(--amber)">${g.kcal} kcal</strong>
          </div>
          <input type="range" id="prof-kcal" min="1000" max="3500" step="50" value="${g.kcal}"
            class="prof-range-amber"
            oninput="updateGoalFromProfile('kcal',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text3);margin-top:3px">
            <span>1200</span><span id="td-slider-tdee" style="color:var(--amber);font-weight:700">TDEE: ${tdee}</span><span>3500</span>
          </div>
        </div>

        <div style="margin-bottom:16px">
          <div class="slider-label" style="margin-bottom:6px">
            <span style="display:flex;align-items:center;gap:6px">🥩 <span>Πρωτεΐνη</span></span>
            <strong id="prof-prot-val" style="color:var(--blue)">${g.protein}g</strong>
          </div>
          <input type="range" id="prof-prot" min="60" max="300" step="5" value="${g.protein}"
            class="prof-range-blue"
            oninput="updateGoalFromProfile('protein',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text3);margin-top:3px">
            <span>60g</span><span id="td-prot-hint" style="color:var(--blue);font-weight:700">Συν. 1.9g/kg: ${idealProt}g</span><span>300g</span>
          </div>
        </div>

        <div style="margin-bottom:16px">
          <div class="slider-label" style="margin-bottom:6px">
            <span style="display:flex;align-items:center;gap:6px">🍚 <span>Υδατάνθρακες</span></span>
            <strong id="prof-carb-val" style="color:var(--green-d)">${g.carbs}g</strong>
          </div>
          <input type="range" id="prof-carb" min="30" max="500" step="5" value="${g.carbs}"
            class="prof-range-green"
            oninput="updateGoalFromProfile('carbs',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text3);margin-top:3px">
            <span>30g</span><span></span><span>500g</span>
          </div>
        </div>

        <div style="margin-bottom:16px">
          <div class="slider-label" style="margin-bottom:6px">
            <span style="display:flex;align-items:center;gap:6px">🫒 <span>Λίπος</span></span>
            <strong id="prof-fat-val" style="color:var(--purple)">${g.fat}g</strong>
          </div>
          <input type="range" id="prof-fat" min="20" max="200" step="5" value="${g.fat}"
            class="prof-range-purple"
            oninput="updateGoalFromProfile('fat',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text3);margin-top:3px">
            <span>20g</span><span></span><span>200g</span>
          </div>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-green" style="flex:1" onclick="applyTDEEGoal()">⚡ Auto από TDEE</button>
          <button class="btn btn-ghost" style="flex:1" onclick="saveProfile()">💾 Αποθήκευση</button>
        </div>
      </div>

      <!-- ΩΡΕΣ ΓΕΥΜΑΤΩΝ -->
      <div class="card card-lg fade-in">
        <div class="section-title">🕐 Ώρες Γευμάτων</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">
          Επίλεξε ώρα <strong>πρώτου γεύματος</strong>. Τα υπόλοιπα τοποθετούνται αυτόματα κάθε 3 ώρες.
        </p>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <label style="font-size:0.75rem;font-weight:700;color:var(--text);white-space:nowrap">1ο Γεύμα (Πρωινό)</label>
          <input type="time" id="prof-first-meal-time"
            value="${p.firstMealTime || '08:00'}"
            style="flex:1;padding:6px 9px;border:2px solid var(--green);border-radius:var(--radius-sm);font-size:0.82rem;font-weight:700;background:var(--bg2)"
            oninput="updateFirstMealTime(this.value)">
        </div>
        <div id="meal-times-preview" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.8rem">
          ${(()=>{
            const t = { breakfast: p.firstMealTime||'08:00' };
            const [h,m] = (p.firstMealTime||'08:00').split(':').map(Number);
            const add = n => { const tot=h*60+m+n*60; return String(Math.floor(tot/60)%24).padStart(2,'0')+':'+String(tot%60).padStart(2,'0'); };
            return [
              ['🌅 Πρωινό', t.breakfast],
              ['🍎 Δεκατιανό', add(3)],
              ['☀️ Μεσημεριανό', add(6)],
              ['🧃 Απογευματινό', add(9)],
              ['🌙 Βραδινό', add(12)],
            ].map(([lbl,time])=>`<div style="background:var(--bg2);border-radius:var(--radius-sm);padding:6px 10px;display:flex;justify-content:space-between"><span style="color:var(--text2)">${lbl}</span><strong style="color:var(--text)">${time}</strong></div>`).join('');
          })()}
        </div>
      </div>

      <!-- ΕΝΑΡΞΗ ΠΛΑΝΟΥ -->
      <div class="card card-lg fade-in">
        <div class="section-title">📅 Έναρξη Πλάνου</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">
          Επίλεξε ποια ημερομηνία αντιστοιχεί στην <strong>Ημέρα 1</strong> του πλάνου. Κάθε κουμπί ημέρας θα δείχνει αυτόματα την αντίστοιχη ημερομηνία.
        </p>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="date" id="plan-start-date"
            value="${state.planStartDate || ''}"
            style="flex:1;padding:10px 12px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.92rem;background:var(--bg2)"
            onchange="setPlanStartDate(this.value)">
          <button class="btn btn-green btn-sm" onclick="setPlanStartDate(new Date().toISOString().split('T')[0])">Σήμερα</button>
        </div>
        ${state.planStartDate ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--text3)">
          Ημ1: ${formatPlanDay(0)} &nbsp;·&nbsp; Ημ4: ${formatPlanDay(3)} &nbsp;·&nbsp; Ημ7: ${formatPlanDay(6)}
        </div>` : ''}
      </div>

      <!-- ΕΚΤΥΠΩΣΗ & ΣΥΝΟΨΗ -->
      <div class="card card-lg fade-in">
        <div class="section-title">🖨️ Εκτύπωση &amp; Σύνοψη</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:14px">Συνοπτική εβδομαδιαία προβολή: ημέρες, γεύματα, θερμίδες, macros.</p>
        <button class="btn btn-blue btn-full" onclick="exportPDF()" style="margin-bottom:10px">
          🖨️ Εκτύπωση / Αποθήκευση PDF
        </button>
        <button class="btn btn-ghost btn-full" onclick="shareProfile()">
          🔗 Κοινοποίηση πλάνου
        </button>
        <div style="margin-top:12px;font-size:0.75rem;color:var(--text3);line-height:1.7">
          Η αναφορά περιλαμβάνει:<br>
          ✅ Εβδομαδιαίο πλάνο &nbsp; ✅ Σύνοψη θερμίδων &amp; μακροθρεπτικών &nbsp; ✅ Λίστα γευμάτων &amp; συνταγών
        </div>
      </div>

    </div>`;
  // If settings tab is currently visible, sync its profile section
  if (state.activeTab === 'settings') {
    const dst = document.getElementById('settings-profile-content');
    const src = document.getElementById('page-profile');
    if (dst && src) dst.innerHTML = src.innerHTML;
  }
}

function updateSidebarAvatar() {
  const p = state.profile;
  const avatarEl = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-user-name');
  if (!avatarEl) return;
  if (p.photoUrl) {
    avatarEl.innerHTML = `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="photo">`;
    avatarEl.style.padding = '0';
  } else {
    avatarEl.innerHTML = (p.name || 'Δ').charAt(0).toUpperCase();
    avatarEl.style.padding = '';
  }
  if (nameEl && p.name) nameEl.textContent = p.name;
  // Keep drawer in sync
  const dAvatar = document.getElementById('drawer-avatar');
  const dName   = document.getElementById('drawer-user-name');
  if (dAvatar) {
    if (p.photoUrl) {
      dAvatar.innerHTML = `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">`;
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
}

function liveUpdateProfile() {
  const p = state.profile;
  const wEl  = document.getElementById('prof-weight');
  const hEl  = document.getElementById('prof-height');
  const aEl  = document.getElementById('prof-age');
  const gEl  = document.getElementById('prof-gender');
  const acEl = document.getElementById('prof-activity');
  const stEl = document.getElementById('prof-steps');
  if (wEl)  p.weight     = parseFloat(wEl.value)  || p.weight;
  if (hEl)  p.height     = parseFloat(hEl.value)  || p.height;
  if (aEl)  p.age        = parseInt(aEl.value)     || p.age;
  if (gEl)  p.gender     = gEl.value;
  if (acEl) p.activity   = parseFloat(acEl.value);
  if (stEl) p.dailySteps = parseInt(stEl.value)    || 0;

  if (!p.useCustomTDEE) p.customTDEE = 0;

  saveState();

  // Δυναμική ενημέρωση BMR / TDEE / BMI χωρίς full re-render
  const bmr          = calcBMR(p);
  const suggestedTDEE = calcSuggestedTDEE(p);
  const tdee         = calcTDEE(p);
  const bmi          = calcBMI(p.weight, p.height);
  const { label: bmiLbl, color: bmiCol } = bmiLabel(parseFloat(bmi));
  const stepAdj      = calcStepAdjustment(p.dailySteps || 0);
  const actMult      = parseFloat(p.activity || 1.50).toFixed(2);

  // Stat chips
  const bmrEl  = document.querySelector('.bmr-val');
  const tdeeEl = document.querySelector('.tdee-val');
  const bmiEl  = document.querySelector('.bmi-val');
  const bmiLblEl = document.querySelector('.bmi-lbl');
  if (bmrEl)   { bmrEl.textContent  = bmr; }
  if (tdeeEl)  { tdeeEl.textContent = tdee; }
  if (bmiEl)   { bmiEl.textContent  = bmi;    bmiEl.style.color   = bmiCol; }
  if (bmiLblEl){ bmiLblEl.textContent = bmiLbl; bmiLblEl.style.color = bmiCol; }

  // TDEE breakdown lines
  const tdBmr    = document.getElementById('td-bmr');
  const tdAct    = document.getElementById('td-act');
  const tdSteps  = document.getElementById('td-steps');
  const tdResult = document.getElementById('td-result');
  const tdActLbl = document.getElementById('td-act-lbl');
  const tdStepsLbl = document.getElementById('td-steps-lbl');
  if (tdBmr)    tdBmr.textContent    = bmr + ' kcal';
  if (tdActLbl) tdActLbl.textContent = `× Συντελεστής δραστηριότητας (${actMult})`;
  if (tdAct)    tdAct.textContent    = Math.round(bmr * parseFloat(p.activity || 1.50)) + ' kcal';
  if (tdStepsLbl) tdStepsLbl.textContent = `+ Διόρθωση βημάτων (${(p.dailySteps||0).toLocaleString()} βήμ/ημ)`;
  if (tdSteps)  tdSteps.textContent  = '+' + stepAdj + ' kcal';
  if (tdResult) tdResult.textContent = suggestedTDEE + ' kcal';

  // Protein ideal hint
  const protHintEl = document.getElementById('td-prot-hint');
  if (protHintEl) protHintEl.textContent = `Συν. 1.9g/kg: ${calcIdealProtein(p.weight)}g`;

  // TDEE label on kcal slider
  const tdeeSliderLbl = document.getElementById('td-slider-tdee');
  if (tdeeSliderLbl) tdeeSliderLbl.textContent = `TDEE: ${tdee}`;

  // Update steps value label
  const stepsValEl = document.getElementById('prof-steps-val');
  if (stepsValEl) stepsValEl.textContent = p.dailySteps || 0;
}

function updateGoalFromProfile(key, val) {
  const v = parseInt(val);
  state.goals[key] = v;
  const labels = { kcal: 'prof-kcal-val', protein: 'prof-prot-val', carbs: 'prof-carb-val', fat: 'prof-fat-val' };
  const suffixes = { kcal: ' kcal', protein: 'g', carbs: 'g', fat: 'g' };
  const el = document.getElementById(labels[key]);
  if (el) el.textContent = v + suffixes[key];
  saveState();
}

function updateFirstMealTime(val) {
  if (!val) return;
  state.profile.firstMealTime = val;
  // Ενημέρωση ωρών σε όλες τις ημέρες βάσει τύπου γεύματος
  const times = getMealTimes();
  state.week.forEach(day => {
    day.meals.forEach(meal => {
      if (times[meal.type]) meal.time = times[meal.type];
    });
  });
  saveState();
  // Ανανέωση preview χωρίς πλήρες re-render
  const preview = document.getElementById('meal-times-preview');
  if (preview) {
    const [h, m] = val.split(':').map(Number);
    const add = n => { const tot = h*60+m+n*60; return String(Math.floor(tot/60)%24).padStart(2,'0')+':'+String(tot%60).padStart(2,'0'); };
    const slots = [['🌅 Πρωινό',val],['🍎 Δεκατιανό',add(3)],['☀️ Μεσημεριανό',add(5)],['🧃 Απογευματινό',add(8)],['🌙 Βραδινό',add(11)]];
    preview.innerHTML = slots.map(([lbl,time])=>`<div style="background:var(--bg2);border-radius:var(--radius-sm);padding:6px 10px;display:flex;justify-content:space-between"><span style="color:var(--text2)">${lbl}</span><strong style="color:var(--text)">${time}</strong></div>`).join('');
  }
  // Re-render ημερήσιου/εβδομαδιαίου ώστε οι ώρες να φαίνονται αμέσως
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
}

function updateCustomTDEE(val) {
  const v = parseInt(val);
  if (v >= 1000) {
    state.profile.customTDEE = v;
    saveState();
    const tdeeEl = document.querySelector('#profile-stats-card .tdee-val');
    if (tdeeEl) tdeeEl.textContent = v;
  }
}

function resetToSuggestedTDEE() {
  state.profile.useCustomTDEE = false;
  state.profile.customTDEE = 0;
  saveState();
  renderProfile();
  showToast('↺ Επιστροφή σε αυτόματο TDEE');
}

function applyTDEEGoal() {
  const tdee = calcTDEE(state.profile);
  const deficit = 400;
  const target = tdee - deficit;
  const prot = calcIdealProtein(state.profile.weight);
  state.goals.kcal    = Math.round(target / 50) * 50;
  state.goals.protein = prot;
  state.goals.carbs   = Math.round((target * 0.35) / 4 / 5) * 5;
  state.goals.fat     = Math.round((target * 0.25) / 9 / 5) * 5;
  saveState();
  renderProfile();
  showToast(`✅ Στόχοι: ${state.goals.kcal} kcal · ${prot}g πρωτ.`);
}

function saveProfile() {
  saveState();
  showToast('✅ Προφίλ αποθηκεύτηκε!');
}

function shareProfile() {
  const p = state.profile;
  const g = state.goals;
  const tdee = calcTDEE(p);
  const text = `Vivon Πλάνο — ${p.name || 'Χρήστης'}\n🎯 ${g.kcal} kcal | 🥩 ${g.protein}g πρωτ. | 🍚 ${g.carbs}g υδατ. | 🫒 ${g.fat}g λίπος\nTDEE: ${tdee} kcal`;
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
  showToast('📅 Έναρξη πλάνου αποθηκεύτηκε');
}

function saveDayStepsCount(val) {
  const v = parseInt(val);
  state.week[state.currentDay].stepsCount = isNaN(v) ? 8000 : Math.max(0, v);
  saveState();
  renderToday();
}

function saveDayStepsDone(checked) {
  state.week[state.currentDay].stepsDone = !!checked;
  saveState();
  renderToday();
}

function saveDayTraining(checked) {
  state.week[state.currentDay].weightTraining = !!checked;
  saveState();
  renderToday();
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
  const val = parseInt(document.getElementById('extra-kcal-input').value) || 0;
  state.week[state.currentDay].extraKcal = val;
  saveState();
  renderToday();
  if (val > 0) showToast(`🍕 +${val} kcal καταχωρήθηκαν`);
  else showToast('✓ Extra kcal καθαρίστηκαν');
}

function clearPrevExtra(dayIdx) {
  if (dayIdx >= 0) state.week[dayIdx].extraKcal = 0;
  saveState();
  renderToday();
}

function formatPlanDay(dayOffset) {
  if (!state.planStartDate) return `Ημ${dayOffset+1}`;
  const d = new Date(state.planStartDate);
  d.setDate(d.getDate() + dayOffset);
  const days = ['Κυρ','Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ'];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
}

function getPlanDayLabel(dayIdx) {
  // Returns "Ημ1 · Δευ 30/6" or just "Ημ1" if no date set
  const base = `Ημ${dayIdx+1}`;
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
  const map = { breakfast: ['Πρωινό','pill-breakfast'], lunch: ['Μεσημεριανό','pill-lunch'], dinner: ['Βραδινό','pill-dinner'], snack: ['Δεκατιανό','pill-snack'], afternoon: ['Απογευματινό','pill-afternoon'] };
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
      // Εκτιμώμενες θερμίδες — macros N/A για στάνταρ
      m = { kcal: Math.round(sm.kcal_est * sf), p: 0, c: 0, f: 0 };
    } else {
      m = calcRecipeMacros(recipe, sf);
    }
    if (meal.done) runningKcal += m.kcal;

    const emoji = isStandard ? sm.emoji : recipe.emoji;
    const name  = isStandard ? sm.name  : recipe.name;

    let bodyHtml = '';
    if (isStandard) {
      // Εμφάνιση items λίστας
      bodyHtml = `<div class="meal-ingredients">
        ${sm.items.map(it => `<div class="ingredient-row"><span class="ingredient-name">${it}</span></div>`).join('')}
        ${sm.note ? `<div style="margin-top:6px;font-size:0.75rem;color:var(--text3);font-style:italic">💡 ${sm.note}</div>` : ''}
      </div>
      <div class="meal-macros" style="opacity:0.5">
        <div class="macro-chip"><div class="macro-chip-val" style="color:#22c55e">~${m.kcal}</div><div class="macro-chip-lbl">kcal</div></div>
        <div class="macro-chip" style="font-size:0.7rem;color:var(--text3)"><div class="macro-chip-val">—</div><div class="macro-chip-lbl">πρωτ.</div></div>
        <div class="macro-chip" style="font-size:0.7rem;color:var(--text3)"><div class="macro-chip-val">—</div><div class="macro-chip-lbl">υδατ.</div></div>
        <div class="macro-chip" style="font-size:0.7rem;color:var(--text3)"><div class="macro-chip-val">—</div><div class="macro-chip-lbl">λίπος</div></div>
      </div>
      <div style="font-size:0.7rem;color:var(--amber);background:var(--amber-bg);border-radius:6px;padding:4px 8px;margin:6px 0;display:inline-block">⭐ Στάνταρ γεύμα · εκτ. θερμίδες</div>`;
    } else {
      const allFoods = [...FOODS_DB, ...state.customFoods];
      const ingHtml = recipe.ingredients.map(ing => {
        const food = allFoods.find(f => f.id === ing.foodId);
        if (!food) return '';
        let qty = ing.qty * sf;
        // Στρογγυλοποίηση: g→δεκάδα, τεμ/ψεκ→1
        if (food.unit === 'g') qty = Math.round(qty / 10) * 10;
        else qty = Math.round(qty);
        // Whey πάντα 30g
        if (ing.foodId === 'f9' && food.unit === 'g') qty = 30;
        return `<div class="ingredient-row"><span class="ingredient-name">${food.name}</span><span class="ingredient-qty">${qty}${food.unit}</span></div>`;
      }).join('');
      bodyHtml = `
        <div class="meal-macros">
          <div class="macro-chip"><div class="macro-chip-val" style="color:#22c55e">${m.kcal}</div><div class="macro-chip-lbl">kcal</div></div>
          <div class="macro-chip"><div class="macro-chip-val" style="color:#3b82f6">${m.p}g</div><div class="macro-chip-lbl">πρωτ.</div></div>
          <div class="macro-chip"><div class="macro-chip-val" style="color:#8b5cf6">${m.c}g</div><div class="macro-chip-lbl">υδατ.</div></div>
          <div class="macro-chip"><div class="macro-chip-val" style="color:#f59e0b">${m.f}g</div><div class="macro-chip-lbl">λίπος</div></div>
        </div>
        <div class="meal-ingredients">${ingHtml}</div>
        ${(recipe.instructions || recipe.serving) ? `
        <button class="recipe-expand-btn" onclick="toggleRecipeExpand(this)" aria-expanded="false">
          📋 Συνταγή &amp; Σερβίρισμα <span class="recipe-expand-arrow">▼</span>
        </button>
        <div class="recipe-expand-body">
          <div>
            ${recipe.instructions ? `<div class="recipe-instructions">${recipe.instructions.replace(/\n/g,'<br>')}</div>` : ''}
            ${recipe.serving ? `<div class="recipe-serving"><span class="recipe-serving-icon">🍽️</span> ${recipe.serving}</div>` : ''}
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
        ${meal.waterNote ? `<div class="water-note">💧 ${meal.waterNote}</div>` : ''}
        <div class="running-kcal">Σύνολο ως τώρα: <strong>${runningKcal} kcal</strong></div>
        <div class="meal-actions">
          <button class="btn btn-ghost btn-sm" onclick="openSwapMeal(${mi})">🔄 Αλλαγή</button>
          <button class="btn btn-ghost btn-sm" onclick="openScaleModal(${mi})">⚖️ Ποσότητα</button>
        </div>
      </div>`;
  });

  document.getElementById('page-today').innerHTML = `
    <div class="container">
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
          <h2>ΑΠΟΜΕΝΟΥΝ</h2>
          <div class="big-num">${remaining.kcal} <span style="font-size:1rem;font-weight:600;opacity:0.75">kcal μέρας</span></div>
          <div class="sub">kcal · Καταναλώθηκαν: ${doneMacros.kcal} / ${goals.kcal}</div>
        </div>
        <div class="kcal-ring">
          ${ring(kcalPct)}
          <div class="kcal-ring-label">${kcalPct}%</div>
        </div>
      </div>

      <!-- Kcal ημέρας override -->
      <div class="card card-sm fade-in" style="padding:8px 12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.7rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">🎯 Kcal ημέρας</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span id="day-kcal-display" style="font-size:0.88rem;font-weight:700;color:var(--text1)">${effectiveKcal}</span>
            ${day.kcalGoal
              ? `<button class="btn btn-ghost btn-sm" onclick="saveDayKcalGoal(0)" style="font-size:0.68rem;padding:2px 6px" title="Επαναφορά default">↺</button>`
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
      ${(() => {
        const hasTraining = !!day.weightTraining;
        const { stepsKcal, trainingKcal, stepsCount, stepsDone } = calcDayActivityKcal(state.currentDay);
        const { totalBurn, consumed, deficit } = calcDayDeficit(state.currentDay);
        const deficitPos = deficit >= 0;
        const deficitColor = deficitPos ? '#22c55e' : '#ef4444';
        const weeklyStepsKcal = stepsKcal * 7;
        const weeklyTrainingKcal = trainingKcal * 7;
        const stepsSliderPct = Math.min(100, Math.round((stepsCount - 1000) / (20000 - 1000) * 100));
        const motivMsg = deficitPos
          ? { icon: '🎯', title: 'Στη σωστή πορεία!', text: 'Το ημερήσιο έλλειμμα σε βοηθά να πετύχεις τους στόχους σου.' }
          : { icon: '⚠️', title: 'Πλεόνασμα σήμερα', text: 'Κατανάλωσες περισσότερες θερμίδες από όσες έκαψες.' };
        return `
        <div class="act-section fade-in">
          <div class="card card-sm" style="padding:14px 16px;margin-bottom:10px">
            <div class="act-header" style="margin-bottom:14px">
              <span class="act-header-icon">🏃</span>
              <span class="act-header-title">ΔΡΑΣΤΗΡΙΟΤΗΤΑ & ΕΛΛΕΙΜΜΑ</span>
            </div>

            <!-- Προπόνηση -->
            <div class="act-inner-row">
              <div class="act-row-top">
                <div style="display:flex;align-items:center;gap:10px">
                  <span class="act-icon-badge" style="background:#ede9fe">🏋️</span>
                  <span class="act-label">Προπόνηση</span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" ${hasTraining ? 'checked' : ''} onchange="saveDayTraining(this.checked)">
                  <span class="toggle-slider"></span>
                </label>
              </div>
              ${hasTraining ? `
              <div class="act-big-num">${weeklyTrainingKcal.toLocaleString()} <span class="act-big-unit">kcal/εβδ.</span></div>
              <div style="font-size:0.72rem;color:var(--text3);margin-bottom:4px">~${trainingKcal} kcal σήμερα · 1h βαρά</div>` : ''}
            </div>

            <div class="act-divider"></div>

            <!-- Βήματα / NEAT -->
            <div class="act-inner-row">
              <div class="act-row-top">
                <div style="display:flex;align-items:center;gap:10px">
                  <span class="act-icon-badge" style="background:#fef3c7">🔥</span>
                  <span class="act-label">Πρόσθετη βασική <span style="color:var(--text3);font-weight:500">(NEAT)</span></span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" ${stepsDone ? 'checked' : ''} onchange="saveDayStepsDone(this.checked)">
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="act-big-num">${(stepsCount).toLocaleString()} <span class="act-big-unit">βήματα</span></div>
              ${stepsDone ? `<div style="font-size:0.72rem;color:var(--text3);margin-bottom:6px">~${stepsKcal} kcal σήμερα · ~${weeklyStepsKcal} kcal/εβδ.</div>` : '<div style="height:6px"></div>'}
              <input type="range" min="1000" max="20000" step="500" value="${stepsCount}"
                class="act-slider"
                oninput="saveDayStepsCount(this.value)">
              <div class="act-slider-ticks">
                <span>0k</span><span>2k</span><span>5k</span><span style="color:${stepsCount>=7000?'var(--green-d)':'var(--text3)'}">7k</span><span>10k</span><span>15k</span><span>20k+</span>
              </div>
            </div>

            <div class="act-divider"></div>

            <!-- Summary -->
            <div class="act-inner-row">
              <div style="font-size:0.78rem;color:var(--text2);margin-bottom:10px">
                🔥 Σύνολο <strong>${totalBurn} kcal</strong> &nbsp;·&nbsp; BMR Κατανάλωση <strong>${consumed} kcal</strong>
              </div>
              <div style="font-size:1.6rem;font-weight:900;color:${deficitColor}">${deficitPos ? '−' : '+'}${Math.abs(deficit)} kcal</div>
              <div style="font-size:0.82rem;font-weight:600;color:${deficitColor};margin-top:2px">${deficitPos ? 'Έλλειμμα' : 'Πλεόνασμα'}</div>
            </div>

            <div class="act-divider"></div>

            <!-- Motivational -->
            <div class="act-motiv" style="margin-bottom:0">
              <span class="act-motiv-icon">${motivMsg.icon}</span>
              <div>
                <div style="font-weight:700;font-size:0.88rem">${motivMsg.title}</div>
                <div style="font-size:0.78rem;color:var(--text2);margin-top:2px">${motivMsg.text}</div>
              </div>
            </div>
          </div>
        </div>`;
      })()}


      <!-- Meals header + reset -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div class="section-title" style="margin:0">${day.label} — Γεύματα</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="exportDayPDF(${state.currentDay})">🖨️</button>
          <button class="btn btn-ghost btn-sm" onclick="resetDayDone()" title="Μηδένισε τα checkboxes">↺ Reset</button>
          <button class="btn btn-ghost btn-sm" onclick="resetDayMeals()" title="Επαναφορά γευμάτων στα default">🗑 Default</button>
        </div>
      </div>
      ${mealsHtml}

      <!-- Add Meal Button -->
      <button class="btn btn-ghost btn-full" style="margin-bottom:10px" onclick="openAddMealModal()">➕ Προσθήκη Γεύματος</button>

      <!-- Macros Dashboard -->
      <div class="dashboard-grid fade-in" style="margin-bottom:10px">
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">Πρωτεΐνη</div>
          <div class="macro-card-value" style="color:#3b82f6;font-size:1.1rem;margin:2px 0">${doneMacros.p}g</div>
          <div class="macro-card-sub" style="font-size:0.62rem">${goals.protein}g · −${remaining.p}g</div>
          ${macroBar(doneMacros.p, goals.protein, '#3b82f6')}
        </div>
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">Υδατάνθρακες</div>
          <div class="macro-card-value" style="color:#8b5cf6;font-size:1.1rem;margin:2px 0">${doneMacros.c}g</div>
          <div class="macro-card-sub" style="font-size:0.62rem">${goals.carbs}g · −${remaining.c}g</div>
          ${macroBar(doneMacros.c, goals.carbs, '#8b5cf6')}
        </div>
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">Λίπος</div>
          <div class="macro-card-value" style="color:#f59e0b;font-size:1.1rem;margin:2px 0">${doneMacros.f}g</div>
          <div class="macro-card-sub" style="font-size:0.62rem">${goals.fat}g · −${remaining.f}g</div>
          ${macroBar(doneMacros.f, goals.fat, '#f59e0b')}
        </div>
        <div class="macro-card" style="padding:8px 10px">
          <div class="macro-card-label" style="font-size:0.62rem">Κατανάλωση</div>
          <div class="macro-card-value" style="color:#22c55e;font-size:1.1rem;margin:2px 0">${doneMacros.kcal}</div>
          <div class="macro-card-sub" style="font-size:0.62rem">kcal · ${day.meals.filter(m=>m.done).length}/${day.meals.length} γεύματα</div>
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
              ⚠️ <strong>Χθες έφαγες +${prevExtra} kcal</strong> παραπάνω. Προσαρμόσου σήμερα!
              <button onclick="clearPrevExtra(${prevDayIdx})" style="border:none;background:none;cursor:pointer;color:var(--text3);float:right;font-size:0.75rem">✕</button>
            </div>`
          : '';
        return `<div class="card card-sm fade-in" style="margin-bottom:14px">
          <div class="section-title">🍕 Επιπλέον Θερμίδες (εκτός πλάνου)</div>
          ${reminderHtml}
          <p style="font-size:0.8rem;color:var(--text2);margin-bottom:10px">Φάγατε κάτι παραπάνω; Καταγράψτε το εδώ. Η ημέρα θα κοκκινίσει στην Εβδομάδα.</p>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="extra-kcal-input" value="${extraKcal||''}" min="0" max="5000" step="50"
              placeholder="π.χ. 400"
              style="flex:1;padding:10px 12px;border:2px solid ${extraKcal>0?'#ef4444':'var(--border)'};border-radius:var(--radius-sm);font-size:1rem;font-weight:700;background:var(--bg2)">
            <span style="font-size:0.85rem;color:var(--text3);white-space:nowrap">kcal</span>
            <button class="btn btn-sm" style="background:${extraKcal>0?'#ef4444':'var(--green)'};color:#fff"
              onclick="saveExtraKcal()">💾</button>
          </div>
          ${extraKcal > 0 ? `<div style="margin-top:8px;font-size:0.78rem;color:#ef4444;font-weight:700">Σύνολο ημέρας: ${dayMacros.kcal + extraKcal} kcal (+${extraKcal} εκτός πλάνου)</div>` : ''}
        </div>`;
      })()}

      <!-- Supplements -->
      ${(() => {
        const supp = state.supplements || {};
        if (!supp.enabled) return '';
        const activeIds = supp.activeIds || [];
        if (activeIds.length === 0) return `<div class="card fade-in" style="padding:14px 16px">
          <div class="section-title" style="margin-bottom:6px">💊 Συμπληρώματα</div>
          <div style="font-size:0.8rem;color:var(--text3)">Δεν έχεις επιλέξει συμπληρώματα. Πήγαινε στις <strong>Ρυθμίσεις → Συμπληρώματα</strong>.</div>
        </div>`;
        const done = supp.done || {};
        const active = SUPPLEMENTS_LIBRARY.filter(s => activeIds.includes(s.id));
        return `<div class="card fade-in">
          <div class="section-title" style="margin-bottom:10px">💊 Συμπληρώματα</div>
          ${active.map(s => {
            const isDone = !!done[s.id];
            return `<div class="supp-item">
              <button class="supp-check ${isDone?'checked':''}" onclick="toggleSupp('${s.id}')">${isDone?'✓':''}</button>
              <div class="supp-info" style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="supp-name">${s.name}</span>
                  <span style="font-size:0.68rem;color:var(--text3);font-weight:600">${s.timing}</span>
                </div>
                <div class="supp-note">${s.intake} · ${s.qty}</div>
              </div>
              <button onclick="toggleSuppInfo('${s.id}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:1rem;padding:4px;flex-shrink:0">ℹ️</button>
            </div>
            <div id="supp-info-${s.id}" class="supp-guide" style="display:none">
              <div class="supp-guide-row"><span class="supp-guide-label">Ιδανική ώρα</span><span>${s.timing}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">Τρόπος</span><span>${s.intake}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">✅ Βελτιώνει</span><span>${s.boosts}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">⚠️ Μειώνει</span><span>${s.reduces}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">🚫 Αποφύγετε</span><span>${s.avoid}</span></div>
              <div class="supp-guide-row"><span class="supp-guide-label">☕ Καφές/Τσάι</span><span>${s.drinks}</span></div>
              ${s.gap !== '—' ? `<div class="supp-guide-row"><span class="supp-guide-label">⏱ Απόσταση</span><span>${s.gap}</span></div>` : ''}
              <div class="supp-guide-tip">${s.tip}</div>
              <div style="margin-top:6px;font-size:0.65rem;color:var(--text3)">Τεκμηρίωση: <strong>${s.evidence}</strong> · ${s.ideal}</div>
            </div>`;
          }).join('')}
        </div>`;
      })()}
    </div>`;
}

// ── PAGE: WEEK ──
function renderWeek() {
  const allR = [...RECIPES_DB, ...state.customRecipes];
  const mealOrder = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealMeta = {
    breakfast:  { label:'Πρωινό',       color:'#f59e0b', bg:'#fffbeb', border:'#f59e0b' },
    snack:      { label:'Δεκατιανό',    color:'#10b981', bg:'#f0fdf4', border:'#10b981' },
    lunch:      { label:'Μεσημεριανό',  color:'#3b82f6', bg:'#eff6ff', border:'#3b82f6' },
    afternoon:  { label:'Απογευματινό', color:'#06b6d4', bg:'#ecfeff', border:'#06b6d4' },
    dinner:     { label:'Βραδινό',      color:'#8b5cf6', bg:'#f5f3ff', border:'#8b5cf6' },
  };
  const dayNamesLong = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
  function getDayTitle(di) {
    if (!state.planStartDate) return `Ημ${di+1}`;
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
      <text x="65" y="78" text-anchor="middle" font-size="9" fill="#9ca3af">Μέση πρόσληψη</text>
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
    if (avgPct >= 88 && avgPct <= 108) return { emoji:'😊', label:'Πολύ καλή επιλογή!', sub:'Συνέχισε έτσι', color:'#22c55e' };
    if (avgPct < 88) return { emoji:'😟', label:'Λίγο χαμηλά', sub:'Αύξησε λίγο τις θερμίδες', color:'#f59e0b' };
    return { emoji:'⚠️', label:'Λίγο ψηλά', sub:'Προσπάθησε να μειώσεις', color:'#ef4444' };
  }
  const bal = weekBalance();

  function getWeekRange() {
    if (!state.planStartDate) return '';
    const start = new Date(state.planStartDate);
    const end = new Date(state.planStartDate);
    end.setDate(end.getDate() + 6);
    const months = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
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
        let name = '', kcal = 0, emoji = '';
        if (me.standardId) {
          const sm = STANDARD_MEALS.find(s => s.id === me.standardId);
          if (!sm) return '';
          name = sm.name; emoji = sm.emoji;
          kcal = Math.round(sm.kcal_est * (me.scaleFactor||1));
        } else {
          const r = allR.find(x => x.id === me.recipeId);
          if (!r) return '';
          const mac = calcRecipeMacros(r, me.scaleFactor||1);
          name = r.name; emoji = r.emoji; kcal = mac.kcal;
        }
        return `<div style="margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-size:0.6rem;font-weight:800;color:${meta.color};text-transform:uppercase;letter-spacing:0.04em">${meta.label}</span>
            <span style="font-size:0.6rem;font-weight:700;color:${meta.color}">${typeKcal} kcal</span>
          </div>
          <div style="background:${meta.bg};border-left:3px solid ${meta.border};border-radius:0 6px 6px 0;padding:5px 7px;cursor:pointer" onclick="goToDay(${di})">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:1px">
              <span style="font-size:1.15rem;flex-shrink:0">${emoji}</span>
              <span style="font-size:0.7rem;font-weight:700;color:var(--text);line-height:1.3;flex:1">${name}</span>
            </div>
            <div style="font-size:0.62rem;color:${meta.color};font-weight:700">${kcal} kcal</div>
          </div>
        </div>`;
      }).join('');
    }).join('');

    return `<div style="background:var(--card);border-radius:12px;border:1px solid var(--border);border-top:${borderTop};box-shadow:var(--shadow);overflow:hidden;min-width:0">
      <div style="padding:10px 10px 8px;border-bottom:1px solid var(--border)">
        <div style="font-weight:900;font-size:0.85rem;color:var(--text)">${getDayTitle(di)}</div>
        ${dateStr}
        <div style="margin-top:6px">
          <div style="font-size:1rem;font-weight:900;color:${barColor}">${m.kcal > 0 ? m.kcal.toLocaleString() : '—'} kcal</div>
        </div>
      </div>
      <div style="padding:8px 8px 10px">
        ${mealSections || '<div style="font-size:0.65rem;color:var(--text3);text-align:center;padding:12px 0">Κανένα γεύμα</div>'}
        ${allDone ? `<div style="margin-top:6px;text-align:center"><span style="font-size:0.62rem;color:#22c55e;font-weight:700;background:#dcfce7;border-radius:20px;padding:2px 8px">✓ Ολοκληρώθηκε</span></div>` : ''}
        ${extraKcal > 0 ? `<div style="margin-top:4px;font-size:0.62rem;color:#ef4444;font-weight:700;text-align:center">⚠️ +${extraKcal} kcal εκτός</div>` : ''}
        ${(() => {
          const { deficit } = calcDayDeficit(di);
          const dc = deficit >= 0 ? '#22c55e' : '#ef4444';
          const sc = (day.stepsCount !== undefined && day.stepsCount !== null) ? day.stepsCount : 8000;
          return `<div style="margin-top:5px;font-size:0.6rem;text-align:center;color:${dc};font-weight:700">${deficit >= 0 ? '−' : '+'}${Math.abs(deficit)} kcal ${deficit >= 0 ? 'έλλ.' : 'πλεόν.'}</div>
          <div style="font-size:0.55rem;color:var(--text3);text-align:center">${day.stepsDone ? `👣${(sc/1000).toFixed(1)}k` : ''}${day.weightTraining?' 🏋️':''}</div>`;
        })()}
      </div>
    </div>`;
  }).join('');

  document.getElementById('page-week').innerHTML = `
    <div style="padding:0 0 24px;background:var(--bg);min-height:100vh">

      <!-- Header -->
      <div class="week-page-header">
        <div>
          <h1 style="font-size:1.4rem;font-weight:900;color:var(--text);margin-bottom:4px">Εβδομαδιαίο Πρόγραμμα</h1>
          <div style="font-size:0.78rem;color:var(--text3)">7 ημέρες · <strong style="color:var(--text2)">${avgKcal.toLocaleString()} kcal/ημέρα</strong></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px">
          <div style="display:flex;align-items:center;gap:2px;background:var(--bg);border-radius:10px;padding:4px 8px;border:1px solid var(--border)">
            <button onclick="shiftWeek(-1)" style="border:none;background:none;cursor:pointer;font-size:1.1rem;color:var(--text2);padding:2px 6px;min-height:36px">‹</button>
            <button class="btn btn-ghost btn-sm" onclick="goToToday()">Σήμερα</button>
            <button onclick="shiftWeek(1)" style="border:none;background:none;cursor:pointer;font-size:1.1rem;color:var(--text2);padding:2px 6px;min-height:36px">›</button>
          </div>
          ${weekRange ? `<div style="font-size:0.78rem;font-weight:700;color:var(--text2)">${weekRange}</div>` : ''}
          <div style="display:flex;gap:5px;margin-left:auto">
            <button class="btn btn-ghost btn-sm" onclick="exportPDF()">🖨️ PDF</button>
            <button class="btn btn-ghost btn-sm" onclick="copyDay()">📋</button>
          </div>
        </div>
      </div>

      <!-- Summary strip -->
      <div style="background:var(--card);border-bottom:1px solid var(--border);padding:16px 20px">
        <div class="week-summary-inner" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          <!-- Gauge -->
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
            ${weekGauge(avgPct)}
            <div style="font-size:0.8rem;font-weight:800;color:var(--text);margin-top:2px">Μέση πρόσληψη</div>
            <div style="font-size:1.1rem;font-weight:900;color:var(--text)">${avgKcal.toLocaleString()} kcal</div>
            <div style="font-size:0.72rem;color:var(--text3)">Στόχος: ${goalKcal.toLocaleString()} kcal</div>
          </div>
          <!-- Macros -->
          <div style="flex:1;min-width:200px">
            <div style="font-size:0.75rem;font-weight:800;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">Μακροθρεπτικά (μέσος όρος)</div>
            ${macroRow('Πρωτεΐνη', avgP, state.goals.protein || 160, '#3b82f6')}
            ${macroRow('Υδατάνθρακες', avgC, state.goals.carbs || 200, '#8b5cf6')}
            ${macroRow('Λίπος', avgF, state.goals.fat || 60, '#f59e0b')}
          </div>
          <!-- Balance -->
          <div style="background:var(--bg);border-radius:12px;padding:16px 20px;min-width:160px;text-align:center;border:1px solid var(--border)">
            <div style="font-size:0.7rem;font-weight:800;color:${bal.color};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Ισορροπία εβδομάδας</div>
            <div style="font-size:2rem;margin-bottom:6px">${bal.emoji}</div>
            <div style="font-size:0.85rem;font-weight:800;color:${bal.color}">${bal.label}</div>
            <div style="font-size:0.72rem;color:var(--text3);margin-top:2px">${bal.sub}</div>
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
        const dayNames7Short = ['Κυρ','Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ'];
        function getShortDayTitle(di) {
          if (!state.planStartDate) return `Η${di+1}`;
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
                <div style="font-size:0.68rem;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">⚖️ Πραγματική Μεταβολή Βάρους</div>
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                  <div style="font-size:0.75rem;color:var(--text2)">
                    ${before.date}: <strong>${before.weight}kg</strong> → ${afterOrLatest.date}: <strong>${afterOrLatest.weight}kg</strong>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:1.2rem;font-weight:900;color:${actualColor}">${sign}${actualDelta.toFixed(1)} kg</div>
                    <div style="font-size:0.62rem;color:var(--text3)">πραγματική αλλαγή</div>
                  </div>
                </div>
              </div>`;
          }
        }

        return `<div style="padding:0 16px;margin-bottom:10px">
          <div style="background:var(--card);border-radius:12px;padding:16px;box-shadow:var(--shadow);border:1px solid var(--border)">
            <div style="font-size:0.75rem;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">🏃 Εβδομαδιαία Δραστηριότητα & Έλλειμμα</div>
            <div style="display:flex;gap:0;margin-bottom:14px">${barCells}</div>
            <div style="font-size:0.78rem;color:var(--text2)">
              🔥 Συνολική καύση: <strong>${weeklyBurn.toLocaleString()} kcal</strong><br>
              🍽️ Συνολική κατανάλωση: <strong>${weeklyConsumed.toLocaleString()} kcal</strong>
            </div>

            <!-- Προβλέψεις απώλειας -->
            <div class="week-deficit-grid" style="margin-top:10px">
              <!-- Πρόβλεψη βάσει TDEE συντήρησης -->
              <div style="background:#f0fdf4;border-radius:8px;padding:8px 10px;border:1.5px solid #bbf7d0">
                <div style="font-size:0.6rem;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">📐 Βάσει TDEE</div>
                <div style="font-size:0.65rem;color:#166534;margin-bottom:3px">TDEE: <strong>${tdee.toLocaleString()}</strong> · Στόχος: <strong>${goalKcalPerDay.toLocaleString()} kcal</strong></div>
                <div style="display:flex;align-items:baseline;gap:6px">
                  <div style="font-size:1rem;font-weight:900;color:${tdeeColor}">${tdeeWeeklyDeficit >= 0 ? '−' : '+'}${Math.abs(tdeeWeeklyDeficit).toLocaleString()} kcal</div>
                  <div style="font-size:0.7rem;font-weight:700;color:${tdeeColor}">≈ ${parseFloat(tdeeKgEquiv) >= 0 ? '-' : '+'}${Math.abs(parseFloat(tdeeKgEquiv))} kg</div>
                </div>
              </div>
              <!-- Πρόβλεψη βάσει πραγματικής καύσης -->
              <div style="background:#eff6ff;border-radius:8px;padding:8px 10px;border:1.5px solid #bfdbfe">
                <div style="font-size:0.6rem;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">🏃 Πραγματική Καύση</div>
                <div style="font-size:0.65rem;color:#1e3a8a;margin-bottom:3px">Καύση: <strong>${weeklyBurn.toLocaleString()}</strong> · Κατ/ση: <strong>${weeklyConsumed.toLocaleString()} kcal</strong></div>
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
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">Σύνολο εβδομάδας</div>
            <div style="font-size:1rem;font-weight:900;color:var(--text)">${totalKcal.toLocaleString()} kcal</div>
            <div style="font-size:0.65rem;color:var(--text3)">Μέσ. ${avgKcal.toLocaleString()} kcal/ημέρα</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">🌿</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">Ποικιλία τροφών</div>
            <div style="font-size:1rem;font-weight:900;color:var(--text)">${uniqueFoods.size} διαφ. τρόφιμα</div>
            <div style="font-size:0.65rem;color:${uniqueFoods.size >= 30 ? '#22c55e' : '#f59e0b'}">${uniqueFoods.size >= 30 ? 'Καλή ποικιλία!' : 'Δοκίμασε περισσότερα'}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">💧</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">Ενυδάτωση</div>
            <div style="font-size:1rem;font-weight:900;color:var(--text)">${(state.profile.weight * 0.035).toFixed(1)}L νερό</div>
            <div style="font-size:0.65rem;color:var(--text3)">Στόχος: ${Math.round(state.profile.weight * 35)}ml/ημέρα</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;margin-bottom:2px">🎯</div>
            <div style="font-size:0.7rem;color:var(--text3);margin-bottom:2px">Πρόοδος στόχου</div>
            <div style="font-size:1rem;font-weight:900;color:${parseFloat(weightChange) <= 0 ? '#22c55e' : '#ef4444'}">${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange} kg</div>
            <div style="font-size:0.65rem;color:var(--text3)">Αυτή την εβδομάδα</div>
          </div>
        </div>
      </div>

    </div>`;
}

// ── PAGE: RECIPES ──
function renderRecipes(filter = '') {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const mealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealLabels = { breakfast:'☀️ Πρωινά', snack:'🍎 Δεκατιανό', lunch:'🥗 Μεσημεριανά', afternoon:'☕ Απογευματινό', dinner:'🌙 Βραδινά' };

  let html = `
    <div class="rc-card">
        <div class="rc-header">
          <span class="rc-title">📖 Συνταγές</span>
          <button class="rc-new-btn" onclick="openAddRecipeModal()">+ Νέα συνταγή</button>
        </div>
        <div class="rc-search">
          <svg class="rc-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Αναζήτηση συνταγής..." value="${filter}" oninput="renderRecipes(this.value)">
        </div>
        <div class="recipe-filter-pills">
          <button class="recipe-pill active" onclick="filterRecipeType('all',this)">Όλες</button>
          <button class="recipe-pill" onclick="filterRecipeType('breakfast',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Πρωινά</button>
          <button class="recipe-pill" onclick="filterRecipeType('snack',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 2c-1 2-1.5 4-1.5 6s.5 4 1.5 6"/><path d="M2 12h20"/></svg> Δεκατιανά</button>
          <button class="recipe-pill" onclick="filterRecipeType('lunch',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Μεση/νό</button>
          <div class="recipe-filter-pills-break"></div>
          <button class="recipe-pill" onclick="filterRecipeType('afternoon',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg> Απογευματινά</button>
          <button class="recipe-pill" onclick="filterRecipeType('dinner',this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Βραδινά</button>
        </div>
      </div>`;

  mealTypes.forEach(type => {
    const recipes = allRecipes.filter(r => r.meal === type && (!filter || r.name.toLowerCase().includes(filter.toLowerCase())));
    if (!recipes.length) return;
    html += `<div class="section-title" data-type="${type}">${mealLabels[type]}</div>
      <div class="recipes-grid" data-type="${type}">
        ${recipes.map(r => {
          const m = calcRecipeMacros(r);
          const isFav = state.favorites.includes(r.id);
          return `<div class="recipe-card ${isFav?'favorite':''}" onclick="openRecipeDetail('${r.id}')">
            <div class="recipe-card-emoji">${r.emoji}</div>
            <div class="recipe-card-name">${r.name}</div>
            <div class="recipe-card-kcal">${m.kcal} kcal</div>
            <div class="recipe-card-meal">Π:${m.p}g | Υ:${m.c}g | Λ:${m.f}g</div>
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
    protein: '🥩 Πρωτεΐνες', carbs: '🍚 Υδατάνθρακες',
    veggie: '🥦 Λαχανικά', fat: '🫒 Λιπαρά',
    dairy: '🥛 Γαλακτοκομικά', fruit: '🍎 Φρούτα', other: '🧂 Άλλα'
  };
  const q = filter.toLowerCase();

  let html = `
    <div class="foods-wrap">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2>🔬 Λεξικό Τροφών</h2>
        <button class="btn btn-green btn-sm" onclick="openAddFoodModal()">➕ Νέα</button>
      </div>
      <div class="search-wrap"><span class="search-icon">🔍</span>
        <input type="text" placeholder="Αναζήτηση τροφής..." value="${filter}" oninput="renderFoods(this.value)">
      </div>`;

  Object.entries(categories).forEach(([cat, label]) => {
    const foods = allFoods.filter(f => f.category === cat && (!q || f.name.toLowerCase().includes(q)));
    if (!foods.length) return;
    html += `<div class="food-section">
      <div class="food-section-title">${label}</div>
      ${foods.map(f => {
        const per = f.unit === 'τεμ' ? `/ τεμ` : `/ 100${f.unit}`;
        return `<div class="food-row" onclick="openFoodDetail('${f.id}')">
          <div>
            <div class="food-row-name">${f.name}</div>
            <div class="food-row-sub">Π:${f.per100.p}g · Υ:${f.per100.c}g · Λ:${f.per100.f}g ${per}</div>
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

      <!-- Mode + Apply -->
      <div class="card card-lg fade-in">
        <div class="section-title">🤖 Αυτόματη Κλιμάκωση</div>
        <div class="mode-tabs">
          <button class="mode-tab ${state.optimizeMode===1?'active':''}" onclick="setMode(1)">Mode 1<br><span style="font-size:0.65rem;font-weight:400">Max Πρωτεΐνη</span></button>
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
    showToast('✅ Εφαρμόστηκε σε όλες τις ημέρες!');
  } else {
    optimizeSingleDay(state.currentDay);
    showToast(`✅ Ημέρα ${state.currentDay+1} βελτιστοποιήθηκε`);
  }
  saveState();
  renderToday();
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
    breakfast:  { label: 'Πρωινό',        icon: '🌅', cls: 'breakfast', color: '#f59e0b', time: _mt.breakfast },
    snack:      { label: 'Δεκατιανό',     icon: '🍎', cls: 'snack',     color: '#22c55e', time: _mt.snack },
    lunch:      { label: 'Μεσημεριανό',   icon: '☀️', cls: 'lunch',     color: '#3b82f6', time: _mt.lunch },
    afternoon:  { label: 'Απογευματινό',  icon: '🧃', cls: 'afternoon', color: '#06b6d4', time: _mt.afternoon },
    dinner:     { label: 'Βραδινό',       icon: '🌙', cls: 'dinner',    color: '#8b5cf6', time: _mt.dinner },
  };
  const filterLabels = [
    { key: 'all',       label: 'Όλες',        icon: '' },
    { key: 'breakfast', label: 'Πρωινά',      icon: '☀️' },
    { key: 'snack',     label: 'Δεκατιανά',   icon: '🍎' },
    { key: 'lunch',     label: 'Μεσ/νό',      icon: '🥗' },
    { key: 'afternoon', label: 'Απογ/νά',     icon: '☕' },
    { key: 'dinner',    label: 'Βραδινά',     icon: '🌙' },
  ];
  const allMealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealTypes = typeFilter === 'all' ? allMealTypes : [typeFilter];

  // ── LEFT: meal library ──
  const libSearch = (window._builderSearch || '').toLowerCase();
  let libHtml = '';
  mealTypes.forEach(t => {
    const meta = mealTypeMeta[t];
    const standards = STANDARD_MEALS.filter(s => s.meal === t && (!libSearch || s.name.toLowerCase().includes(libSearch)));
    const recipes   = allRecipes.filter(r => r.meal === t && (!libSearch || r.name.toLowerCase().includes(libSearch)));
    if (!standards.length && !recipes.length) return;

    libHtml += `<div class="dplanner-lib-section-header">
      <span class="dplanner-lib-section-icon ${t}">${meta.icon}</span>
      <span class="dplanner-lib-section-label">${meta.label.toUpperCase()}</span>
    </div>`;
    libHtml += `<div class="dplanner-lib-grid">`;
    standards.forEach(s => {
      const sel = builderMeals.find(x => x.id === s.id && x.isStandard);
      libHtml += `<div class="dplanner-meal-card ${sel ? 'selected-dp' : ''}" onclick="builderPageToggle('${s.id}',true)">
        <div class="dplanner-meal-emoji">${s.emoji}</div>
        <div class="dplanner-meal-info">
          <div class="dplanner-meal-name">${s.name}</div>
          <div class="dplanner-meal-meta">Π:${s.p||'?'}g · Υ:${s.c||'?'}g · Λ:${s.f||'?'}g</div>
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
          <div class="dplanner-meal-name">${r.name}</div>
          <div class="dplanner-meal-meta">Π:${m.p}g · Υ:${m.c}g · Λ:${m.f}g</div>
        </div>
        <div class="dplanner-meal-kcal">${m.kcal} kcal</div>
        <button class="dplanner-add-btn dplanner-add-btn--visible" onclick="event.stopPropagation();builderPageToggle('${r.id}',false)">${sel ? '✕' : '+'}</button>
      </div>`;
    });
    libHtml += `</div>`;
  });
  if (!libHtml) libHtml = '<div class="empty-state"><div class="empty-icon">🍽️</div><p>Δεν βρέθηκαν γεύματα</p></div>';

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
  allMealTypes.forEach(t => {
    const meta = mealTypeMeta[t];
    const mealsOfType = builderMeals.filter(bm => {
      if (bm.isStandard) { const sm = STANDARD_MEALS.find(s => s.id === bm.id); return sm && sm.meal === t; }
      const r = allRecipes.find(x => x.id === bm.id); return r && r.meal === t;
    });

    let slotKcal = 0;
    let entriesHtml = '';
    mealsOfType.forEach(bm => {
      let name, emoji, kcal;
      if (bm.isStandard) {
        const sm = STANDARD_MEALS.find(s => s.id === bm.id); if (!sm) return;
        name = sm.name; emoji = sm.emoji; kcal = sm.kcal_est;
      } else {
        const r = allRecipes.find(x => x.id === bm.id); if (!r) return;
        const m = calcRecipeMacros(r); name = r.name; emoji = r.emoji; kcal = m.kcal;
      }
      slotKcal += kcal;
      entriesHtml += `<div class="dplanner-entry">
        <span class="dplanner-entry-emoji">${emoji}</span>
        <span class="dplanner-entry-name">${name}</span>
        <span class="dplanner-entry-kcal">${kcal} kcal</span>
        <button class="dplanner-entry-rm" onclick="builderPageToggle('${bm.id}',${bm.isStandard})" title="Αφαίρεση">×</button>
      </div>`;
    });

    middleHtml += `<div class="dplanner-slot">
      <div class="dplanner-slot-header">
        <div class="dplanner-slot-left">
          <div class="dplanner-slot-icon ${meta.cls}">${meta.icon}</div>
          <div>
            <div class="dplanner-slot-title">${meta.label}</div>
            <div class="dplanner-slot-time">${meta.time}</div>
          </div>
        </div>
        ${slotKcal > 0 ? `<div class="dplanner-slot-kcal" style="color:${meta.color}">${slotKcal} kcal</div>` : ''}
      </div>
      ${entriesHtml}
      <button class="dplanner-add-slot-btn" onclick="dpHighlightType('${t}')">+ Προσθήκη τροφίμου</button>
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
  const qualLabel = avgPct >= 85 ? 'Πολύ καλή επιλογή!' : avgPct >= 60 ? 'Καλή πρόοδος' : 'Επίλεξε γεύματα';
  const qualDesc  = avgPct >= 85
    ? 'Ισορροπημένο πλάνο με ποικιλία θρεπτικών συστατικών.'
    : avgPct >= 60
    ? 'Καλό πλάνο, μπορείς να βελτιώσεις τα μακροθρεπτικά.'
    : 'Πρόσθεσε γεύματα από την αριστερή λίστα.';

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
            <div class="dplanner-tpl-meta">${tpl.meals.length} γεύματα · ~${tKcal} kcal · ${tpl.savedAt}</div>
          </div>
          <div style="display:flex;gap:5px">
            <button class="btn btn-ghost btn-sm" onclick="loadTemplate(${ti})">▶</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteTemplate(${ti})">🗑</button>
          </div>
        </div>`;
      }).join('')
    : '<div style="font-size:0.8rem;color:var(--text3)">Δεν υπάρχουν αποθηκευμένα πρότυπα.</div>';

  const dayLabel = state.planStartDate
    ? `${state.week[state.currentDay].label} · ${formatPlanDay(state.currentDay)}`
    : state.week[state.currentDay].label;

  if (typeof state._builderApplyDay === 'undefined') state._builderApplyDay = state.currentDay || 0;
  const applyDayIdx = Math.max(0, Math.min(state.week.length - 1, state._builderApplyDay || 0));
  state._builderApplyDay = applyDayIdx;
  const applyDayLabel = state.planStartDate
    ? (() => { const d = new Date(state.planStartDate); d.setDate(d.getDate() + applyDayIdx); const months=['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου','Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου']; const dayNames=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο']; return `${dayNames[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`; })()
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
          <h2 class="dplanner-topcard-title">Day Planner</h2>
          <p class="dplanner-topcard-sub">Σχεδίασε τα γεύματά σου για σήμερα</p>
        </div>
        <button class="dplanner-topcard-icon-btn" onclick="exportPDF()" title="PDF">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
          <span style="font-size:0.65rem;font-weight:700;display:block;margin-top:1px">PDF</span>
        </button>
      </div>
      <div class="dplanner-status-row ${totalKcal > 0 ? '' : 'dplanner-status-empty'}">
        <div class="dplanner-status-left">
          <div class="dplanner-status-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green-d)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#dcfce7"/><path d="M3 11c0 0 2-3 9-3s9 3 9 3v2c0 4.42-3.58 8-8 8H11c-4.42 0-8-3.58-8-8v-2z" fill="none"/><ellipse cx="12" cy="13" rx="5" ry="4" fill="none" stroke="var(--green-d)" stroke-width="1.5"/></svg>
          </div>
          <div>
            <div class="dplanner-status-title">${totalKcal > 0 ? 'Το πλάνο είναι έτοιμο!' : 'Επίλεξε γεύματα'}</div>
            <div class="dplanner-status-meta">${builderMeals.length} γεύματα &nbsp;·&nbsp; ${totalKcal} kcal</div>
          </div>
        </div>
        ${totalKcal > 0 ? `<button class="dplanner-preview-btn" onclick="dpHighlightType('all')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Προεπισκόπηση
        </button>` : ''}
      </div>
      <button class="dplanner-btn-save" onclick="builderPageApply()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Αποθήκευση πλάνου
      </button>
      <button class="dplanner-btn-clear" onclick="builderPageClear()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Καθαρισμός πλάνου
      </button>
    </div>

    <!-- SAVE DESTINATION CARD (mobile) -->
    <div class="dplanner-daycard">
      <div class="dplanner-daycard-title" style="font-size:0.95rem;font-weight:800;margin-bottom:12px">Πού θέλεις να αποθηκεύσεις;</div>

      <button class="dplanner-dest-row" onclick="builderPageApply()">
        <div class="dplanner-dest-icon" style="background:#dcfce7">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-d)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="dplanner-dest-info">
          <div class="dplanner-dest-name">Επιλογή συγκεκριμένης ημερομηνίας</div>
          <div class="dplanner-dest-sub">Επίλεξε ημερομηνία από το ημερολόγιο</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <button class="dplanner-dest-row" onclick="builderSaveToDaySlot()">
        <div class="dplanner-dest-icon" style="background:#dcfce7">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-d)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </div>
        <div class="dplanner-dest-info">
          <div class="dplanner-dest-name">Αποθήκευση ως Ημέρας (Day 1, Day 2…)</div>
          <div class="dplanner-dest-sub">Δημιούργησε την δική σου σειρά ημερών</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- WEEK OVERVIEW CARD (mobile) -->
    <div class="dplanner-daycard">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="dplanner-daycard-title" style="font-size:0.95rem;font-weight:800">Επισκόπηση εβδομάδας</div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="dplanner-week-grid">
        ${state.week.map((d, i) => {
          const hasMeals = d.meals && d.meals.length > 0;
          const shortDay = state.planStartDate ? (() => { const dt = new Date(state.planStartDate); dt.setDate(dt.getDate()+i); return ['Κυρ','Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ'][dt.getDay()]; })() : d.label.slice(0,3);
          const dayNum = `Day ${i+1}`;
          return `<button class="dplanner-week-day ${hasMeals ? 'has-meals' : ''} ${applyDayIdx === i ? 'selected' : ''}"
            onclick="state._builderApplyDay=${i};renderBuilderPage('${typeFilter}')">
            <div class="dplanner-week-day-check">
              ${hasMeals
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`}
            </div>
            <div class="dplanner-week-day-name">${shortDay}</div>
            <div class="dplanner-week-day-num">${dayNum}</div>
          </button>`;
        }).join('')}
      </div>
      <div class="dplanner-week-legend">
        <span class="dplanner-week-legend-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="background:var(--green-d);border-radius:50%;padding:1px"><polyline points="20 6 9 17 4 12"/></svg>
          Αποθηκευμένο
        </span>
        <span class="dplanner-week-legend-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>
          Δεν έχει αποθηκευτεί
        </span>
      </div>
    </div>

    <!-- 3 COLUMNS -->
    <div class="dplanner-cols">

      <!-- LEFT: Meal Library -->
      <div class="dplanner-col">
        <div class="dplanner-col-head">
          <h3>Βιβλιοθήκη τροφίμων</h3>
          <div class="dplanner-search-wrap">
            <span class="dplanner-search-icon">🔍</span>
            <input type="text" placeholder="Αναζήτηση γευμάτων..."
              value="${window._builderSearch || ''}"
              oninput="window._builderSearch=this.value;renderBuilderPage('${typeFilter}')">
          </div>
          <div class="recipe-filter-pills" style="margin-top:8px">
            ${filterLabels.map(fl => `<button class="recipe-pill ${typeFilter===fl.key?'active':''}"
              onclick="renderBuilderPage('${fl.key}')">${fl.icon ? fl.icon+' ' : ''}${fl.label}</button>`).join('')}
          </div>
        </div>
        <div class="dplanner-col-body">${libHtml}</div>
      </div>

      <!-- MIDDLE: Day Plan -->
      <div class="dplanner-col">
        <div class="dplanner-col-head">
          <h3>Το πλάνο της ημέρας</h3>
          <div class="dplanner-day-nav">
            <button class="dplanner-nav-btn" onclick="state.currentDay=Math.max(0,state.currentDay-1);renderBuilderPage('${typeFilter}')">‹</button>
            <div class="dplanner-day-label">${dayLabel}</div>
            <button class="dplanner-nav-btn" onclick="state.currentDay=Math.min(state.week.length-1,state.currentDay+1);renderBuilderPage('${typeFilter}')">›</button>
          </div>
        </div>
        <div class="dplanner-col-body">
          ${middleHtml || '<div class="empty-state"><div class="empty-icon">🍽️</div><p>Επίλεξε γεύματα από αριστερά</p></div>'}
        </div>
      </div>

      <!-- RIGHT: Summary -->
      <div class="dplanner-col">
        <div class="dplanner-col-head"><h3>Σύνοψη ημέρας</h3></div>
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
                <span><span class="dplanner-legend-dot" style="background:#22c55e"></span>Πρωτεΐνη</span>
                <span style="font-weight:700">${totalP}g (${mp.p}%)</span>
              </div>
              <div class="dplanner-legend-row">
                <span><span class="dplanner-legend-dot" style="background:#3b82f6"></span>Υδατάνθρακες</span>
                <span style="font-weight:700">${totalC}g (${mp.c}%)</span>
              </div>
              <div class="dplanner-legend-row">
                <span><span class="dplanner-legend-dot" style="background:#f59e0b"></span>Λίπη</span>
                <span style="font-weight:700">${totalF}g (${mp.f}%)</span>
              </div>
            </div>
            <div style="font-size:0.72rem;color:var(--text3)">
              Στόχος: ${goals.kcal} kcal &nbsp;·&nbsp;
              <span style="color:var(--green-d);font-weight:700">Υπόλοιπο: ${Math.max(0,goals.kcal-totalKcal)} kcal</span>
            </div>
          </div>

          <!-- Macro bars -->
          <div class="card card-sm" style="margin-bottom:12px">
            <div class="section-title" style="margin-bottom:10px">Μακροθρεπτικά</div>
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label"><span style="color:#22c55e">Πρωτεΐνη</span><span>${totalP}g / ${goals.protein}g &nbsp; ${pPct}%</span></div>
              <div class="dplanner-mbar-track"><div class="dplanner-mbar-fill" style="width:${pPct}%;background:#22c55e"></div></div>
            </div>
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label"><span style="color:#3b82f6">Υδατάνθρακες</span><span>${totalC}g / ${goals.carbs}g &nbsp; ${cPct}%</span></div>
              <div class="dplanner-mbar-track"><div class="dplanner-mbar-fill" style="width:${cPct}%;background:#3b82f6"></div></div>
            </div>
            <div class="dplanner-mbar">
              <div class="dplanner-mbar-label"><span style="color:#f59e0b">Λίπη</span><span>${totalF}g / ${goals.fat}g &nbsp; ${fPct}%</span></div>
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
            <div class="section-title" style="margin-bottom:8px">Ενέργεια & Στόχοι</div>
            <div class="dplanner-stat">
              <div class="dplanner-stat-row"><span>🔥 Συνολικές θερμίδες</span><strong>${totalKcal} / ${goals.kcal} kcal</strong></div>
              <div class="dplanner-stat-row"><span>🍽️ Γεύματα επιλεγμένα</span><strong>${builderMeals.length}</strong></div>
              <div class="dplanner-stat-row"><span>💧 Ενυδάτωση (στόχος 3L)</span><strong style="color:var(--blue)">— / 3L</strong></div>
              <div class="dplanner-stat-row"><span>⭐ Βαθμολογία πλάνου</span><strong>${score.toFixed(1)} / 10</strong></div>
            </div>
          </div>

          <!-- Templates -->
          <div class="card card-sm">
            <div class="section-title" style="margin-bottom:8px">💾 Πρότυπα</div>
            <div style="display:flex;gap:6px;margin-bottom:10px">
              <input type="text" id="builder-tpl-name" placeholder="Όνομα προτύπου..."
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
  if (!builderMeals.length) { showToast('⚠️ Δεν επιλέχτηκαν γεύματα'); return; }
  const dayIdx = typeof state._builderApplyDay !== 'undefined'
    ? Math.max(0, Math.min(state.week.length - 1, state._builderApplyDay))
    : state.currentDay;
  applyBuilderToDayIdx(dayIdx);
}

function builderSaveToDaySlot() {
  if (!builderMeals.length) { showToast('⚠️ Δεν επιλέχτηκαν γεύματα'); return; }
  openModal(`<div class="modal-handle"></div>
    <div class="modal-title">📅 Αποθήκευση σε ημέρα</div>
    <p style="font-size:0.82rem;color:var(--text2);margin-bottom:14px">Επίλεξε σε ποια ημέρα να εφαρμοστεί το πλάνο.</p>
    <div class="recipes-grid">
      ${state.week.map((d,i) => {
        const hasMeals = d.meals && d.meals.length > 0;
        const dayLabel = state.planStartDate ? formatPlanDay(i) : `Ημ${i+1}`;
        return `<div class="recipe-card ${hasMeals ? 'favorite' : ''}" onclick="applyBuilderToDayIdx(${i})">
          <div class="recipe-card-emoji">${hasMeals ? '✅' : '📅'}</div>
          <div class="recipe-card-name">${d.label}<br><span style="font-size:0.68rem;color:var(--text3)">${dayLabel}</span></div>
        </div>`;
      }).join('')}
    </div>`);
}

function applyBuilderToDayIdx(dayIdx) {
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
  state.week[dayIdx].meals = newMeals;
  builderMeals = [];
  saveState();
  closeModal();
  const dayName = state.week[dayIdx].label || `Ημέρα ${dayIdx+1}`;
  showToast(`✅ Αποθηκεύτηκε στη ${dayName}!`);
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
  const mealLabels = { breakfast:'☀️ Πρωινά', snack:'🍎 Δεκατιανό', lunch:'🥗 Μεσ/νά', afternoon:'☕ Απογ/νό', dinner:'🌙 Βραδινά' };
  let html = '';
  const types = typeFilter === 'all' ? ['breakfast','snack','lunch','afternoon','dinner'] : [typeFilter];
  types.forEach(t => {
    const recipes = allRecipes.filter(r => r.meal === t);
    const standards = allStandard.filter(s => s.meal === t);
    if (!recipes.length && !standards.length) return;
    html += `<div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin:8px 0 4px">${mealLabels[t]}</div>`;
    standards.forEach(s => {
      const inBuilder = builderMeals.find(x => x.id === s.id && x.isStandard);
      html += `<div class="swap-row ${inBuilder?'selected-builder':''}" onclick="builderToggle('${s.id}',true)">
        <div class="swap-row-left"><span class="swap-emoji">${s.emoji}</span>
          <div><div class="swap-name">⭐ ${s.name}</div><div class="swap-items">${s.items.slice(0,2).join(' · ')}</div></div>
        </div>
        <div class="swap-kcal">~${s.kcal_est}<span>kcal</span></div>
      </div>`;
    });
    recipes.forEach(r => {
      const m = calcRecipeMacros(r);
      const inBuilder = builderMeals.find(x => x.id === r.id && !x.isStandard);
      html += `<div class="swap-row ${inBuilder?'selected-builder':''}" onclick="builderToggle('${r.id}',false)">
        <div class="swap-row-left"><span class="swap-emoji">${r.emoji}</span>
          <div><div class="swap-name">${r.name}</div><div class="swap-items">Π:${m.p}g · Υ:${m.c}g · Λ:${m.f}g</div></div>
        </div>
        <div class="swap-kcal">${m.kcal}<span>kcal</span></div>
      </div>`;
    });
  });
  return html || '<div style="padding:10px;color:var(--text3)">Δεν βρέθηκαν γεύματα</div>';
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
    bar.innerHTML = '<span class="chip">Κανένα γεύμα</span>';
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
  if (!confirm('Διαγραφή αυτού του προτύπου;')) return;
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
  renderToday();
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
}

function toggleSuppActive(id) {
  if (!state.supplements.activeIds) state.supplements.activeIds = [];
  const idx = state.supplements.activeIds.indexOf(id);
  if (idx === -1) state.supplements.activeIds.push(id);
  else state.supplements.activeIds.splice(idx, 1);
  saveState();
  renderSettingsSupplements();
  renderToday();
}

function toggleSuppInfo(id) {
  const el = document.getElementById('supp-info-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-content').innerHTML = html;
  overlay.classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
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
    return `<div class="ingredient-row"><span class="ingredient-name">${food.name}</span><span class="ingredient-qty">${ing.qty}${food.unit}</span></div>`;
  }).join('');

  // Μετατροπή "\n" σε αριθμημένα βήματα
  function stepsHtml(text) {
    if (!text) return '';
    return text.split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:0.85rem;line-height:1.5">${l}</div>`)
      .join('');
  }

  const cookingHtml = stepsHtml(recipe.instructions);
  const servingHtml = recipe.serving
    ? `<div class="section-title" style="margin-top:14px">🍽️ Σερβίρισμα</div>
       <div style="background:var(--green-bg);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:16px;font-size:0.85rem;color:var(--text2);line-height:1.5">${recipe.serving}</div>`
    : '';

  openModal(`
    <div class="modal-handle"></div>
    <div style="text-align:center;font-size:3rem;margin-bottom:8px">${recipe.emoji}</div>
    <div class="modal-title" style="text-align:center">${recipe.name}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">
      <span class="chip chip-green">${m.kcal} kcal</span>
      <span class="chip chip-blue">Π: ${m.p}g</span>
      <span class="chip">Υ: ${m.c}g</span>
      <span class="chip">Λ: ${m.f}g</span>
    </div>
    <div class="section-title">🧂 Υλικά</div>
    ${ingredientsHtml}
    <div class="section-title" style="margin-top:14px">👨‍🍳 Οδηγίες Μαγειρέματος</div>
    <div style="margin-bottom:${recipe.serving ? '4px' : '16px'}">${cookingHtml}</div>
    ${servingHtml}
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-ghost btn-sm" onclick="toggleFavorite('${rid}');closeModal()">${isFav?'☆ Αφαίρεση':'⭐ Αγαπημένο'}</button>
      <button class="btn btn-green" style="flex:1" onclick="addRecipeToDay('${rid}');closeModal()">➕ Προσθήκη στην Ημέρα</button>
    </div>`);
}

function openFoodDetail(fid) {
  const allFoods = [...FOODS_DB, ...state.customFoods];
  const food = allFoods.find(f => f.id === fid);
  if (!food) return;
  const per = food.unit === 'τεμ' ? 'τεμ' : '100' + food.unit;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${food.name}</div>
    <div class="section-title">Θρεπτικά Στοιχεία / ${per}</div>
    <div class="meal-macros" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:16px">
      <div class="macro-chip"><div class="macro-chip-val" style="color:#22c55e">${food.per100.kcal}</div><div class="macro-chip-lbl">kcal</div></div>
      <div class="macro-chip"><div class="macro-chip-val" style="color:#3b82f6">${food.per100.p}g</div><div class="macro-chip-lbl">πρωτ.</div></div>
      <div class="macro-chip"><div class="macro-chip-val" style="color:#8b5cf6">${food.per100.c}g</div><div class="macro-chip-lbl">υδατ.</div></div>
      <div class="macro-chip"><div class="macro-chip-val" style="color:#f59e0b">${food.per100.f}g</div><div class="macro-chip-lbl">λίπος</div></div>
    </div>
    <button class="btn btn-ghost btn-full" onclick="closeModal()">Κλείσιμο</button>`);
}

function openSwapMeal(mi) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const currentType = state.week[state.currentDay].meals[mi].type;
  const snackTypes = currentType === 'afternoon' ? ['afternoon', 'snack'] : [currentType];
  const recipes = allRecipes.filter(r => snackTypes.includes(r.meal));
  const standards = STANDARD_MEALS.filter(s => snackTypes.includes(s.meal));
  const mealTypeLabel = { breakfast:'Πρωινά', lunch:'Μεσημεριανά', dinner:'Βραδινά', snack:'Δεκατιανό', afternoon:'Απογευματινό' }[currentType] || '';

  const standardItems = standards.map(s => ({
    key: 'std:' + s.id,
    html: `<div class="swap-row" data-name="${s.name.toLowerCase()}" onclick="swapMealStandard(${mi},'${s.id}')">
      <div class="swap-row-left">
        <span class="swap-emoji">${s.emoji}</span>
        <div>
          <div class="swap-name">${s.name}</div>
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
      html: `<div class="swap-row" data-name="${r.name.toLowerCase()}" onclick="swapMeal(${mi},'${r.id}')">
        <div class="swap-row-left">
          <span class="swap-emoji">${r.emoji}</span>
          <div>
            <div class="swap-name">${r.name}</div>
            <div class="swap-items">Π:${m.p}g · Υ:${m.c}g · Λ:${m.f}g</div>
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
      <div class="modal-title" style="margin:0">Επιλογή Γεύματος — ${mealTypeLabel}</div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text3);padding:4px;line-height:1">✕</button>
    </div>
    <div class="swap-search-wrap">
      <input class="swap-search" id="swap-search-input" type="text" placeholder="Αναζήτηση γεύματος..." oninput="filterSwapList(this.value)" autocomplete="off">
    </div>
    <div class="swap-list" id="swap-list-inner">
      ${listHTML || '<div class="empty-state"><p>Δεν βρέθηκαν γεύματα</p></div>'}
    </div>`);

  setTimeout(() => {
    const inp = document.getElementById('swap-search-input');
    if (inp) inp.focus();
  }, 100);
}

window.filterSwapList = function(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('#swap-list-inner .swap-row');
  rows.forEach(row => {
    const name = (row.dataset.name || '') + row.textContent.toLowerCase();
    row.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
};

function swapMeal(mi, rid) {
  state.week[state.currentDay].meals[mi].recipeId = rid;
  state.week[state.currentDay].meals[mi].scaleFactor = 1;
  delete state.week[state.currentDay].meals[mi].standardId;
  saveState();
  closeModal();
  renderToday();
  showToast('✅ Γεύμα αλλάχθηκε');
}

function swapMealStandard(mi, sid) {
  // Αποθηκεύουμε το standard ID — δεν έχει recipeId, εμφανίζεται ως "στάνταρ"
  state.week[state.currentDay].meals[mi].standardId = sid;
  delete state.week[state.currentDay].meals[mi].recipeId;
  saveState();
  closeModal();
  renderToday();
  showToast('✅ Στάνταρ γεύμα επιλέχθηκε');
}

function openScaleModal(mi) {
  const sf = state.week[state.currentDay].meals[mi].scaleFactor || 1;
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
    <button class="btn btn-green btn-full" onclick="applyScale(${mi},parseFloat(document.getElementById('sf-slider').value))">✓ Εφαρμογή</button>`);
}

function applyScale(mi, sf) {
  state.week[state.currentDay].meals[mi].scaleFactor = sf;
  saveState();
  closeModal();
  renderToday();
  showToast(`✅ Ποσότητα: ${sf.toFixed(2)}x`);
}

function openAddMealModal() {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const mealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealLabels = { breakfast:'Πρωινό', lunch:'Μεσημεριανό', dinner:'Βραδινό', snack:'Δεκατιανό', afternoon:'Απογευματινό' };
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">➕ Προσθήκη Γεύματος</div>
    <div class="form-group">
      <label>Ώρα</label>
      <input type="time" id="new-meal-time" value="12:00">
    </div>
    <div class="form-group">
      <label>Τύπος</label>
      <select id="new-meal-type">
        ${mealTypes.map(t => `<option value="${t}">${mealLabels[t]}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Συνταγή</label>
      <select id="new-meal-recipe">
        ${allRecipes.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-green btn-full" onclick="addMealFromModal()">➕ Προσθήκη</button>`);
}

function addMealFromModal() {
  const time = document.getElementById('new-meal-time').value;
  const type = document.getElementById('new-meal-type').value;
  const recipeId = document.getElementById('new-meal-recipe').value;
  state.week[state.currentDay].meals.push({ time, type, recipeId, done: false, scaleFactor: 1 });
  state.week[state.currentDay].meals.sort((a,b) => a.time.localeCompare(b.time));
  saveState();
  closeModal();
  renderToday();
  showToast('✅ Γεύμα προστέθηκε');
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
  renderToday();
  showToast('✅ Γεύμα προστέθηκε στην ημέρα');
}

function openAddRecipeModal() {
  const allFoods = [...FOODS_DB, ...state.customFoods];
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">➕ Νέα Συνταγή</div>
    <div class="form-group"><label>Όνομα</label><input type="text" id="nr-name" placeholder="πχ. Σαλάτα Τόνου"></div>
    <div class="form-group"><label>Emoji</label><input type="text" id="nr-emoji" value="🍽️" maxlength="2"></div>
    <div class="form-group"><label>Τύπος Γεύματος</label>
      <select id="nr-meal">
        <option value="breakfast">Πρωινό</option>
        <option value="snack">Δεκατιανό</option>
        <option value="afternoon">Απογευματινό</option>
        <option value="lunch">Μεσημεριανό</option>
        <option value="dinner">Βραδινό</option>
      </select>
    </div>
    <div class="form-group"><label>Οδηγίες</label><textarea id="nr-inst" placeholder="Βήμα 1..."></textarea></div>
    <div class="section-title">Υλικά (1ο)</div>
    <div style="display:flex;gap:8px">
      <select id="nr-food1" style="flex:1">${allFoods.map(f=>`<option value="${f.id}">${f.name}</option>`).join('')}</select>
      <input type="number" id="nr-qty1" placeholder="qty" style="width:70px" value="100">
    </div>
    <div style="margin-top:10px">
      <button class="btn btn-green btn-full" onclick="saveNewRecipe()">💾 Αποθήκευση</button>
    </div>`);
}

function saveNewRecipe() {
  const name = document.getElementById('nr-name').value.trim();
  if (!name) { showToast('⚠️ Βάλε όνομα!'); return; }
  const newRecipe = {
    id: 'cr_' + Date.now(),
    name,
    emoji: document.getElementById('nr-emoji').value || '🍽️',
    meal: document.getElementById('nr-meal').value,
    instructions: document.getElementById('nr-inst').value,
    ingredients: [{ foodId: document.getElementById('nr-food1').value, qty: parseInt(document.getElementById('nr-qty1').value) || 100 }]
  };
  state.customRecipes.push(newRecipe);
  saveState();
  closeModal();
  renderRecipes();
  showToast('✅ Συνταγή αποθηκεύτηκε');
}

function openAddFoodModal() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">➕ Νέο Τρόφιμο</div>
    <div class="form-group"><label>Όνομα</label><input type="text" id="nf-name" placeholder="πχ. Τυρί κότατζ 0%"></div>
    <div class="form-group"><label>Κατηγορία</label>
      <select id="nf-cat">
        <option value="protein">Πρωτεΐνη</option><option value="carbs">Υδατάνθρακες</option>
        <option value="veggie">Λαχανικά</option><option value="fat">Λιπαρά</option>
        <option value="dairy">Γαλακτοκομικά</option><option value="fruit">Φρούτα</option><option value="other">Άλλο</option>
      </select>
    </div>
    <div class="form-group"><label>Μονάδα</label>
      <select id="nf-unit"><option value="g">γραμμάρια (g)</option><option value="ml">ml</option><option value="τεμ">τεμάχια</option></select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="form-group"><label>Θερμίδες</label><input type="number" id="nf-kcal" placeholder="0"></div>
      <div class="form-group"><label>Πρωτεΐνη (g)</label><input type="number" id="nf-p" placeholder="0"></div>
      <div class="form-group"><label>Υδατάνθρακες (g)</label><input type="number" id="nf-c" placeholder="0"></div>
      <div class="form-group"><label>Λίπος (g)</label><input type="number" id="nf-f" placeholder="0"></div>
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
      kcal: parseFloat(document.getElementById('nf-kcal').value) || 0,
      p: parseFloat(document.getElementById('nf-p').value) || 0,
      c: parseFloat(document.getElementById('nf-c').value) || 0,
      f: parseFloat(document.getElementById('nf-f').value) || 0,
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
    <div class="modal-title">🏗️ Day Builder</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="chip chip-green">${m.kcal} kcal</span>
      <span class="chip chip-blue">Π:${m.p}g</span>
      <span class="chip">Υ:${m.c}g</span>
      <span class="chip">Λ:${m.f}g</span>
    </div>
    <div class="section-title">Επιλεγμένα (${builderMeals.length})</div>
    ${builderMeals.map((rid,i) => {
      const r = allRecipes.find(x => x.id === rid);
      return r ? `<div class="food-row" style="cursor:default">
        <span>${r.emoji} ${r.name}</span>
        <button class="btn btn-ghost btn-sm" onclick="builderRemove(${i})">✕</button>
      </div>` : '';
    }).join('') || '<p style="font-size:0.8rem;color:var(--text3);margin-bottom:8px">Δεν έχεις επιλέξει ακόμα.</p>'}
    <div class="section-title" style="margin-top:12px">Προσθήκη Συνταγής</div>
    <div class="recipes-grid">
      ${allRecipes.map(r => {
        const mac = calcRecipeMacros(r);
        return `<div class="recipe-card" onclick="builderAdd('${r.id}')">
          <div class="recipe-card-emoji">${r.emoji}</div>
          <div class="recipe-card-name">${r.name}</div>
          <div class="recipe-card-kcal">${mac.kcal} kcal</div>
        </div>`;
      }).join('')}
    </div>
    <button class="btn btn-green btn-full" style="margin-top:12px" onclick="applyBuilderToDay()">✅ Εφάρμοσε στην Ημέρα ${state.currentDay+1}</button>`);
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
    el.innerHTML = '<span class="chip">Κανένα γεύμα ακόμα</span>';
    return;
  }
  el.innerHTML = `<span class="chip chip-green">${builderMeals.length} γεύματα επιλεγμένα</span>`;
}

// ── RESET DAY ──
function resetDayDone() {
  // Μηδενίζει μόνο τα checkboxes (done flags) — κρατάει τα γεύματα
  state.week[state.currentDay].meals.forEach(m => m.done = false);
  saveState();
  renderToday();
  showToast('↺ Checkboxes μηδενίστηκαν');
}

function resetDayMeals() {
  if (!confirm(`Επαναφορά Ημέρα ${state.currentDay+1} στα default γεύματα; Οι αλλαγές χάνονται.`)) return;
  state.week[state.currentDay].meals = JSON.parse(JSON.stringify(DEFAULT_WEEK[state.currentDay].meals));
  saveState();
  renderToday();
  showToast('✅ Ημέρα επαναφέρθηκε στα default');
}

// ── COPY DAY ──
function copyDay() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📋 Αντιγραφή Ημέρας ${state.currentDay+1} σε...</div>
    <div class="recipes-grid">
      ${state.week.filter((_,i)=>i!==state.currentDay).map(d => `
        <div class="recipe-card" onclick="doCopyDay(${d.day-1})">
          <div class="recipe-card-emoji">📅</div>
          <div class="recipe-card-name">${d.label}</div>
        </div>`).join('')}
    </div>`);
}

function doCopyDay(targetIdx) {
  state.week[targetIdx].meals = JSON.parse(JSON.stringify(state.week[state.currentDay].meals));
  state.week[targetIdx].meals.forEach(m => m.done = false);
  saveState();
  closeModal();
  showToast(`✅ Αντιγράφηκε στην Ημέρα ${targetIdx+1}`);
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
      name = r.emoji + ' ' + r.name;
      kcal = mac.kcal;
      macStr = `Π:${mac.p}g / Υ:${mac.c}g / Λ:${mac.f}g`;
      const ingList = r.ingredients.map(ing => {
        const food = allFoodsLocal.find(f => f.id === ing.foodId);
        if (!food) return '';
        let qty = ing.qty * (m.scaleFactor||1);
        if (food.unit === 'g') qty = Math.round(qty / 10) * 10;
        else qty = Math.round(qty);
        if (ing.foodId === 'f9' && food.unit === 'g') qty = 30;
        return food.name + ' ' + qty + food.unit;
      }).filter(Boolean).join(' · ');
      detailHtml = `<tr><td colspan="5" style="padding:1px 12px 4px;font-size:9px;color:#6b7280;line-height:1.5;white-space:normal;word-break:break-word">${ingList}</td></tr>`;
      if (r.instructions) {
        detailHtml += `<tr><td colspan="5" style="padding:1px 12px 7px;font-size:8.5px;color:#9ca3af;font-style:italic;line-height:1.5;white-space:normal;word-break:break-word">${r.instructions}</td></tr>`;
      }
    }
    const mealTypeLabel = { breakfast:'Πρωινό', snack:'Δεκατιανό', lunch:'Μεσημεριανό', afternoon:'Απογευματινό', dinner:'Βραδινό' }[m.type] || m.type;
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
    ? `<tr style="background:#fef2f2"><td colspan="5" style="padding:6px 8px;font-size:9px;color:#ef4444;font-weight:700">⚠️ Επιπλέον εκτός πλάνου: +${extraKcal} kcal</td></tr>`
    : '';

  const html = `<style>@page { size: A4 portrait; margin: 0; }</style>
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;padding:10mm 12mm;min-height:277mm;box-sizing:border-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:17px;font-weight:800;color:#111">${day.label}${dateLabel}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">Στόχος: ${g.kcal} kcal · Πλάνο: ${tot.kcal} kcal (${pct}%) · ${p.name||'Vivon'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;color:#3b82f6">Πρωτεΐνη: ${tot.p}g</div>
          <div style="font-size:11px;font-weight:700;color:#8b5cf6">Υδατάνθρακες: ${tot.c}g</div>
          <div style="font-size:11px;font-weight:700;color:#f59e0b">Λίπος: ${tot.f}g</div>
        </div>
      </div>
      <div style="height:6px;background:#e5e7eb;border-radius:3px;margin-bottom:12px">
        <div style="height:6px;width:${pct}%;background:${barColor};border-radius:3px"></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9.5px">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700;width:85px">ΓΕΥΜΑ</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700">ΣΥΝΤΑΓΗ / ΠΕΡΙΓΡΑΦΗ</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;color:#475569;font-weight:700;width:55px">KCAL</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700;width:130px">MACROS</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:#475569;font-weight:700;width:45px">ΩΡΑ</th>
          </tr>
        </thead>
        <tbody>${mealRows}${extraRow}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;border-top:2px solid #22c55e">
            <td colspan="2" style="padding:8px;font-weight:800;font-size:11px;color:#111">ΣΥΝΟΛΟ ΗΜΕΡΑΣ</td>
            <td style="padding:8px;font-weight:800;font-size:12px;color:#22c55e;text-align:right">${tot.kcal + extraKcal}</td>
            <td style="padding:8px;font-size:9.5px;color:#374151">Π:${tot.p}g · Υ:${tot.c}g · Λ:${tot.f}g</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  document.getElementById('print-view').innerHTML = html;
  showToast('⏳ Άνοιγμα εκτύπωσης...');
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
  const mealTypeLabel = { breakfast:'Πρωινό', snack:'Δεκατιανό', lunch:'Μεσημεριανό', afternoon:'Απογευματινό', dinner:'Βραδινό' };
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
      name = r.emoji + ' ' + r.name;
      kcal = mac.kcal;
      macStr = `Π:${mac.p}g / Υ:${mac.c}g / Λ:${mac.f}g`;
      const ingList = r.ingredients.map(ing => {
        const food = allFoodsForPrint.find(f => f.id === ing.foodId);
        if (!food) return '';
        let qty = ing.qty * (m.scaleFactor||1);
        if (food.unit === 'g') qty = Math.round(qty / 10) * 10;
        else qty = Math.round(qty);
        if (ing.foodId === 'f9' && food.unit === 'g') qty = 30;
        return food.name + ' ' + qty + food.unit;
      }).filter(Boolean).join(' · ');
      detailHtml = `<tr><td colspan="5" style="padding:1px 12px 4px;font-size:10px;color:#6b7280;line-height:1.5;white-space:normal;word-break:break-word">${ingList}</td></tr>`;
      if (r.instructions) {
        detailHtml += `<tr><td colspan="5" style="padding:1px 12px 7px;font-size:9.5px;color:#9ca3af;font-style:italic;line-height:1.5;white-space:normal;word-break:break-word">${r.instructions}</td></tr>`;
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
    ? `<tr style="background:#fef2f2"><td colspan="5" style="padding:8px 10px;font-size:10px;color:#ef4444;font-weight:700">⚠️ Επιπλέον εκτός πλάνου: +${extraKcal} kcal</td></tr>`
    : '';

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page { size: A4 portrait; margin: 10mm; }
    </style>
    <div style="padding:8mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:22px;font-weight:900;color:#111">${day.label}${dateLabel}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:3px">Στόχος: ${g.kcal} kcal · Πλάνο: ${tot.kcal} kcal (${pct}%)</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:900;color:#22c55e;letter-spacing:-1px;margin-bottom:4px">VIVON</div>
          <div style="font-size:13px;font-weight:700;color:#3b82f6">Πρωτεΐνη: ${tot.p}g</div>
          <div style="font-size:13px;font-weight:700;color:#8b5cf6">Υδατάνθρακες: ${tot.c}g</div>
          <div style="font-size:13px;font-weight:700;color:#f59e0b">Λίπος: ${tot.f}g</div>
        </div>
      </div>
      <div style="height:7px;background:#e5e7eb;border-radius:3px;margin-bottom:14px">
        <div style="height:7px;width:${pct}%;background:${barColor};border-radius:3px"></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700;width:95px">ΓΕΥΜΑ</th>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">ΣΥΝΤΑΓΗ / ΠΕΡΙΓΡΑΦΗ</th>
            <th style="padding:9px 10px;text-align:right;font-size:10.5px;color:#475569;font-weight:700;width:60px">KCAL</th>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700;width:140px">MACROS</th>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700;width:50px">ΩΡΑ</th>
          </tr>
        </thead>
        <tbody>${mealRows}${extraRow}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;border-top:2px solid #22c55e">
            <td colspan="2" style="padding:10px;font-weight:800;font-size:13px;color:#111">ΣΥΝΟΛΟ ΗΜΕΡΑΣ</td>
            <td style="padding:10px;font-weight:800;font-size:14px;color:#22c55e;text-align:right">${tot.kcal + extraKcal}</td>
            <td style="padding:10px;font-size:11px;color:#374151">Π:${tot.p}g · Υ:${tot.c}g · Λ:${tot.f}g</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  showToast('⏳ Άνοιγμα εκτύπωσης...');
  setTimeout(() => window.print(), 400);
}

function exportPDF_stats() {
  const g = state.goals;
  const DAYS_EL = ['Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ','Κυρ'];
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
      <td style="padding:8px 10px;font-size:11px;color:#6b7280">Π:${d.p}g Υ:${d.c}g Λ:${d.f}g</td>
      <td style="padding:8px 10px;font-size:11px;color:#6b7280">${d.day.stepsDone ? '👟 '+( d.day.stepsCount||8000).toLocaleString() : '—'} ${d.day.weightTraining ? '🏋️' : ''}</td>
      <td style="padding:8px 10px;font-size:12px;font-weight:700;color:${d.deficit>0?'#22c55e':'#ef4444'}">${d.deficit > 0 ? '-' : '+'}${Math.abs(Math.round(d.deficit))} kcal</td>
    </tr>`;
  }).join('');

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page { size: A4 portrait; margin: 10mm; }
    </style>
    <div style="padding:8mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:22px;font-weight:900;color:#111">Στατιστικά Εβδομάδας</div>
          <div style="font-size:12px;color:#6b7280;margin-top:3px">Αναλυτική αναφορά</div>
        </div>
        <div style="font-size:20px;font-weight:900;color:#22c55e;letter-spacing:-1px">VIVON</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
        <div style="background:#eff6ff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Μ.Ό. Kcal/ημέρα</div>
          <div style="font-size:22px;font-weight:900;color:#22c55e">${avgKcal.toLocaleString()}</div>
          <div style="font-size:10px;color:#9ca3af">Στόχος ${g.kcal||'—'}</div>
        </div>
        <div style="background:#eff6ff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Μ.Ό. Πρωτεΐνη</div>
          <div style="font-size:22px;font-weight:900;color:#3b82f6">${avgP}g</div>
          <div style="font-size:10px;color:#9ca3af">Στόχος ${g.protein||'—'}g</div>
        </div>
        <div style="background:${totalDeficit>0?'#f0fdf4':'#fef2f2'};border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Εβδ. Ισοζύγιο</div>
          <div style="font-size:22px;font-weight:900;color:${totalDeficit>0?'#22c55e':'#ef4444'}">${Math.abs(Math.round(totalDeficit))}</div>
          <div style="font-size:10px;color:#9ca3af">${totalDeficit>0?'kcal έλλειμμα':'kcal πλεόνασμα'}</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:18px">
        <div style="font-size:13px;font-weight:800;color:#111;margin-bottom:12px">Μέσος Όρος Μακροθρεπτικών</div>
        ${barRow('🥩 Πρωτεΐνη', avgP, g.protein||180, '#3b82f6')}
        ${barRow('🍚 Υδατάνθρακες', avgC, g.carbs||200, '#f59e0b')}
        ${barRow('🫒 Λίπη', avgF, g.fat||60, '#8b5cf6')}
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:18px">
        <div style="padding:12px 14px;font-size:13px;font-weight:800;color:#111;border-bottom:1px solid #e5e7eb">Ανά Ημέρα</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">ΗΜΕΡΑ</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">KCAL</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">%</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">MACROS</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">ΔΡΑΣΤΗΡΙΟΤΗΤΑ</th>
              <th style="padding:8px 10px;text-align:left;font-size:10.5px;color:#475569;font-weight:700">ΙΣΟΖΥΓΙΟ</th>
            </tr>
          </thead>
          <tbody>${dayRows}</tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#ecfeff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Βήματα (εβδ. kcal)</div>
          <div style="font-size:20px;font-weight:900;color:#06b6d4">${totalStepsKcal}</div>
          <div style="font-size:10px;color:#9ca3af">${stepsDoneDays}/7 ημέρες ✅</div>
        </div>
        <div style="background:#f5f3ff;border-radius:10px;padding:12px 14px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Γυμναστήριο (kcal)</div>
          <div style="font-size:20px;font-weight:900;color:#8b5cf6">${totalTrainingKcal}</div>
          <div style="font-size:10px;color:#9ca3af">${trainingDays}/7 προπονήσεις</div>
        </div>
      </div>
    </div>`;
  showToast('⏳ Άνοιγμα εκτύπωσης...');
  setTimeout(() => window.print(), 400);
}

function exportPDF_body() {
  const log = state.bodyLog || [];
  const p = state.profile;

  const logRows = log.length === 0
    ? '<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">Δεν υπάρχουν μετρήσεις</td></tr>'
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
    <div style="padding:8mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:3px solid #22c55e">
        <div>
          <div style="font-size:22px;font-weight:900;color:#111">Μετρήσεις Σώματος</div>
          <div style="font-size:12px;color:#6b7280;margin-top:3px">${p.name || ''}</div>
        </div>
        <div style="font-size:20px;font-weight:900;color:#22c55e;letter-spacing:-1px">VIVON</div>
      </div>

      ${latest ? `<div style="display:flex;gap:14px;margin-bottom:18px">
        <div style="background:#eff6ff;border-radius:10px;padding:12px 18px;text-align:center;flex:1">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Τελευταίο Βάρος</div>
          <div style="font-size:24px;font-weight:900;color:#3b82f6">${latest.weight} kg</div>
          <div style="font-size:10px;color:#9ca3af">${latest.date}</div>
        </div>
        ${latest.fat !== null && latest.fat !== undefined ? `<div style="background:#fef2f2;border-radius:10px;padding:12px 18px;text-align:center;flex:1">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">% Λίπους</div>
          <div style="font-size:24px;font-weight:900;color:#ef4444">${latest.fat}%</div>
        </div>` : ''}
        ${latest.muscle !== null && latest.muscle !== undefined ? `<div style="background:#f0fdf4;border-radius:10px;padding:12px 18px;text-align:center;flex:1">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">% Μυϊκής Μάζας</div>
          <div style="font-size:24px;font-weight:900;color:#16a34a">${latest.muscle}%</div>
        </div>` : ''}
      </div>` : ''}

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <div style="padding:12px 14px;font-size:13px;font-weight:800;color:#111;border-bottom:1px solid #e5e7eb">Ιστορικό Μετρήσεων</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">ΗΜΕΡΟΜΗΝΙΑ</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">ΒΑΡΟΣ</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">% ΛΙΠΟΥΣ</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;color:#475569;font-weight:700">% ΜΥΪΚΗΣ</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
    </div>`;
  showToast('⏳ Άνοιγμα εκτύπωσης...');
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
    const months = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
  }
  const weekRangePrint = getWeekRangePrint();

  const balColor = avgPctW >= 88 && avgPctW <= 108 ? '#22c55e' : avgPctW < 88 ? '#f59e0b' : '#ef4444';
  const balEmoji = avgPctW >= 88 && avgPctW <= 108 ? '😊' : avgPctW < 88 ? '😟' : '⚠️';
  const balLabel = avgPctW >= 88 && avgPctW <= 108 ? 'Πολύ καλή επιλογή!' : avgPctW < 88 ? 'Λίγο χαμηλά' : 'Λίγο ψηλά';
  const balSub   = avgPctW >= 88 && avgPctW <= 108 ? 'Συνέχισε έτσι' : avgPctW < 88 ? 'Αύξησε λίγο τις θερμίδες' : 'Προσπάθησε να μειώσεις';

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
      <text x="${cx}" y="${cy + size*0.14}" text-anchor="middle" font-size="${size*0.085}" fill="#9ca3af">Μέση</text>
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
    breakfast: { label:'Πρωινό',       color:'#f59e0b', bg:'#fffbeb', border:'#f59e0b' },
    snack:     { label:'Δεκατιανό',    color:'#10b981', bg:'#f0fdf4', border:'#10b981' },
    lunch:     { label:'Μεσημεριανό',  color:'#3b82f6', bg:'#eff6ff', border:'#3b82f6' },
    afternoon: { label:'Απογευματινό', color:'#06b6d4', bg:'#ecfeff', border:'#06b6d4' },
    dinner:    { label:'Βραδινό',      color:'#8b5cf6', bg:'#f5f3ff', border:'#8b5cf6' },
  };
  const dayNamesAllP = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
  function getPdfDayTitle(di) {
    if (!state.planStartDate) return `Ημ${di+1}`;
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
          name = sm.name; emoji = sm.emoji;
          kcal = Math.round(sm.kcal_est * (me.scaleFactor||1));
        } else {
          const r = allRecipes.find(x => x.id === me.recipeId);
          if (!r) return '';
          const mac = calcRecipeMacros(r, me.scaleFactor||1);
          name = r.name; emoji = r.emoji; kcal = mac.kcal;
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
        ${mealCards || '<div style="font-size:8px;color:#9ca3af;text-align:center;padding:8px 0">Κανένα γεύμα</div>'}
        ${allDone ? `<div style="margin-top:3px;text-align:center"><span style="font-size:7.5px;color:#22c55e;font-weight:700;background:#dcfce7;border-radius:20px;padding:1px 6px">✓ Ολοκλ.</span></div>` : ''}
      </div>
    </div>`;
  }).join('');

  const summaryPage = `
    <div style="padding:5mm 5mm 4mm;font-family:'Helvetica Neue',Arial,sans-serif;background:#f8fafc;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid #e5e7eb">
        <div>
          <div style="font-size:18px;font-weight:900;color:#111;letter-spacing:-0.5px">Εβδομαδιαίο Πρόγραμμα</div>
          <div style="font-size:9px;color:#6b7280;margin-top:1px">7 ημέρες · <strong style="color:#374151">${avgKcalW.toLocaleString()} kcal/ημέρα</strong> κατά μέσο όρο</div>
        </div>
        <div style="text-align:right">
          ${weekRangePrint ? `<div style="font-size:8px;color:#6b7280">${weekRangePrint}</div>` : ''}
          <div style="font-size:8px;color:#6b7280;margin-top:1px">${p.name || ''}</div>
          <div style="font-size:15px;font-weight:900;color:#22c55e;letter-spacing:-1px;margin-top:1px">VIVON</div>
        </div>
      </div>
      <div style="display:flex;align-items:stretch;gap:8px;margin-bottom:6px;background:#fff;border-radius:8px;padding:6px 10px;border:1px solid #e5e7eb">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;min-width:76px">
          ${printGauge(avgPctW, 66)}
          <div style="font-size:7px;font-weight:800;color:#111;margin-top:2px">Μέση πρόσληψη</div>
          <div style="font-size:10px;font-weight:900;color:#111">${avgKcalW.toLocaleString()} kcal</div>
          <div style="font-size:6.5px;color:#9ca3af">Στόχος: ${g.kcal.toLocaleString()} kcal</div>
        </div>
        <div style="width:1px;background:#f3f4f6;flex-shrink:0"></div>
        <div style="flex:1;padding:0 5px">
          <div style="font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Μακροθρεπτικά (μέσος όρος)</div>
          ${printMacroBar('Πρωτεΐνη', avgPW, g.protein || 160, '#3b82f6')}
          ${printMacroBar('Υδατάνθρακες', avgCW, g.carbs || 200, '#8b5cf6')}
          ${printMacroBar('Λίπος', avgFW, g.fat || 60, '#f59e0b')}
        </div>
        <div style="width:1px;background:#f3f4f6;flex-shrink:0"></div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:95px;text-align:center">
          <div style="font-size:7px;font-weight:800;color:${balColor};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px">Ισορροπία εβδομάδας</div>
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
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">Σύνολο εβδομάδας</div>
          <div style="font-size:10px;font-weight:900;color:#111">${totalKcalW.toLocaleString()} kcal</div>
          <div style="font-size:6.5px;color:#9ca3af">Μέσ. ${avgKcalW.toLocaleString()} kcal/ημ.</div>
        </div>
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">🌿</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">Ποικιλία τροφών</div>
          <div style="font-size:10px;font-weight:900;color:#111">${uniqueFoodsW.size} διαφ. τρόφιμα</div>
          <div style="font-size:6.5px;color:${uniqueFoodsW.size >= 30 ? '#22c55e' : '#f59e0b'}">${uniqueFoodsW.size >= 30 ? 'Καλή ποικιλία!' : 'Δοκίμασε περισσότερα'}</div>
        </div>
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">💧</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">Ενυδάτωση</div>
          <div style="font-size:10px;font-weight:900;color:#111">${(state.profile.weight * 0.035).toFixed(1)}L νερό</div>
          <div style="font-size:6.5px;color:#9ca3af">Στόχος: ${Math.round(state.profile.weight * 35)}ml/ημ.</div>
        </div>
        <div style="background:#fff;border-radius:6px;border:1px solid #e5e7eb;padding:6px 8px;text-align:center">
          <div style="font-size:12px;margin-bottom:1px">🎯</div>
          <div style="font-size:6.5px;color:#9ca3af;margin-bottom:1px">Πρόοδος στόχου</div>
          <div style="font-size:10px;font-weight:900;color:${parseFloat(weightChangeW) <= 0 ? '#22c55e' : '#ef4444'}">${parseFloat(weightChangeW) > 0 ? '+' : ''}${weightChangeW} kg</div>
          <div style="font-size:6.5px;color:#9ca3af">Αυτή την εβδομάδα</div>
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
  showToast('⏳ Άνοιγμα εκτύπωσης...');
  setTimeout(() => window.print(), 400);
}

// ── NAVIGATION & UTILITIES ──
function navigateTo(tab) {
  // Map legacy tabs to new structure
  const legacyMap = { profile: 'settings', optimize: 'settings', recipes: 'ideas', foods: 'ideas' };
  if (legacyMap[tab]) tab = legacyMap[tab];

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
  if (tab === 'builder')  { state._builderFilter = 'breakfast'; renderBuilderPage('breakfast'); }
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
      <div class="ideas-tabs-bar">
        <div class="segment">
          <button class="seg-btn active" id="ideas-tab-recipes" onclick="showIdeasTab('recipes')">📖 Συνταγές</button>
          <button class="seg-btn" id="ideas-tab-foods" onclick="showIdeasTab('foods')">🥦 Τρόφιμα</button>
        </div>
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
  const DAYS_EL = ['Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ','Κυρ'];
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
        <span>Χρειάζονται τουλάχιστον 2 μετρήσεις για διάγραμμα</span>
       </div>`
    : `<div style="margin-top:10px">${renderBodyChart(log)}</div>`;
  const dateChip = latest
    ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;border-radius:20px;padding:5px 12px;font-size:0.78rem;color:#374151;font-weight:500;margin-top:6px">
        <span>📅</span><span>${fmtDateGr(latest.date)}</span>
       </div>` : '';

  el.innerHTML = `
    <div class="container fade-in" style="padding-top:14px;display:flex;flex-direction:column;gap:14px;padding-bottom:20px">

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="macro-card">
          <div class="macro-card-label">Μ.Ό. Kcal/ημ</div>
          <div class="macro-card-value" style="color:var(--green-d)">${avgKcal}</div>
          <div class="macro-card-sub">Στόχος ${goals.kcal || '—'}</div>
        </div>
        <div class="macro-card">
          <div class="macro-card-label">Μ.Ό. Πρωτεΐνη</div>
          <div class="macro-card-value" style="color:var(--blue)">${avgP}g</div>
          <div class="macro-card-sub">Στόχος ${goals.protein || '—'}g</div>
        </div>
        <div class="macro-card">
          <div class="macro-card-label">Εβδ. Ισοζύγιο</div>
          <div class="macro-card-value" style="color:${totalDeficit>0?'var(--green-d)':'var(--red)'}">${Math.abs(Math.round(totalDeficit))}</div>
          <div class="macro-card-sub">${totalDeficit>0?'kcal έλλειμμα':'kcal πλεόνασμα'}</div>
        </div>
      </div>

      <!-- Kcal bar chart -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3>Θερμίδες ανά ημέρα</h3>
          <span style="font-size:0.72rem;color:var(--text3)">Στόχος: ${goals.kcal||'—'} kcal</span>
        </div>
        <div style="display:flex;gap:5px;align-items:flex-end">
          ${barsHtml}
        </div>
      </div>

      <!-- Macros avg -->
      <div class="card">
        <h3 style="margin-bottom:12px">Μέσος Όρος Μακροθρεπτικών</h3>
        ${[
          { lbl:'🥩 Πρωτεΐνη', val:avgP, goal: goals.protein||180, color:'var(--blue)' },
          { lbl:'🍚 Υδατάνθρακες', val:avgC, goal: goals.carbs||200, color:'var(--amber)' },
          { lbl:'🫒 Λίπη', val:avgF, goal: goals.fat||60, color:'var(--purple)' },
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
          <div class="macro-card-label">Βήματα (εβδ. kcal)</div>
          <div class="macro-card-value" style="color:var(--cyan)">${totalStepsKcal}</div>
          <div class="macro-card-sub">${stepsDoneDays}/7 ημέρες ✅</div>
        </div>
        <div class="macro-card">
          <div class="macro-card-label">Γυμναστήριο (kcal)</div>
          <div class="macro-card-value" style="color:var(--purple)">${totalTrainingKcal}</div>
          <div class="macro-card-sub">${trainingDays}/7 προπονήσεις</div>
        </div>
      </div>

      <!-- Body measurements chart -->
      <div class="card">
        <h3 style="margin-bottom:12px">Εξέλιξη Σώματος</h3>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          ${bodyStatCard('#eff6ff','⚖️',weightVal,'Βάρος','#3b82f6')}
          ${bodyStatCard('#fef2f2','🩸',fatVal,'Λίπος','#ef4444')}
          ${bodyStatCard('#f0fdf4','💪',muscleVal,'Μυϊκή μάζα','#16a34a')}
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

function _settingsSaveBtn(id) {
  return `<button id="${id}" class="btn btn-primary" style="width:100%;padding:13px;font-size:0.97rem;font-weight:700;border-radius:12px" onclick="saveSettingsToCloud()">💾 Αποθήκευση ρυθμίσεων</button>`;
}

function renderSettingsPage() {
  const el = document.getElementById('page-settings');
  if (!el) return;
  el.innerHTML = `
    <div class="container fade-in" style="padding-top:14px">
      <div class="segment" style="margin-top:0">
        <button class="seg-btn active" id="settings-tab-profile" onclick="showSettingsTab('profile')">👤 Προφίλ</button>
        <button class="seg-btn" id="settings-tab-optimize" onclick="showSettingsTab('optimize')">⚡ Βελτίωση</button>
        <button class="seg-btn" id="settings-tab-supplements" onclick="showSettingsTab('supplements')">💊 Συμπληρώματα</button>
      </div>
      <div id="settings-profile-content"></div>
      <div id="settings-optimize-content" style="display:none"></div>
      <div id="settings-supplements-content" style="display:none"></div>
      ${_settingsSaveBtn('settings-save-bottom')}
    </div>`;
  renderProfileInto(document.getElementById('settings-profile-content'));
  renderOptimizeInto(document.getElementById('settings-optimize-content'));
  renderSettingsSupplements();
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
            <div style="font-size:0.9rem;font-weight:700">Συμπληρώματα διατροφής</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">Ενεργοποίησε για να εμφανίζονται στην ημερήσια σελίδα</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSuppFeature(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      ${enabled ? `
      <div style="font-size:0.72rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Επίλεξε τα συμπληρώματά σου</div>
      ${SUPPLEMENTS_LIBRARY.map(s => {
        const isActive = activeIds.includes(s.id);
        return `<div class="card card-sm" style="margin-bottom:8px;padding:10px 14px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:0.88rem;font-weight:700">${s.name}</div>
              <div style="font-size:0.7rem;color:var(--text3);margin-top:1px">${s.timing} · ${s.qty}</div>
              <div style="font-size:0.68rem;margin-top:3px">${s.ideal}</div>
            </div>
            <label class="toggle-switch" style="flex-shrink:0">
              <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleSuppActive('${s.id}')">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>`;
      }).join('')}` : ''}
    </div>`;
}

function showSettingsTab(which) {
  ['profile','optimize','supplements'].forEach(t => {
    const btn = document.getElementById('settings-tab-' + t);
    const content = document.getElementById('settings-' + t + '-content');
    if (btn) btn.classList.toggle('active', t === which);
    if (content) content.style.display = t === which ? '' : 'none';
  });
}

async function saveSettingsToCloud() {
  const btns = ['settings-save-top', 'settings-save-bottom'];
  btns.forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = true; b.textContent = 'Αποθήκευση...'; }
  });
  try {
    await syncToSupabase();
    showToast('✅ Οι ρυθμίσεις αποθηκεύτηκαν!', 2500);
  } catch (e) {
    showToast('❌ Σφάλμα αποθήκευσης. Δοκιμάστε ξανά.', 3000);
  } finally {
    btns.forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = false; b.innerHTML = '💾 Αποθήκευση ρυθμίσεων'; }
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
function renderProfileInto(el)  { _renderInto(el, 'page-profile',  renderProfile);  }
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
  await loadState();
  checkWeekReset();
  updateSidebarAvatar();

  // Update sidebar + drawer with signed-in user's name or email
  const user = sbGetCurrentUser();
  if (user) {
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = state.profile.name || user.email || 'Χρήστης';
    const dName  = document.getElementById('drawer-user-name');
    const dEmail = document.getElementById('drawer-user-email');
    if (dName)  dName.textContent  = state.profile.name || user.email || 'Χρήστης';
    if (dEmail) dEmail.textContent = user.email || '';
  }

  document.querySelectorAll('.tab-item, .sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      navigateTo(tab);
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
  const savedTab = state.activeTab || 'today';
  navigateTo(legacyMap[savedTab] || savedTab);

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

/* ── SIDE DRAWER ── */
function openDrawer() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  updateDrawerUser();
  drawer.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function switchTabFromDrawer(tab) {
  closeDrawer();
  navigateTo(tab);
  // Sync active state in drawer items
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
  if (nameEl) nameEl.textContent = (p && p.name) || (user && user.email) || 'Χρήστης';
  if (emailEl) emailEl.textContent = (user && user.email) || '';
}
