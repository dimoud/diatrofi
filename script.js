// ============================================================
// script.js — Main application logic
// ============================================================

// ── STATE ──
let state = {
  profile: { ...DEFAULT_PROFILE },
  goals: { ...DEFAULT_GOALS },
  week: JSON.parse(JSON.stringify(DEFAULT_WEEK)),
  currentDay: 0,
  supplements: JSON.parse(JSON.stringify(SUPPLEMENTS_DEFAULT)),
  favorites: [],
  customFoods: [],
  customRecipes: [],
  dayTemplates: [],
  activeTab: 'today',
  optimizeMode: 1,
};

// ── LOCALSTORAGE ──
function saveState() {
  try { localStorage.setItem('nutriApp_v2', JSON.stringify(state)); } catch(e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem('nutriApp_v2');
    if (raw) {
      const saved = JSON.parse(raw);
      // Deep merge profile so new keys (weight, height, etc.) survive old saves
      state = {
        ...state,
        ...saved,
        profile: { ...state.profile, ...(saved.profile || {}) },
        goals:   { ...state.goals,   ...(saved.goals   || {}) },
      };
    }
  } catch(e) {}
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

function calcBMR(p) {
  if (p.useCustomBMR && p.customBMR > 0) return p.customBMR;
  // Harris-Benedict (αναθεωρημένη)
  if (p.gender === 'male') {
    return Math.round(88.362 + (13.397 * p.weight) + (4.799 * p.height) - (5.677 * p.age));
  } else {
    return Math.round(447.593 + (9.247 * p.weight) + (3.098 * p.height) - (4.330 * p.age));
  }
}

function calcTDEE(p) {
  return Math.round(calcBMR(p) * (p.activity || 1.55));
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
  const tdee = calcTDEE(p);
  const idealProt = calcIdealProtein(p.weight);
  const deficit = tdee - g.kcal;

  const activityLabels = {
    1.2:  'Καθιστική ζωή',
    1.375:'Ελαφριά δραστηριότητα (1–2x/εβδ.)',
    1.55: 'Μέτρια δραστηριότητα (3–5x/εβδ.)',
    1.725:'Έντονη δραστηριότητα (6–7x/εβδ.)',
    1.9:  'Πολύ έντονη (2x/ημέρα)',
  };

  document.getElementById('page-profile').innerHTML = `
    <div class="container" style="padding-top:16px;padding-bottom:24px">

      <!-- AVATAR + NAME -->
      <div class="card card-lg fade-in" style="text-align:center;padding:28px 20px 22px">
        <div style="position:relative;display:inline-block;margin-bottom:14px">
          <div id="profile-avatar" style="width:100px;height:100px;border-radius:50%;background:var(--green-bg);display:flex;align-items:center;justify-content:center;font-size:2.6rem;margin:0 auto;overflow:hidden;border:3px solid var(--green);cursor:pointer" onclick="triggerPhotoUpload()">
            ${p.photoUrl
              ? `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover" alt="photo">`
              : '👤'}
          </div>
          <button onclick="triggerPhotoUpload()" style="position:absolute;bottom:0;right:0;background:var(--green-d);color:white;border:none;border-radius:50%;width:28px;height:28px;font-size:0.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center">📷</button>
        </div>
        <input type="file" id="photo-input" accept="image/*" style="display:none" onchange="handlePhotoUpload(this)">

        <input type="text" id="prof-name"
          value="${p.name || ''}"
          placeholder="Το όνομά σου..."
          style="font-size:1.3rem;font-weight:700;border:none;border-bottom:2px solid var(--border);background:transparent;text-align:center;width:100%;padding:4px 8px;margin-bottom:6px;outline:none;color:var(--text)"
          oninput="liveUpdateName(this.value)">
        <div style="font-size:0.8rem;color:var(--text3)">Πάτα για επεξεργασία</div>
      </div>

      <!-- ΒΑΡΟΣ / ΥΨΟΣ / ΗΛΙΚΙΑ -->
      <div class="card card-lg fade-in" style="margin-top:14px">
        <div class="section-title">📏 Σωματικά Στοιχεία</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
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
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Ηλικία</label>
            <input type="number" id="prof-age" value="${p.age}" step="1" min="15" max="100"
              style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:var(--bg2)"
              oninput="liveUpdateProfile()">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Φύλο</label>
            <select id="prof-gender" style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;background:var(--bg2)" onchange="liveUpdateProfile()">
              <option value="male"   ${p.gender==='male'?'selected':''}>Άνδρας</option>
              <option value="female" ${p.gender==='female'?'selected':''}>Γυναίκα</option>
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:0.75rem">Επίπεδο Δραστηριότητας</label>
            <select id="prof-activity" style="width:100%;padding:10px 8px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.85rem;background:var(--bg2)" onchange="liveUpdateProfile()">
              ${Object.entries(activityLabels).map(([val, lbl]) =>
                `<option value="${val}" ${parseFloat(p.activity)===parseFloat(val)?'selected':''}>${lbl}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- BMI / BMR / TDEE -->
      <div class="card card-lg fade-in" style="margin-top:14px" id="profile-stats-card">
        <div class="section-title">📊 Στατιστικά</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:12px;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:${bmiCol}">${bmi}</div>
            <div style="font-size:0.68rem;color:${bmiCol};font-weight:600">${bmiLbl}</div>
            <div style="font-size:0.63rem;color:var(--text3);margin-top:2px">BMI</div>
          </div>
          <div style="background:${p.useCustomBMR?'#dbeafe':'var(--bg2)'};border-radius:var(--radius-sm);padding:12px;text-align:center;border:${p.useCustomBMR?'2px solid #3b82f6':'1px solid transparent'}">
            <div style="font-size:1.6rem;font-weight:800;color:#3b82f6">${bmr}</div>
            <div style="font-size:0.68rem;color:#3b82f6;font-weight:600">${p.useCustomBMR?'Μετρημένος':'Εκτιμώμενος'}</div>
            <div style="font-size:0.63rem;color:var(--text3);margin-top:2px">BMR kcal</div>
          </div>
          <div style="background:var(--amber-bg);border-radius:var(--radius-sm);padding:12px;text-align:center">
            <div style="font-size:1.6rem;font-weight:800;color:var(--amber)">${tdee}</div>
            <div style="font-size:0.68rem;color:var(--amber);font-weight:600">Συντήρηση</div>
            <div style="font-size:0.63rem;color:var(--text3);margin-top:2px">TDEE kcal</div>
          </div>
        </div>

        <!-- Custom BMR toggle -->
        <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div>
              <div style="font-size:0.8rem;font-weight:700">Μετρημένος BMR</div>
              <div style="font-size:0.7rem;color:var(--text3)">Από μέτρηση (π.χ. InBody)</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="prof-use-bmr" ${p.useCustomBMR?'checked':''} onchange="toggleCustomBMR(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" id="prof-custom-bmr" value="${p.customBMR||2100}" min="800" max="5000" step="10"
              ${!p.useCustomBMR?'disabled':''}
              style="flex:1;padding:8px 10px;border:2px solid ${p.useCustomBMR?'var(--blue)':'var(--border)'};border-radius:var(--radius-sm);font-size:1rem;font-weight:700;text-align:center;background:${p.useCustomBMR?'#fff':'var(--bg2)'};color:${p.useCustomBMR?'var(--text)':'var(--text3)'}"
              oninput="updateCustomBMR(this.value)">
            <span style="font-size:0.82rem;color:var(--text2);white-space:nowrap">kcal/ημέρα</span>
          </div>
        </div>

        <div style="background:${deficit>0?'#fef3c7':'#dcfce7'};border-radius:var(--radius-sm);padding:12px;font-size:0.82rem;color:var(--text2)">
          ${deficit > 0
            ? `⚡ Έλλειμμα <strong>${deficit} kcal/ημέρα</strong> · ~<strong>${(deficit*7/7700).toFixed(2)} kg/εβδ.</strong> απώλεια`
            : deficit < 0
              ? `📈 Υπέρβαση <strong>${Math.abs(deficit)} kcal</strong> από συντήρηση`
              : `✅ Ισορροπία — ακριβώς στο TDEE`}
        </div>
      </div>

      <!-- ΣΤΟΧΟΙ -->
      <div class="card card-lg fade-in" style="margin-top:14px">
        <div class="section-title">🎯 Ημερήσιοι Στόχοι</div>

        <div style="margin-bottom:12px">
          <div class="slider-label" style="margin-bottom:4px"><span>🔥 Θερμίδες</span><strong id="prof-kcal-val">${g.kcal} kcal</strong></div>
          <input type="range" id="prof-kcal" min="1200" max="3500" step="50" value="${g.kcal}"
            oninput="updateGoalFromProfile('kcal',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text3)">
            <span>1200</span><span style="color:var(--amber)">TDEE: ${tdee}</span><span>3500</span>
          </div>
        </div>

        <div style="margin-bottom:12px">
          <div class="slider-label" style="margin-bottom:4px"><span>🥩 Πρωτεΐνη</span><strong id="prof-prot-val">${g.protein}g</strong></div>
          <input type="range" id="prof-prot" min="60" max="300" step="5" value="${g.protein}"
            oninput="updateGoalFromProfile('protein',this.value)" style="width:100%">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text3)">
            <span>60g</span><span style="color:var(--blue)">Συν. 1.9g/kg: ${idealProt}g</span><span>300g</span>
          </div>
        </div>

        <div style="margin-bottom:12px">
          <div class="slider-label" style="margin-bottom:4px"><span>🍚 Υδατάνθρακες</span><strong id="prof-carb-val">${g.carbs}g</strong></div>
          <input type="range" id="prof-carb" min="30" max="500" step="5" value="${g.carbs}"
            oninput="updateGoalFromProfile('carbs',this.value)" style="width:100%">
        </div>

        <div style="margin-bottom:16px">
          <div class="slider-label" style="margin-bottom:4px"><span>🫒 Λίπος</span><strong id="prof-fat-val">${g.fat}g</strong></div>
          <input type="range" id="prof-fat" min="20" max="200" step="5" value="${g.fat}"
            oninput="updateGoalFromProfile('fat',this.value)" style="width:100%">
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-green" style="flex:1" onclick="applyTDEEGoal()">⚡ Auto από TDEE</button>
          <button class="btn btn-ghost" style="flex:1" onclick="saveProfile()">💾 Αποθήκευση</button>
        </div>
      </div>

      <!-- ΗΜΕΡΟΛΟΓΙΟ ΕΝΑΡΞΗΣ ΠΛΑΝΟΥ -->
      <div class="card card-lg fade-in" style="margin-top:14px">
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

      <!-- ΣΥΝΟΠΤΙΚΟ ΕΒΔΟΜΑΔΙΑΙΟ PDF -->
      <div class="card card-lg fade-in" style="margin-top:14px">
        <div class="section-title">🖨️ Εκτύπωση</div>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">Συνοπτική εβδομαδιαία προβολή: ημέρες, γεύματα, θερμίδες, macros.</p>
        <button class="btn btn-blue btn-full" onclick="exportPDF()">🖨️ Εκτύπωση / Αποθήκευση PDF</button>
      </div>

    </div>`;
}

function liveUpdateName(val) {
  state.profile.name = val;
  document.getElementById('top-app-title').textContent = val ? `🥗 ${val}` : '🥗 Vivon';
  saveState();
}

function liveUpdateProfile() {
  const p = state.profile;
  p.weight   = parseFloat(document.getElementById('prof-weight').value) || p.weight;
  p.height   = parseFloat(document.getElementById('prof-height').value) || p.height;
  p.age      = parseInt(document.getElementById('prof-age').value)      || p.age;
  p.gender   = document.getElementById('prof-gender').value;
  p.activity = parseFloat(document.getElementById('prof-activity').value);
  saveState();

  // Re-render stats card only
  const bmi = calcBMI(p.weight, p.height);
  const { label: bmiLbl, color: bmiCol } = bmiLabel(parseFloat(bmi));
  const tdee = calcTDEE(p);
  const deficit = tdee - state.goals.kcal;
  const card = document.getElementById('profile-stats-card');
  if (card) {
    card.querySelector('div[style*="grid"]').innerHTML = `
      <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:${bmiCol}">${bmi}</div>
        <div style="font-size:0.75rem;color:${bmiCol};font-weight:600">${bmiLbl}</div>
        <div style="font-size:0.7rem;color:var(--text3);margin-top:2px">BMI</div>
      </div>
      <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:var(--amber)">${tdee}</div>
        <div style="font-size:0.75rem;color:var(--amber);font-weight:600">kcal/ημέρα</div>
        <div style="font-size:0.7rem;color:var(--text3);margin-top:2px">TDEE (Συντήρηση)</div>
      </div>`;
  }
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

function toggleCustomBMR(val) {
  state.profile.useCustomBMR = val;
  saveState();
  renderProfile();
}

function updateCustomBMR(val) {
  const v = parseInt(val);
  if (v > 500) {
    state.profile.customBMR = v;
    saveState();
    // Live update BMR/TDEE display
    const bmr  = calcBMR(state.profile);
    const tdee = calcTDEE(state.profile);
    const bmrEl = document.querySelector('#profile-stats-card .bmr-val');
    if (bmrEl) bmrEl.textContent = bmr;
  }
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
  const map = { breakfast: ['Πρωινό','pill-breakfast'], lunch: ['Μεσημεριανό','pill-lunch'], dinner: ['Βραδινό','pill-dinner'], snack: ['Προάριστο','pill-snack'], afternoon: ['Απογευματινό','pill-afternoon'] };
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
        <div class="recipe-instructions">${recipe.instructions}</div>`;
    }

    mealsHtml += `
      <div class="meal-card ${meal.done ? 'done-card' : ''} fade-in" data-mi="${mi}">
        <div class="meal-card-header">
          <div class="meal-emoji">${emoji}</div>
          <div class="meal-meta">
            <div class="meal-time-badge">🕐 ${meal.time}</div>
            <div class="meal-name">${name}</div>
            ${mealTypePill(meal.type)}
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
          <div class="big-num">${remaining.kcal}</div>
          <div class="sub">kcal · Φαγώθηκαν: ${doneMacros.kcal} / ${goals.kcal}</div>
        </div>
        <div class="kcal-ring">
          ${ring(kcalPct)}
          <div class="kcal-ring-label">${kcalPct}%</div>
        </div>
      </div>

      <!-- Macros Dashboard -->
      <div class="dashboard-grid fade-in">
        <div class="macro-card">
          <div class="macro-card-label">Πρωτεΐνη</div>
          <div class="macro-card-value" style="color:#3b82f6">${doneMacros.p}g</div>
          <div class="macro-card-sub">Στόχος: ${goals.protein}g · Απομένουν: ${remaining.p}g</div>
          ${macroBar(doneMacros.p, goals.protein, '#3b82f6')}
        </div>
        <div class="macro-card">
          <div class="macro-card-label">Υδατάνθρακες</div>
          <div class="macro-card-value" style="color:#8b5cf6">${doneMacros.c}g</div>
          <div class="macro-card-sub">Στόχος: ${goals.carbs}g · Απομένουν: ${remaining.c}g</div>
          ${macroBar(doneMacros.c, goals.carbs, '#8b5cf6')}
        </div>
        <div class="macro-card">
          <div class="macro-card-label">Λίπος</div>
          <div class="macro-card-value" style="color:#f59e0b">${doneMacros.f}g</div>
          <div class="macro-card-sub">Στόχος: ${goals.fat}g · Απομένουν: ${remaining.f}g</div>
          ${macroBar(doneMacros.f, goals.fat, '#f59e0b')}
        </div>
        <div class="macro-card">
          <div class="macro-card-label">Κατανάλωση</div>
          <div class="macro-card-value" style="color:#22c55e">${doneMacros.kcal}</div>
          <div class="macro-card-sub">kcal · ${day.meals.filter(m=>m.done).length}/${day.meals.length} γεύματα</div>
          ${macroBar(doneMacros.kcal, effectiveKcal, '#22c55e')}
        </div>
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

      <!-- Kcal ημέρας override -->
      <div class="card card-sm fade-in" style="display:flex;align-items:center;gap:10px;padding:10px 14px">
        <span style="font-size:0.8rem;color:var(--text2);white-space:nowrap">🎯 Kcal ημέρας:</span>
        <input type="number" id="day-kcal-input" value="${effectiveKcal}" min="800" max="4000" step="50"
          style="width:80px;border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:0.9rem;font-weight:700;color:var(--text1);background:var(--bg2);text-align:center"
          onchange="saveDayKcalGoal(this.value)">
        ${day.kcalGoal ? `<span style="font-size:0.72rem;color:#f59e0b">✏️ τροποποιημένο</span>
          <button class="btn btn-ghost btn-sm" onclick="saveDayKcalGoal(0)" style="font-size:0.72rem">↺</button>` : `<span style="font-size:0.72rem;color:var(--text3)">default ${goals.kcal}</span>`}
      </div>

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
      <button class="btn btn-ghost btn-full" style="margin-bottom:14px" onclick="openAddMealModal()">➕ Προσθήκη Γεύματος</button>

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
      <div class="card fade-in">
        <div class="section-title">💊 Συμπληρώματα & Ρουτίνα</div>
        ${state.supplements.map((s,si) => `
          <div class="supp-item">
            <button class="supp-check ${s.done?'checked':''}" onclick="toggleSupp(${si})">${s.done?'✓':''}</button>
            <span class="supp-time">${s.time}</span>
            <div class="supp-info">
              <div class="supp-name">${s.name}</div>
              <div class="supp-note">${s.note}</div>
            </div>
            ${s.qty ? `<span class="supp-qty">${s.qty}</span>` : ''}
          </div>`).join('')}
        <div style="margin-top:12px;font-size:0.72rem;color:var(--text3)">
          ⚠️ Μαγνήσιο + Ψευδάργυρος μακριά από ασβέστιο. D3 με λιπαρό γεύμα.
        </div>
      </div>
    </div>`;
}

// ── PAGE: WEEK ──
function renderWeek() {
  const allR = [...RECIPES_DB, ...state.customRecipes];
  const mealOrder = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealMeta = {
    breakfast:  { label:'Πρωινό',        color:'#f59e0b', bg:'#fffbeb', icon:'☀️' },
    snack:      { label:'Προάριστο',      color:'#10b981', bg:'#f0fdf4', icon:'🥐' },
    lunch:      { label:'Μεσημεριανό',    color:'#3b82f6', bg:'#eff6ff', icon:'🥗' },
    afternoon:  { label:'Απογευματινό',   color:'#06b6d4', bg:'#ecfeff', icon:'☕' },
    dinner:     { label:'Βραδινό',        color:'#8b5cf6', bg:'#f5f3ff', icon:'🌙' },
  };

  const cols = state.week.map((day, di) => {
    const m = calcDayMacros(di);
    const pct = Math.round((m.kcal / state.goals.kcal) * 100);
    const allDone = day.meals.length > 0 && day.meals.every(me => me.done);
    const extraKcal = day.extraKcal || 0;
    const hasExtra = extraKcal > 0;
    const barColor = pct > 105 ? '#ef4444' : pct > 95 ? '#22c55e' : '#f59e0b';
    const borderColor = allDone ? 'var(--green)' : hasExtra ? '#ef4444' : 'var(--border)';
    const dateStr = state.planStartDate ? `<div style="font-size:0.65rem;color:var(--text3);margin-top:1px">${formatPlanDay(di)}</div>` : '';

    // Ομαδοποίηση ανά τύπο γεύματος
    const byType = {};
    day.meals.forEach(me => {
      if (!byType[me.type]) byType[me.type] = [];
      byType[me.type].push(me);
    });

    const mealSections = mealOrder.map(type => {
      const meals = byType[type];
      if (!meals || meals.length === 0) return '';
      const meta = mealMeta[type] || { label: type, color:'#6b7280', bg:'#f9fafb', icon:'🍽️' };

      const lines = meals.map(me => {
        let name = '', kcal = 0;
        if (me.standardId) {
          const sm = STANDARD_MEALS.find(s => s.id === me.standardId);
          if (!sm) return '';
          name = sm.emoji + ' ' + sm.name;
          kcal = Math.round(sm.kcal_est * (me.scaleFactor||1));
        } else {
          const r = allR.find(x => x.id === me.recipeId);
          if (!r) return '';
          const mac = calcRecipeMacros(r, me.scaleFactor||1);
          name = r.emoji + ' ' + r.name;
          kcal = mac.kcal;
        }
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;padding:2px 0">
          <span style="font-size:0.7rem;color:var(--text1);line-height:1.35;word-break:break-word;flex:1;font-weight:600">${name}</span>
          <span style="font-size:0.68rem;color:${meta.color};font-weight:700;white-space:nowrap">${kcal}</span>
        </div>`;
      }).filter(Boolean).join('');

      if (!lines) return '';

      // Σύνολο kcal του τύπου
      const typeKcal = meals.reduce((acc, me) => {
        if (me.standardId) {
          const sm = STANDARD_MEALS.find(s => s.id === me.standardId);
          return acc + (sm ? Math.round(sm.kcal_est * (me.scaleFactor||1)) : 0);
        }
        const r = allR.find(x => x.id === me.recipeId);
        return acc + (r ? calcRecipeMacros(r, me.scaleFactor||1).kcal : 0);
      }, 0);

      return `<div style="margin-bottom:6px;background:${meta.bg};border-radius:6px;padding:5px 7px;border-left:3px solid ${meta.color}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
          <span style="font-size:0.62rem;font-weight:800;color:${meta.color};text-transform:uppercase;letter-spacing:0.03em">${meta.icon} ${meta.label}</span>
          <span style="font-size:0.62rem;font-weight:700;color:${meta.color}">${typeKcal} kcal</span>
        </div>
        ${lines}
      </div>`;
    }).join('');

    return `<div class="week-col-card" style="border:2px solid ${borderColor};border-radius:var(--radius);padding:10px;cursor:pointer;min-width:0" onclick="goToDay(${di})">
      <div style="font-weight:800;font-size:0.85rem;color:var(--text1)">${day.label.replace('Ημέρα ','Ημ.')}</div>
      ${dateStr}
      <div style="height:4px;background:var(--border);border-radius:2px;margin:6px 0 3px">
        <div style="height:4px;width:${Math.min(pct,100)}%;background:${barColor};border-radius:2px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <span style="font-size:0.8rem;font-weight:800;color:${barColor}">${m.kcal} kcal <span style="font-size:0.62rem;font-weight:600">(${pct}%)</span></span>
        <span style="font-size:0.6rem;color:var(--text3)">Π:${m.p}g Υ:${m.c}g Λ:${m.f}g</span>
      </div>
      ${mealSections || '<div style="font-size:0.65rem;color:var(--text3)">Κανένα γεύμα</div>'}
      ${hasExtra ? `<div style="margin-top:4px;font-size:0.62rem;color:#ef4444;font-weight:700">⚠️ +${extraKcal} kcal εκτός</div>` : ''}
      ${allDone ? `<div style="margin-top:4px;font-size:0.62rem;color:var(--green);font-weight:700">✓ Ολοκληρώθηκε</div>` : ''}
    </div>`;
  }).join('');

  document.getElementById('page-week').innerHTML = `
    <div style="padding:16px 16px 24px;max-width:1400px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2>📅 Εβδομαδιαίο</h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="exportPDF()">📄 PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="copyDay()">📋 Αντιγραφή</button>
        </div>
      </div>
      <div class="week-overview-grid">${cols}</div>
    </div>`;
}

// ── PAGE: RECIPES ──
function renderRecipes(filter = '') {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const mealTypes = ['breakfast','snack','lunch','afternoon','dinner'];
  const mealLabels = { breakfast:'☀️ Πρωινά', snack:'🥐 Προάριστο', lunch:'🥗 Μεσημεριανά', afternoon:'☕ Απογευματινό', dinner:'🌙 Βραδινά' };

  let html = `
    <div class="container">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2>📖 Συνταγές</h2>
        <button class="btn btn-green btn-sm" onclick="openAddRecipeModal()">➕ Νέα</button>
      </div>
      <div class="search-wrap"><span class="search-icon">🔍</span>
        <input type="text" placeholder="Αναζήτηση συνταγής..." value="${filter}" oninput="renderRecipes(this.value)">
      </div>
      <div class="segment">
        <button class="seg-btn active" onclick="filterRecipeType('all',this)">Όλες</button>
        <button class="seg-btn" onclick="filterRecipeType('breakfast',this)">Πρωινά</button>
        <button class="seg-btn" onclick="filterRecipeType('snack',this)">Προάριστο</button>
        <button class="seg-btn" onclick="filterRecipeType('lunch',this)">Μεσ/νά</button>
        <button class="seg-btn" onclick="filterRecipeType('afternoon',this)">Απογ/νό</button>
        <button class="seg-btn" onclick="filterRecipeType('dinner',this)">Βραδινά</button>
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
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
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
    <div class="container">
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

      <!-- Goals sliders -->
      <div class="card card-lg fade-in">
        <div class="section-title">🎯 Ημερήσιοι Στόχοι</div>
        <div class="slider-row">
          <div class="slider-label"><span>🔥 Θερμίδες</span><strong id="sl-kcal-val">${g.kcal} kcal</strong></div>
          <input type="range" id="sl-kcal" min="1200" max="3500" step="50" value="${g.kcal}" oninput="updateGoal('kcal',this.value)">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>🥩 Πρωτεΐνη</span><strong id="sl-prot-val">${g.protein}g</strong></div>
          <input type="range" id="sl-prot" min="80" max="300" step="5" value="${g.protein}" oninput="updateGoal('protein',this.value)">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>🍚 Υδατάνθρακες</span><strong id="sl-carb-val">${g.carbs}g</strong></div>
          <input type="range" id="sl-carb" min="50" max="400" step="5" value="${g.carbs}" oninput="updateGoal('carbs',this.value)">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>🫒 Λίπος</span><strong id="sl-fat-val">${g.fat}g</strong></div>
          <input type="range" id="sl-fat" min="20" max="200" step="5" value="${g.fat}" oninput="updateGoal('fat',this.value)">
        </div>
        <button class="btn btn-ghost btn-sm" onclick="resetGoals()">↺ Reset</button>
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
  const mealLabels = { all:'Όλα', breakfast:'☀️ Πρωινά', snack:'🥐 Προάριστο', lunch:'🥗 Μεσ/νά', afternoon:'☕ Απογ/νό', dinner:'🌙 Βραδινά' };
  const types = typeFilter === 'all' ? ['breakfast','snack','lunch','afternoon','dinner'] : [typeFilter];

  // Grid cards
  let gridHtml = '';
  types.forEach(t => {
    const recipes  = allRecipes.filter(r => r.meal === t);
    const standards = STANDARD_MEALS.filter(s => s.meal === t);
    if (!recipes.length && !standards.length) return;
    gridHtml += `<div class="builder-type-label">${mealLabels[t]||t}</div>
    <div class="builder-grid">`;
    standards.forEach(s => {
      const sel = builderMeals.find(x => x.id === s.id && x.isStandard);
      gridHtml += `<div class="builder-card ${sel?'builder-card-sel':''}" onclick="builderPageToggle('${s.id}',true)">
        <div class="builder-card-emoji">${s.emoji}</div>
        <div class="builder-card-name">${s.name}</div>
        <div class="builder-card-kcal">~${s.kcal_est} kcal</div>
        <div class="builder-card-badge">⭐ Στάνταρ</div>
        ${sel ? '<div class="builder-card-check">✓</div>' : ''}
      </div>`;
    });
    recipes.forEach(r => {
      const m = calcRecipeMacros(r);
      const sel = builderMeals.find(x => x.id === r.id && !x.isStandard);
      gridHtml += `<div class="builder-card ${sel?'builder-card-sel':''}" onclick="builderPageToggle('${r.id}',false)">
        <div class="builder-card-emoji">${r.emoji}</div>
        <div class="builder-card-name">${r.name}</div>
        <div class="builder-card-kcal">${m.kcal} kcal</div>
        <div class="builder-card-badge" style="color:var(--blue)">Π:${m.p}g</div>
        ${sel ? '<div class="builder-card-check">✓</div>' : ''}
      </div>`;
    });
    gridHtml += '</div>';
  });

  // Selected summary
  let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0;
  const selRows = builderMeals.map((bm, bi) => {
    let name='', emoji='', kcal=0, p=0, c=0, f=0;
    if (bm.isStandard) {
      const sm = STANDARD_MEALS.find(s=>s.id===bm.id); if(!sm) return '';
      name=sm.name; emoji=sm.emoji; kcal=sm.kcal_est;
    } else {
      const r=[...RECIPES_DB,...state.customRecipes].find(x=>x.id===bm.id); if(!r) return '';
      const mac=calcRecipeMacros(r); name=r.name; emoji=r.emoji; kcal=mac.kcal; p=mac.p; c=mac.c; f=mac.f;
    }
    totalKcal+=kcal; totalP+=p; totalC+=c; totalF+=f;
    return `<div class="builder-sel-row">
      <span>${emoji} ${name}</span>
      <span style="color:var(--green-d);font-weight:700">${kcal} kcal
        <button onclick="builderPageToggle('${bm.id}',${bm.isStandard})" style="border:none;background:none;cursor:pointer;color:var(--red);margin-left:6px">✕</button>
      </span>
    </div>`;
  }).join('');

  const savedTemplates = state.dayTemplates || [];

  document.getElementById('page-builder').innerHTML = `
    <div class="container" style="padding-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2>🏗️ Day Builder</h2>
        <div style="font-size:0.75rem;color:var(--text3)">Ημέρα ${state.currentDay+1}</div>
      </div>

      <!-- Live Summary -->
      <div class="card card-sm fade-in" style="margin-bottom:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${builderMeals.length?'10px':'0'}">
          ${builderMeals.length ? `
            <span class="chip chip-green">${totalKcal} kcal</span>
            <span class="chip chip-blue">Π:${totalP}g</span>
            <span class="chip">Υ:${totalC}g</span>
            <span class="chip">Λ:${totalF}g</span>
            <span class="chip">${builderMeals.length} γεύματα</span>
          ` : '<span class="chip" style="color:var(--text3)">Επίλεξε γεύματα από κάτω</span>'}
        </div>
        ${selRows ? `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">${selRows}</div>` : ''}
        ${builderMeals.length ? `
          <div style="display:flex;gap:8px">
            <button class="btn btn-green" style="flex:1" onclick="builderPageApply()">✓ Εφάρμοσε σε Ημέρα...</button>
            <button class="btn btn-ghost btn-sm" onclick="builderPageClear()">🗑 Clear</button>
          </div>` : ''}
      </div>

      <!-- Φίλτρα -->
      <div class="segment" style="margin-bottom:14px">
        ${['all','breakfast','snack','lunch','afternoon','dinner'].map(t => `
          <button class="seg-btn ${typeFilter===t?'active':''}" onclick="renderBuilderPage('${t}')">${mealLabels[t]}</button>
        `).join('')}
      </div>

      <!-- Grid -->
      ${gridHtml || '<div style="padding:20px;color:var(--text3);text-align:center">Δεν βρέθηκαν γεύματα</div>'}

      <!-- Templates -->
      <div class="card card-lg fade-in" style="margin-top:16px">
        <div class="section-title">💾 Αποθήκευση ως Πρότυπο</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="text" id="builder-tpl-name" placeholder="Όνομα (π.χ. Ημέρα Ελαφριά)"
            style="flex:1;padding:9px 12px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;background:var(--bg2)">
          <button class="btn btn-green btn-sm" onclick="saveDayAsTemplate()">💾</button>
        </div>
        ${savedTemplates.length ? `
          <div class="section-title" style="margin-bottom:8px">📂 Αποθηκευμένα</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${savedTemplates.map((tpl,ti) => {
              const kcal = tpl.meals.reduce((acc,m) => {
                if (m.standardId) { const sm=STANDARD_MEALS.find(s=>s.id===m.standardId); return acc+(sm?sm.kcal_est:0); }
                const r=[...RECIPES_DB,...state.customRecipes].find(x=>x.id===m.recipeId); if(!r) return acc;
                return acc+calcRecipeMacros(r,m.scaleFactor||1).kcal;
              },0);
              return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg2);border-radius:var(--radius-sm);padding:10px 12px;border:1px solid var(--border)">
                <div><div style="font-weight:700;font-size:0.88rem">${tpl.name}</div>
                <div style="font-size:0.72rem;color:var(--text3)">${tpl.meals.length} γεύματα · ~${kcal} kcal · ${tpl.savedAt}</div></div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" onclick="loadTemplate(${ti})">▶ Φόρτωσε</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteTemplate(${ti})">🗑</button>
                </div>
              </div>`;
            }).join('')}
          </div>` : '<div style="font-size:0.82rem;color:var(--text3)">Δεν υπάρχουν αποθηκευμένα πρότυπα.</div>'}
      </div>
    </div>`;
}

function builderPageToggle(id, isStandard) {
  const idx = builderMeals.findIndex(x => x.id === id && x.isStandard === isStandard);
  if (idx >= 0) builderMeals.splice(idx, 1);
  else builderMeals.push({ id, isStandard });
  renderBuilderPage(state._builderFilter || 'all');
}

function builderPageApply() {
  if (!builderMeals.length) { showToast('⚠️ Δεν επιλέχτηκαν γεύματα'); return; }
  // Επιλογή ημέρας
  openModal(`<div class="modal-handle"></div>
    <div class="modal-title">📅 Σε ποια ημέρα να εφαρμοστεί;</div>
    <p style="font-size:0.82rem;color:var(--text2);margin-bottom:14px">Επίλεξε ημέρα ή αποθήκευσε ως πρότυπο.</p>
    <div class="recipes-grid">
      ${state.week.map((d,i) => {
        const dl = state.planStartDate ? '<br><span style=\'font-size:0.68rem;color:var(--text3)\'>' + formatPlanDay(i) + '</span>' : '';
        return '<div class=\'recipe-card\' onclick=\'applyBuilderToDayIdx(' + i + ')\' ><div class=\'recipe-card-emoji\'>📅</div><div class=\'recipe-card-name\'>' + d.label + dl + '</div></div>';
      }).join('')}
    </div>`);
}

function applyBuilderToDayIdx(dayIdx) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const typeTime = { breakfast:'08:00', lunch:'13:00', dinner:'20:00', snack:'11:00', afternoon:'16:00' };
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
  showToast('✅ Day Builder → Ημέρα ' + (dayIdx+1) + '!');
  navigateTo('today');
  state.currentDay = dayIdx;
  renderToday();
}

function builderPageClear() {
  builderMeals = [];
  renderBuilderPage(state._builderFilter || 'all');
}

// ── DAY BUILDER (inline — legacy, kept for optimize page) ──
function renderBuilderRecipeList(typeFilter) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const allStandard = STANDARD_MEALS;
  const mealLabels = { breakfast:'☀️ Πρωινά', snack:'🥐 Προάριστο', lunch:'🥗 Μεσ/νά', afternoon:'☕ Απογ/νό', dinner:'🌙 Βραδινά' };
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
  else renderOptimize();
}

function deleteTemplate(ti) {
  if (!confirm('Διαγραφή αυτού του προτύπου;')) return;
  state.dayTemplates.splice(ti, 1);
  saveState();
  if (state.activeTab === 'builder') renderBuilderPage();
  else renderOptimize();
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
  if (dayIdx === state.currentDay) { navigateTo('today'); } else { renderOptimize(); }
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
  renderOptimize();
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

function toggleMealDone(mi) {
  state.week[state.currentDay].meals[mi].done = !state.week[state.currentDay].meals[mi].done;
  saveState();
  renderToday();
}

function toggleSupp(si) {
  state.supplements[si].done = !state.supplements[si].done;
  saveState();
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

function openSwapMeal(mi, activeTab) {
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const currentType = state.week[state.currentDay].meals[mi].type;
  const snackTypes = currentType === 'afternoon' ? ['afternoon', 'snack'] : [currentType];
  const recipes = allRecipes.filter(r => snackTypes.includes(r.meal));
  const standards = STANDARD_MEALS.filter(s => snackTypes.includes(s.meal));
  const tab = activeTab || 'standard';

  const mealTypeLabel = { breakfast:'Πρωινά', lunch:'Μεσημεριανά', dinner:'Βραδινά', snack:'Προάριστο', afternoon:'Απογευματινό' }[currentType] || '';

  const standardsHTML = standards.map(s => `
    <div class="swap-row" onclick="swapMealStandard(${mi},'${s.id}')">
      <div class="swap-row-left">
        <span class="swap-emoji">${s.emoji}</span>
        <div>
          <div class="swap-name">${s.name}</div>
          <div class="swap-items">${s.items.join(' · ')}</div>
          ${s.note ? `<div class="swap-note">${s.note}</div>` : ''}
        </div>
      </div>
      <div class="swap-kcal">~${s.kcal_est}<br><span>kcal</span></div>
    </div>`).join('');

  const recipesHTML = recipes.map(r => {
    const m = calcRecipeMacros(r);
    return `<div class="swap-row" onclick="swapMeal(${mi},'${r.id}')">
      <div class="swap-row-left">
        <span class="swap-emoji">${r.emoji}</span>
        <div>
          <div class="swap-name">${r.name}</div>
          <div class="swap-items">Π:${m.p}g · Υ:${m.c}g · Λ:${m.f}g</div>
        </div>
      </div>
      <div class="swap-kcal">${m.kcal}<br><span>kcal</span></div>
    </div>`;
  }).join('');

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">🔄 Επιλογή Γεύματος — ${mealTypeLabel}</div>
    <div class="swap-tabs">
      <button class="swap-tab ${tab==='standard'?'active':''}" onclick="openSwapMeal(${mi},'standard')">⭐ Στάνταρ</button>
      <button class="swap-tab ${tab==='recipes'?'active':''}" onclick="openSwapMeal(${mi},'recipes')">📖 Συνταγές</button>
    </div>
    <div class="swap-list">
      ${tab === 'standard' ? (standardsHTML || '<div class="empty-state"><p>Δεν υπάρχουν στάνταρ γεύματα για αυτή την κατηγορία</p></div>') : recipesHTML}
    </div>`);
}

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
  const mealLabels = { breakfast:'Πρωινό', lunch:'Μεσημεριανό', dinner:'Βραδινό', snack:'Προάριστο', afternoon:'Απογευματινό' };
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
  const typeTime = { breakfast:'08:00', lunch:'13:00', dinner:'20:00', snack:'11:00', afternoon:'16:00' };
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
        <option value="snack">Προάριστο</option>
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
  const typeTime = { breakfast:'08:00', lunch:'13:00', dinner:'20:00', snack:'11:00', afternoon:'16:00' };
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
    const mealTypeLabel = { breakfast:'Πρωινό', snack:'Προάριστο', lunch:'Μεσημεριανό', afternoon:'Απογευματινό', dinner:'Βραδινό' }[m.type] || m.type;
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
  const allRecipes = [...RECIPES_DB, ...state.customRecipes];
  const p = state.profile;
  const g = state.goals;
  const bmi = calcBMI(p.weight, p.height);
  const tdee = calcTDEE(p);

  // ── ΣΕΛΙΔΑ 1: Landscape — εβδομαδιαία συνοπτική επισκόπηση ──
  // Κάθε ημέρα = μία στήλη, compact row με συνολικά kcal/macros + γεύματα
  const weekCols = state.week.map((day, di) => {
    const tot = calcDayMacros(di, false);
    const pct = Math.min(100, Math.round((tot.kcal / g.kcal) * 100));
    const barColor = pct > 105 ? '#ef4444' : pct > 95 ? '#22c55e' : '#f59e0b';

    const dateHeaderStr = state.planStartDate ? `<div style="font-size:8px;color:#6b7280;font-weight:600;margin-top:1px">${formatPlanDay(di)}</div>` : '';

    const mealLines = day.meals.map(m => {
      let name = '', kcal = 0;
      if (m.standardId) {
        const sm = STANDARD_MEALS.find(s => s.id === m.standardId);
        if (!sm) return '';
        name = sm.emoji + ' ' + sm.name;
        kcal = Math.round(sm.kcal_est * (m.scaleFactor||1));
      } else {
        const r = allRecipes.find(x => x.id === m.recipeId);
        if (!r) return '';
        const mac = calcRecipeMacros(r, m.scaleFactor||1);
        name = r.emoji + ' ' + r.name;
        kcal = mac.kcal;
      }
      return `<div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:8.5px;padding:3px 0;border-bottom:1px solid #f3f4f6;gap:4px;line-height:1.3">
        <span style="color:#374151;white-space:normal;word-break:break-word;flex:1">${name}</span>
        <span style="color:#6b7280;white-space:nowrap;font-weight:700;padding-left:2px">${kcal}</span>
      </div>`;
    }).join('');

    return `<div style="flex:1;min-width:0;border:1px solid #e5e7eb;border-radius:6px;padding:8px;background:#fff">
      <div style="font-weight:800;font-size:10px;color:#111;border-bottom:2px solid ${barColor};padding-bottom:4px;margin-bottom:5px">${day.label.replace('Ημέρα ','Ημ.')}${dateHeaderStr}</div>
      <div style="height:4px;background:#e5e7eb;border-radius:2px;margin-bottom:5px">
        <div style="height:4px;width:${pct}%;background:${barColor};border-radius:2px"></div>
      </div>
      <div style="font-size:9px;color:${barColor};font-weight:700;margin-bottom:3px">${tot.kcal} kcal (${pct}%)</div>
      <div style="font-size:8.5px;color:#6b7280;margin-bottom:6px">Π:${tot.p}g · Υ:${tot.c}g · Λ:${tot.f}g</div>
      ${mealLines}
    </div>`;
  }).join('');

  const summaryPage = `
    <div style="padding:12mm 10mm;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:3px solid #22c55e">
        <div style="font-size:18px;font-weight:800;color:#111">📅 Εβδομαδιαία Επισκόπηση</div>
        <div style="font-size:10px;color:#6b7280">Στόχος: ${g.kcal} kcal/ημέρα · ${p.name||'Vivon'}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-start">${weekCols}</div>
    </div>`;

  // ── ΣΕΛΙΔΑ 2+: Portrait — ανά ημέρα, λεπτομέρειες για όλα τα γεύματα ──
  const allFoodsForPrint = [...FOODS_DB, ...state.customFoods];
  const dayPages = state.week.map((day, di) => {
    const tot = calcDayMacros(di, false);
    const pct = Math.min(100, Math.round((tot.kcal / g.kcal) * 100));
    const barColor = pct > 105 ? '#ef4444' : pct > 95 ? '#22c55e' : '#f59e0b';

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
          const food = allFoodsForPrint.find(f => f.id === ing.foodId);
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

      const mealTypeLabel = { breakfast:'Πρωινό', snack:'Προάριστο', lunch:'Μεσημεριανό', afternoon:'Απογευματινό', dinner:'Βραδινό' }[m.type] || m.type;
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

    const extraKcal = day.extraKcal || 0;
    const extraRow = extraKcal > 0
      ? `<tr style="background:#fef2f2"><td colspan="5" style="padding:6px 8px;font-size:9px;color:#ef4444;font-weight:700">⚠️ Επιπλέον εκτός πλάνου: +${extraKcal} kcal</td></tr>`
      : '';
    const dateLabel = state.planStartDate ? ` · ${formatPlanDay(di)}` : '';

    return `
      <div style="page-break-before:always;padding:10mm 12mm;font-family:'Helvetica Neue',Arial,sans-serif;min-height:277mm;box-sizing:border-box">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:3px solid #22c55e">
          <div>
            <div style="font-size:17px;font-weight:800;color:#111">${day.label}${dateLabel}</div>
            <div style="font-size:10px;color:#6b7280;margin-top:2px">Στόχος: ${g.kcal} kcal · Πλάνο: ${tot.kcal} kcal (${pct}%)</div>
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
          <tbody>
            ${mealRows}
            ${extraRow}
          </tbody>
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
  }).join('');

  const pv = document.getElementById('print-view');
  pv.innerHTML = `
    <style>
      @page :first { size: A4 landscape; }
      @page { size: A4 portrait; margin: 0; }
    </style>
    ${summaryPage}
    ${dayPages}`;
  showToast('⏳ Άνοιγμα εκτύπωσης...');
  setTimeout(() => window.print(), 400);
}

// ── NAVIGATION & UTILITIES ──
function navigateTo(tab) {
  state.activeTab = tab;
  saveState();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-' + tab);
  if (page) page.classList.add('active');
  const btn = document.querySelector(`.tab-item[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  if (tab === 'today')    renderToday();
  if (tab === 'week')     renderWeek();
  if (tab === 'profile')  renderProfile();
  if (tab === 'recipes')  renderRecipes();
  if (tab === 'foods')    renderFoods();
  if (tab === 'optimize') renderOptimize();
  if (tab === 'builder')  renderBuilderPage();
}

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
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  document.querySelectorAll('.tab-item').forEach(btn => {
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
  navigateTo(state.activeTab || 'today');
});
