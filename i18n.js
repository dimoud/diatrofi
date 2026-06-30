// ============================================================
// i18n.js — Internationalization / Language support
// ============================================================

const LANGUAGES = {
  el: { label: 'Ελληνικά', flag: '🇬🇷' },
  en: { label: 'English',  flag: '🇬🇧' },
  es: { label: 'Español',  flag: '🇪🇸' },
  fr: { label: 'Français', flag: '🇫🇷' },
};

const I18N = {
  // ── Navigation labels ──
  nav_today:        { el: 'Ημερήσιο',     en: 'Daily',       es: 'Diario',      fr: 'Quotidien' },
  nav_week:         { el: 'Εβδομαδιαίο',  en: 'Weekly',      es: 'Semanal',     fr: 'Hebdomadaire' },
  nav_ideas:        { el: 'Ιδέες',        en: 'Ideas',       es: 'Ideas',       fr: 'Idées' },
  nav_builder:      { el: 'Σχεδιαστής',   en: 'Builder',     es: 'Diseñador',   fr: 'Planificateur' },
  nav_body:         { el: 'Μετρήσεις',    en: 'Measurements',es: 'Medidas',     fr: 'Mesures' },
  nav_stats:        { el: 'Στατιστικά',   en: 'Statistics',  es: 'Estadísticas',fr: 'Statistiques' },
  nav_settings:     { el: 'Ρυθμίσεις',    en: 'Settings',    es: 'Ajustes',     fr: 'Paramètres' },
  nav_week_short:   { el: 'Εβδομάδα',     en: 'Week',        es: 'Semana',      fr: 'Semaine' },
  nav_progress:     { el: 'Πρόοδος',      en: 'Progress',    es: 'Progreso',    fr: 'Progrès' },
  nav_menu:         { el: 'Μενού',        en: 'Menu',        es: 'Menú',        fr: 'Menu' },

  // ── Drawer sections ──
  drawer_main:      { el: 'Κύριο',        en: 'Main',        es: 'Principal',   fr: 'Principal' },
  drawer_nutrition: { el: 'Διατροφή',     en: 'Nutrition',   es: 'Nutrición',   fr: 'Nutrition' },
  drawer_health:    { el: 'Υγεία',        en: 'Health',      es: 'Salud',       fr: 'Santé' },
  drawer_settings:  { el: 'Ρυθμίσεις',    en: 'Settings',    es: 'Ajustes',     fr: 'Paramètres' },
  drawer_pdf:       { el: 'Εξαγωγή PDF',  en: 'Export PDF',  es: 'Exportar PDF',fr: 'Exporter PDF' },
  drawer_logout:    { el: 'Αποσύνδεση',   en: 'Sign out',    es: 'Cerrar sesión',fr: 'Déconnexion' },
  drawer_plan:      { el: 'Σχεδιαστής',   en: 'Planner',     es: 'Planificador',fr: 'Planificateur' },

  // ── Sidebar ──
  sidebar_subtitle: { el: 'Διαιτολόγιο',  en: 'Diet plan',   es: 'Dieta',       fr: 'Régime' },
  sidebar_pdf:      { el: '🖨️ PDF',       en: '🖨️ PDF',      es: '🖨️ PDF',      fr: '🖨️ PDF' },
  sidebar_logout:   { el: '⏏ Αποσύνδεση',en: '⏏ Sign out',  es: '⏏ Salir',     fr: '⏏ Déconnexion' },

  // ── Settings tabs ──
  settings_profile:     { el: '👤 Προφίλ',         en: '👤 Profile',         es: '👤 Perfil',         fr: '👤 Profil' },
  settings_optimize:    { el: '⚡ Βελτίωση',        en: '⚡ Optimize',        es: '⚡ Optimizar',      fr: '⚡ Optimiser' },
  settings_supplements: { el: '💊 Συμπληρώματα',    en: '💊 Supplements',     es: '💊 Suplementos',    fr: '💊 Suppléments' },
  settings_language:    { el: '🌐 Γλώσσα',          en: '🌐 Language',        es: '🌐 Idioma',         fr: '🌐 Langue' },
  settings_feedback:    { el: '💬 Σχόλια & Δωρεά',  en: '💬 Feedback & Donate',es: '💬 Opinión & Donación',fr: '💬 Avis & Don' },
  settings_save:        { el: '💾 Αποθήκευση ρυθμίσεων', en: '💾 Save settings', es: '💾 Guardar ajustes', fr: '💾 Enregistrer' },
  settings_saving:      { el: 'Αποθήκευση...',       en: 'Saving...',          es: 'Guardando...',      fr: 'Enregistrement...' },
  settings_saved:       { el: '✅ Οι ρυθμίσεις αποθηκεύτηκαν!', en: '✅ Settings saved!', es: '✅ ¡Ajustes guardados!', fr: '✅ Paramètres enregistrés !' },
  settings_save_error:  { el: '❌ Σφάλμα αποθήκευσης. Δοκιμάστε ξανά.', en: '❌ Save error. Try again.', es: '❌ Error al guardar. Inténtalo de nuevo.', fr: '❌ Erreur d\'enregistrement. Réessayez.' },

  // ── Language section ──
  lang_title:       { el: 'Γλώσσα Εφαρμογής', en: 'App Language', es: 'Idioma de la app', fr: 'Langue de l\'application' },
  lang_subtitle:    { el: 'Επιλέξτε τη γλώσσα της εφαρμογής', en: 'Choose your app language', es: 'Elige el idioma de la aplicación', fr: 'Choisissez la langue de l\'application' },

  // ── Supplements ──
  suppl_title:      { el: 'Συμπληρώματα διατροφής', en: 'Dietary supplements', es: 'Suplementos dietéticos', fr: 'Compléments alimentaires' },
  suppl_subtitle:   { el: 'Ενεργοποίησε για να εμφανίζονται στην ημερήσια σελίδα', en: 'Enable to show on the daily page', es: 'Activa para mostrar en la página diaria', fr: 'Activer pour afficher sur la page quotidienne' },
  suppl_choose:     { el: 'Επίλεξε τα συμπληρώματά σου', en: 'Choose your supplements', es: 'Elige tus suplementos', fr: 'Choisissez vos suppléments' },

  // ── Profile ──
  prof_edit_hint:   { el: 'Πάτα για επεξεργασία ✏️', en: 'Tap to edit ✏️', es: 'Toca para editar ✏️', fr: 'Appuyez pour modifier ✏️' },
  prof_body:        { el: '🏃 Σωματικά Στοιχεία', en: '🏃 Body Data', es: '🏃 Datos corporales', fr: '🏃 Données corporelles' },
  prof_weight:      { el: 'Βάρος (kg)', en: 'Weight (kg)', es: 'Peso (kg)', fr: 'Poids (kg)' },
  prof_height:      { el: 'Ύψος (cm)', en: 'Height (cm)', es: 'Altura (cm)', fr: 'Taille (cm)' },
  prof_age:         { el: 'Ηλικία', en: 'Age', es: 'Edad', fr: 'Âge' },
  prof_gender:      { el: 'Φύλο', en: 'Gender', es: 'Sexo', fr: 'Sexe' },
  prof_male:        { el: '👤 Άνδρας', en: '👤 Male', es: '👤 Hombre', fr: '👤 Homme' },
  prof_female:      { el: '👤 Γυναίκα', en: '👤 Female', es: '👤 Mujer', fr: '👤 Femme' },
  prof_activity:    { el: 'Επίπεδο Δραστηριότητας (προπονήσεις)', en: 'Activity Level (workouts)', es: 'Nivel de actividad (entrenamientos)', fr: 'Niveau d\'activité (entraînements)' },
  prof_steps:       { el: '👣 Μέσα Βήματα / Ημέρα', en: '👣 Avg Steps / Day', es: '👣 Pasos medios / Día', fr: '👣 Pas moyens / Jour' },

  // ── Feedback section ──
  feedback_title:        { el: '💬 Σχόλια & Πρόταση', en: '💬 Feedback & Suggestion', es: '💬 Comentarios y Sugerencia', fr: '💬 Avis et Suggestion' },
  feedback_subtitle:     { el: 'Πες μας τη γνώμη σου για να βελτιώσουμε την εφαρμογή!', en: 'Tell us your thoughts to help us improve the app!', es: '¡Dinos tu opinión para mejorar la app!', fr: 'Dites-nous votre avis pour améliorer l\'application !' },
  feedback_placeholder:  { el: 'Γράψε εδώ τo σχόλιό σου, τη γνώμη σου ή μια ιδέα...', en: 'Write your comment, opinion or idea here...', es: 'Escribe aquí tu comentario, opinión o idea...', fr: 'Écrivez ici votre commentaire, avis ou idée...' },
  feedback_send:         { el: '📤 Αποστολή Σχολίου', en: '📤 Send Feedback', es: '📤 Enviar Comentario', fr: '📤 Envoyer l\'avis' },
  feedback_sending:      { el: 'Αποστολή...', en: 'Sending...', es: 'Enviando...', fr: 'Envoi...' },
  feedback_sent:         { el: '✅ Το σχόλιό σου στάλθηκε! Ευχαριστούμε!', en: '✅ Your feedback was sent! Thank you!', es: '✅ ¡Tu comentario fue enviado! ¡Gracias!', fr: '✅ Votre avis a été envoyé ! Merci !' },
  feedback_empty:        { el: '⚠️ Γράψε κάτι πριν το στείλεις.', en: '⚠️ Write something before sending.', es: '⚠️ Escribe algo antes de enviar.', fr: '⚠️ Écrivez quelque chose avant d\'envoyer.' },
  feedback_error:        { el: '❌ Σφάλμα αποστολής. Δοκιμάστε ξανά.', en: '❌ Send error. Try again.', es: '❌ Error al enviar. Inténtalo de nuevo.', fr: '❌ Erreur d\'envoi. Réessayez.' },
  feedback_type_label:   { el: 'Τύπος:', en: 'Type:', es: 'Tipo:', fr: 'Type :' },
  feedback_type_general: { el: 'Γενικό', en: 'General', es: 'General', fr: 'Général' },
  feedback_type_bug:     { el: 'Πρόβλημα', en: 'Bug', es: 'Error', fr: 'Problème' },
  feedback_type_idea:    { el: 'Ιδέα', en: 'Idea', es: 'Idea', fr: 'Idée' },

  // ── Donate section ──
  donate_title:    { el: '❤️ Υποστήριξε το VIVON', en: '❤️ Support VIVON', es: '❤️ Apoya VIVON', fr: '❤️ Soutenez VIVON' },
  donate_subtitle: { el: 'Αν σου αρέσει η εφαρμογή, μπορείς να με στηρίξεις με μια μικρή δωρεά!', en: 'If you enjoy the app, you can support me with a small donation!', es: 'Si te gusta la app, ¡puedes apoyarme con una pequeña donación!', fr: 'Si vous aimez l\'application, vous pouvez me soutenir avec un petit don !' },
  donate_paypal:   { el: '💳 Δωρεά μέσω PayPal', en: '💳 Donate via PayPal', es: '💳 Donar vía PayPal', fr: '💳 Don via PayPal' },
  donate_revolut:  { el: '🔄 Δωρεά μέσω Revolut', en: '🔄 Donate via Revolut', es: '🔄 Donar vía Revolut', fr: '🔄 Don via Revolut' },
  donate_or:       { el: 'ή', en: 'or', es: 'o', fr: 'ou' },
  donate_thanks:   { el: 'Κάθε βοήθεια μετράει! 🙏', en: 'Every bit helps! 🙏', es: '¡Cualquier ayuda cuenta! 🙏', fr: 'Chaque aide compte ! 🙏' },
};

// ── Current language (default: Greek) ──
let _currentLang = 'el';

function getLang() {
  return _currentLang;
}

function t(key) {
  const entry = I18N[key];
  if (!entry) return key;
  return entry[_currentLang] || entry['el'] || key;
}

function setLang(lang) {
  if (!LANGUAGES[lang]) return;
  _currentLang = lang;
  try { localStorage.setItem('vivon_lang', lang); } catch(e) {}
  document.documentElement.lang = lang;
  updateUILanguage();
}

function initLang() {
  let saved = 'el';
  try { saved = localStorage.getItem('vivon_lang') || 'el'; } catch(e) {}
  if (!LANGUAGES[saved]) saved = 'el';
  _currentLang = saved;
  document.documentElement.lang = saved;
}

function updateUILanguage() {
  // Bottom bar
  _setTextContent('[data-tab="today"] .tab-label-i18n',    t('nav_today'));
  _setTextContent('[data-tab="week"] .tab-label-i18n',     t('nav_week_short'));
  _setTextContent('[data-tab="ideas"] .tab-label-i18n',    t('nav_ideas'));
  _setTextContent('[data-tab="stats"] .tab-label-i18n',    t('nav_progress'));
  _setI18nMenuLabel(t('nav_menu'));

  // Sidebar items
  _setTextContent('.sidebar-item[data-tab="today"] .sidebar-label',    t('nav_today'));
  _setTextContent('.sidebar-item[data-tab="week"] .sidebar-label',     t('nav_week'));
  _setTextContent('.sidebar-item[data-tab="ideas"] .sidebar-label',    t('nav_ideas'));
  _setTextContent('.sidebar-item[data-tab="builder"] .sidebar-label',  t('nav_builder'));
  _setTextContent('.sidebar-item[data-tab="body"] .sidebar-label',     t('nav_body'));
  _setTextContent('.sidebar-item[data-tab="stats"] .sidebar-label',    t('nav_stats'));
  _setTextContent('.sidebar-item[data-tab="settings"] .sidebar-label', t('nav_settings'));
  _setTextContent('#sidebar-user-sub', t('sidebar_subtitle'));

  // Sidebar footer buttons
  const sidebarPDF = document.querySelector('.sidebar-footer .btn:first-child');
  if (sidebarPDF) sidebarPDF.textContent = t('sidebar_pdf');
  const sidebarLogout = document.querySelector('.sidebar-footer .btn:last-child');
  if (sidebarLogout) sidebarLogout.textContent = t('sidebar_logout');

  // Drawer sections
  _setTextContentAll('.drawer-section-label', [
    t('drawer_main'), t('drawer_nutrition'), t('drawer_health'), t('drawer_settings')
  ]);
  _setTextContent('.drawer-item[data-tab="today"]',   '🏠 ' + t('nav_today'));
  _setTextContent('.drawer-item[data-tab="week"]',    '📅 ' + t('nav_week'));
  _setTextContent('.drawer-item[data-tab="builder"]', '🍽️ ' + t('drawer_plan'));
  _setTextContent('.drawer-item[data-tab="ideas"]',   '💡 ' + t('nav_ideas'));
  _setTextContent('.drawer-item[data-tab="body"]',    '⚖️ ' + t('nav_body'));
  _setTextContent('.drawer-item[data-tab="stats"]',   '📊 ' + t('nav_stats'));
  _setTextContent('.drawer-item[data-tab="settings"]','⚙️ ' + t('nav_settings'));

  // Re-render settings page if currently open
  if (typeof renderSettingsPage === 'function' && document.getElementById('page-settings').classList.contains('active')) {
    renderSettingsPage();
  }
}

function _setTextContent(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function _setI18nMenuLabel(text) {
  const btns = document.querySelectorAll('.tab-menu-btn');
  btns.forEach(btn => {
    const labels = btn.querySelectorAll('.tab-label-i18n');
    labels.forEach(l => l.textContent = text);
  });
}

function _setTextContentAll(selector, texts) {
  const els = document.querySelectorAll(selector);
  els.forEach((el, i) => { if (texts[i] !== undefined) el.textContent = texts[i]; });
}
