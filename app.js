/* =============================================
   TimeLiveAHP – Application JavaScript
   Architecture: Vanilla JS, Firebase v9 (compat)
   ============================================= */

// =============================================
//  CONFIGURATION FIREBASE
//  ⚠️ Remplacer par vos propres clés Firebase
// =============================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAFJnlyb3nN_ZQ5Mh2kvcZpBzczzeFa9nE",
  authDomain: "timelivev1.firebaseapp.com",
  projectId: "timelivev1",
  storageBucket: "timelivev1.firebasestorage.app",
  messagingSenderId: "1062792579553",
  appId: "1:1062792579553:web:b82e14388097b4e24b6aa0",
};

// ---- Initialisation Firebase ----
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

// ---- Persistance locale (mode démo sans Firebase) ----
// Si Firebase n'est pas configuré, on bascule en mode démo localStorage
let DEMO_MODE = false;

// =============================================
//  ÉTAT GLOBAL DE L'APPLICATION
// =============================================
const state = {
  user: null, // Utilisateur connecté
  concerts: [], // Liste des concerts
  bands: [], // Liste des groupes
  filters: { band: "", city: "", type: "", status: "" },
  editingConcertId: null, // ID concert en cours d'édition
  editingBandId: null, // ID groupe en cours d'édition
  currentDetailId: null, // ID concert détaillé
};

// =============================================
//  UTILITAIRES
// =============================================

/** Génère un ID unique (pour mode démo) */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Formate une date "YYYY-MM-DD" → "15 jan. 2025" */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Retourne le jour et le mois abrégé depuis "YYYY-MM-DD" */
function splitDate(dateStr) {
  if (!dateStr) return { day: "--", month: "---", year: "----" };
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
    year: d.getFullYear(),
  };
}

/** Vérifie si une date est aujourd'hui */
function isTonight(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

/** Vérifie si une date est dans la semaine en cours (hors aujourd'hui) */
function isThisWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay() || 7));
  return d > today && d <= endOfWeek;
}

/** Vérifie si une date est ce mois-ci (hors semaine) */
function isThisMonth(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return (
    !isTonight(dateStr) &&
    !isThisWeek(dateStr) &&
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d >= now
  );
}

/** Vérifie si une date est dans le futur (hors ce mois) */
function isLaterThisYear(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d > now &&
    !isTonight(dateStr) &&
    !isThisWeek(dateStr) &&
    !isThisMonth(dateStr)
  );
}

/** Vérifie si une date est passée */
function isPast(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
  return d < today;
}

/** Affiche une notification toast */
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove("hidden");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add("hidden"), 3000);
}

/** Récupère la couleur d'un groupe par son ID */
function getBandColor(bandId) {
  const band = state.bands.find((b) => b.id === bandId);
  return band ? band.color : "#ebeab0";
}

/** Récupère le nom d'un groupe par son ID */
function getBandName(bandId) {
  const band = state.bands.find((b) => b.id === bandId);
  return band ? band.name : "Groupe inconnu";
}

/** Emoji selon le type d'événement */
function typeEmoji(type) {
  const map = {
    festival: "🎪",
    salle: "🏛️",
    bar: "🍺",
    intérieur: "🏠",
    extérieur: "🌳",
    privé: "🔒",
    tournée: "🚌",
  };
  return map[type] || "🎵";
}

/** Config visuelle d'un statut */
function statusConfig(status) {
  const map = {
    confirmé: {
      label: "Confirmé",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.15)",
      border: "rgba(74,222,128,0.35)",
    },
    option: {
      label: "Option",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.15)",
      border: "rgba(251,191,36,0.35)",
    },
    négociation: {
      label: "En négociation",
      color: "#60a5fa",
      bg: "rgba(96,165,250,0.15)",
      border: "rgba(96,165,250,0.35)",
    },
    annulé: {
      label: "Annulé",
      color: "#f87171",
      bg: "rgba(248,113,113,0.15)",
      border: "rgba(248,113,113,0.35)",
    },
  };
  return map[status] || map["confirmé"];
}

/** Formate un montant en euros */
function formatEuro(amount) {
  if (!amount && amount !== 0) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// =============================================
//  AUTHENTIFICATION
// =============================================

/** Écoute les changements d'état d'authentification */
function initAuth() {
  // Si Firebase non configuré, on bascule en mode démo
  if (FIREBASE_CONFIG.apiKey === "VOTRE_API_KEY") {
    DEMO_MODE = true;
    setupAuthUI();
    return;
  }

  auth.onAuthStateChanged((user) => {
    state.user = user;
    if (user) {
      showApp(user);
    } else {
      showAuthScreen();
    }
  });
}

/** Affiche l'écran de connexion */
function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

/** Affiche l'application principale */
function showApp(user) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  // Afficher infos utilisateur
  const name = user.displayName || user.email || "Utilisateur";
  document.getElementById("user-display-name").textContent = name;
  document.getElementById("user-avatar").textContent = name
    .charAt(0)
    .toUpperCase();
  // Charger les données
  loadBands();
  loadConcerts();
  // Icônes Lucide sur les éléments statiques de l'app
  if (typeof lucide !== "undefined") lucide.createIcons();
}

/** Configure les listeners UI d'auth */
function setupAuthUI() {
  // Tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".auth-form")
        .forEach((f) => f.classList.remove("active"));
      btn.classList.add("active");
      document
        .getElementById(`${btn.dataset.tab}-form`)
        .classList.add("active");
    });
  });

  // Connexion email
  document.getElementById("btn-login").addEventListener("click", handleLogin);

  // Inscription
  document
    .getElementById("btn-register")
    .addEventListener("click", handleRegister);

  // Google
  document
    .getElementById("btn-google-login")
    .addEventListener("click", handleGoogleLogin);

  // Mode démo: simuler un user
  if (DEMO_MODE) {
    const demoUser = {
      uid: "demo-user",
      email: "demo@timeliveahp.fr",
      displayName: "Mode Démo",
    };
    state.user = demoUser;
    // Précharger données démo
    loadDemoData();
    showApp(demoUser);
  }
}

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  try {
    setLoading("btn-login", true);
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    errEl.textContent = translateAuthError(e.code);
  } finally {
    setLoading("btn-login", false);
  }
}

async function handleRegister() {
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  try {
    setLoading("btn-register", true);
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    if (name) await cred.user.updateProfile({ displayName: name });
  } catch (e) {
    errEl.textContent = translateAuthError(e.code);
  } finally {
    setLoading("btn-register", false);
  }
}

async function handleGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    document.getElementById("auth-error").textContent = translateAuthError(
      e.code,
    );
  }
}

function translateAuthError(code) {
  const errors = {
    "auth/user-not-found": "Aucun compte trouvé avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Cet email est déjà utilisé.",
    "auth/invalid-email": "Email invalide.",
    "auth/weak-password": "Mot de passe trop faible (min 6 caractères).",
    "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
  };
  return errors[code] || "Une erreur s'est produite.";
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.innerHTML = `<span class="spinner"></span> Chargement...`;
  else {
    if (btnId === "btn-login") btn.textContent = "Se connecter";
    if (btnId === "btn-register") btn.textContent = "Créer un compte";
  }
}

// =============================================
//  DONNÉES – FIRESTORE / DÉMO
// =============================================

/** Référence Firestore selon l'utilisateur */
function userRef() {
  return db.collection("users").doc(state.user.uid);
}

/** Charge les groupes depuis Firestore (ou localStorage en démo) */
function loadBands() {
  if (DEMO_MODE) {
    state.bands = getDemoCollection("bands");
    renderBands();
    updateBandSelects();
    return;
  }
  userRef()
    .collection("bands")
    .orderBy("created_at", "asc")
    .onSnapshot(
      (snapshot) => {
        state.bands = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        renderBands();
        updateBandSelects();
      },
      (err) => console.error("Erreur chargement groupes:", err),
    );
}

/** Charge les concerts depuis Firestore (ou localStorage en démo) */
function loadConcerts() {
  if (DEMO_MODE) {
    state.concerts = getDemoCollection("concerts");
    renderTimeline();
    renderDashboard();
    return;
  }
  userRef()
    .collection("concerts")
    .orderBy("date", "asc")
    .onSnapshot(
      (snapshot) => {
        state.concerts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        renderTimeline();
        renderDashboard();
      },
      (err) => console.error("Erreur chargement concerts:", err),
    );
}

/** Sauvegarde un concert (ajout ou modification) */
async function saveConcert(data) {
  if (DEMO_MODE) {
    if (data.id) {
      updateDemoItem("concerts", data.id, data);
    } else {
      data.id = genId();
      data.created_at = new Date().toISOString();
      addDemoItem("concerts", data);
    }
    loadConcerts();
    return;
  }
  if (data.id) {
    await userRef().collection("concerts").doc(data.id).update(data);
  } else {
    data.created_at = firebase.firestore.FieldValue.serverTimestamp();
    await userRef().collection("concerts").add(data);
  }
}

/** Supprime un concert */
async function deleteConcert(id) {
  if (DEMO_MODE) {
    removeDemoItem("concerts", id);
    loadConcerts();
    return;
  }
  await userRef().collection("concerts").doc(id).delete();
}

/** Sauvegarde un groupe */
async function saveBand(data) {
  if (DEMO_MODE) {
    if (data.id) {
      updateDemoItem("bands", data.id, data);
    } else {
      data.id = genId();
      data.created_at = new Date().toISOString();
      addDemoItem("bands", data);
    }
    loadBands();
    updateBandSelects();
    return;
  }
  if (data.id) {
    await userRef().collection("bands").doc(data.id).update(data);
  } else {
    data.created_at = firebase.firestore.FieldValue.serverTimestamp();
    await userRef().collection("bands").add(data);
  }
}

/** Supprime un groupe */
async function deleteBand(id) {
  if (DEMO_MODE) {
    removeDemoItem("bands", id);
    loadBands();
    return;
  }
  await userRef().collection("bands").doc(id).delete();
}

// =============================================
//  DÉMO STORAGE (localStorage)
// =============================================
function getDemoCollection(name) {
  try {
    return JSON.parse(localStorage.getItem(`tla_${name}`) || "[]");
  } catch {
    return [];
  }
}
function saveDemoCollection(name, arr) {
  localStorage.setItem(`tla_${name}`, JSON.stringify(arr));
}
function addDemoItem(name, item) {
  const arr = getDemoCollection(name);
  arr.push(item);
  saveDemoCollection(name, arr);
}
function updateDemoItem(name, id, item) {
  const arr = getDemoCollection(name).map((x) =>
    x.id === id ? { ...x, ...item } : x,
  );
  saveDemoCollection(name, arr);
}
function removeDemoItem(name, id) {
  const arr = getDemoCollection(name).filter((x) => x.id !== id);
  saveDemoCollection(name, arr);
}

/** Précharge des données de démonstration */
function loadDemoData() {
  // Vérifier la version des données démo — incrémentez si structure change
  const DEMO_VERSION = "2";
  if (
    getDemoCollection("bands").length > 0 &&
    localStorage.getItem("tla_demo_version") === DEMO_VERSION
  )
    return;
  localStorage.setItem("tla_demo_version", DEMO_VERSION);
  const bands = [
    {
      id: "b1",
      name: "Les Fantômes",
      color: "#ebeab0",
      logo_url: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "b2",
      name: "Electric Storm",
      color: "#2563eb",
      logo_url: "",
      created_at: new Date().toISOString(),
    },
  ];
  saveDemoCollection("bands", bands);

  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const t = (days) => {
    const d = new Date(today);
    d.setDate(today.getDate() + days);
    return d;
  };

  const concerts = [
    {
      id: "c1",
      band_id: "b1",
      band_name: "Les Fantômes",
      band_color: "#ebeab0",
      date: fmt(t(0)),
      time: "20:30",
      venue_name: "Le Bataclan",
      city: "Paris",
      country: "France",
      event_type: "salle",
      status: "confirmé",
      fee: 2500,
      notes: "Concert de lancement de l'album",
      google_maps_link: "",
      poster_image_url: "",
      contacts: {
        org_name: "Jean Dupont",
        org_phone: "+33 6 12 34 56 78",
        org_email: "jean@bataclan.fr",
        booker_name: "Marie Martin",
        booker_phone: "+33 6 98 76 54 32",
      },
      created_at: new Date().toISOString(),
    },
    {
      id: "c2",
      band_id: "b2",
      band_name: "Electric Storm",
      band_color: "#2563eb",
      date: fmt(t(3)),
      time: "21:00",
      venue_name: "La Cigale",
      city: "Paris",
      country: "France",
      event_type: "salle",
      status: "option",
      fee: 1800,
      notes: "",
      google_maps_link: "",
      poster_image_url: "",
      contacts: {
        org_name: "Sophie Bernard",
        org_phone: "+33 6 55 66 77 88",
        org_email: "",
      },
      created_at: new Date().toISOString(),
    },
    {
      id: "c3",
      band_id: "b1",
      band_name: "Les Fantômes",
      band_color: "#ebeab0",
      date: fmt(t(12)),
      time: "18:00",
      venue_name: "Zénith",
      city: "Lyon",
      country: "France",
      event_type: "festival",
      status: "confirmé",
      fee: 4000,
      notes: "Festival Nuits Sonores",
      google_maps_link: "",
      poster_image_url: "",
      contacts: {
        sound_name: "Paul Leblanc",
        sound_phone: "+33 6 11 22 33 44",
      },
      created_at: new Date().toISOString(),
    },
    {
      id: "c4",
      band_id: "b2",
      band_name: "Electric Storm",
      band_color: "#2563eb",
      date: fmt(t(45)),
      time: "22:00",
      venue_name: "Le Metronum",
      city: "Toulouse",
      country: "France",
      event_type: "salle",
      status: "négociation",
      fee: 0,
      notes: "",
      google_maps_link: "",
      poster_image_url: "",
      contacts: {},
      created_at: new Date().toISOString(),
    },
    {
      id: "c5",
      band_id: "b1",
      band_name: "Les Fantômes",
      band_color: "#ebeab0",
      date: fmt(t(-30)),
      time: "20:00",
      venue_name: "L'Olympia",
      city: "Paris",
      country: "France",
      event_type: "salle",
      status: "confirmé",
      fee: 3200,
      notes: "Super concert!",
      google_maps_link: "",
      poster_image_url: "",
      contacts: {
        org_name: "Pierre Durand",
        org_phone: "+33 6 44 55 66 77",
        org_email: "pierre@olympia.fr",
      },
      created_at: new Date().toISOString(),
    },
  ];
  saveDemoCollection("concerts", concerts);
}

// =============================================
//  RENDU – TIMELINE
// =============================================

/** Filtre les concerts selon les filtres actifs */
function getFilteredConcerts() {
  const { band, city, type, status } = state.filters;
  return state.concerts.filter((c) => {
    if (band && c.band_id !== band) return false;
    if (city && !c.city.toLowerCase().includes(city.toLowerCase()))
      return false;
    if (type && c.event_type !== type) return false;
    if (status && (c.status || "confirmé") !== status) return false;
    return true;
  });
}

/** Rendu de la timeline complète */
function renderTimeline() {
  const container = document.getElementById("timeline-container");
  const concerts = getFilteredConcerts();

  // ---- Bannière "Ce soir" ----
  const banner = document.getElementById("tonight-banner");
  const tonightConcerts = state.concerts.filter(
    (c) => isTonight(c.date) && (c.status || "confirmé") !== "annulé",
  );
  if (banner) {
    if (tonightConcerts.length > 0) {
      const c = tonightConcerts[0];
      const sc = statusConfig(c.status || "confirmé");
      banner.className = "tonight-banner";
      banner.innerHTML = `
        <div class="tonight-banner-inner">
          <div class="tonight-banner-left">
            <span class="tonight-pulse"></span>
            <span class="tonight-label">CE SOIR</span>
          </div>
          <div class="tonight-banner-info">
            <span class="tonight-band" style="color:${c.band_color || "var(--accent)"}">${escHtml(c.band_name)}</span>
            <span class="tonight-details">
              ${escHtml(c.venue_name)} · ${escHtml(c.city)}${c.time ? " · " + c.time : ""}
            </span>
          </div>
          ${tonightConcerts.length > 1 ? `<span class="tonight-more">+${tonightConcerts.length - 1}</span>` : ""}
        </div>`;
    } else {
      banner.className = "tonight-banner hidden";
      banner.innerHTML = "";
    }
  }

  // Mise à jour compteur
  document.getElementById("concerts-count").textContent =
    `${concerts.length} concert${concerts.length !== 1 ? "s" : ""}`;

  if (concerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎤</div>
        <p>${
          state.filters.band ||
          state.filters.city ||
          state.filters.type ||
          state.filters.status
            ? "Aucun concert pour ces filtres."
            : "Aucun concert pour le moment."
        }</p>
        <button class="btn-primary" id="btn-add-empty" style="max-width:200px;margin:0 auto">Ajouter un concert</button>
      </div>`;
    document
      .getElementById("btn-add-empty")
      ?.addEventListener("click", () => openConcertModal());
    return;
  }

  const sections = [
    {
      key: "tonight",
      label: "Ce soir",
      filter: (c) => isTonight(c.date),
      cls: "tonight",
    },
    {
      key: "week",
      label: "Cette semaine",
      filter: (c) => isThisWeek(c.date),
      cls: "this-week",
    },
    {
      key: "month",
      label: "Ce mois-ci",
      filter: (c) => isThisMonth(c.date),
      cls: "",
    },
    {
      key: "later",
      label: "Plus tard cette année",
      filter: (c) => isLaterThisYear(c.date),
      cls: "",
    },
    {
      key: "future",
      label: "Années à venir",
      filter: (c) => {
        const d = new Date(c.date + "T00:00:00");
        return d.getFullYear() > new Date().getFullYear() && !isPast(c.date);
      },
      cls: "",
    },
    {
      key: "past",
      label: "Concerts passés",
      filter: (c) => isPast(c.date),
      cls: "past",
    },
  ];

  let html = "";
  sections.forEach((sec) => {
    const items = concerts.filter(sec.filter);
    if (items.length === 0) return;
    // Tri: passés décroissant, futurs croissant
    items.sort((a, b) =>
      sec.key === "past"
        ? new Date(b.date) - new Date(a.date)
        : new Date(a.date) - new Date(b.date),
    );
    html += `<div class="timeline-section">
      <div class="section-label ${sec.cls}">${sec.label} <span style="opacity:.6">(${items.length})</span></div>
      <div class="concerts-list">
        ${items.map((c) => renderConcertCard(c, sec.key === "past")).join("")}
      </div>
    </div>`;
  });

  container.innerHTML = html;

  // Attacher les listeners de clic sur les cartes
  container.querySelectorAll(".concert-card").forEach((card) => {
    card.addEventListener("click", () => openDetailModal(card.dataset.id));
  });

  // Réinitialiser les icônes Lucide dans les éléments dynamiques
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderConcertCard(concert, past = false) {
  const { day, month, year } = splitDate(concert.date);
  const color = concert.band_color || "#ebeab0";
  const status = concert.status || "confirmé";
  const sc = statusConfig(status);
  return `
    <div class="concert-card${past ? " past" : ""}" data-id="${concert.id}"
         style="--band-color: ${color}">
      <div class="card-date-block">
        <div class="card-day">${day}</div>
        <div class="card-month">${month}</div>
        <div class="card-year">${year}</div>
      </div>
      <div class="card-divider"></div>
      <div class="card-main">
        <div class="card-top-row">
          <div class="card-band" style="color:${color}">${escHtml(concert.band_name)}</div>
          ${!past ? `<span class="status-badge" style="color:${sc.color};background:${sc.bg};border-color:${sc.border}">${sc.label}</span>` : ""}
        </div>
        <div class="card-venue">${escHtml(concert.venue_name)}</div>
        <div class="card-meta">
          <span class="card-city">📍 ${escHtml(concert.city)}</span>
          ${concert.event_type ? `<span class="card-type">${typeEmoji(concert.event_type)} ${concert.event_type}</span>` : ""}
          ${concert.fee ? `<span class="card-fee">${formatEuro(concert.fee)}</span>` : ""}
          ${concert.time ? `<span class="card-time">${concert.time}</span>` : ""}
        </div>
      </div>
    </div>`;
}

/** Échappe les caractères HTML */
function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =============================================
//  RENDU – DASHBOARD
// =============================================
function renderDashboard() {
  const year = new Date().getFullYear();
  const thisYearConcerts = state.concerts.filter(
    (c) => new Date(c.date).getFullYear() === year,
  );
  const upcoming = state.concerts.filter((c) => !isPast(c.date));
  const cities = [
    ...new Set(state.concerts.map((c) => c.city).filter(Boolean)),
  ];

  // Revenus cette année (concerts confirmés uniquement)
  const yearRevenue = thisYearConcerts
    .filter((c) => c.status !== "annulé")
    .reduce((sum, c) => sum + (parseFloat(c.fee) || 0), 0);

  document.getElementById("stat-total").textContent = thisYearConcerts.length;
  document.getElementById("stat-bands").textContent = state.bands.length;
  document.getElementById("stat-cities").textContent = cities.length;
  document.getElementById("stat-upcoming").textContent = upcoming.length;
  document.getElementById("stat-revenue").textContent = formatEuro(yearRevenue);

  // Concerts par groupe
  const byBand = {};
  state.concerts.forEach((c) => {
    byBand[c.band_name] = (byBand[c.band_name] || 0) + 1;
  });
  const maxBand = Math.max(...Object.values(byBand), 1);
  document.getElementById("band-chart-bars").innerHTML =
    Object.entries(byBand)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, count]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label">${escHtml(name)}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(count / maxBand) * 100}%"></div></div>
        <div class="chart-bar-val">${count}</div>
      </div>`,
      )
      .join("") ||
    '<p style="color:var(--text-muted);font-size:.85rem">Aucune donnée</p>';

  // Concerts par ville (top 5)
  const byCity = {};
  state.concerts.forEach((c) => {
    if (c.city) byCity[c.city] = (byCity[c.city] || 0) + 1;
  });
  const maxCity = Math.max(...Object.values(byCity), 1);
  document.getElementById("city-chart-bars").innerHTML =
    Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(
        ([name, count]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label">${escHtml(name)}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(count / maxCity) * 100}%"></div></div>
        <div class="chart-bar-val">${count}</div>
      </div>`,
      )
      .join("") ||
    '<p style="color:var(--text-muted);font-size:.85rem">Aucune donnée</p>';

  // Revenus par groupe
  const revByBand = {};
  state.concerts
    .filter((c) => c.status !== "annulé" && c.fee > 0)
    .forEach((c) => {
      revByBand[c.band_name] =
        (revByBand[c.band_name] || 0) + (parseFloat(c.fee) || 0);
    });
  const maxRev = Math.max(...Object.values(revByBand), 1);
  document.getElementById("revenue-chart-bars").innerHTML =
    Object.entries(revByBand)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, amount]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label">${escHtml(name)}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(amount / maxRev) * 100}%"></div></div>
        <div class="chart-bar-val">${formatEuro(amount)}</div>
      </div>`,
      )
      .join("") ||
    '<p style="color:var(--text-muted);font-size:.85rem">Aucun cachet renseigné</p>';
}

// =============================================
//  RENDU – GROUPES
// =============================================
function renderBands() {
  const container = document.getElementById("bands-container");
  if (state.bands.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎸</div>
        <p>Aucun groupe créé.</p>
        <button class="btn-primary" id="btn-add-band-empty" style="max-width:200px;margin:0 auto">Créer un groupe</button>
      </div>`;
    document
      .getElementById("btn-add-band-empty")
      ?.addEventListener("click", () => openBandModal());
    return;
  }
  container.innerHTML = state.bands
    .map((band) => {
      const concertCount = state.concerts.filter(
        (c) => c.band_id === band.id,
      ).length;
      return `
      <div class="concert-card band-card glass" style="--band-color:${band.color}" data-band-id="${band.id}">
        ${
          band.logo_url
            ? `<img class="band-logo" src="${escHtml(band.logo_url)}" alt="${escHtml(band.name)}" onerror="this.style.display='none'">`
            : `<div class="band-logo-placeholder" style="border:2px solid ${band.color}"><i data-lucide="music-2"></i></div>`
        }
        <div class="band-name">${escHtml(band.name)}</div>
        <div class="band-concerts-count">${concertCount} concert${concertCount !== 1 ? "s" : ""}</div>
        <div class="band-actions">
          <button class="band-btn-edit" data-bid="${band.id}"><i data-lucide="pencil" style="width:13px;height:13px;vertical-align:middle;margin-right:4px"></i>Modifier</button>
          <button class="band-btn-delete" data-bid="${band.id}"><i data-lucide="trash-2" style="width:13px;height:13px;vertical-align:middle"></i></button>
        </div>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".band-btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openBandModal(btn.dataset.bid);
    });
  });
  container.querySelectorAll(".band-btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteBand(btn.dataset.bid);
    });
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
}

/** Met à jour les selects de groupes dans les formulaires */
function updateBandSelects() {
  const selects = ["filter-band", "concert-band"];
  selects.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    const isFilter = id === "filter-band";
    sel.innerHTML =
      `<option value="">${isFilter ? "Tous les groupes" : "Sélectionner un groupe"}</option>` +
      state.bands
        .map((b) => `<option value="${b.id}">${escHtml(b.name)}</option>`)
        .join("");
    if (val) sel.value = val;
  });
}

// =============================================
//  MODAL CONCERT
// =============================================
function openConcertModal(concertId = null) {
  state.editingConcertId = concertId;
  const modal = document.getElementById("modal-concert");
  document.getElementById("modal-concert-title").textContent = concertId
    ? "Modifier le Concert"
    : "Nouveau Concert";

  // Réinitialiser le formulaire
  clearConcertForm();

  if (concertId) {
    const c = state.concerts.find((x) => x.id === concertId);
    if (c) fillConcertForm(c);
  } else {
    // Date par défaut = aujourd'hui
    document.getElementById("concert-date").value = new Date()
      .toISOString()
      .slice(0, 10);
  }

  modal.classList.remove("hidden");
}

function clearConcertForm() {
  [
    "concert-band",
    "concert-status",
    "concert-type",
    "concert-date",
    "concert-time",
    "concert-venue",
    "concert-city",
    "concert-country",
    "concert-maps",
    "concert-poster",
    "concert-notes",
    "concert-fee",
    "contact-org-name",
    "contact-org-phone",
    "contact-org-email",
    "contact-booker-name",
    "contact-booker-phone",
    "contact-sound-name",
    "contact-sound-phone",
    "contact-light-name",
    "contact-light-phone",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("concert-country").value = "France";
  document.getElementById("concert-status").value = "confirmé";
}

function fillConcertForm(c) {
  document.getElementById("concert-band").value = c.band_id || "";
  document.getElementById("concert-status").value = c.status || "confirmé";
  document.getElementById("concert-type").value = c.event_type || "";
  document.getElementById("concert-date").value = c.date || "";
  document.getElementById("concert-time").value = c.time || "";
  document.getElementById("concert-venue").value = c.venue_name || "";
  document.getElementById("concert-city").value = c.city || "";
  document.getElementById("concert-country").value = c.country || "France";
  document.getElementById("concert-maps").value = c.google_maps_link || "";
  document.getElementById("concert-poster").value = c.poster_image_url || "";
  document.getElementById("concert-notes").value = c.notes || "";
  document.getElementById("concert-fee").value = c.fee || "";
  // Contacts
  const ct = c.contacts || {};
  document.getElementById("contact-org-name").value = ct.org_name || "";
  document.getElementById("contact-org-phone").value = ct.org_phone || "";
  document.getElementById("contact-org-email").value = ct.org_email || "";
  document.getElementById("contact-booker-name").value = ct.booker_name || "";
  document.getElementById("contact-booker-phone").value = ct.booker_phone || "";
  document.getElementById("contact-sound-name").value = ct.sound_name || "";
  document.getElementById("contact-sound-phone").value = ct.sound_phone || "";
  document.getElementById("contact-light-name").value = ct.light_name || "";
  document.getElementById("contact-light-phone").value = ct.light_phone || "";
}

function closeConcertModal() {
  document.getElementById("modal-concert").classList.add("hidden");
  state.editingConcertId = null;
}

async function handleSaveConcert() {
  const bandId = document.getElementById("concert-band").value;
  const date = document.getElementById("concert-date").value;
  const venue = document.getElementById("concert-venue").value.trim();
  const city = document.getElementById("concert-city").value.trim();

  if (!bandId || !date || !venue || !city) {
    showToast("Veuillez remplir les champs obligatoires (*)", "error");
    return;
  }

  const band = state.bands.find((b) => b.id === bandId);
  const data = {
    band_id: bandId,
    band_name: band?.name || "",
    band_color: band?.color || "#ebeab0",
    status: document.getElementById("concert-status").value || "confirmé",
    date,
    time: document.getElementById("concert-time").value,
    venue_name: venue,
    city,
    country: document.getElementById("concert-country").value.trim(),
    event_type: document.getElementById("concert-type").value,
    fee: parseFloat(document.getElementById("concert-fee").value) || 0,
    notes: document.getElementById("concert-notes").value.trim(),
    google_maps_link: document.getElementById("concert-maps").value.trim(),
    poster_image_url: document.getElementById("concert-poster").value.trim(),
    contacts: {
      org_name: document.getElementById("contact-org-name").value.trim(),
      org_phone: document.getElementById("contact-org-phone").value.trim(),
      org_email: document.getElementById("contact-org-email").value.trim(),
      booker_name: document.getElementById("contact-booker-name").value.trim(),
      booker_phone: document
        .getElementById("contact-booker-phone")
        .value.trim(),
      sound_name: document.getElementById("contact-sound-name").value.trim(),
      sound_phone: document.getElementById("contact-sound-phone").value.trim(),
      light_name: document.getElementById("contact-light-name").value.trim(),
      light_phone: document.getElementById("contact-light-phone").value.trim(),
    },
  };

  if (state.editingConcertId) data.id = state.editingConcertId;

  try {
    const btn = document.getElementById("save-concert-btn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    await saveConcert(data);
    showToast(
      state.editingConcertId ? "Concert modifié ✓" : "Concert ajouté ✓",
    );
    closeConcertModal();
  } catch (e) {
    console.error(e);
    showToast("Erreur lors de la sauvegarde", "error");
  } finally {
    const btn = document.getElementById("save-concert-btn");
    btn.disabled = false;
    btn.textContent = "Enregistrer";
  }
}

// =============================================
//  MODAL GROUPE
// =============================================
function openBandModal(bandId = null) {
  state.editingBandId = bandId;
  document.getElementById("modal-band-title").textContent = bandId
    ? "Modifier le Groupe"
    : "Nouveau Groupe";
  document.getElementById("band-name").value = "";
  document.getElementById("band-color").value = "#ebeab0";
  document.getElementById("band-logo").value = "";
  updateColorPreview("#ebeab0");

  if (bandId) {
    const band = state.bands.find((b) => b.id === bandId);
    if (band) {
      document.getElementById("band-name").value = band.name;
      document.getElementById("band-color").value = band.color;
      document.getElementById("band-logo").value = band.logo_url || "";
      updateColorPreview(band.color);
    }
  }
  document.getElementById("modal-band").classList.remove("hidden");
}

function closeBandModal() {
  document.getElementById("modal-band").classList.add("hidden");
  state.editingBandId = null;
}

async function handleSaveBand() {
  const name = document.getElementById("band-name").value.trim();
  const color = document.getElementById("band-color").value;
  const logo = document.getElementById("band-logo").value.trim();

  if (!name) {
    showToast("Nom du groupe requis", "error");
    return;
  }

  const data = { name, color, logo_url: logo };
  if (state.editingBandId) data.id = state.editingBandId;

  try {
    await saveBand(data);
    showToast(state.editingBandId ? "Groupe modifié ✓" : "Groupe créé ✓");
    closeBandModal();
  } catch (e) {
    console.error(e);
    showToast("Erreur lors de la sauvegarde", "error");
  }
}

async function confirmDeleteBand(bandId) {
  const band = state.bands.find((b) => b.id === bandId);
  if (!band) return;
  const count = state.concerts.filter((c) => c.band_id === bandId).length;
  const msg =
    count > 0
      ? `Supprimer "${band.name}" ? Ce groupe a ${count} concert(s) associé(s).`
      : `Supprimer le groupe "${band.name}" ?`;
  if (!confirm(msg)) return;
  await deleteBand(bandId);
  showToast("Groupe supprimé");
}

function updateColorPreview(color) {
  document.getElementById("band-color-preview").style.background = color;
}

// =============================================
//  MODAL DÉTAIL
// =============================================
function openDetailModal(concertId) {
  const concert = state.concerts.find((c) => c.id === concertId);
  if (!concert) return;
  state.currentDetailId = concertId;

  document.getElementById("detail-band-name").textContent = concert.band_name;
  document.getElementById("detail-band-name").style.color =
    concert.band_color || "inherit";

  const sc = statusConfig(concert.status || "confirmé");
  const ct = concert.contacts || {};

  // Helper pour une ligne de contact
  const contactLine = (label, name, phone, email) => {
    if (!name && !phone && !email) return "";
    return `<div class="detail-contact-block">
      <div class="detail-contact-role">${label}</div>
      ${name ? `<div class="detail-contact-name">${escHtml(name)}</div>` : ""}
      ${phone ? `<a href="tel:${escHtml(phone)}" class="detail-contact-link"><i data-lucide="phone" style="width:13px;height:13px;vertical-align:middle;margin-right:4px"></i>${escHtml(phone)}</a>` : ""}
      ${email ? `<a href="mailto:${escHtml(email)}" class="detail-contact-link"><i data-lucide="mail" style="width:13px;height:13px;vertical-align:middle;margin-right:4px"></i>${escHtml(email)}</a>` : ""}
    </div>`;
  };

  const contactsHtml =
    contactLine("Organisateur", ct.org_name, ct.org_phone, ct.org_email) +
    contactLine("Booker", ct.booker_name, ct.booker_phone, null) +
    contactLine("Ingé Son", ct.sound_name, ct.sound_phone, null) +
    contactLine("Ingé Lumière", ct.light_name, ct.light_phone, null);

  const body = document.getElementById("detail-body");
  body.innerHTML = `
    ${
      concert.poster_image_url
        ? `<img class="detail-poster" src="${escHtml(concert.poster_image_url)}" alt="Affiche" onerror="this.style.display='none'">`
        : ""
    }
    <!-- Statut -->
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="tag"></i></div>
      <div class="detail-content">
        <div class="detail-label">Statut</div>
        <span class="status-badge status-badge-lg" style="color:${sc.color};background:${sc.bg};border-color:${sc.border}">${sc.label}</span>
      </div>
    </div>
    <!-- Date -->
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="calendar-days"></i></div>
      <div class="detail-content">
        <div class="detail-label">Date & Heure</div>
        <div class="detail-value">${formatDate(concert.date)}${concert.time ? " – " + concert.time : ""}</div>
      </div>
    </div>
    <!-- Lieu -->
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="building-2"></i></div>
      <div class="detail-content">
        <div class="detail-label">Lieu</div>
        <div class="detail-value">${escHtml(concert.venue_name)}</div>
      </div>
    </div>
    <!-- Ville -->
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="map-pin"></i></div>
      <div class="detail-content">
        <div class="detail-label">Ville / Pays</div>
        <div class="detail-value">${escHtml(concert.city)}${concert.country ? ", " + concert.country : ""}</div>
      </div>
    </div>
    <!-- Type -->
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="music"></i></div>
      <div class="detail-content">
        <div class="detail-label">Type d'événement</div>
        <div class="detail-value" style="text-transform:capitalize">${typeEmoji(concert.event_type)} ${concert.event_type || "—"}</div>
      </div>
    </div>
    <!-- Cachet -->
    ${
      concert.fee > 0
        ? `
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="euro"></i></div>
      <div class="detail-content">
        <div class="detail-label">Cachet</div>
        <div class="detail-value detail-fee">${formatEuro(concert.fee)}</div>
      </div>
    </div>`
        : ""
    }
    <!-- Google Maps -->
    ${
      concert.google_maps_link
        ? `
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="navigation"></i></div>
      <div class="detail-content">
        <div class="detail-label">Google Maps</div>
        <a href="${escHtml(concert.google_maps_link)}" target="_blank" rel="noopener" class="detail-link detail-value">Ouvrir sur Maps →</a>
      </div>
    </div>`
        : ""
    }
    <!-- Contacts -->
    ${
      contactsHtml
        ? `
    <div class="detail-row detail-row-contacts">
      <div class="detail-icon"><i data-lucide="users"></i></div>
      <div class="detail-content">
        <div class="detail-label">Contacts</div>
        <div class="detail-contacts-grid">${contactsHtml}</div>
      </div>
    </div>`
        : ""
    }
    <!-- Notes -->
    ${
      concert.notes
        ? `
    <div class="detail-row">
      <div class="detail-icon"><i data-lucide="file-text"></i></div>
      <div class="detail-content">
        <div class="detail-label">Notes</div>
        <div class="detail-notes">${escHtml(concert.notes)}</div>
      </div>
    </div>`
        : ""
    }`;

  document.getElementById("modal-detail").classList.remove("hidden");
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeDetailModal() {
  document.getElementById("modal-detail").classList.add("hidden");
  state.currentDetailId = null;
}

async function handleDeleteConcert() {
  if (!state.currentDetailId) return;
  const concert = state.concerts.find((c) => c.id === state.currentDetailId);
  if (
    !confirm(
      `Supprimer le concert "${concert?.venue_name}" du ${formatDate(concert?.date)} ?`,
    )
  )
    return;
  await deleteConcert(state.currentDetailId);
  showToast("Concert supprimé");
  closeDetailModal();
}

function handleShareConcert() {
  const id = state.currentDetailId;
  if (!id) return;
  const url = `${location.origin}${location.pathname.replace("index.html", "")}concert.html?id=${id}`;
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("Lien copié dans le presse-papier 🔗"));
  } else {
    prompt("Copiez ce lien :", url);
  }
}

// =============================================
//  NAVIGATION & VUES
// =============================================
function switchView(viewName) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById(`view-${viewName}`)?.classList.add("active");
  document
    .querySelector(`.nav-item[data-view="${viewName}"]`)
    ?.classList.add("active");
  // Fermer sidebar sur mobile
  closeSidebar();
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.remove("hidden");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.add("hidden");
}

// =============================================
//  FILTRES
// =============================================
function applyFilters() {
  state.filters.band   = document.getElementById("filter-band").value;
  state.filters.city   = document.getElementById("filter-city").value.trim();
  state.filters.type   = document.getElementById("filter-type").value;
  state.filters.status = document.getElementById("filter-status")?.value || "";
  renderTimeline();
}

function resetFilters() {
  document.getElementById("filter-band").value = "";
  document.getElementById("filter-city").value = "";
  document.getElementById("filter-type").value = "";
  const fs = document.getElementById("filter-status");
  if (fs) fs.value = "";
  state.filters = { band: "", city: "", type: "", status: "" };
  renderTimeline();
}

// =============================================
//  INITIALISATION DES LISTENERS
// =============================================
function initEventListeners() {
  // ---- Navigation ----
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  // ---- Sidebar mobile ----
  document.getElementById("hamburger")?.addEventListener("click", openSidebar);
  document
    .getElementById("sidebar-overlay")
    ?.addEventListener("click", closeSidebar);

  // ---- Logo → retour à la timeline ----
  document.getElementById("logo-home-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchView("timeline");
  });
  document
    .getElementById("topbar-home-link")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      switchView("timeline");
    });

  // ---- FAB & boutons d'ajout ----
  document
    .getElementById("fab-add")
    .addEventListener("click", () => openConcertModal());
  document
    .getElementById("btn-add-top")
    ?.addEventListener("click", () => openConcertModal());

  // ---- Modal Concert ----
  document
    .getElementById("save-concert-btn")
    .addEventListener("click", handleSaveConcert);
  document
    .getElementById("cancel-concert-modal")
    .addEventListener("click", closeConcertModal);
  document
    .getElementById("close-concert-modal")
    .addEventListener("click", closeConcertModal);
  document.getElementById("modal-concert").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeConcertModal();
  });

  // ---- Modal Groupe ----
  document
    .getElementById("btn-add-band")
    .addEventListener("click", () => openBandModal());
  document
    .getElementById("save-band-btn")
    .addEventListener("click", handleSaveBand);
  document
    .getElementById("cancel-band-modal")
    .addEventListener("click", closeBandModal);
  document
    .getElementById("close-band-modal")
    .addEventListener("click", closeBandModal);
  document.getElementById("modal-band").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeBandModal();
  });

  // ---- Color picker ----
  document
    .getElementById("band-color")
    .addEventListener("input", (e) => updateColorPreview(e.target.value));
  document.querySelectorAll(".swatch").forEach((s) => {
    s.addEventListener("click", () => {
      const color = s.dataset.color;
      document.getElementById("band-color").value = color;
      updateColorPreview(color);
    });
  });

  // ---- Modal Détail ----
  document
    .getElementById("close-detail-modal")
    .addEventListener("click", closeDetailModal);
  document.getElementById("modal-detail").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document
    .getElementById("detail-delete-btn")
    .addEventListener("click", handleDeleteConcert);
  document.getElementById("detail-edit-btn").addEventListener("click", () => {
    const id = state.currentDetailId;
    closeDetailModal();
    openConcertModal(id);
  });
  document
    .getElementById("detail-share-btn")
    .addEventListener("click", handleShareConcert);

  // ---- Filtres ----
  document
    .getElementById("filter-band")
    .addEventListener("change", applyFilters);
  document
    .getElementById("filter-city")
    .addEventListener("input", debounce(applyFilters, 400));
  document
    .getElementById("filter-type")
    .addEventListener("change", applyFilters);
  document
    .getElementById("filter-status")
    ?.addEventListener("change", applyFilters);
  document
    .getElementById("btn-reset-filters")
    .addEventListener("click", resetFilters);

  // ---- Déconnexion ----
  document.getElementById("btn-logout").addEventListener("click", () => {
    if (DEMO_MODE) {
      state.user = null;
      state.concerts = [];
      state.bands = [];
      showAuthScreen();
    } else {
      auth.signOut();
    }
  });

  // ---- Clavier ----
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (
        !document.getElementById("modal-concert").classList.contains("hidden")
      )
        closeConcertModal();
      if (!document.getElementById("modal-band").classList.contains("hidden"))
        closeBandModal();
      if (!document.getElementById("modal-detail").classList.contains("hidden"))
        closeDetailModal();
    }
  });
}

/** Debounce utilitaire */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// =============================================
//  POINT D'ENTRÉE
// =============================================
document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  setupAuthUI();
  initAuth();
  // Initialiser les icônes Lucide statiques
  if (typeof lucide !== "undefined") lucide.createIcons();
});
