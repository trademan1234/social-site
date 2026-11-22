# ✦ Pulse — réseau social MEAN

Partage de photos, vidéos, réactions et commentaires.
Stack : **MongoDB · Express 5 · Angular 19 · Node 22**.

## Démarrage

```bash
npm install          # installe concurrently (racine)
npm run install:all  # installe server/ et client/
npm run dev          # API sur :3000 + Angular sur :4200 (proxy /api et /uploads)
```

Ouvre <http://localhost:4200>.

**Mode production** (Express sert l'application Angular compilée) : `npm start`, puis <http://localhost:3000>.

### MongoDB
- **Sans configuration** : un MongoDB embarqué (`mongodb-memory-server`) démarre automatiquement et
  enregistre les données dans `server/data/db`. Le binaire est téléchargé au premier lancement.
- **Vrai serveur / Atlas** : définis `MONGO_URI`, par exemple `mongodb://localhost:27017/pulse`.

## Fonctionnalités
- Inscription et connexion **par pseudo uniquement** (pas d'email ni de mot de passe).
- Les visiteurs voient le fil ; **seuls les inscrits** peuvent publier, réagir et commenter.
- Publication de photos (glisser-déposer accepté) et de vidéos (mp4/webm/mov, 100 Mo max), avec barre de progression.
- 6 réactions (👍 ❤️ 😂 😮 🔥 😢) : survol, ou appui long sur mobile. Double-clic sur une photo = ❤️.
- Commentaires, profils avec statistiques et bio, filtres Tout / Photos / Vidéos, scroll infini.

## Optimisations
- Images converties en **WebP**, redimensionnées (1600 px) + miniature 640 px, servies via `srcset`.
- Dimensions stockées : pas de décalage de mise en page (`aspect-ratio`).
- Vidéos : aucun téléchargement avant l'approche de l'écran, lecture auto muette quand visibles, streaming HTTP Range.
- Médias en cache navigateur 1 an (`immutable`), compression gzip des réponses.
- Angular **zoneless** + signals + `OnPush`, pages en lazy loading, `content-visibility` sur les cartes.
  Environ 71 Ko transférés au chargement initial.
- Pagination par curseur et index MongoDB adaptés.

## ⚠️ Sécurité
Choix volontaire, conformément à la demande : **n'importe qui connaissant un pseudo peut se connecter avec**.
Convient à une démo ou à un usage entre proches, pas à une mise en ligne publique sans mot de passe.
