# 🎵 TimeLiveAHP – Gestion de Concerts

Application web complète pour gérer les concerts d'un musicien. Design glassmorphism sombre avec animations fluides.

---

## 📁 Structure des fichiers

```
TimeLiveAHP/
├── index.html      → Application principale
├── concert.html    → Page partageable d'un concert
├── style.css       → Styles (glassmorphism dark)
├── app.js          → Logique JavaScript
└── README.md
```

---

## 🚀 Démarrage rapide (Mode Démo)

Sans configuration Firebase, l'application fonctionne en **mode démo** avec `localStorage` :

1. Ouvrir `index.html` dans un navigateur (ou un serveur local)
2. Se connecter automatiquement en mode démo
3. Des données de test sont préchargées

> Pour un serveur local rapide : `npx serve .` ou `python3 -m http.server 8080`

---

## 🔥 Configuration Firebase

### 1. Créer un projet Firebase

1. Aller sur [console.firebase.google.com](https://console.firebase.google.com)
2. Créer un nouveau projet
3. Activer **Firestore Database** (mode test pour commencer)
4. Activer **Authentication** → Email/Mot de passe + Google (optionnel)

### 2. Récupérer les clés

Dans les paramètres du projet → "Ajouter une application Web" → copier la config.

### 3. Remplacer dans le code

Dans `app.js` **ET** `concert.html`, remplacer :

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "VOTRE_API_KEY",           // ← votre vraie clé
  authDomain:        "votre-projet.firebaseapp.com",
  projectId:         "votre-projet",
  storageBucket:     "votre-projet.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId:             "VOTRE_APP_ID"
};
```

### 4. Règles Firestore (firestore.rules)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 📊 Structure des données Firestore

```
users/
  {userId}/
    bands/
      {bandId}/
        - name: string
        - color: string (hex)
        - logo_url: string
        - created_at: timestamp

    concerts/
      {concertId}/
        - band_id: string
        - band_name: string
        - band_color: string
        - date: string (YYYY-MM-DD)
        - time: string (HH:MM)
        - venue_name: string
        - city: string
        - country: string
        - event_type: string
        - notes: string
        - google_maps_link: string
        - poster_image_url: string
        - created_at: timestamp
```

---

## ✨ Fonctionnalités

- ✅ Authentification email / Google
- ✅ Timeline verticale des concerts (Ce soir / Cette semaine / Ce mois / Plus tard / Passés)
- ✅ Gestion des groupes (nom, couleur, logo)
- ✅ Ajout / modification / suppression de concerts
- ✅ Filtres (groupe, ville, type)
- ✅ Dashboard avec statistiques
- ✅ Page partageable par URL (`concert.html?id=...`)
- ✅ Mode démo (sans Firebase)
- ✅ Design glassmorphism dark mobile-first
- ✅ Animations et micro-interactions

---

## 🎨 Personnalisation

Variables CSS dans `style.css` :

```css
:root {
  --accent:  #7c3aed;   /* Violet néon principal */
  --accent2: #a855f7;   /* Violet clair */
  --bg:      #0f0f12;   /* Fond sombre */
}
```

---

## 📱 Compatibilité

- Chrome, Firefox, Safari, Edge modernes
- Mobile iOS et Android
- Progressive Web App compatible (ajouter un manifest.json)
