// ============================================================
// auth.js — Full-screen authentication UI (premium design)
// ============================================================

(function () {

  // ── SVG icons (inline, no dependency) ────────────────────

  const ICONS = {
    user:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    userAdd: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M2 20c0-4 3.6-7 8-7s8 3 8 7"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>`,
    mail:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>`,
    lock:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    eye:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    arrow:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>`,
    shield:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    back:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/></svg>`,
  };

  // ── Bootstrap ─────────────────────────────────────────────

  async function bootAuth() {
    renderAuthScreen();

    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
      hideAuthScreen();
      await initApp();
    }

    _supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        hideAuthScreen();
        await initApp();
      }
      if (event === 'SIGNED_OUT') {
        showAuthScreen();
      }
      if (event === 'PASSWORD_RECOVERY') {
        authShowTab('reset-new');
      }
    });
  }

  // ── Render ────────────────────────────────────────────────

  function renderAuthScreen() {
    const el = document.getElementById('auth-screen');
    if (!el) return;
    el.innerHTML = `
      <div class="auth-card">

        <!-- Logo -->
        <div class="auth-logo">
          <img src="logo.png" alt="VIVON" class="auth-logo-img"
               onerror="this.style.display='none'">
          <div class="auth-brand">VIVON</div>
          <div class="auth-tagline">Ο σύμμαχός σου για μια <em>καλύτερη διατροφή</em>.</div>
        </div>

        <!-- Tabs -->
        <div class="auth-tabs" id="auth-tabs">
          <button class="auth-tab active" data-tab="login" onclick="authShowTab('login')">
            ${ICONS.user} Σύνδεση
          </button>
          <button class="auth-tab" data-tab="register" onclick="authShowTab('register')">
            ${ICONS.userAdd} Εγγραφή
          </button>
        </div>

        <!-- LOGIN -->
        <form id="auth-form-login" class="auth-form" onsubmit="authLogin(event)">
          <div class="auth-field">
            <label class="auth-label">Email</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.mail}</span>
              <input class="auth-input" id="auth-email-login" type="email"
                     placeholder="email@example.com" required autocomplete="email">
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label">Κωδικός</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.lock}</span>
              <input class="auth-input" id="auth-pass-login" type="password"
                     placeholder="••••••••" required autocomplete="current-password"
                     style="padding-right:42px">
              <button type="button" class="auth-input-toggle"
                      onclick="authTogglePass('auth-pass-login',this)"
                      tabindex="-1">${ICONS.eye}</button>
            </div>
          </div>
          <div id="auth-error-login" class="auth-error" style="display:none">
            ${ICONS.shield} <span></span>
          </div>
          <button class="auth-btn" type="submit" id="auth-btn-login">
            ${ICONS.arrow} Σύνδεση
          </button>
          <div class="auth-footer-row">
            <button class="auth-link-btn" type="button" onclick="authShowTab('reset')">
              Ξέχασες τον κωδικό σου; <span>Επαναφορά</span>
            </button>
          </div>
        </form>

        <!-- REGISTER -->
        <form id="auth-form-register" class="auth-form" style="display:none"
              onsubmit="authRegister(event)">
          <div class="auth-field">
            <label class="auth-label">Όνομα</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.user}</span>
              <input class="auth-input" id="auth-name-register" type="text"
                     placeholder="Το όνομά σου" required autocomplete="given-name"
                     style="padding-left:42px">
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label">Email</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.mail}</span>
              <input class="auth-input" id="auth-email-register" type="email"
                     placeholder="email@example.com" required autocomplete="email">
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label">Κωδικός</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.lock}</span>
              <input class="auth-input" id="auth-pass-register" type="password"
                     placeholder="Τουλάχιστον 6 χαρακτήρες" required minlength="6"
                     autocomplete="new-password" style="padding-right:42px">
              <button type="button" class="auth-input-toggle"
                      onclick="authTogglePass('auth-pass-register',this)"
                      tabindex="-1">${ICONS.eye}</button>
            </div>
          </div>
          <div id="auth-error-register" class="auth-error" style="display:none">
            ${ICONS.shield} <span></span>
          </div>
          <button class="auth-btn" type="submit" id="auth-btn-register">
            ${ICONS.arrow} Δημιουργία λογαριασμού
          </button>
        </form>

        <!-- PASSWORD RESET (request) -->
        <form id="auth-form-reset" class="auth-form" style="display:none"
              onsubmit="authReset(event)">
          <p class="auth-hint">Εισάγετε το email σας και θα σας στείλουμε σύνδεσμο για επαναφορά κωδικού.</p>
          <div class="auth-field">
            <label class="auth-label">Email</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.mail}</span>
              <input class="auth-input" id="auth-email-reset" type="email"
                     placeholder="email@example.com" required autocomplete="email">
            </div>
          </div>
          <div id="auth-error-reset"   class="auth-error"   style="display:none"><span></span></div>
          <div id="auth-success-reset" class="auth-success"  style="display:none"></div>
          <button class="auth-btn" type="submit" id="auth-btn-reset">
            ${ICONS.arrow} Αποστολή συνδέσμου
          </button>
          <div class="auth-footer-row">
            <button class="auth-link-btn" type="button" onclick="authShowTab('login')">
              ${ICONS.back} <span style="font-size:0.8rem">Πίσω στη σύνδεση</span>
            </button>
          </div>
        </form>

        <!-- SET NEW PASSWORD (after clicking reset link) -->
        <form id="auth-form-reset-new" class="auth-form" style="display:none"
              onsubmit="authSetNewPassword(event)">
          <p class="auth-hint">Εισάγετε τον νέο σας κωδικό.</p>
          <div class="auth-field">
            <label class="auth-label">Νέος Κωδικός</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${ICONS.lock}</span>
              <input class="auth-input" id="auth-pass-new" type="password"
                     placeholder="Τουλάχιστον 6 χαρακτήρες" required minlength="6"
                     autocomplete="new-password" style="padding-right:42px">
              <button type="button" class="auth-input-toggle"
                      onclick="authTogglePass('auth-pass-new',this)"
                      tabindex="-1">${ICONS.eye}</button>
            </div>
          </div>
          <div id="auth-error-reset-new" class="auth-error" style="display:none"><span></span></div>
          <button class="auth-btn" type="submit" id="auth-btn-reset-new">
            ${ICONS.arrow} Αποθήκευση κωδικού
          </button>
        </form>

      </div>`;
  }

  function showAuthScreen() {
    // Hide app immediately — no lag
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.add('app-hidden');
    const el = document.getElementById('auth-screen');
    if (el) { el.style.display = 'flex'; renderAuthScreen(); }
  }

  function hideAuthScreen() {
    const el = document.getElementById('auth-screen');
    if (el) el.style.display = 'none';
    // Reveal app shell
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.remove('app-hidden');
  }

  // ── Tab switching ─────────────────────────────────────────

  window.authShowTab = function (tab) {
    const forms   = ['login', 'register', 'reset', 'reset-new'];
    const tabBtns = ['login', 'register'];

    forms.forEach(f => {
      const el = document.getElementById(`auth-form-${f}`);
      if (el) el.style.display = (f === tab) ? '' : 'none';
    });
    tabBtns.forEach(t => {
      const el = document.querySelector(`.auth-tab[data-tab="${t}"]`);
      if (el) el.classList.toggle('active', t === tab);
    });
    const tabs = document.getElementById('auth-tabs');
    if (tabs) tabs.style.display = (tab === 'reset' || tab === 'reset-new') ? 'none' : '';
  };

  // ── Password visibility toggle ────────────────────────────

  window.authTogglePass = function (inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
  };

  // ── Form handlers ─────────────────────────────────────────

  window.authLogin = async function (e) {
    e.preventDefault();
    const email = document.getElementById('auth-email-login').value.trim();
    const pass  = document.getElementById('auth-pass-login').value;
    setLoading('login', true);
    clearMsg('login');

    const { error } = await sbSignIn(email, pass);
    setLoading('login', false);
    if (error) showError('login', _friendly(error.message));
    // on success: onAuthStateChange SIGNED_IN fires → hideAuthScreen + initApp
  };

  window.authRegister = async function (e) {
    e.preventDefault();
    const name  = document.getElementById('auth-name-register').value.trim();
    const email = document.getElementById('auth-email-register').value.trim();
    const pass  = document.getElementById('auth-pass-register').value;
    setLoading('register', true);
    clearMsg('register');

    const { data, error } = await sbSignUp(email, pass, name);
    setLoading('register', false);
    if (error) { showError('register', _friendly(error.message)); return; }

    if (!data.session) {
      // Email confirmation required
      showInfo('register', `${ICONS.shield} Ελέγξτε το email σας για επιβεβαίωση εγγραφής.`);
    }
  };

  window.authReset = async function (e) {
    e.preventDefault();
    const email = document.getElementById('auth-email-reset').value.trim();
    setLoading('reset', true);
    clearMsg('reset');

    const { error } = await sbResetPassword(email);
    setLoading('reset', false);
    if (error) { showError('reset', _friendly(error.message)); return; }

    const suc = document.getElementById('auth-success-reset');
    if (suc) { suc.style.display = ''; suc.textContent = '✅ Ο σύνδεσμος επαναφοράς στάλθηκε στο email σας.'; }
  };

  window.authSetNewPassword = async function (e) {
    e.preventDefault();
    const pass = document.getElementById('auth-pass-new').value;
    setLoading('reset-new', true);
    clearMsg('reset-new');

    const { error } = await _supabase.auth.updateUser({ password: pass });
    setLoading('reset-new', false);
    if (error) showError('reset-new', _friendly(error.message));
    // on success: SIGNED_IN event fires → initApp
  };

  // ── UI helpers ────────────────────────────────────────────

  const BTN_LABELS = {
    login:       `${ICONS.arrow} Σύνδεση`,
    register:    `${ICONS.arrow} Δημιουργία λογαριασμού`,
    reset:       `${ICONS.arrow} Αποστολή συνδέσμου`,
    'reset-new': `${ICONS.arrow} Αποθήκευση κωδικού`,
  };

  function setLoading(form, loading) {
    const btn = document.getElementById(`auth-btn-${form}`);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading ? 'Παρακαλώ περιμένετε...' : (BTN_LABELS[form] || 'OK');
  }

  function showError(form, msg) {
    const el = document.getElementById(`auth-error-${form}`);
    if (!el) return;
    el.style.display = 'flex';
    el.className = 'auth-error';
    const span = el.querySelector('span') || el;
    span.innerHTML = msg;
  }

  function showInfo(form, msg) {
    const el = document.getElementById(`auth-error-${form}`);
    if (!el) return;
    el.style.display = 'flex';
    el.className = 'auth-info';
    const span = el.querySelector('span') || el;
    span.innerHTML = msg;
  }

  function clearMsg(form) {
    ['auth-error-', 'auth-success-'].forEach(prefix => {
      const el = document.getElementById(prefix + form);
      if (el) { el.style.display = 'none'; const span = el.querySelector('span'); if (span) span.textContent = ''; }
    });
  }

  function _friendly(msg) {
    if (!msg) return 'Άγνωστο σφάλμα.';
    if (msg.includes('Invalid login credentials'))  return 'Λανθασμένο email ή κωδικός.';
    if (msg.includes('Email not confirmed'))         return 'Παρακαλώ επιβεβαιώστε πρώτα το email σας.';
    if (msg.includes('User already registered'))     return 'Υπάρχει ήδη λογαριασμός με αυτό το email.';
    if (msg.includes('Password should be'))          return 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.';
    if (msg.includes('Unable to validate email'))    return 'Μη έγκυρο email.';
    return msg;
  }

  // ── Sign-out (called from app UI) ─────────────────────────

  window.handleSignOut = async function () {
    // Hide app and show auth immediately — no lag
    showAuthScreen();
    try { localStorage.removeItem('nutriApp_v2'); } catch (e) {}
    await sbSignOut();
    // onAuthStateChange SIGNED_OUT also fires but showAuthScreen already ran
  };

  // ── Entry point ───────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', bootAuth);

})();
