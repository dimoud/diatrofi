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
  settings_profile:     { el: 'Προφίλ',         en: 'Profile',         es: 'Perfil',         fr: 'Profil' },
  settings_optimize:    { el: 'Βελτίωση',        en: 'Optimize',        es: 'Optimizar',      fr: 'Optimiser' },
  settings_supplements: { el: 'Συμπληρώματα',    en: 'Supplements',     es: 'Suplementos',    fr: 'Suppléments' },
  settings_language:    { el: 'Γλώσσα',          en: 'Language',        es: 'Idioma',         fr: 'Langue' },
  settings_feedback:    { el: 'Σχόλια & Δωρεά',  en: 'Feedback & Donate',es: 'Opinión & Donación',fr: 'Avis & Don' },
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
  donate_revolut:  { el: '🔄 Δωρεά μέσω Revolut', en: '🔄 Donate via Revolut', es: '🔄 Donar vía Revolut', fr: '🔄 Don via Revolut' },
  donate_thanks:   { el: 'Κάθε βοήθεια μετράει! 🙏', en: 'Every bit helps! 🙏', es: '¡Cualquier ayuda cuenta! 🙏', fr: 'Chaque aide compte ! 🙏' },
  donate_drawer:   { el: 'Υποστήριξε το VIVON', en: 'Support VIVON', es: 'Apoya VIVON', fr: 'Soutenez VIVON' },
  donate_sidebar:  { el: '❤️ Υποστήριξη', en: '❤️ Support', es: '❤️ Apoyo', fr: '❤️ Soutien' },

  // ── Legal / Copyright ──
  legal_footer_link:  { el: '© VIVON · Νομικές πληροφορίες', en: '© VIVON · Legal info', es: '© VIVON · Aviso legal', fr: '© VIVON · Mentions légales' },
  legal_footer_text:  {
    el: '© 2025 VIVON · από τον δημιουργό · Όλα τα δικαιώματα διατηρούνται · Απαγορεύεται η εμπορική χρήση · Τα δεδομένα σας παραμένουν αποκλειστικά δικά σας — δεν κοινοποιούνται σε τρίτους και δεν τροποποιούνται.',
    en: '© 2025 VIVON · by the creator · All rights reserved · Commercial use is prohibited · Your data belongs solely to you — it is never shared with third parties or modified.',
    es: '© 2025 VIVON · por el creador · Todos los derechos reservados · Se prohíbe el uso comercial · Tus datos son exclusivamente tuyos — no se comparten con terceros ni se modifican.',
    fr: '© 2025 VIVON · par le créateur · Tous droits réservés · Toute utilisation commerciale est interdite · Vos données vous appartiennent exclusivement — elles ne sont jamais partagées ni modifiées.',
  },
  legal_modal_title:  { el: 'Πληροφορίες & Απόρρητο', en: 'Info & Privacy', es: 'Información y Privacidad', fr: 'Informations & Confidentialité' },
  legal_modal_heading:{ el: '© 2025 VIVON — από τον δημιουργό', en: '© 2025 VIVON — by the creator', es: '© 2025 VIVON — por el creador', fr: '© 2025 VIVON — par le créateur' },
  legal_modal_copy:   {
    el: 'Όλα τα δικαιώματα διατηρούνται. Απαγορεύεται αυστηρά η αναπαραγωγή, η διανομή ή η εμπορική χρήση της εφαρμογής ή οποιουδήποτε τμήματός της χωρίς γραπτή άδεια του δημιουργού.',
    en: 'All rights reserved. Reproduction, distribution or commercial use of the application or any part of it is strictly prohibited without the written permission of the creator.',
    es: 'Todos los derechos reservados. Queda estrictamente prohibida la reproducción, distribución o uso comercial de la aplicación o cualquier parte de la misma sin el permiso escrito del creador.',
    fr: 'Tous droits réservés. La reproduction, la distribution ou l\'utilisation commerciale de l\'application ou de toute partie de celle-ci est strictement interdite sans l\'autorisation écrite du créateur.',
  },
  legal_modal_privacy_title: { el: 'Απόρρητο δεδομένων', en: 'Data Privacy', es: 'Privacidad de datos', fr: 'Confidentialité des données' },
  legal_modal_privacy_text:  {
    el: 'Τα δεδομένα σας (διατροφικά στοιχεία, μετρήσεις, στόχοι) παραμένουν αποκλειστικά δικά σας. Δεν τα κοινοποιούμε σε τρίτους, δεν τα πουλάμε και δεν τα χρησιμοποιούμε για σκοπούς πέραν της λειτουργίας της εφαρμογής. Δεν κάνουμε καμία επεξεργασία ή τροποποίηση των δεδομένων σας χωρίς τη συγκατάθεσή σας.',
    en: 'Your data (nutritional details, measurements, goals) belongs solely to you. We do not share it with third parties, sell it, or use it for any purpose beyond running the app. We make no processing or modification of your data without your consent.',
    es: 'Tus datos (detalles nutricionales, medidas, objetivos) son exclusivamente tuyos. No los compartimos con terceros, no los vendemos ni los usamos para ningún propósito más allá del funcionamiento de la app. No realizamos ningún procesamiento o modificación de tus datos sin tu consentimiento.',
    fr: 'Vos données (informations nutritionnelles, mesures, objectifs) vous appartiennent exclusivement. Nous ne les partageons pas avec des tiers, ne les vendons pas et ne les utilisons pas à d\'autres fins que le fonctionnement de l\'application. Nous ne traitons ni ne modifions vos données sans votre consentement.',
  },

  // ── PDF hardcoded strings ──
  pdf_meal_col:       { el: 'ΓΕΥΜΑ',            en: 'MEAL',         es: 'COMIDA',        fr: 'REPAS' },
  pdf_recipe_col:     { el: 'ΣΥΝΤΑΓΗ / ΠΕΡΙΓΡΑΦΗ', en: 'RECIPE / DESCRIPTION', es: 'RECETA / DESCRIPCIÓN', fr: 'RECETTE / DESCRIPTION' },
  pdf_time_col:       { el: 'ΩΡΑ',              en: 'TIME',         es: 'HORA',          fr: 'HEURE' },
  pdf_day_total:      { el: 'ΣΥΝΟΛΟ ΗΜΕΡΑΣ',    en: 'DAY TOTAL',    es: 'TOTAL DÍA',     fr: 'TOTAL JOURNÉE' },
  pdf_stats_title:    { el: 'Στατιστικά Εβδομάδας', en: 'Weekly Statistics', es: 'Estadísticas Semanales', fr: 'Statistiques Hebdomadaires' },
  pdf_stats_subtitle: { el: 'Αναλυτική αναφορά', en: 'Detailed report', es: 'Informe detallado', fr: 'Rapport détaillé' },
  pdf_per_day:        { el: 'Ανά Ημέρα',        en: 'Per Day',      es: 'Por Día',       fr: 'Par Jour' },
  pdf_col_day:        { el: 'ΗΜΕΡΑ',            en: 'DAY',          es: 'DÍA',           fr: 'JOUR' },
  pdf_col_activity:   { el: 'ΔΡΑΣΤΗΡΙΟΤΗΤΑ',    en: 'ACTIVITY',     es: 'ACTIVIDAD',     fr: 'ACTIVITÉ' },
  pdf_col_balance:    { el: 'ΙΣΟΖΥΓΙΟ',         en: 'BALANCE',      es: 'BALANCE',       fr: 'BILAN' },
  pdf_steps_kcal:     { el: 'Βήματα (εβδ. kcal)', en: 'Steps (weekly kcal)', es: 'Pasos (kcal sem.)', fr: 'Pas (kcal sem.)' },
  pdf_gym_kcal:       { el: 'Γυμναστήριο (kcal)', en: 'Gym (kcal)', es: 'Gimnasio (kcal)', fr: 'Salle (kcal)' },
  pdf_workouts:       { el: '{n}/7 προπονήσεις', en: '{n}/7 workouts', es: '{n}/7 entrenamientos', fr: '{n}/7 entraînements' },
  pdf_body_title:     { el: 'Μετρήσεις Σώματος', en: 'Body Measurements', es: 'Medidas Corporales', fr: 'Mesures Corporelles' },
  pdf_last_weight:    { el: 'Τελευταίο Βάρος',  en: 'Last Weight',  es: 'Último Peso',   fr: 'Dernier Poids' },
  pdf_fat_pct:        { el: '% Λίπους',         en: '% Body Fat',   es: '% Grasa',       fr: '% Graisse' },
  pdf_muscle_pct:     { el: '% Μυϊκής Μάζας',   en: '% Muscle Mass', es: '% Masa Muscular', fr: '% Masse Musculaire' },
  pdf_body_history:   { el: 'Ιστορικό Μετρήσεων', en: 'Measurement History', es: 'Historial de Medidas', fr: 'Historique des Mesures' },
  pdf_col_date:       { el: 'ΗΜΕΡΟΜΗΝΙΑ',       en: 'DATE',         es: 'FECHA',         fr: 'DATE' },
  pdf_col_weight:     { el: 'ΒΑΡΟΣ',            en: 'WEIGHT',       es: 'PESO',          fr: 'POIDS' },
  pdf_col_fat:        { el: '% ΛΙΠΟΥΣ',         en: '% BODY FAT',   es: '% GRASA',       fr: '% GRAISSE' },
  pdf_col_muscle:     { el: '% ΜΥΪΚΗΣ',         en: '% MUSCLE',     es: '% MUSCULAR',    fr: '% MUSCULAIRE' },
  pdf_gauge_avg:      { el: 'Μέση',             en: 'Avg',          es: 'Med.',          fr: 'Moy.' },
  pdf_this_week:      { el: 'Αυτή την εβδομάδα', en: 'This week',   es: 'Esta semana',   fr: 'Cette semaine' },
  pdf_open_print:     { el: '⏳ Άνοιγμα εκτύπωσης...', en: '⏳ Opening print...', es: '⏳ Abriendo impresión...', fr: '⏳ Ouverture impression...' },

  // ── Disclaimer (shown at registration) ──
  disclaimer_title: {
    el: '⚠️ Σημαντική Ανακοίνωση',
    en: '⚠️ Important Notice',
    es: '⚠️ Aviso Importante',
    fr: '⚠️ Avis Important',
  },
  disclaimer_body: {
    el: 'Το VIVON είναι εφαρμογή καταγραφής διατροφής και προσωπικής παρακολούθησης. ΔΕΝ παρέχει ιατρικές, διαιτολογικές ή άλλες επαγγελματικές συμβουλές. Οι πληροφορίες και υπολογισμοί στην εφαρμογή είναι ενδεικτικοί και ενδέχεται να περιέχουν ανακρίβειες. ΔΕΝ αντικαθιστούν τη γνώμη ιατρού, διαιτολόγου ή άλλου ειδικού. Χρησιμοποιείτε την εφαρμογή αποκλειστικά με δική σας ευθύνη. Σε περίπτωση υγειονομικών ανησυχιών, συμβουλευτείτε πάντα ειδικό.',
    en: 'VIVON is a personal nutrition tracking app. It does NOT provide medical, dietary, or professional advice of any kind. All information and calculations are indicative only and may contain inaccuracies. Nothing in this app should be considered a substitute for advice from a qualified doctor, dietitian, or healthcare professional. You use this app entirely at your own risk. If you have any health concerns, always consult a qualified professional.',
    es: 'VIVON es una aplicación personal de seguimiento nutricional. NO proporciona asesoramiento médico, dietético ni profesional de ningún tipo. Toda la información y los cálculos son meramente indicativos y pueden contener inexactitudes. Nada en esta aplicación debe considerarse un sustituto del consejo de un médico, dietista u otro profesional de la salud. Usas esta aplicación bajo tu propia responsabilidad. Si tienes alguna preocupación de salud, consulta siempre a un profesional.',
    fr: 'VIVON est une application personnelle de suivi nutritionnel. Elle ne fournit AUCUN conseil médical, diététique ou professionnel. Toutes les informations et calculs sont indicatifs et peuvent contenir des inexactitudes. Rien dans cette application ne remplace l\'avis d\'un médecin, diététicien ou autre professionnel de santé qualifié. Vous utilisez cette application entièrement à vos propres risques. En cas de préoccupation de santé, consultez toujours un professionnel qualifié.',
  },
  disclaimer_check: {
    el: 'Διάβασα και αποδέχομαι τους παραπάνω όρους. Κατανοώ ότι η εφαρμογή δεν παρέχει ιατρικές συμβουλές.',
    en: 'I have read and accept the above notice. I understand this app does not provide medical advice.',
    es: 'He leído y acepto el aviso anterior. Entiendo que esta aplicación no proporciona asesoramiento médico.',
    fr: 'J\'ai lu et j\'accepte l\'avis ci-dessus. Je comprends que cette application ne fournit pas de conseils médicaux.',
  },
  disclaimer_required: {
    el: 'Πρέπει να αποδεχτείς τους όρους για να εγγραφείς.',
    en: 'You must accept the notice to create an account.',
    es: 'Debes aceptar el aviso para crear una cuenta.',
    fr: 'Vous devez accepter l\'avis pour créer un compte.',
  },

  // ── Meal types ──
  meal_breakfast:   { el: 'Πρωινό',       en: 'Breakfast',   es: 'Desayuno',    fr: 'Petit-déjeuner' },
  meal_snack:       { el: 'Δεκατιανό',    en: 'Snack',       es: 'Merienda',    fr: 'Collation' },
  meal_lunch:       { el: 'Μεσημεριανό',  en: 'Lunch',       es: 'Almuerzo',    fr: 'Déjeuner' },
  meal_afternoon:   { el: 'Απογευματινό', en: 'Afternoon',   es: 'Merienda tarde', fr: 'Goûter' },
  meal_dinner:      { el: 'Βραδινό',      en: 'Dinner',      es: 'Cena',        fr: 'Dîner' },

  // Plural / header forms
  meal_breakfasts:  { el: 'Πρωινά',       en: 'Breakfasts',  es: 'Desayunos',   fr: 'Petits-déjeuners' },
  meal_snacks:      { el: 'Δεκατιανά',    en: 'Snacks',      es: 'Meriendas',   fr: 'Collations' },
  meal_lunches:     { el: 'Μεσημεριανά',  en: 'Lunches',     es: 'Almuerzos',   fr: 'Déjeuners' },
  meal_afternoons:  { el: 'Απογευματινά', en: 'Afternoons',  es: 'Meriendas tarde', fr: 'Goûters' },
  meal_dinners:     { el: 'Βραδινά',      en: 'Dinners',     es: 'Cenas',       fr: 'Dîners' },

  // ── Activity levels ──
  activity_0: { el: 'Καμία (0 προπονήσεις/εβδ.)',         en: 'None (0 workouts/week)',            es: 'Ninguna (0 entrenamientos/sem.)',   fr: 'Aucune (0 entraînements/sem.)' },
  activity_2: { el: 'Ελαφριά (1–2 προπονήσεις/εβδ.)',    en: 'Light (1–2 workouts/week)',         es: 'Ligera (1–2 entrenamientos/sem.)', fr: 'Légère (1–2 entraînements/sem.)' },
  activity_3: { el: 'Μέτρια (3 προπονήσεις/εβδ.)',       en: 'Moderate (3 workouts/week)',        es: 'Moderada (3 entrenamientos/sem.)', fr: 'Modérée (3 entraînements/sem.)' },
  activity_5: { el: 'Έντονη (4–5 προπονήσεις/εβδ.)',     en: 'Intense (4–5 workouts/week)',       es: 'Intensa (4–5 entrenamientos/sem.)',fr: 'Intense (4–5 entraînements/sem.)' },
  activity_7: { el: 'Πολύ έντονη (6–7 προπονήσεις/εβδ.)',en: 'Very intense (6–7 workouts/week)', es: 'Muy intensa (6–7 entren./sem.)',   fr: 'Très intense (6–7 entraîn./sem.)' },

  // ── Food categories ──
  cat_protein: { el: '🥩 Πρωτεΐνες',       en: '🥩 Proteins',       es: '🥩 Proteínas',      fr: '🥩 Protéines' },
  cat_carbs:   { el: '🍚 Υδατάνθρακες',    en: '🍚 Carbohydrates',  es: '🍚 Carbohidratos',  fr: '🍚 Glucides' },
  cat_veggie:  { el: '🥦 Λαχανικά',        en: '🥦 Vegetables',     es: '🥦 Verduras',       fr: '🥦 Légumes' },
  cat_fat:     { el: '🫒 Λιπαρά',          en: '🫒 Fats',           es: '🫒 Grasas',         fr: '🫒 Lipides' },
  cat_dairy:   { el: '🥛 Γαλακτοκομικά',   en: '🥛 Dairy',          es: '🥛 Lácteos',        fr: '🥛 Produits laitiers' },
  cat_fruit:   { el: '🍎 Φρούτα',          en: '🍎 Fruits',         es: '🍎 Frutas',         fr: '🍎 Fruits' },
  cat_other:   { el: '🧂 Άλλα',            en: '🧂 Other',          es: '🧂 Otros',          fr: '🧂 Autres' },

  // ── Supplement categories ──
  suppl_cat_sport:     { el: 'Αθλητική Απόδοση', en: 'Sports Performance', es: 'Rendimiento deportivo', fr: 'Performance sportive' },
  suppl_cat_health:    { el: 'Υγεία',            en: 'Health',             es: 'Salud',                 fr: 'Santé' },
  suppl_cat_immunity:  { el: 'Ανοσοποιητικό',    en: 'Immunity',           es: 'Inmunidad',             fr: 'Immunité' },
  suppl_cat_joint:     { el: 'Αρθρώσεις',        en: 'Joint Health',       es: 'Articulaciones',        fr: 'Articulations' },
  suppl_cat_hair:      { el: 'Μαλλιά & Νύχια',   en: 'Hair & Nails',       es: 'Cabello y uñas',        fr: 'Cheveux et ongles' },

  // ── Gender ──
  gender_male:   { el: '👤 Άνδρας',  en: '👤 Male',   es: '👤 Hombre', fr: '👤 Homme' },
  gender_female: { el: '👤 Γυναίκα', en: '👤 Female', es: '👤 Mujer',  fr: '👤 Femme' },

  // ── Day names ──
  day_sun: { el: 'Κυριακή',   en: 'Sunday',    es: 'Domingo',    fr: 'Dimanche' },
  day_mon: { el: 'Δευτέρα',   en: 'Monday',    es: 'Lunes',      fr: 'Lundi' },
  day_tue: { el: 'Τρίτη',     en: 'Tuesday',   es: 'Martes',     fr: 'Mardi' },
  day_wed: { el: 'Τετάρτη',   en: 'Wednesday', es: 'Miércoles',  fr: 'Mercredi' },
  day_thu: { el: 'Πέμπτη',    en: 'Thursday',  es: 'Jueves',     fr: 'Jeudi' },
  day_fri: { el: 'Παρασκευή', en: 'Friday',    es: 'Viernes',    fr: 'Vendredi' },
  day_sat: { el: 'Σάββατο',   en: 'Saturday',  es: 'Sábado',     fr: 'Samedi' },
  day_sun_s: { el: 'Κυρ', en: 'Sun', es: 'Dom', fr: 'Dim' },
  day_mon_s: { el: 'Δευ', en: 'Mon', es: 'Lun', fr: 'Lun' },
  day_tue_s: { el: 'Τρί', en: 'Tue', es: 'Mar', fr: 'Mar' },
  day_wed_s: { el: 'Τετ', en: 'Wed', es: 'Mié', fr: 'Mer' },
  day_thu_s: { el: 'Πέμ', en: 'Thu', es: 'Jue', fr: 'Jeu' },
  day_fri_s: { el: 'Παρ', en: 'Fri', es: 'Vie', fr: 'Ven' },
  day_sat_s: { el: 'Σάβ', en: 'Sat', es: 'Sáb', fr: 'Sam' },

  // ── Month abbreviations ──
  month_jan: { el: 'Ιαν', en: 'Jan', es: 'Ene', fr: 'Jan' },
  month_feb: { el: 'Φεβ', en: 'Feb', es: 'Feb', fr: 'Fév' },
  month_mar: { el: 'Μαρ', en: 'Mar', es: 'Mar', fr: 'Mar' },
  month_apr: { el: 'Απρ', en: 'Apr', es: 'Abr', fr: 'Avr' },
  month_may: { el: 'Μαΐ', en: 'May', es: 'May', fr: 'Mai' },
  month_jun: { el: 'Ιουν', en: 'Jun', es: 'Jun', fr: 'Juin' },
  month_jul: { el: 'Ιουλ', en: 'Jul', es: 'Jul', fr: 'Juil' },
  month_aug: { el: 'Αυγ', en: 'Aug', es: 'Ago', fr: 'Août' },
  month_sep: { el: 'Σεπ', en: 'Sep', es: 'Sep', fr: 'Sep' },
  month_oct: { el: 'Οκτ', en: 'Oct', es: 'Oct', fr: 'Oct' },
  month_nov: { el: 'Νοε', en: 'Nov', es: 'Nov', fr: 'Nov' },
  month_dec: { el: 'Δεκ', en: 'Dec', es: 'Dic', fr: 'Déc' },

  // ── Common UI actions / labels ──
  btn_save:       { el: 'Αποθήκευση',   en: 'Save',        es: 'Guardar',    fr: 'Enregistrer' },
  btn_cancel:     { el: 'Ακύρωση',      en: 'Cancel',      es: 'Cancelar',   fr: 'Annuler' },
  btn_delete:     { el: 'Διαγραφή',     en: 'Delete',      es: 'Eliminar',   fr: 'Supprimer' },
  btn_edit:       { el: 'Επεξεργασία',  en: 'Edit',        es: 'Editar',     fr: 'Modifier' },
  btn_add:        { el: 'Προσθήκη',     en: 'Add',         es: 'Añadir',     fr: 'Ajouter' },
  btn_close:      { el: 'Κλείσιμο',     en: 'Close',       es: 'Cerrar',     fr: 'Fermer' },
  btn_confirm:    { el: 'Επιβεβαίωση',  en: 'Confirm',     es: 'Confirmar',  fr: 'Confirmer' },
  btn_back:       { el: '← Πίσω',       en: '← Back',      es: '← Atrás',    fr: '← Retour' },
  btn_next:       { el: 'Επόμενο →',    en: 'Next →',      es: 'Siguiente →',fr: 'Suivant →' },
  btn_done:       { el: 'Ολοκλήρωση ✓', en: 'Done ✓',      es: 'Listo ✓',    fr: 'Terminé ✓' },
  btn_generate:   { el: '🚀 Δημιουργία πλάνου', en: '🚀 Generate plan', es: '🚀 Generar plan', fr: '🚀 Générer le plan' },
  btn_new_recipe: { el: '+ Νέα συνταγή', en: '+ New recipe', es: '+ Nueva receta', fr: '+ Nouvelle recette' },
  btn_new_food:   { el: '➕ Νέα', en: '➕ New', es: '➕ Nuevo', fr: '➕ Nouveau' },

  // ── Search / empty states ──
  search_recipe:  { el: 'Αναζήτηση συνταγής...', en: 'Search recipe...', es: 'Buscar receta...', fr: 'Rechercher une recette...' },
  search_food:    { el: 'Αναζήτηση τροφής...',   en: 'Search food...',   es: 'Buscar alimento...', fr: 'Rechercher un aliment...' },
  search_meal:    { el: 'Αναζήτηση γεύματος...', en: 'Search meal...',   es: 'Buscar comida...', fr: 'Rechercher un repas...' },
  empty_meals:    { el: 'Δεν βρέθηκαν γεύματα',  en: 'No meals found',   es: 'No se encontraron comidas', fr: 'Aucun repas trouvé' },
  empty_recipes:  { el: 'Δεν βρέθηκαν συνταγές', en: 'No recipes found', es: 'No se encontraron recetas', fr: 'Aucune recette trouvée' },

  // ── Recipe / Food page ──
  recipes_title:      { el: '📖 Συνταγές',       en: '📖 Recipes',      es: '📖 Recetas',       fr: '📖 Recettes' },
  foods_title:        { el: '🔬 Λεξικό Τροφών',  en: '🔬 Food Lexicon', es: '🔬 Léxico de alimentos', fr: '🔬 Lexique alimentaire' },
  nav_ideas_recipes:  { el: 'Συνταγές',           en: 'Recipes',         es: 'Recetas',           fr: 'Recettes' },
  nav_ideas_foods:    { el: 'Τρόφιμα',            en: 'Foods',           es: 'Alimentos',         fr: 'Aliments' },
  filter_all:       { el: 'Όλες',              en: 'All',             es: 'Todas',            fr: 'Toutes' },
  recipe_serving:   { el: 'Σερβίρισμα',        en: 'Serving',         es: 'Servicio',         fr: 'Service' },
  recipe_instruct:  { el: 'Οδηγίες',           en: 'Instructions',    es: 'Instrucciones',    fr: 'Instructions' },
  recipe_ingred:    { el: 'Υλικά',             en: 'Ingredients',     es: 'Ingredientes',     fr: 'Ingrédients' },
  add_to_day:       { el: 'Προσθήκη στην ημέρα', en: 'Add to day',    es: 'Añadir al día',    fr: 'Ajouter au jour' },
  add_to_week:      { el: 'Προσθήκη στην εβδομάδα', en: 'Add to week', es: 'Añadir a la semana', fr: 'Ajouter à la semaine' },

  // ── Today page ──
  today_no_plan:    { el: 'Δεν έχεις πλάνο για σήμερα', en: 'No plan for today', es: 'Sin plan para hoy', fr: 'Pas de plan pour aujourd\'hui' },
  today_create_plan: { el: 'Δημιούργησε πλάνο', en: 'Create plan', es: 'Crear plan', fr: 'Créer un plan' },
  water_note_label:  { el: '💧 Νερό', en: '💧 Water', es: '💧 Agua', fr: '💧 Eau' },
  water_note_500ml:  { el: 'Πιες 500ml νερό 💧 — Σύνολο ως τώρα: {total}', en: 'Drink 500ml water 💧 — Total so far: {total}', es: 'Bebe 500ml de agua 💧 — Total hasta ahora: {total}', fr: 'Bois 500ml d\'eau 💧 — Total jusqu\'ici : {total}' },
  water_note_1l:     { el: 'Πιες 1L νερό 💧 — Στόχος: 3L ✅', en: 'Drink 1L water 💧 — Goal: 3L ✅', es: 'Bebe 1L de agua 💧 — Objetivo: 3L ✅', fr: 'Bois 1L d\'eau 💧 — Objectif : 3L ✅' },
  mark_done:        { el: 'Ολοκληρώθηκε', en: 'Done', es: 'Listo', fr: 'Terminé' },

  // ── Week page ──
  week_avg_intake:  { el: 'Μέση πρόσληψη',          en: 'Avg intake',          es: 'Ingesta media',       fr: 'Apport moyen' },
  week_balance_good: { el: 'Εξαιρετική ισορροπία',  en: 'Excellent balance',   es: 'Equilibrio excelente',fr: 'Excellent équilibre' },
  week_balance_low:  { el: 'Λίγο χαμηλά',           en: 'A bit low',           es: 'Un poco bajo',        fr: 'Un peu bas' },
  week_balance_high: { el: 'Λίγο υπερβολικά',       en: 'A bit over',          es: 'Un poco alto',        fr: 'Un peu trop' },
  week_keep_going:   { el: 'Συνέχισε έτσι',         en: 'Keep it up',          es: '¡Sigue así!',         fr: 'Continue comme ça' },
  week_increase_kcal:{ el: 'Αύξησε λίγο τις θερμίδες', en: 'Increase calories a bit', es: 'Aumenta un poco las calorías', fr: 'Augmente un peu les calories' },
  week_decrease_kcal:{ el: 'Μείωσε λίγο τις θερμίδες', en: 'Decrease calories a bit', es: 'Reduce un poco las calorías', fr: 'Réduis un peu les calories' },
  week_day_prefix:   { el: 'Ημ{n}',                 en: 'D{n}',                es: 'D{n}',                fr: 'J{n}' },
  week_reset_confirm: { el: 'Επαναφορά εβδομαδιαίου πλάνου στις προεπιλογές;', en: 'Reset weekly plan to defaults?', es: '¿Restablecer el plan semanal?', fr: 'Réinitialiser le plan hebdomadaire ?' },
  week_reset_done:    { el: '✅ Εβδομαδιαίο πλάνο επαναφέρθηκε στις προεπιλογές', en: '✅ Weekly plan reset to defaults', es: '✅ Plan semanal restablecido', fr: '✅ Plan hebdomadaire réinitialisé' },
  deficit_label:      { el: 'Έλλειμμα',       en: 'Deficit',    es: 'Déficit',    fr: 'Déficit' },
  surplus_label:      { el: 'Πλεόνασμα',      en: 'Surplus',    es: 'Superávit',  fr: 'Surplus' },
  deficit_abbr:       { el: 'έλλ.',           en: 'def.',       es: 'déf.',       fr: 'déf.' },
  surplus_abbr:       { el: 'πλεόν.',         en: 'surp.',      es: 'sup.',       fr: 'surp.' },
  deficit_on_track:   { el: 'Στη σωστή πορεία!',  en: 'On track!',     es: '¡En el buen camino!', fr: 'Sur la bonne voie !' },
  surplus_today:      { el: 'Πλεόνασμα σήμερα',  en: 'Surplus today', es: 'Superávit hoy',       fr: 'Surplus aujourd\'hui' },
  deficit_help:       { el: 'Το ημερήσιο έλλειμμα σε βοηθά να πετύχεις τους στόχους σου.', en: 'The daily deficit helps you reach your goals.', es: 'El déficit diario te ayuda a alcanzar tus objetivos.', fr: 'Le déficit journalier t\'aide à atteindre tes objectifs.' },
  surplus_help:       { el: 'Κατανάλωσες περισσότερες θερμίδες από όσες έκαψες.', en: 'You consumed more calories than you burned.', es: 'Consumiste más calorías de las que quemaste.', fr: 'Tu as consommé plus de calories que tu n\'en as brûlées.' },

  // ── Wizard ──
  wizard_style_title:   { el: '🍽️ Στυλ διατροφής',   en: '🍽️ Eating style',    es: '🍽️ Estilo alimentario', fr: '🍽️ Style alimentaire' },
  wizard_step_label:    { el: 'Βήμα {n} από {total} — Επίλεξε στυλ', en: 'Step {n} of {total} — Choose style', es: 'Paso {n} de {total} — Elige estilo', fr: 'Étape {n} sur {total} — Choisir le style' },
  wizard_style_desc:    { el: 'Τα απλά γεύματα είναι εύκολα στην παρασκευή. Τα gourmet έχουν περισσότερη διαδικασία.', en: 'Simple meals are easy to prepare. Gourmet meals require more work.', es: 'Las comidas simples son fáciles. Las gourmet requieren más elaboración.', fr: 'Les repas simples sont faciles. Les gourmet demandent plus de travail.' },
  wizard_simple_title:  { el: 'Απλά γεύματα', en: 'Simple meals', es: 'Comidas simples', fr: 'Repas simples' },
  wizard_simple_sub:    { el: 'Κοτόπουλο, ρύζι, πατάτα, αυγά, σαλάτες — γρήγορα & χωρίς μεγάλη διαδικασία', en: 'Chicken, rice, potato, eggs, salads — quick & easy', es: 'Pollo, arroz, patata, huevos, ensaladas — rápido y fácil', fr: 'Poulet, riz, pomme de terre, œufs, salades — rapide et facile' },
  wizard_mixed_title:   { el: 'Μεικτά', en: 'Mixed', es: 'Mixto', fr: 'Mixte' },
  wizard_mixed_sub:     { el: 'Συνδυασμός απλών και σύνθετων — καθημερινή ισορροπία', en: 'Mix of simple and complex — daily balance', es: 'Combinación de simples y complejas — equilibrio diario', fr: 'Mélange de simples et complexes — équilibre quotidien' },
  wizard_gourmet_title: { el: 'Gourmet', en: 'Gourmet', es: 'Gourmet', fr: 'Gourmet' },
  wizard_gourmet_sub:   { el: 'Μουσακάς, avocado toast, shakshuka, ποικιλία υλικών — για όταν έχεις χρόνο', en: 'Moussaka, avocado toast, shakshuka, variety — for when you have time', es: 'Musaka, tostada de aguacate, shakshuka, variedad — para cuando tienes tiempo', fr: 'Moussaka, toast avocat, shakshuka, variété — pour quand tu as le temps' },
  wizard_deselect:               { el: 'Αποεπίλεξε τα γεύματα που ΔΕΝ θέλεις', en: 'Deselect meals you do NOT want', es: 'Deselecciona las comidas que NO quieres', fr: 'Désélectionne les repas que tu NE veux PAS' },
  wizard_meal_sublabel:          { el: 'Αποεπίλεξε τα γεύματα που ΔΕΝ θέλεις στο {slot}.', en: 'Deselect meals you do NOT want for {slot}.', es: 'Deselecciona las comidas que NO quieres en {slot}.', fr: 'Désélectionne les repas que tu NE veux PAS pour {slot}.' },
  wizard_meal_sublabel_breakfast: { el: 'Αποεπίλεξε τα γεύματα που ΔΕΝ θέλεις στο πρωινό.', en: 'Deselect breakfasts you do NOT want.', es: 'Deselecciona los desayunos que NO quieres.', fr: 'Désélectionne les petits-déjeuners que tu NE veux PAS.' },
  wizard_meal_sublabel_snack:     { el: 'Αποεπίλεξε τα σνακ που ΔΕΝ θέλεις.', en: 'Deselect snacks you do NOT want.', es: 'Deselecciona los snacks que NO quieres.', fr: 'Désélectionne les snacks que tu NE veux PAS.' },
  wizard_meal_sublabel_lunch:     { el: 'Αποεπίλεξε τα γεύματα που ΔΕΝ θέλεις στο μεσημεριανό.', en: 'Deselect lunches you do NOT want.', es: 'Deselecciona los almuerzos que NO quieres.', fr: 'Désélectionne les déjeuners que tu NE veux PAS.' },
  wizard_meal_sublabel_dinner:    { el: 'Αποεπίλεξε τα γεύματα που ΔΕΝ θέλεις στο βραδινό.', en: 'Deselect dinners you do NOT want.', es: 'Deselecciona las cenas que NO quieres.', fr: 'Désélectionne les dîners que tu NE veux PAS.' },
  wizard_confirm_title:          { el: '✅ Επιβεβαίωση πλάνου', en: '✅ Confirm plan', es: '✅ Confirmar plan', fr: '✅ Confirmer le plan' },
  wizard_confirm_sub:            { el: 'Το πλάνο θα δημιουργηθεί με τις επιλογές σου.', en: 'The plan will be created with your choices.', es: 'El plan se creará con tus opciones.', fr: 'Le plan sera créé avec tes choix.' },
  wizard_selected_count:         { el: '{sel} επιλεγμένα · {exc} αποκλεισμένα', en: '{sel} selected · {exc} excluded', es: '{sel} seleccionados · {exc} excluidos', fr: '{sel} sélectionnés · {exc} exclus' },
  wizard_select_all:             { el: 'Επιλογή όλων', en: 'Select all', es: 'Seleccionar todo', fr: 'Tout sélectionner' },
  wizard_all_ok:                 { el: '✓ Όλα επιτρεπτά', en: '✓ All allowed', es: '✓ Todos permitidos', fr: '✓ Tous autorisés' },
  wizard_more:                   { el: '+{n} ακόμα', en: '+{n} more', es: '+{n} más', fr: '+{n} de plus' },

  // ── Stats / Progress ──
  stats_title:      { el: '📊 Στατιστικά', en: '📊 Statistics', es: '📊 Estadísticas', fr: '📊 Statistiques' },
  stats_kcal:       { el: 'Θερμίδες', en: 'Calories', es: 'Calorías', fr: 'Calories' },
  stats_protein:    { el: 'Πρωτεΐνη', en: 'Protein',  es: 'Proteína', fr: 'Protéines' },
  stats_carbs:      { el: 'Υδατ.',    en: 'Carbs',    es: 'Carbos.',  fr: 'Glucides' },
  stats_fat:        { el: 'Λιπαρά',   en: 'Fat',      es: 'Grasas',   fr: 'Lipides' },
  stats_goal:       { el: 'Στόχος',   en: 'Goal',     es: 'Objetivo', fr: 'Objectif' },
  stats_avg:        { el: 'Μέσος Όρος', en: 'Average', es: 'Promedio', fr: 'Moyenne' },
  stats_week:       { el: 'Εβδομάδα',  en: 'Week',    es: 'Semana',   fr: 'Semaine' },
  stats_day:        { el: 'Ημέρα',     en: 'Day',     es: 'Día',      fr: 'Jour' },

  // ── BMI labels ──
  bmi_underweight:  { el: 'Λιποβαρής',      en: 'Underweight',    es: 'Bajo peso',      fr: 'Insuffisance pondérale' },
  bmi_normal:       { el: 'Κανονικό',       en: 'Normal',         es: 'Normal',         fr: 'Normal' },
  bmi_overweight:   { el: 'Υπέρβαρος',      en: 'Overweight',     es: 'Sobrepeso',      fr: 'Surpoids' },
  bmi_obese:        { el: 'Παχυσαρκία',     en: 'Obese',          es: 'Obesidad',       fr: 'Obésité' },

  // ── Profile / Optimize ──
  prof_custom_tdee:     { el: 'Χειροκίνητο TDEE', en: 'Manual TDEE', es: 'TDEE manual', fr: 'TDEE manuel' },
  prof_first_meal:      { el: 'Ώρα πρώτου γεύματος', en: 'First meal time', es: 'Hora del primer plato', fr: 'Heure du premier repas' },
  prof_name_placeholder:{ el: 'Το όνομά σου...', en: 'Your name...', es: 'Tu nombre...', fr: 'Ton prénom...' },

  // ── Optimize / Goals ──
  opt_title:        { el: 'Βελτίωση',              en: 'Optimize',            es: 'Optimizar',            fr: 'Optimiser' },
  pace_slow:        { el: 'Αργός',        en: 'Slow',        es: 'Lento',        fr: 'Lent' },
  pace_moderate:    { el: 'Μέτριος',      en: 'Moderate',    es: 'Moderado',     fr: 'Modéré' },
  pace_fast:        { el: 'Γρήγορος',     en: 'Fast',        es: 'Rápido',       fr: 'Rapide' },
  pace_aggressive:  { el: 'Επιθετικός',   en: 'Aggressive',  es: 'Agresivo',     fr: 'Agressif' },
  pace_maintain:    { el: 'Συντήρηση',    en: 'Maintenance', es: 'Mantenimiento', fr: 'Maintien' },
  pace_bulk:        { el: 'Αύξηση Μάζας', en: 'Bulk',        es: 'Volumen',      fr: 'Prise de masse' },
  opt_goal_kcal:    { el: 'Στόχος Θερμίδων',       en: 'Calorie Goal',        es: 'Objetivo calórico',    fr: 'Objectif calorique' },
  opt_goal_protein: { el: 'Στόχος Πρωτεΐνης (g)',  en: 'Protein Goal (g)',    es: 'Objetivo proteína (g)',fr: 'Objectif protéines (g)' },
  opt_goal_carbs:   { el: 'Στόχος Υδατανθράκων (g)',en: 'Carb Goal (g)',      es: 'Objetivo carbos (g)',  fr: 'Objectif glucides (g)' },
  opt_goal_fat:     { el: 'Στόχος Λιπαρών (g)',    en: 'Fat Goal (g)',        es: 'Objetivo grasas (g)',  fr: 'Objectif lipides (g)' },

  // ── Body / Measurements ──
  body_title:           { el: 'Μετρήσεις',              en: 'Measurements',            es: 'Medidas',               fr: 'Mesures' },
  body_weight:          { el: 'Βάρος',                  en: 'Weight',                  es: 'Peso',                  fr: 'Poids' },
  body_fat:             { el: 'Λίπος',                  en: 'Body Fat',                es: 'Grasa corporal',        fr: 'Masse grasse' },
  body_muscle:          { el: 'Μυϊκή μάζα',             en: 'Muscle Mass',             es: 'Masa muscular',         fr: 'Masse musculaire' },
  body_log_empty:       { el: 'Δεν υπάρχουν μετρήσεις ακόμα', en: 'No measurements yet', es: 'Sin medidas aún',   fr: 'Pas encore de mesures' },
  body_page_title:      { el: 'ΜΕΤΡΗΣΕΙΣ ΣΩΜΑΤΟΣ',      en: 'BODY MEASUREMENTS',       es: 'MEDIDAS CORPORALES',    fr: 'MESURES CORPORELLES' },
  body_page_subtitle:   { el: 'Παρακολούθησε την πρόοδό σου', en: 'Track your progress', es: 'Sigue tu progreso',  fr: 'Suis ta progression' },
  body_new_entry:       { el: 'ΝΕΑ ΜΕΤΡΗΣΗ',            en: 'NEW MEASUREMENT',         es: 'NUEVA MEDIDA',          fr: 'NOUVELLE MESURE' },
  body_date_label:      { el: 'Ημερομηνία',              en: 'Date',                    es: 'Fecha',                 fr: 'Date' },
  body_save_btn:        { el: 'Αποθήκευση Μέτρησης',    en: 'Save Measurement',        es: 'Guardar medida',        fr: 'Enregistrer la mesure' },
  body_history_title:   { el: 'ΙΣΤΟΡΙΚΟ ΜΕΤΡΗΣΕΩΝ',     en: 'MEASUREMENT HISTORY',     es: 'HISTORIAL DE MEDIDAS',  fr: 'HISTORIQUE DES MESURES' },
  body_view_all:        { el: 'Προβολή όλων των μετρήσεων ›', en: 'View all measurements ›', es: 'Ver todas las medidas ›', fr: 'Voir toutes les mesures ›' },
  body_chart_min:       { el: 'Χρειάζονται τουλάχιστον 2 μετρήσεις για διάγραμμα', en: 'At least 2 measurements needed for chart', es: 'Se necesitan al menos 2 medidas para el gráfico', fr: 'Au moins 2 mesures nécessaires pour le graphique' },
  body_count:           { el: '{n} μετρήσεις',           en: '{n} entries',             es: '{n} entradas',          fr: '{n} entrées' },
  body_weight_kg:       { el: 'Βάρος (kg)',              en: 'Weight (kg)',             es: 'Peso (kg)',             fr: 'Poids (kg)' },
  body_fat_pct:         { el: '% Λίπος',                 en: '% Body Fat',              es: '% Grasa',               fr: '% Graisse' },
  body_muscle_pct:      { el: '% Μυϊκή Μάζα',           en: '% Muscle Mass',           es: '% Masa muscular',       fr: '% Masse musculaire' },

  // ── Toasts / notifications ──
  toast_saved:           { el: '✅ Αποθηκεύτηκε!',          en: '✅ Saved!',                   es: '✅ ¡Guardado!',           fr: '✅ Enregistré !' },
  toast_deleted:         { el: '🗑️ Διαγράφηκε',            en: '🗑️ Deleted',                 es: '🗑️ Eliminado',           fr: '🗑️ Supprimé' },
  toast_body_saved:      { el: '✅ Μέτρηση αποθηκεύτηκε!', en: '✅ Measurement saved!',       es: '✅ ¡Medida guardada!',    fr: '✅ Mesure enregistrée !' },
  toast_body_deleted:    { el: '🗑 Εγγραφή διαγράφηκε',    en: '🗑 Entry deleted',            es: '🗑 Entrada eliminada',   fr: '🗑 Entrée supprimée' },
  toast_added:      { el: '✅ Προστέθηκε!',     en: '✅ Added!',           es: '✅ ¡Añadido!',       fr: '✅ Ajouté !' },
  toast_error:      { el: '❌ Σφάλμα',          en: '❌ Error',            es: '❌ Error',            fr: '❌ Erreur' },
  toast_plan_created: { el: '✅ Πλάνο δημιουργήθηκε!', en: '✅ Plan created!', es: '✅ ¡Plan creado!', fr: '✅ Plan créé !' },

  // ── Supplement detail fields ──
  suppl_qty:      { el: 'Δοσολογία',    en: 'Dosage',       es: 'Dosis',        fr: 'Dosage' },
  suppl_timing:   { el: 'Χρονισμός',    en: 'Timing',       es: 'Momento',      fr: 'Moment' },
  suppl_intake:   { el: 'Λήψη',         en: 'Intake',       es: 'Ingesta',      fr: 'Prise' },
  suppl_evidence: { el: 'Αποδείξεις',   en: 'Evidence',     es: 'Evidencia',    fr: 'Preuves' },
  suppl_tip:      { el: 'Συμβουλή',     en: 'Tip',          es: 'Consejo',      fr: 'Conseil' },
  suppl_boosts:   { el: 'Ενισχύεται με', en: 'Boosted by',  es: 'Potenciado por',fr: 'Renforcé par' },
  suppl_reduces:  { el: 'Μειώνεται από', en: 'Reduced by',  es: 'Reducido por', fr: 'Réduit par' },
  suppl_avoid:    { el: 'Αποφύγετε',    en: 'Avoid',        es: 'Evitar',       fr: 'Éviter' },
  suppl_drinks:   { el: 'Ροφήματα',     en: 'Drinks',       es: 'Bebidas',      fr: 'Boissons' },
  suppl_gap:      { el: 'Απόσταση',     en: 'Gap',          es: 'Intervalo',    fr: 'Intervalle' },
  suppl_ideal:    { el: 'Ιδανικό',      en: 'Ideal',        es: 'Ideal',        fr: 'Idéal' },

  // ── Evidence levels ──
  evidence_high:   { el: 'Υψηλή',  en: 'High',   es: 'Alta',  fr: 'Élevée' },
  evidence_medium: { el: 'Μέτρια', en: 'Medium', es: 'Media', fr: 'Moyenne' },
  evidence_low:    { el: 'Χαμηλή', en: 'Low',    es: 'Baja',  fr: 'Faible' },

  // ── Auth page ──
  auth_login:              { el: 'Σύνδεση',              en: 'Sign in',              es: 'Iniciar sesión',       fr: 'Connexion' },
  auth_register:           { el: 'Εγγραφή',              en: 'Create account',       es: 'Crear cuenta',         fr: 'Créer un compte' },
  auth_create_account:     { el: 'Δημιουργία λογαριασμού', en: 'Create account',    es: 'Crear cuenta',         fr: 'Créer un compte' },
  auth_email:              { el: 'Email',                en: 'Email',                es: 'Correo',               fr: 'E-mail' },
  auth_password:           { el: 'Κωδικός',              en: 'Password',             es: 'Contraseña',           fr: 'Mot de passe' },
  auth_password_hint:      { el: 'Τουλάχιστον 6 χαρακτήρες', en: 'At least 6 characters', es: 'Al menos 6 caracteres', fr: 'Au moins 6 caractères' },
  auth_name:               { el: 'Όνομα',                en: 'Name',                 es: 'Nombre',               fr: 'Prénom' },
  auth_forgot:             { el: 'Ξέχασες τον κωδικό σου;', en: 'Forgot your password?', es: '¿Olvidaste tu contraseña?', fr: 'Mot de passe oublié ?' },
  auth_reset_label:        { el: 'Επαναφορά',            en: 'Reset',                es: 'Restablecer',          fr: 'Réinitialiser' },
  auth_reset_hint:         { el: 'Εισάγετε το email σας και θα σας στείλουμε σύνδεσμο για επαναφορά κωδικού.', en: 'Enter your email and we\'ll send you a password reset link.', es: 'Introduce tu correo y te enviaremos un enlace para restablecer tu contraseña.', fr: 'Saisissez votre e-mail et nous vous enverrons un lien de réinitialisation.' },
  auth_reset_send:         { el: 'Αποστολή συνδέσμου',   en: 'Send reset link',      es: 'Enviar enlace',        fr: 'Envoyer le lien' },
  auth_reset_sent:         { el: 'Ο σύνδεσμος επαναφοράς στάλθηκε στο email σας.', en: 'The reset link has been sent to your email.', es: 'El enlace de restablecimiento ha sido enviado a tu correo.', fr: 'Le lien de réinitialisation a été envoyé à votre e-mail.' },
  auth_new_password:       { el: 'Νέος Κωδικός',         en: 'New Password',         es: 'Nueva Contraseña',     fr: 'Nouveau mot de passe' },
  auth_new_password_hint:  { el: 'Εισάγετε τον νέο σας κωδικό.', en: 'Enter your new password.', es: 'Introduce tu nueva contraseña.', fr: 'Saisissez votre nouveau mot de passe.' },
  auth_save_password:      { el: 'Αποθήκευση κωδικού',   en: 'Save password',        es: 'Guardar contraseña',   fr: 'Enregistrer le mot de passe' },
  auth_back_login:         { el: 'Πίσω στη σύνδεση',     en: 'Back to sign in',      es: 'Volver a iniciar sesión', fr: 'Retour à la connexion' },
  auth_loading:            { el: 'Παρακαλώ περιμένετε...', en: 'Please wait...', es: 'Por favor espera...', fr: 'Veuillez patienter...' },
  auth_check_email:        { el: 'Ελέγξτε το email σας για επιβεβαίωση εγγραφής.', en: 'Check your email to confirm registration.', es: 'Revisa tu correo para confirmar el registro.', fr: 'Vérifiez votre e-mail pour confirmer l\'inscription.' },
  auth_tagline:            { el: 'Ο σύμμαχός σου για μια καλύτερη διατροφή.', en: 'Your ally for better nutrition.', es: 'Tu aliado para una mejor nutrición.', fr: 'Votre allié pour une meilleure nutrition.' },
  auth_error_generic:      { el: 'Άγνωστο σφάλμα.', en: 'Unknown error.', es: 'Error desconocido.', fr: 'Erreur inconnue.' },
  auth_error_credentials:  { el: 'Λανθασμένο email ή κωδικός.', en: 'Incorrect email or password.', es: 'Correo o contraseña incorrectos.', fr: 'E-mail ou mot de passe incorrect.' },
  auth_error_not_confirmed:{ el: 'Παρακαλώ επιβεβαιώστε πρώτα το email σας.', en: 'Please confirm your email first.', es: 'Por favor, confirma tu correo primero.', fr: 'Veuillez d\'abord confirmer votre e-mail.' },
  auth_error_already_registered: { el: 'Υπάρχει ήδη λογαριασμός με αυτό το email.', en: 'An account with this email already exists.', es: 'Ya existe una cuenta con este correo.', fr: 'Un compte avec cet e-mail existe déjà.' },
  auth_error_password_short: { el: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.', en: 'Password must be at least 6 characters.', es: 'La contraseña debe tener al menos 6 caracteres.', fr: 'Le mot de passe doit comporter au moins 6 caractères.' },
  auth_error_invalid_email: { el: 'Μη έγκυρο email.', en: 'Invalid email.', es: 'Correo inválido.', fr: 'E-mail invalide.' },
  auth_error_rate_limit:   { el: 'Πολλές προσπάθειες. Παρακαλώ δοκιμάστε ξανά σε λίγα λεπτά.', en: 'Too many attempts. Please try again in a few minutes.', es: 'Demasiados intentos. Por favor, inténtalo de nuevo en unos minutos.', fr: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.' },
  auth_no_account:         { el: 'Δεν έχεις λογαριασμό;', en: 'No account?',         es: '¿Sin cuenta?',         fr: 'Pas de compte ?' },
  auth_have_account:       { el: 'Έχεις ήδη λογαριασμό;', en: 'Already have an account?', es: '¿Ya tienes cuenta?', fr: 'Déjà un compte ?' },

  // ── Units ──
  unit_piece:     { el: 'τεμ.', en: 'pc',      es: 'u.',    fr: 'pièce' },
  unit_piece_pl:  { el: 'τεμάχια', en: 'pieces', es: 'unidades', fr: 'pièces' },
  unit_grams:     { el: 'γραμμάρια (g)', en: 'grams (g)', es: 'gramos (g)', fr: 'grammes (g)' },
  unit_tsp:       { el: 'κ.γ.', en: 'tsp', es: 'cdta.',fr: 'c.à.c.' },
  unit_tbsp:      { el: 'κ.σ.', en: 'tbsp',es: 'cda.', fr: 'c.à.s.' },

  // ── Form labels ──
  form_name:                  { el: 'Όνομα',              en: 'Name',               es: 'Nombre',          fr: 'Nom' },
  form_category:              { el: 'Κατηγορία',          en: 'Category',           es: 'Categoría',       fr: 'Catégorie' },
  form_unit:                  { el: 'Μονάδα',             en: 'Unit',               es: 'Unidad',          fr: 'Unité' },
  form_meal_type:             { el: 'Τύπος Γεύματος',     en: 'Meal type',          es: 'Tipo de comida',  fr: 'Type de repas' },
  form_instructions:          { el: 'Οδηγίες',            en: 'Instructions',       es: 'Instrucciones',   fr: 'Instructions' },
  form_instructions_placeholder: { el: 'Βήμα 1...', en: 'Step 1...', es: 'Paso 1...', fr: 'Étape 1...' },
  form_kcal_per_serving:      { el: 'Θερμίδες ανά μερίδα', en: 'Calories per serving', es: 'Calorías por ración', fr: 'Calories par portion' },
  form_nutrients:             { el: 'Θρεπτικά στοιχεία',  en: 'Nutrition facts',    es: 'Valores nutricionales', fr: 'Valeurs nutritionnelles' },
  form_recipe_placeholder:    { el: 'πχ. Σαλάτα Τόνου',  en: 'e.g. Tuna Salad',   es: 'ej. Ensalada de atún', fr: 'ex. Salade thon' },
  form_food_placeholder:      { el: 'πχ. Τυρί κότατζ 0%', en: 'e.g. Cottage cheese 0%', es: 'ej. Queso cottage 0%', fr: 'ex. Fromage cottage 0%' },

  // ── Confirm dialogs ──
  confirm_delete_template:    { el: 'Διαγραφή αυτού του προτύπου;', en: 'Delete this template?', es: '¿Eliminar esta plantilla?', fr: 'Supprimer ce modèle ?' },
  confirm_reset_day:          { el: 'Επαναφορά Ημέρα {n} στα default γεύματα; Οι αλλαγές χάνονται.', en: 'Reset Day {n} to default meals? Changes will be lost.', es: '¿Restablecer el Día {n} a las comidas por defecto? Los cambios se perderán.', fr: 'Réinitialiser le Jour {n} aux repas par défaut ? Les modifications seront perdues.' },

  // ── Toast messages ──
  toast_new_week:             { el: 'Νέα εβδομάδα! Τα ημερήσια checkboxes έγιναν reset.', en: 'New week! Daily checkboxes were reset.', es: '¡Nueva semana! Las casillas diarias se reiniciaron.', fr: 'Nouvelle semaine ! Les cases quotidiennes ont été réinitialisées.' },
  toast_plan_style:           { el: 'Νέο πρόγραμμα ({style})!', en: 'New plan ({style})!', es: '¡Nuevo plan ({style})!', fr: 'Nouveau plan ({style}) !' },

  // ── Builder ──
  builder_plan_ready:         { el: 'Το πλάνο είναι έτοιμο!',  en: 'Plan is ready!',         es: '¡El plan está listo!',    fr: 'Le plan est prêt !' },
  builder_no_days_selected:   { el: 'Δεν έχεις επιλέξει ημέρες', en: 'No days selected', es: 'No has seleccionado días', fr: 'Aucun jour sélectionné' },
  builder_apply_confirm_title: { el: 'Εφαρμογή προγράμματος', en: 'Apply plan', es: 'Aplicar plan', fr: 'Appliquer le plan' },
  builder_apply_confirm_body: { el: 'Θέλεις να αποθηκεύσεις το πλάνο για: {days};<br><br>Το υπάρχον πρόγραμμα των ημερών αυτών θα αντικατασταθεί.', en: 'Do you want to save the plan for: {days}?<br><br>The existing schedule for these days will be replaced.', es: '¿Quieres guardar el plan para: {days}?<br><br>El programa existente para estos días será reemplazado.', fr: 'Veux-tu sauvegarder le plan pour : {days} ?<br><br>Le programme existant pour ces jours sera remplacé.' },

  // ── Supplement search ──
  search_supplement:          { el: 'Αναζήτηση συμπληρώματος…', en: 'Search supplement…', es: 'Buscar suplemento…', fr: 'Rechercher un supplément…' },

  // ── Supplement category filter labels ──
  supp_cat_all:      { el: 'Όλα',              en: 'All',           es: 'Todos',         fr: 'Tous' },
  supp_cat_sport:    { el: '💪 Αθλητική',      en: '💪 Sport',      es: '💪 Deporte',    fr: '💪 Sport' },
  supp_cat_health:   { el: '❤️ Υγεία',         en: '❤️ Health',     es: '❤️ Salud',      fr: '❤️ Santé' },
  supp_cat_wellness: { el: '🌿 Ευεξία',        en: '🌿 Wellness',   es: '🌿 Bienestar',  fr: '🌿 Bien-être' },
  supp_cat_fatburn:  { el: '🔥 Λιποδιάλυση',  en: '🔥 Fat Burn',   es: '🔥 Quemagrasas', fr: '🔥 Brûle-graisses' },
  supp_cat_personal: { el: '⭐ Προσωπικά',     en: '⭐ Personal',   es: '⭐ Personal',   fr: '⭐ Personnel' },
  supp_custom_title:       { el: 'Τα δικά μου συμπληρώματα', en: 'My supplements',        es: 'Mis suplementos',       fr: 'Mes suppléments' },
  supp_custom_add:         { el: 'Προσθήκη συμπληρώματος', en: 'Add supplement',       es: 'Añadir suplemento',   fr: 'Ajouter un supplément' },
  supp_custom_save:        { el: 'Αποθήκευση',               en: 'Save',                   es: 'Guardar',               fr: 'Enregistrer' },
  supp_custom_cancel:      { el: 'Ακύρωση',                  en: 'Cancel',                 es: 'Cancelar',              fr: 'Annuler' },
  supp_custom_delete:      { el: 'Διαγραφή',                 en: 'Delete',                 es: 'Eliminar',              fr: 'Supprimer' },
  supp_custom_name_ph:     { el: 'Όνομα συμπληρώματος…',     en: 'Supplement name…',       es: 'Nombre del suplemento…',fr: 'Nom du supplément…' },
  supp_custom_qty_ph:      { el: 'Δοσολογία (π.χ. 1 κάψουλα)', en: 'Dosage (e.g. 1 capsule)', es: 'Dosis (ej. 1 cápsula)', fr: 'Dosage (ex. 1 gélule)' },
  supp_custom_timing_ph:   { el: 'Χρονισμός (π.χ. Πρωί)',    en: 'Timing (e.g. Morning)',  es: 'Momento (ej. Mañana)',  fr: 'Moment (ex. Matin)' },
  supp_custom_name_required: { el: 'Συμπλήρωσε το όνομα', en: 'Enter a name', es: 'Introduce un nombre', fr: 'Entrez un nom' },

  // ── Profile section headings ──
  prof_goals_title:      { el: '🎯 Ημερήσιοι Στόχοι',    en: '🎯 Daily Goals',        es: '🎯 Objetivos diarios',   fr: '🎯 Objectifs quotidiens' },
  prof_meal_times_title: { el: '🕐 Ώρες Γευμάτων',       en: '🕐 Meal Times',          es: '🕐 Horarios de comidas', fr: '🕐 Horaires des repas' },
  prof_meal_times_desc:  { el: 'Ρύθμισε την ώρα κάθε γεύματος ξεχωριστά.', en: 'Set the time for each meal individually.', es: 'Ajusta el horario de cada comida por separado.', fr: 'Définissez l\'heure de chaque repas séparément.' },
  prof_plan_start_title: { el: '📅 Έναρξη Πλάνου',       en: '📅 Plan Start',          es: '📅 Inicio del plan',     fr: '📅 Début du plan' },
  prof_plan_start_desc:  { el: 'Επίλεξε ποια ημερομηνία αντιστοιχεί στην <strong>Ημέρα 1</strong> του πλάνου. Κάθε κουμπί ημέρας θα δείχνει αυτόματα την αντίστοιχη ημερομηνία.', en: 'Choose the date that corresponds to <strong>Day 1</strong> of your plan. Each day button will automatically show the matching date.', es: 'Elige qué fecha corresponde al <strong>Día 1</strong> del plan. Cada botón de día mostrará automáticamente la fecha correspondiente.', fr: 'Choisissez la date correspondant au <strong>Jour 1</strong> de votre plan. Chaque bouton de jour affichera automatiquement la date correspondante.' },
  prof_today_btn:        { el: 'Σήμερα',                  en: 'Today',                  es: 'Hoy',                    fr: 'Aujourd\'hui' },
  prof_create_plan_btn:  { el: '📋 Δημιουργία Πλάνου',   en: '📋 Create Plan',         es: '📋 Crear plan',          fr: '📋 Créer un plan' },
  prof_fill_first:       { el: '⚠️ Συμπλήρωσε πρώτα <strong>βάρος, ύψος και ηλικία</strong> στα στοιχεία σου παραπάνω.', en: '⚠️ First fill in your <strong>weight, height and age</strong> in the fields above.', es: '⚠️ Primero completa tu <strong>peso, altura y edad</strong> en los campos de arriba.', fr: '⚠️ Remplis d\'abord ton <strong>poids, ta taille et ton âge</strong> dans les champs ci-dessus.' },
  prof_print_title:      { el: '🖨️ Εκτύπωση &amp; Σύνοψη', en: '🖨️ Print &amp; Summary', es: '🖨️ Imprimir &amp; Resumen', fr: '🖨️ Imprimer &amp; Résumé' },
  prof_print_desc:       { el: 'Συνοπτική εβδομαδιαία προβολή: ημέρες, γεύματα, θερμίδες, macros.', en: 'Weekly summary view: days, meals, calories, macros.', es: 'Vista resumida semanal: días, comidas, calorías, macros.', fr: 'Vue récapitulative hebdomadaire : jours, repas, calories, macros.' },
  prof_print_btn:        { el: '🖨️ Εκτύπωση / Αποθήκευση PDF', en: '🖨️ Print / Save PDF', es: '🖨️ Imprimir / Guardar PDF', fr: '🖨️ Imprimer / Enregistrer PDF' },
  prof_click_edit:       { el: 'Πάτα για επεξεργασία ✏️', en: 'Tap to edit ✏️', es: 'Toca para editar ✏️', fr: 'Appuyez pour modifier ✏️' },
  prof_bmr_label:        { el: 'Βασικός Μεταβολισμός', en: 'Basal Metabolism', es: 'Metabolismo Basal', fr: 'Métabolisme de Base' },
  prof_kcal_label:       { el: '🔥 Θερμίδες', en: '🔥 Calories', es: '🔥 Calorías', fr: '🔥 Calories' },
  prof_protein_label:    { el: '🥩 Πρωτεΐνη', en: '🥩 Protein', es: '🥩 Proteína', fr: '🥩 Protéines' },

  // ── Goal pace section labels ──
  pace_loss_header:  { el: '📉 Απώλεια Βάρους', en: '📉 Weight Loss', es: '📉 Pérdida de peso', fr: '📉 Perte de poids' },
  pace_other_header: { el: '⚖️ Άλλοι Στόχοι',  en: '⚖️ Other Goals', es: '⚖️ Otros objetivos', fr: '⚖️ Autres objectifs' },
  pace_slow:         { el: '🐢 Αργός',          en: '🐢 Slow',        es: '🐢 Lento',          fr: '🐢 Lent' },
  pace_moderate:     { el: '🚶 Μέτριος',        en: '🚶 Moderate',    es: '🚶 Moderado',       fr: '🚶 Modéré' },
  pace_fast:         { el: '🏃 Γρήγορος',       en: '🏃 Fast',        es: '🏃 Rápido',         fr: '🏃 Rapide' },
  pace_aggressive:   { el: '🔥 Επιθετικός',     en: '🔥 Aggressive',  es: '🔥 Agresivo',       fr: '🔥 Agressif' },
  pace_maintain:     { el: '⚖️ Συντήρηση',      en: '⚖️ Maintain',    es: '⚖️ Mantenimiento',  fr: '⚖️ Maintien' },
  pace_bulk:         { el: '💪 Αύξηση Μάζας',   en: '💪 Bulk',        es: '💪 Volumen',        fr: '💪 Prise de masse' },
  pace_hint_kcal:    { el: '−{n} kcal/ημέρα',  en: '−{n} kcal/day', es: '−{n} kcal/día',     fr: '−{n} kcal/jour' },
  pace_hint_tdee:    { el: '= TDEE {n} kcal',   en: '= TDEE {n} kcal', es: '= TDEE {n} kcal', fr: '= TDEE {n} kcal' },
  pace_hint_bulk:    { el: '+200 kcal · {n}g πρωτ.', en: '+200 kcal · {n}g prot.', es: '+200 kcal · {n}g prot.', fr: '+200 kcal · {n}g prot.' },

  // ── Profile/share ──
  prof_protein_hint:  { el: 'Συν. 1.9g/kg: {val}g', en: 'Rec. 1.9g/kg: {val}g', es: 'Rec. 1.9g/kg: {val}g', fr: 'Rec. 1.9g/kg : {val}g' },
  share_plan_title:   { el: 'Πλάνο', en: 'Plan', es: 'Plan', fr: 'Plan' },
  share_user:         { el: 'Χρήστης', en: 'User', es: 'Usuario', fr: 'Utilisateur' },

  // ── Macro abbreviations for display ──
  macro_p_abbr: { el: 'Π', en: 'P', es: 'P', fr: 'P' },
  macro_c_abbr: { el: 'Υ', en: 'C', es: 'C', fr: 'G' },
  macro_f_abbr: { el: 'Λ', en: 'F', es: 'G', fr: 'L' },

  // ── Foods page ──
  foods_new_btn:       { el: '➕ Νέα',             en: '➕ New',              es: '➕ Nuevo',              fr: '➕ Nouveau' },

  // ── Builder / Planner page ──
  builder_title:      { el: 'Σχεδιαστής Ημέρας', en: 'Day Planner', es: 'Planificador diario', fr: 'Planificateur journalier' },
  builder_your_day:   { el: 'Η μέρα σου',         en: 'Your day',    es: 'Tu día',              fr: 'Ta journée' },
  builder_templates:  { el: 'Πρότυπα',             en: 'Templates',   es: 'Plantillas',          fr: 'Modèles' },
  builder_save_tpl:   { el: '💾 Αποθήκευση ως πρότυπο', en: '💾 Save as template', es: '💾 Guardar como plantilla', fr: '💾 Enregistrer comme modèle' },
  builder_apply_day:           { el: 'Εφαρμογή στην εβδομάδα',       en: 'Apply to week',              es: 'Aplicar a la semana',           fr: 'Appliquer à la semaine' },
  builder_topcard_title:       { el: 'Σχεδιαστής',                   en: 'Planner',                    es: 'Planificador',                  fr: 'Planificateur' },
  builder_topcard_sub:         { el: 'Σχεδίασε τα γεύματά σου για σήμερα', en: 'Plan your meals for today', es: 'Planifica tus comidas de hoy', fr: 'Planifie tes repas pour aujourd\'hui' },
  builder_preview_btn:         { el: 'Προεπισκόπηση',                en: 'Preview',                    es: 'Vista previa',                  fr: 'Aperçu' },
  builder_clear_btn:           { el: 'Καθαρισμός επιλογής',          en: 'Clear selection',            es: 'Limpiar selección',             fr: 'Effacer la sélection' },
  builder_week_plan_title:     { el: 'Δημιουργία εβδομαδιαίου πλάνου', en: 'Create weekly plan',      es: 'Crear plan semanal',            fr: 'Créer un plan hebdomadaire' },
  builder_week_plan_desc:      { el: 'Επίλεξε γεύματα και αποθήκευσέ τα σε κάθε μέρα. Πάτα ξανά σε μια μέρα για αποεπιλογή.', en: 'Select meals and save them to each day. Tap a day again to deselect.', es: 'Selecciona comidas y guárdalas en cada día. Toca un día de nuevo para deseleccionarlo.', fr: 'Sélectionne des repas et enregistre-les pour chaque jour. Appuie à nouveau sur un jour pour le désélectionner.' },
  builder_lib_title:           { el: 'Βιβλιοθήκη τροφίμων',         en: 'Food Library',               es: 'Biblioteca de alimentos',       fr: 'Bibliothèque d\'aliments' },
  builder_day_plan_title:      { el: 'Το πλάνο της ημέρας',          en: 'Day Plan',                   es: 'Plan del día',                  fr: 'Plan du jour' },
  builder_empty_select:        { el: 'Επίλεξε γεύματα από αριστερά', en: 'Select meals from the left', es: 'Selecciona comidas de la izquierda', fr: 'Sélectionne des repas à gauche' },
  builder_empty_meals:         { el: 'Δεν βρέθηκαν γεύματα',         en: 'No meals found',             es: 'No se encontraron comidas',     fr: 'Aucun repas trouvé' },
  builder_summary_title:       { el: 'Σύνοψη ημέρας',                en: 'Day Summary',                es: 'Resumen del día',               fr: 'Résumé du jour' },
  builder_macros_title:        { el: 'Μακροθρεπτικά',                en: 'Macros',                     es: 'Macronutrientes',               fr: 'Macronutriments' },
  builder_energy_title:        { el: 'Ενέργεια & Στόχοι',            en: 'Energy & Goals',             es: 'Energía y Objetivos',           fr: 'Énergie & Objectifs' },
  builder_total_kcal:          { el: '🔥 Συνολικές θερμίδες',        en: '🔥 Total calories',          es: '🔥 Calorías totales',           fr: '🔥 Calories totales' },
  builder_hydration:           { el: '💧 Ενυδάτωση (στόχος 3L)',     en: '💧 Hydration (goal 3L)',     es: '💧 Hidratación (objetivo 3L)',  fr: '💧 Hydratation (objectif 3L)' },
  builder_score:               { el: '⭐ Βαθμολογία πλάνου',         en: '⭐ Plan score',              es: '⭐ Puntuación del plan',        fr: '⭐ Score du plan' },
  builder_templates_title:     { el: '💾 Πρότυπα',                   en: '💾 Templates',               es: '💾 Plantillas',                 fr: '💾 Modèles' },
  builder_tpl_placeholder:     { el: 'Όνομα προτύπου...',            en: 'Template name...',           es: 'Nombre de plantilla...',        fr: 'Nom du modèle...' },
  builder_tpl_empty:           { el: 'Δεν υπάρχουν αποθηκευμένα πρότυπα.', en: 'No saved templates.', es: 'No hay plantillas guardadas.',  fr: 'Aucun modèle enregistré.' },
  builder_tpl_meals:           { el: '{n} γεύματα',                  en: '{n} meals',                  es: '{n} comidas',                   fr: '{n} repas' },
  builder_add_food_btn:        { el: '+ Προσθήκη τροφίμου',          en: '+ Add food',                 es: '+ Añadir alimento',             fr: '+ Ajouter un aliment' },
  builder_remove_title:        { el: 'Αφαίρεση',                     en: 'Remove',                     es: 'Eliminar',                      fr: 'Supprimer' },
  builder_goal_label:          { el: 'Στόχος',                       en: 'Goal',                       es: 'Objetivo',                      fr: 'Objectif' },
  builder_remaining_label:     { el: 'Υπόλοιπο',                     en: 'Remaining',                  es: 'Restante',                      fr: 'Restant' },
  builder_no_meals_toast:      { el: '⚠️ Δεν επιλέχτηκαν γεύματα',  en: '⚠️ No meals selected',       es: '⚠️ No hay comidas seleccionadas', fr: '⚠️ Aucun repas sélectionné' },
  builder_meals_count:         { el: '{n} γεύματα',                  en: '{n} meals',                  es: '{n} comidas',                   fr: '{n} repas' },
  builder_quality_great:      { el: 'Πολύ καλή επιλογή!',    en: 'Great choice!',        es: '¡Excelente elección!',    fr: 'Excellent choix !' },
  builder_quality_good:       { el: 'Καλή πρόοδος',          en: 'Good progress',        es: 'Buen progreso',           fr: 'Bon progrès' },
  builder_quality_start:      { el: 'Επίλεξε γεύματα',       en: 'Select meals',         es: 'Selecciona comidas',      fr: 'Sélectionne des repas' },
  builder_quality_great_desc: { el: 'Ισορροπημένο πλάνο με ποικιλία θρεπτικών συστατικών.', en: 'Balanced plan with a variety of nutrients.', es: 'Plan equilibrado con variedad de nutrientes.', fr: 'Plan équilibré avec une variété de nutriments.' },
  builder_quality_good_desc:  { el: 'Καλό πλάνο, μπορείς να βελτιώσεις τα μακροθρεπτικά.', en: 'Good plan, you can improve the macros.', es: 'Buen plan, puedes mejorar los macros.', fr: 'Bon plan, tu peux améliorer les macros.' },
  builder_quality_start_desc: { el: 'Πρόσθεσε γεύματα από την αριστερή λίστα.', en: 'Add meals from the left list.', es: 'Añade comidas de la lista izquierda.', fr: 'Ajoute des repas depuis la liste gauche.' },
  stats_balance_great:        { el: 'Πολύ καλή επιλογή!',    en: 'Great balance!',       es: '¡Muy buen equilibrio!',   fr: 'Très bon équilibre !' },
  stats_balance_low:          { el: 'Λίγο χαμηλά',           en: 'A bit low',            es: 'Un poco bajo',            fr: 'Un peu bas' },
  stats_balance_high:         { el: 'Λίγο ψηλά',             en: 'A bit high',           es: 'Un poco alto',            fr: 'Un peu haut' },
  diversity_great:            { el: 'Καλή ποικιλία!',         en: 'Great variety!',       es: '¡Gran variedad!',         fr: 'Bonne variété !' },
  diversity_more:             { el: 'Δοκίμασε περισσότερα',   en: 'Try more variety',     es: 'Prueba más variedad',     fr: 'Essaie plus de variété' },

  // ── Macro display labels (full) ──
  macro_protein:  { el: 'Πρωτεΐνη', en: 'Protein',       es: 'Proteína',  fr: 'Protéines' },
  macro_carbs:    { el: 'Υδατάνθρακες', en: 'Carbohydrates', es: 'Carbohidratos', fr: 'Glucides' },
  macro_fat:      { el: 'Λιπαρά',    en: 'Fat',           es: 'Grasas',    fr: 'Lipides' },
  macro_kcal:     { el: 'Θερμίδες',  en: 'Calories',      es: 'Calorías',  fr: 'Calories' },

  // ── Training / steps ──
  training_label:   { el: '🏋️ Προπόνηση Βαρών', en: '🏋️ Weight Training', es: '🏋️ Entrenamiento de pesas', fr: '🏋️ Musculation' },
  steps_label:      { el: '👣 Βήματα', en: '👣 Steps', es: '👣 Pasos', fr: '👣 Pas' },
  steps_done:       { el: 'Βήματα ολοκληρώθηκαν', en: 'Steps completed', es: 'Pasos completados', fr: 'Pas complétés' },

  // ── Custom TDEE ──
  tdee_label:     { el: 'TDEE (kcal/ημέρα)', en: 'TDEE (kcal/day)', es: 'TDEE (kcal/día)', fr: 'TDEE (kcal/jour)' },
  tdee_suggested: { el: 'Προτεινόμενο TDEE', en: 'Suggested TDEE',  es: 'TDEE sugerido',   fr: 'TDEE suggéré' },
  tdee_custom:    { el: 'Χειροκίνητο',       en: 'Manual',          es: 'Manual',           fr: 'Manuel' },

  // ── Meal card chip labels ──
  chip_prot:           { el: 'πρωτ.',           en: 'prot.',           es: 'prot.',          fr: 'prot.' },
  chip_carb:           { el: 'υδατ.',           en: 'carb.',           es: 'carb.',          fr: 'gluc.' },
  chip_fat:            { el: 'λίπος',           en: 'fat',             es: 'grasa',          fr: 'lipide' },
  chip_portion:        { el: 'Μερίδα',          en: 'Portion',         es: 'Porción',        fr: 'Portion' },
  meal_swap_btn:       { el: '🔄 Αλλαγή',       en: '🔄 Swap',         es: '🔄 Cambiar',      fr: '🔄 Changer' },
  meal_scale_btn:      { el: '⚖️ Ποσότητα',     en: '⚖️ Quantity',     es: '⚖️ Cantidad',     fr: '⚖️ Quantité' },
  meal_serving_btn:    { el: '📋 Πρόταση Σερβιρίσματος', en: '📋 Serving Suggestion', es: '📋 Sugerencia de servicio', fr: '📋 Suggestion de service' },
  meal_recipe_btn:     { el: '📋 Συνταγή &amp; Σερβίρισμα', en: '📋 Recipe &amp; Serving', es: '📋 Receta y servicio', fr: '📋 Recette et service' },
  today_yesterday_extra: { el: '⚠️ Χθες έφαγες +{n} kcal παραπάνω. Προσαρμόσου σήμερα!', en: '⚠️ Yesterday you had +{n} kcal extra. Adjust today!', es: '⚠️ Ayer tomaste +{n} kcal extra. ¡Ajústate hoy!', fr: '⚠️ Hier tu as mangé +{n} kcal en plus. Adapte-toi aujourd\'hui !' },

  // ── Daily page ──
  today_remaining:      { el: 'ΑΠΟΜΕΝΟΥΝ',         en: 'REMAINING',          es: 'RESTANTE',           fr: 'RESTANT' },
  today_kcal_day:       { el: 'kcal μέρας',        en: 'kcal/day',           es: 'kcal/día',           fr: 'kcal/jour' },
  today_consumed:       { el: 'Καταναλώθηκαν',     en: 'Consumed',           es: 'Consumidas',         fr: 'Consommées' },
  today_kcal_day_goal:  { el: 'Kcal ημέρας',       en: 'Day calories',       es: 'Calorías del día',   fr: 'Calories du jour' },
  today_meals_header:   { el: 'Γεύματα',            en: 'Meals',              es: 'Comidas',            fr: 'Repas' },
  today_add_meal:       { el: '➕ Προσθήκη Γεύματος', en: '➕ Add Meal',       es: '➕ Añadir Comida',  fr: '➕ Ajouter un repas' },
  today_reset_checks:   { el: '↺ Reset',            en: '↺ Reset',            es: '↺ Reset',            fr: '↺ Reset' },
  today_reset_meals:    { el: '🗑 Default',          en: '🗑 Default',         es: '🗑 Por defecto',     fr: '🗑 Défaut' },
  today_extra_kcal:     { el: '🍕 Επιπλέον Θερμίδες (εκτός πλάνου)', en: '🍕 Extra Calories (outside plan)', es: '🍕 Calorías extra (fuera del plan)', fr: '🍕 Calories supplémentaires (hors plan)' },
  today_day_total:      { el: 'Σύνολο ημέρας',      en: 'Day total',          es: 'Total del día',      fr: 'Total journalier' },
  today_outside_plan:   { el: 'εκτός πλάνου',       en: 'outside plan',       es: 'fuera del plan',     fr: 'hors plan' },
  today_running_total:  { el: 'Σύνολο ως τώρα',     en: 'Running total',      es: 'Total hasta ahora',  fr: 'Total jusqu\'ici' },
  today_extra_cleared:  { el: '✓ Extra kcal καθαρίστηκαν', en: '✓ Extra kcal cleared', es: '✓ Kcal extra borradas', fr: '✓ Kcal supplémentaires effacées' },
  today_extra_added:    { el: '+{n} kcal καταχωρήθηκαν', en: '+{n} kcal logged', es: '+{n} kcal registradas', fr: '+{n} kcal enregistrées' },
  today_default_reset:  { el: '↺', en: '↺', es: '↺', fr: '↺' },

  // ── Activity section ──
  act_section_title:    { el: 'ΔΡΑΣΤΗΡΙΟΤΗΤΑ & ΕΛΛΕΙΜΜΑ', en: 'ACTIVITY & DEFICIT', es: 'ACTIVIDAD & DÉFICIT', fr: 'ACTIVITÉ & DÉFICIT' },
  act_training:         { el: 'Προπόνηση',           en: 'Workout',            es: 'Entrenamiento',      fr: 'Entraînement' },
  act_training_kcal:    { el: '~{kcal} kcal σήμερα · 1h βαρά', en: '~{kcal} kcal today · 1h weights', es: '~{kcal} kcal hoy · 1h pesas', fr: '~{kcal} kcal aujourd\'hui · 1h musculation' },
  act_neat:             { el: 'Πρόσθετη βασική',     en: 'Extra base burn',    es: 'Quema base extra',   fr: 'Dépense de base sup.' },
  act_steps_kcal_today: { el: '~{kcal} kcal σήμερα · ~{weekly} kcal/εβδ.', en: '~{kcal} kcal today · ~{weekly} kcal/week', es: '~{kcal} kcal hoy · ~{weekly} kcal/sem.', fr: '~{kcal} kcal aujourd\'hui · ~{weekly} kcal/sem.' },
  act_steps_unit:       { el: 'βήματα',              en: 'steps',              es: 'pasos',              fr: 'pas' },
  act_total_burn:       { el: '🔥 Σύνολο {kcal} kcal · BMR Κατανάλωση {bmr} kcal', en: '🔥 Total {kcal} kcal · BMR Consumption {bmr} kcal', es: '🔥 Total {kcal} kcal · Consumo BMR {bmr} kcal', fr: '🔥 Total {kcal} kcal · Consommation BMR {bmr} kcal' },

  // ── Week page ──
  week_title:           { el: 'Εβδομαδιαίο Πρόγραμμα', en: 'Weekly Program',   es: 'Programa Semanal',   fr: 'Programme Hebdomadaire' },
  week_days_kcal:       { el: '7 ημέρες · {kcal} kcal/ημέρα', en: '7 days · {kcal} kcal/day', es: '7 días · {kcal} kcal/día', fr: '7 jours · {kcal} kcal/jour' },
  week_regen:           { el: 'Ξανά',                  en: 'Redo',               es: 'Rehacer',            fr: 'Refaire' },
  week_reset:           { el: 'Επαναφορά',             en: 'Reset',              es: 'Restablecer',        fr: 'Réinitialiser' },
  week_total:           { el: 'Σύνολο εβδομάδας',     en: 'Weekly total',       es: 'Total semanal',      fr: 'Total hebdomadaire' },
  week_avg_kcal_day:    { el: 'Μέσ. {kcal} kcal/ημέρα', en: 'Avg. {kcal} kcal/day', es: 'Prom. {kcal} kcal/día', fr: 'Moy. {kcal} kcal/jour' },
  week_macros_avg:      { el: 'ΜΑΚΡΟΘΡΕΠΤΙΚΑ (ΜΕΣΟΣ ΟΡΟΣ)', en: 'MACROS (AVERAGE)', es: 'MACROS (PROMEDIO)', fr: 'MACROS (MOYENNE)' },
  week_balance_title:   { el: 'ΙΣΟΡΡΟΠΙΑ ΕΒΔΟΜΑΔΑΣ',  en: 'WEEKLY BALANCE',     es: 'BALANCE SEMANAL',    fr: 'BILAN HEBDOMADAIRE' },

  // ── Regen / Reset modals ──
  week_regen_title:     { el: '🔄 Δημιούργησε Ξανά',  en: '🔄 Regenerate Plan', es: '🔄 Regenerar Plan',  fr: '🔄 Regénérer le plan' },
  week_regen_desc:      { el: 'Επίλεξε στυλ και δημιούργησε νέο τυχαίο πρόγραμμα με βάση τις προτιμήσεις σου.', en: 'Choose a style and generate a new random plan based on your preferences.', es: 'Elige un estilo y genera un nuevo plan aleatorio según tus preferencias.', fr: 'Choisis un style et génère un nouveau plan aléatoire selon tes préférences.' },
  week_regen_btn:       { el: '🎲 Δημιουργία',        en: '🎲 Generate',        es: '🎲 Generar',         fr: '🎲 Générer' },
  week_reset_title:     { el: '🔄 Επαναφορά πλάνου',  en: '🔄 Reset Plan',      es: '🔄 Restablecer Plan', fr: '🔄 Réinitialiser le plan' },
  week_reset_desc:      { el: 'Θέλεις σίγουρα να επαναφέρεις <strong>ολόκληρο</strong> το εβδομαδιαίο πλάνο στις προεπιλογές;<br><span style="color:#ef4444;font-weight:700">Όλες οι αλλαγές θα χαθούν.</span>', en: 'Are you sure you want to reset <strong>the entire</strong> weekly plan to defaults?<br><span style="color:#ef4444;font-weight:700">All changes will be lost.</span>', es: '¿Estás seguro de que quieres restablecer <strong>todo</strong> el plan semanal?<br><span style="color:#ef4444;font-weight:700">Todos los cambios se perderán.</span>', fr: 'Veux-tu vraiment réinitialiser <strong>tout</strong> le plan hebdomadaire ?<br><span style="color:#ef4444;font-weight:700">Toutes les modifications seront perdues.</span>' },
  week_reset_btn:       { el: 'Επαναφορά',            en: 'Reset',              es: 'Restablecer',        fr: 'Réinitialiser' },
  week_applied_all:     { el: '✅ Εφαρμόστηκε σε όλες τις ημέρες!', en: '✅ Applied to all days!', es: '✅ ¡Aplicado a todos los días!', fr: '✅ Appliqué à tous les jours !' },

  // ── Stats page ──
  stats_avg_kcal_day:   { el: 'Μ.Ό. Kcal/ημέρα',    en: 'Avg Kcal/day',       es: 'Prom. Kcal/día',     fr: 'Moy. Kcal/jour' },
  stats_avg_kcal_short: { el: 'Μ.Ό. Kcal/ημ',       en: 'Avg Kcal/d',         es: 'Prom. Kcal/d',       fr: 'Moy. Kcal/j' },
  stats_avg_protein:    { el: 'Μ.Ό. Πρωτεΐνη',      en: 'Avg Protein',        es: 'Prom. Proteína',     fr: 'Moy. Protéines' },
  stats_macros_avg:     { el: 'Μέσος Όρος Μακροθρεπτικών', en: 'Average Macros', es: 'Promedio de Macros', fr: 'Moyenne des Macros' },
  stats_week_total:     { el: 'Σύνολο εβδομάδας',   en: 'Weekly total',       es: 'Total semanal',      fr: 'Total hebdomadaire' },
  stats_days_steps:     { el: '{n}/7 ημέρες ✅',      en: '{n}/7 days ✅',       es: '{n}/7 días ✅',       fr: '{n}/7 jours ✅' },
  stats_week_total_short: { el: 'Σύνολο εβδομάδας', en: 'Weekly total',       es: 'Total semanal',      fr: 'Total hebdomadaire' },
  stats_avg_intake_svg: { el: 'Μέση πρόσληψη',       en: 'Avg intake',         es: 'Ingesta media',      fr: 'Apport moyen' },

  // ── Builder page ──
  builder_meals_selected: { el: '🍽️ Γεύματα επιλεγμένα', en: '🍽️ Meals selected', es: '🍽️ Comidas seleccionadas', fr: '🍽️ Repas sélectionnés' },
  builder_optimize_ai:  { el: '✨ Βελτιστοποίηση με AI', en: '✨ Optimize with AI', es: '✨ Optimizar con IA', fr: '✨ Optimiser avec IA' },
  builder_mode1_label:  { el: 'Max Πρωτεΐνη',        en: 'Max Protein',        es: 'Máx Proteína',       fr: 'Max Protéines' },
  builder_apply_days:   { el: 'Εφαρμογή στο πρόγραμμα ({n} ημέρες)', en: 'Apply to schedule ({n} days)', es: 'Aplicar al programa ({n} días)', fr: 'Appliquer au programme ({n} jours)' },
  builder_week_summary: { el: 'Συνοπτική εβδομαδιαία προβολή: ημέρες, γεύματα, θερμίδες, macros.', en: 'Weekly overview: days, meals, calories, macros.', es: 'Resumen semanal: días, comidas, calorías, macros.', fr: 'Vue hebdomadaire : jours, repas, calories, macros.' },
  builder_create_plan:  { el: '📋 Δημιουργία Πλάνου', en: '📋 Create Plan',     es: '📋 Crear Plan',       fr: '📋 Créer le plan' },

  // ── Macro labels (inline / table) ──
  macro_protein_abbr:   { el: '🥩 Πρωτεΐνη',         en: '🥩 Protein',         es: '🥩 Proteína',         fr: '🥩 Protéines' },
  macro_carbs_abbr:     { el: '🍚 Υδατάνθρακες',     en: '🍚 Carbs',           es: '🍚 Carbos',           fr: '🍚 Glucides' },
  macro_fat_abbr:       { el: '🫒 Λίπος',            en: '🫒 Fat',             es: '🫒 Grasa',            fr: '🫒 Lipides' },

  // ── PDF / Print ──
  pdf_week_title:       { el: 'Εβδομαδιαίο Πρόγραμμα', en: 'Weekly Program',   es: 'Programa Semanal',   fr: 'Programme Hebdomadaire' },
  pdf_week_subtitle:    { el: '7 ημέρες · {kcal} kcal/ημέρα κατά μέσο όρο', en: '7 days · {kcal} kcal/day average', es: '7 días · {kcal} kcal/día de media', fr: '7 jours · {kcal} kcal/jour en moyenne' },
  pdf_week_total:       { el: 'Σύνολο εβδομάδας',    en: 'Weekly total',       es: 'Total semanal',      fr: 'Total hebdomadaire' },
  pdf_extra_kcal:       { el: '⚠️ Επιπλέον εκτός πλάνου: +{n} kcal', en: '⚠️ Extra outside plan: +{n} kcal', es: '⚠️ Extra fuera del plan: +{n} kcal', fr: '⚠️ Extra hors plan : +{n} kcal' },

  // ── AI messages ──
  ai_wait:              { el: 'Περίμενε {time} λεπτά πριν την επόμενη βελτιστοποίηση', en: 'Wait {time} before the next optimization', es: 'Espera {time} antes de la próxima optimización', fr: 'Attends {time} avant la prochaine optimisation' },
  ai_limit:             { el: 'Το AI όριο χρήσης εξαντλήθηκε. Δοκίμασε αύριο ή αναβάθμισε το Gemini API plan.', en: 'AI usage limit reached. Try again tomorrow or upgrade your Gemini API plan.', es: 'Límite de uso de IA alcanzado. Intenta mañana o actualiza tu plan de API de Gemini.', fr: 'Limite d\'utilisation IA atteinte. Réessaie demain ou améliore ton plan API Gemini.' },
  ai_json_error:        { el: 'Δεν βρέθηκε έγκυρο JSON στην απάντηση', en: 'No valid JSON found in response', es: 'No se encontró JSON válido en la respuesta', fr: 'Aucun JSON valide trouvé dans la réponse' },
  ai_days_error:        { el: 'Αναμενόταν 7 ημέρες', en: 'Expected 7 days', es: 'Se esperaban 7 días', fr: '7 jours attendus' },
  ai_estimate_ok:       { el: '✅ AI εκτίμηση θερμίδων!', en: '✅ AI calorie estimate!', es: '✅ ¡Estimación de calorías IA!', fr: '✅ Estimation calorique IA !' },
  ai_optimize_ok:       { el: '✅ Το πλάνο βελτιστοποιήθηκε με AI!', en: '✅ Plan optimized with AI!', es: '✅ ¡Plan optimizado con IA!', fr: '✅ Plan optimisé avec IA !' },
  ai_generate_ok:       { el: '✅ Το εβδομαδιαίο πλάνο δημιουργήθηκε επιτυχώς!', en: '✅ Weekly plan created successfully!', es: '✅ ¡Plan semanal creado con éxito!', fr: '✅ Plan hebdomadaire créé avec succès !' },
  ai_optimizing:        { el: '⏳ Βελτιστοποίηση...', en: '⏳ Optimizing...', es: '⏳ Optimizando...', fr: '⏳ Optimisation...' },
  ai_generating:        { el: '⏳ Δημιουργία...',     en: '⏳ Generating...', es: '⏳ Generando...', fr: '⏳ Génération...' },
  ai_optimize_btn:      { el: '✨ Βελτιστοποίηση με AI', en: '✨ Optimize with AI', es: '✨ Optimizar con IA', fr: '✨ Optimiser avec IA' },
  ai_generate_btn:      { el: '✨ Δημιουργία Πλάνου με AI', en: '✨ Create Plan with AI', es: '✨ Crear Plan con IA', fr: '✨ Créer le plan avec IA' },

  // ── Week day card ──
  week_no_meal_pdf:     { el: 'Κανένα γεύμα',    en: 'No meals',         es: 'Sin comidas',      fr: 'Aucun repas' },
  week_completed_short: { el: '✓ Ολοκλ.',        en: '✓ Done',           es: '✓ Hecho',          fr: '✓ Fait' },
  week_no_meal:         { el: 'Κανένα γεύμα',            en: 'No meals',             es: 'Sin comidas',          fr: 'Aucun repas' },
  week_completed:       { el: '✓ Ολοκληρώθηκε',         en: '✓ Completed',          es: '✓ Completado',         fr: '✓ Terminé' },
  week_extra_kcal:      { el: '⚠️ +{n} kcal εκτός',     en: '⚠️ +{n} kcal extra',  es: '⚠️ +{n} kcal extra',  fr: '⚠️ +{n} kcal en plus' },
  week_go_to_day:       { el: 'Μετάβαση στην ημέρα',    en: 'Go to day',            es: 'Ir al día',            fr: 'Aller au jour' },
  week_today_btn:       { el: 'Σήμερα',                  en: 'Today',                es: 'Hoy',                  fr: 'Aujourd\'hui' },
  week_copy_btn:        { el: 'Αντιγραφή',               en: 'Copy',                 es: 'Copiar',               fr: 'Copier' },

  // ── Week deficit panel ──
  week_activity_title:  { el: '🏃 Εβδομαδιαία Δραστηριότητα & Έλλειμμα', en: '🏃 Weekly Activity & Deficit', es: '🏃 Actividad semanal y déficit', fr: '🏃 Activité hebdomadaire et déficit' },
  week_total_burn:      { el: '🔥 Συνολική καύση:',      en: '🔥 Total burn:',        es: '🔥 Quema total:',       fr: '🔥 Brûlure totale :' },
  week_total_consumed:  { el: '🍽️ Συνολική κατανάλωση:', en: '🍽️ Total consumed:',   es: '🍽️ Consumo total:',    fr: '🍽️ Total consommé :' },
  week_tdee_based:      { el: '📐 Βάσει TDEE',           en: '📐 Based on TDEE',     es: '📐 Basado en TDEE',    fr: '📐 Basé sur le TDEE' },
  week_tdee_goal:       { el: 'TDEE: {tdee} · Στόχος: {goal} kcal', en: 'TDEE: {tdee} · Goal: {goal} kcal', es: 'TDEE: {tdee} · Objetivo: {goal} kcal', fr: 'TDEE : {tdee} · Objectif : {goal} kcal' },
  week_real_burn:       { el: '🏃 Πραγματική Καύση',     en: '🏃 Real Burn',         es: '🏃 Quema real',         fr: '🏃 Brûlure réelle' },
  week_real_burn_detail:{ el: 'Καύση: {burn} · Κατ/ση: {consumed} kcal', en: 'Burn: {burn} · Consumed: {consumed} kcal', es: 'Quema: {burn} · Consumo: {consumed} kcal', fr: 'Brûlure : {burn} · Consommé : {consumed} kcal' },
  week_real_weight:     { el: '⚖️ Πραγματική Μεταβολή Βάρους', en: '⚖️ Actual Weight Change', es: '⚖️ Cambio de peso real', fr: '⚖️ Variation de poids réelle' },
  week_real_change:     { el: 'πραγματική αλλαγή',       en: 'actual change',        es: 'cambio real',          fr: 'changement réel' },

  // ── Week footer stats ──
  week_food_variety:    { el: 'Ποικιλία τροφών',    en: 'Food variety',       es: 'Variedad de alimentos', fr: 'Variété alimentaire' },
  week_food_variety_count: { el: '{n} διαφ. τρόφιμα', en: '{n} diff. foods', es: '{n} alimentos dif.', fr: '{n} aliments diff.' },
  week_hydration:       { el: 'Ενυδάτωση',           en: 'Hydration',          es: 'Hidratación',          fr: 'Hydratation' },
  week_hydration_goal:  { el: 'Στόχος: {ml}ml/ημέρα', en: 'Goal: {ml}ml/day', es: 'Objetivo: {ml}ml/día', fr: 'Objectif : {ml}ml/jour' },
  week_goal_progress:   { el: 'Πρόοδος στόχου',      en: 'Goal progress',      es: 'Progreso del objetivo', fr: 'Progression de l\'objectif' },
  week_this_week:       { el: 'Αυτή την εβδομάδα',   en: 'This week',          es: 'Esta semana',          fr: 'Cette semaine' },

  // ── Supplement guide row labels ──
  suppl_guide_timing:   { el: 'Ιδανική ώρα',       en: 'Best time',          es: 'Mejor momento',      fr: 'Meilleur moment' },
  suppl_guide_intake:   { el: 'Τρόπος',             en: 'How to take',        es: 'Cómo tomar',         fr: 'Comment prendre' },
  suppl_guide_boosts:   { el: '✅ Βελτιώνει',       en: '✅ Boosted by',      es: '✅ Potenciado por',  fr: '✅ Renforcé par' },
  suppl_guide_reduces:  { el: '⚠️ Μειώνει',        en: '⚠️ Reduced by',     es: '⚠️ Reducido por',   fr: '⚠️ Réduit par' },
  suppl_guide_avoid:    { el: '🚫 Αποφύγετε',       en: '🚫 Avoid',           es: '🚫 Evitar',          fr: '🚫 Éviter' },
  suppl_guide_drinks:   { el: '☕ Καφές/Τσάι',      en: '☕ Coffee/Tea',      es: '☕ Café/Té',         fr: '☕ Café/Thé' },
  suppl_guide_gap:      { el: '⏱ Απόσταση',         en: '⏱ Gap',              es: '⏱ Intervalo',        fr: '⏱ Intervalle' },
  suppl_evidence_label: { el: 'Τεκμηρίωση',         en: 'Evidence',           es: 'Evidencia',          fr: 'Preuves' },
  suppl_section:        { el: '💊 Συμπληρώματα',    en: '💊 Supplements',     es: '💊 Suplementos',     fr: '💊 Suppléments' },
  suppl_no_active:      { el: 'Δεν έχεις επιλέξει συμπληρώματα. Πήγαινε στις <strong>Ρυθμίσεις → Συμπληρώματα</strong>.', en: 'No supplements selected. Go to <strong>Settings → Supplements</strong>.', es: 'Sin suplementos seleccionados. Ve a <strong>Ajustes → Suplementos</strong>.', fr: 'Aucun supplément sélectionné. Va dans <strong>Paramètres → Suppléments</strong>.' },
  today_extra_kcal_desc: { el: 'Φάγατε κάτι παραπάνω; Καταγράψτε το εδώ. Η ημέρα θα κοκκινίσει στην Εβδομάδα.', en: 'Ate something extra? Log it here. The day will be highlighted in the Week view.', es: '¿Comiste algo extra? Regístralo aquí. El día se marcará en la vista semanal.', fr: 'Mangé quelque chose en plus ? Enregistre-le ici. Le jour sera mis en évidence dans la vue hebdomadaire.' },

  // ── Stats page ──
  stats_week_deficit:   { el: 'Εβδ. Ισοζύγιο',    en: 'Weekly Balance',     es: 'Balance semanal',    fr: 'Bilan hebdomadaire' },
  stats_deficit_kcal:   { el: 'kcal έλλειμμα',     en: 'kcal deficit',       es: 'kcal déficit',       fr: 'kcal déficit' },
  stats_surplus_kcal:   { el: 'kcal πλεόνασμα',    en: 'kcal surplus',       es: 'kcal superávit',     fr: 'kcal surplus' },
  stats_kcal_per_day:   { el: 'Θερμίδες ανά ημέρα', en: 'Calories per day', es: 'Calorías por día',   fr: 'Calories par jour' },
  stats_body_progress:  { el: 'Εξέλιξη Σώματος',   en: 'Body Progress',      es: 'Progreso corporal',  fr: 'Progression corporelle' },
  stats_steps_kcal:     { el: 'Βήματα (εβδ. kcal)', en: 'Steps (weekly kcal)', es: 'Pasos (kcal sem.)', fr: 'Pas (kcal sem.)' },
  stats_gym_kcal:       { el: 'Γυμναστήριο (kcal)', en: 'Gym (kcal)',         es: 'Gimnasio (kcal)',   fr: 'Salle (kcal)' },
  stats_workouts:       { el: '{n}/7 προπονήσεις',  en: '{n}/7 workouts',     es: '{n}/7 entrenamientos', fr: '{n}/7 entraînements' },

  // ── Misc ──
  day_reset_ok:         { el: '✅ Ημέρα επαναφέρθηκε στα default', en: '✅ Day reset to defaults', es: '✅ Día restablecido a valores predeterminados', fr: '✅ Jour réinitialisé aux valeurs par défaut' },
  add_meal_modal_title: { el: '➕ Προσθήκη Γεύματος', en: '➕ Add Meal',        es: '➕ Añadir Comida',   fr: '➕ Ajouter un repas' },
  optimize_mode1:       { el: 'Mode 1',               en: 'Mode 1',             es: 'Modo 1',             fr: 'Mode 1' },

  // ── Language picker (sign-up first step) ──
  langpick_title:   { el: 'Καλώς ήρθες!',       en: 'Welcome!',             es: '¡Bienvenido!',         fr: 'Bienvenue !' },
  langpick_sub:     { el: 'Επίλεξε τη γλώσσα σου', en: 'Choose your language', es: 'Elige tu idioma',   fr: 'Choisissez votre langue' },
  langpick_btn:     { el: 'Συνέχεια →',          en: 'Continue →',           es: 'Continuar →',          fr: 'Continuer →' },

  // ── Onboarding cards ──
  ob_skip:          { el: 'Παράλειψη',           en: 'Skip',                 es: 'Omitir',               fr: 'Ignorer' },
  ob_next:          { el: 'Επόμενο',             en: 'Next',                 es: 'Siguiente',             fr: 'Suivant' },
  ob_start:         { el: 'Ξεκινάμε!',           en: 'Let\'s go!',           es: '¡Vamos!',              fr: 'C\'est parti !' },
  // Card 1: Calculate kcal + Set profile & goals
  ob1_title:        { el: 'Γνώρισε το VIVON',    en: 'Meet VIVON',           es: 'Conoce VIVON',         fr: 'Découvrez VIVON' },
  ob1_a_icon:       { el: '🔥',                  en: '🔥',                   es: '🔥',                   fr: '🔥' },
  ob1_a_head:       { el: 'Υπολόγισε kcal',      en: 'Calculate kcal',       es: 'Calcula kcal',         fr: 'Calcule tes kcal' },
  ob1_a_desc:       { el: 'Δες πόσες θερμίδες χρειάζεσαι κάθε μέρα βάσει σώματος & δραστηριότητας.', en: 'See how many calories you need daily based on your body & activity.', es: 'Descubre cuántas calorías necesitas al día según tu cuerpo y actividad.', fr: 'Découvre combien de calories tu as besoin chaque jour selon ton corps et ton activité.' },
  ob1_b_icon:       { el: '🎯',                  en: '🎯',                   es: '🎯',                   fr: '🎯' },
  ob1_b_head:       { el: 'Προφίλ & Στόχοι',    en: 'Profile & Goals',      es: 'Perfil y objetivos',   fr: 'Profil & objectifs' },
  ob1_b_desc:       { el: 'Ρύθμισε ύψος, βάρος, ηλικία και διάλεξε αν θες απώλεια, συντήρηση ή μάζα.', en: 'Set your height, weight, age and choose weight loss, maintenance or bulk.', es: 'Configura tu altura, peso, edad y elige pérdida, mantenimiento o volumen.', fr: 'Configure ta taille, ton poids, ton âge et choisis perte de poids, maintien ou prise de masse.' },
  // Card 2: Select foods + Create your plan
  ob2_title:        { el: 'Φτιάξε το πλάνο σου', en: 'Build your plan',     es: 'Crea tu plan',         fr: 'Crée ton plan' },
  ob2_a_icon:       { el: '🥗',                  en: '🥗',                   es: '🥗',                   fr: '🥗' },
  ob2_a_head:       { el: 'Επίλεξε τρόφιμα',    en: 'Choose your foods',    es: 'Elige tus alimentos',  fr: 'Choisis tes aliments' },
  ob2_a_desc:       { el: 'Ορίσε τι σου αρέσει να τρως — απλά, μικτά ή gourmet γεύματα.', en: 'Tell us what you like to eat — simple, mixed or gourmet meals.', es: 'Dinos qué te gusta comer: simple, mixto o gourmet.', fr: 'Dis-nous ce que tu aimes manger : simple, mixte ou gourmet.' },
  ob2_b_icon:       { el: '📋',                  en: '📋',                   es: '📋',                   fr: '📋' },
  ob2_b_head:       { el: 'Δημιούργησε πλάνο',  en: 'Create your plan',     es: 'Crea tu plan',         fr: 'Crée ton plan' },
  ob2_b_desc:       { el: 'Δημιούργησε αυτόματα εβδομαδιαίο διατροφικό πρόγραμμα με ένα κλικ.', en: 'Auto-generate a full weekly nutrition plan with one click.', es: 'Genera automáticamente un plan semanal completo con un clic.', fr: 'Génère automatiquement un plan nutritionnel hebdomadaire complet en un clic.' },
  // Card 3: Adjust + Track progress
  ob3_title:        { el: 'Προσαρμόσου & Παρακολούθει', en: 'Adjust & Track', es: 'Ajusta y sigue',    fr: 'Ajuste et suis' },
  ob3_a_icon:       { el: '✏️',                  en: '✏️',                   es: '✏️',                   fr: '✏️' },
  ob3_a_head:       { el: 'Προσάρμοσε το πλάνο', en: 'Adjust your plan',   es: 'Ajusta tu plan',        fr: 'Ajuste ton plan' },
  ob3_a_desc:       { el: 'Άλλαξε γεύματα, ρύθμισε μερίδες και εναλλάσσε επιλογές όποτε θέλεις.', en: 'Swap meals, adjust portions and change options any time you like.', es: 'Cambia comidas, ajusta porciones y modifica opciones cuando quieras.', fr: 'Change des repas, ajuste les portions et modifie les options quand tu veux.' },
  ob3_b_icon:       { el: '📊',                  en: '📊',                   es: '📊',                   fr: '📊' },
  ob3_b_head:       { el: 'Παρακολούθει & Εκτύπωσε', en: 'Track & Print',  es: 'Sigue e imprime',      fr: 'Suis et imprime' },
  ob3_b_desc:       { el: 'Δες τα στατιστικά σου και εκτύπωσε το πλάνο σου για να το έχεις πάντα μαζί σου.', en: 'View your stats and print your plan to keep it with you anywhere.', es: 'Consulta tus estadísticas e imprime tu plan para llevarlo siempre contigo.', fr: 'Consulte tes statistiques et imprime ton plan pour l\'avoir toujours avec toi.' },

  // ── Swap meal modal ──
  swap_title:       { el: 'Επιλογή Γεύματος',  en: 'Select Meal',         es: 'Seleccionar Comida',  fr: 'Sélectionner un Repas' },
  swap_apply:       { el: '✓ Εφαρμογή',        en: '✓ Apply',             es: '✓ Aplicar',           fr: '✓ Appliquer' },
  swap_sf_normal:   { el: '1× (κανονική)',     en: '1× (normal)',         es: '1× (normal)',         fr: '1× (normal)' },
  swap_sf_smaller:  { el: '{sf}× (μικρότερη)', en: '{sf}× (smaller)',     es: '{sf}× (menor)',       fr: '{sf}× (plus petit)' },
  swap_sf_larger:   { el: '{sf}× (μεγαλύτερη)',en: '{sf}× (larger)',      es: '{sf}× (mayor)',       fr: '{sf}× (plus grand)' },
  swap_saved:       { el: '✅ Γεύμα αποθηκεύτηκε', en: '✅ Meal saved',   es: '✅ Comida guardada',  fr: '✅ Repas enregistré' },
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
  const sidebarDonate = document.getElementById('sidebar-donate-btn');
  if (sidebarDonate) sidebarDonate.textContent = '♥ ' + t('donate_sidebar').replace(/^❤️\s*/, '');
  const sidebarPDF = document.getElementById('sidebar-pdf-btn');
  if (sidebarPDF) sidebarPDF.textContent = t('sidebar_pdf');
  const sidebarLogout = document.querySelector('.sidebar-footer .btn:last-child');
  if (sidebarLogout) sidebarLogout.textContent = t('sidebar_logout');

  // Drawer item labels
  const _setDrawerLabel = (tab, label) => {
    const el = document.querySelector(`.drawer-item[data-tab="${tab}"] .drawer-item-label`);
    if (el) el.textContent = label;
  };
  _setDrawerLabel('today',    t('nav_today'));
  _setDrawerLabel('week',     t('nav_week'));
  _setDrawerLabel('builder',  t('drawer_plan'));
  _setDrawerLabel('ideas',    t('nav_ideas'));
  _setDrawerLabel('body',     t('nav_body'));
  _setDrawerLabel('stats',    t('nav_stats'));
  _setDrawerLabel('settings', t('nav_settings'));
  // Drawer donate label
  const drawerDonateLabel = document.querySelector('.drawer-item-donate .drawer-item-label');
  if (drawerDonateLabel) drawerDonateLabel.textContent = t('donate_drawer');

  // Legal footer
  const footerDesktop = document.querySelector('.app-footer-desktop');
  if (footerDesktop) footerDesktop.textContent = t('legal_footer_text');
  const footerMobile = document.querySelector('.app-footer-mobile');
  if (footerMobile) footerMobile.textContent = t('legal_footer_link');
  const legalModalTitle = document.querySelector('.legal-modal-title');
  if (legalModalTitle) legalModalTitle.textContent = t('legal_modal_title');
  const legalModalBody = document.querySelector('.legal-modal-body');
  if (legalModalBody) legalModalBody.innerHTML =
    `<p><strong>${t('legal_modal_heading')}</strong></p>` +
    `<p>${t('legal_modal_copy')}</p>` +
    `<p><strong>${t('legal_modal_privacy_title')}</strong></p>` +
    `<p>${t('legal_modal_privacy_text')}</p>`;

  // Re-render whichever page is currently active
  const activePages = {
    'page-today':    () => typeof renderToday       === 'function' && renderToday(),
    'page-week':     () => typeof renderWeek        === 'function' && renderWeek(),
    'page-ideas':    () => typeof renderIdeasPage   === 'function' && renderIdeasPage(),
    'page-stats':    () => typeof renderStats       === 'function' && renderStats(),
    'page-builder':  () => typeof renderBuilder     === 'function' && renderBuilder(),
    'page-body':     () => typeof renderBody        === 'function' && renderBody(),
    'page-settings': () => typeof renderSettingsPage === 'function' && renderSettingsPage(),
  };
  for (const [pageId, render] of Object.entries(activePages)) {
    const el = document.getElementById(pageId);
    if (el && el.classList.contains('active')) { render(); break; }
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

// ── Localized data field resolver ──
// Use for food/recipe/meal/supplement objects that carry a `nameI18n`, `noteI18n`, etc. field.
// Falls back to the original `name` field (Greek) when no i18n entry exists.
function tName(item, field = 'name') {
  const i18nField = field + 'I18n';
  const obj = item[i18nField];
  if (!obj) return item[field] || '';
  return obj[_currentLang] || obj['el'] || item[field] || '';
}

// ── Meal type label helper ──
// Returns the translated display name for a meal slot key (breakfast, snack, …)
function tMeal(key) {
  return t('meal_' + key) || key;
}

// ── Meal type plural label helper ──
function tMealPlural(key) {
  const pluralMap = {
    breakfast: 'meal_breakfasts',
    snack:     'meal_snacks',
    lunch:     'meal_lunches',
    afternoon: 'meal_afternoons',
    dinner:    'meal_dinners',
  };
  return t(pluralMap[key] || ('meal_' + key + 's')) || tMeal(key);
}

// ── Activity label helper ──
function tActivity(level) {
  return t('activity_' + level) || String(level);
}

// ── Month array helper (0-indexed) ──
function tMonths() {
  return [
    t('month_jan'), t('month_feb'), t('month_mar'), t('month_apr'),
    t('month_may'), t('month_jun'), t('month_jul'), t('month_aug'),
    t('month_sep'), t('month_oct'), t('month_nov'), t('month_dec'),
  ];
}

// ── Day names array helper (0=Sunday) ──
function tDays() {
  return [
    t('day_sun'), t('day_mon'), t('day_tue'), t('day_wed'),
    t('day_thu'), t('day_fri'), t('day_sat'),
  ];
}

// ── Short day names (0=Sunday), same order as tDays() ──
function tDaysShort() {
  return [
    t('day_sun_s'), t('day_mon_s'), t('day_tue_s'), t('day_wed_s'),
    t('day_thu_s'), t('day_fri_s'), t('day_sat_s'),
  ];
}

// ── Short day names starting Monday (stats charts: 0=Mon … 6=Sun) ──
function tDaysWeek() {
  return [
    t('day_mon_s'), t('day_tue_s'), t('day_wed_s'), t('day_thu_s'),
    t('day_fri_s'), t('day_sat_s'), t('day_sun_s'),
  ];
}

// ── String interpolation for i18n keys with placeholders ──
// Usage: tFmt('wizard_step_label', { n: 2, total: 6 })
function tFmt(key, vars) {
  let str = t(key);
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
    });
  }
  return str;
}

// ── Food category label helper ──
function tCategory(catKey) {
  return t('cat_' + catKey) || catKey;
}

// ── Supplement category label helper ──
function tSupplCat(catKey) {
  return t('suppl_cat_' + catKey) || catKey;
}
