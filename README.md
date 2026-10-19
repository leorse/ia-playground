# Plateforme de démonstration « IA, agents et MCP »

Démo locale de vulgarisation : une application RH classique, exposée à une IA par un serveur MCP, puis pilotée depuis VS Code (agent RH) et par un agent autonome réveillé par webhook. Tout tourne en local avec des données factices ; seul le LLM est distant. Pas de HTTPS, tokens en clair : c'est voulu.

La spécification complète est dans `spec-plateforme-demo-ia.md` (v0.2).

## État d'avancement

| Composant | Dossier | État |
|---|---|---|
| Application RH + serveur MCP + webhook | `app/` | ✅ disponible |
| Agent autonome (orchestrateur + Copilot CLI en ACP + messagerie) | `agent/` | à venir |
| Agent RH et skills pour VS Code | `vscode-demo/` | à venir |

## Prérequis

- Node.js 22 ou plus (`node -v`)
- `curl` (inclus dans Windows 10/11)

## Installation (« compilation »)

Il n'y a **pas de compilation** : c'est du JavaScript exécuté tel quel, sans build. Seule l'installation des dépendances est nécessaire.

```cmd
npm run install:all
```

(équivalent à `cd app && npm install`)

## Lancement

Une seule commande, depuis la racine du projet :

```cmd
npm start
```

ou, sous Windows, double-clic / commande sur le script qui installe les dépendances au besoin puis démarre :

```cmd
demarrer-app.cmd
```

L'application est alors disponible sur :

- Interface web : <http://localhost:3000>
- Serveur MCP : <http://localhost:3000/mcp>

Changer de port : `set PORT=3100 && npm start` (cmd) ou `PORT=3100 npm start` (bash).

Les données sont stockées dans `app/data/db.json` (créé au premier lancement, ignoré par git). Le bouton **Réinitialiser la démo** de l'interface remet l'état de départ ; supprimer ce fichier produit le même effet au prochain démarrage.

## Tests

```cmd
npm test
```

Les tests lancent un serveur temporaire (port 3999) avec une base jetable et vérifient : refus sans token, outils MCP, droits par token, webhook, réinitialisation.

## Utiliser l'interface

- **Tableau de bord** : prochaines arrivées, tâches à venir, dernières notes.
- **Personnel / Tâches** : fiches et tâches (les schémas Mermaid sont dessinés).
- **Notes** : zone de saisie libre. Les annotations de l'agent autonome s'affichent sous chaque note.
- **Paramètres** : interrupteur du webhook (désactivé par défaut), URL de l'agent (`http://localhost:4000/webhook`), secret partagé.
- **Panneau « Sous le capot »** (à droite) : appels MCP reçus, refus de droits et webhooks émis, en direct.

## Voir le serveur MCP avec curl

Les tokens de démo (fichier `app/config/tokens.json`) :

| Token | Nom | Droits |
|---|---|---|
| `demo-rh-xxxx` | `agent-rh-vscode` | lecture, écriture |
| `demo-agent-yyyy` | `agent-autonome` | lecture, annotation |

Le serveur répond en Streamable HTTP, il faut donc les deux en-têtes `Content-Type` et `Accept` ci-dessous. Chaque requête est indépendante (pas de session). Les appels apparaissent aussitôt dans le panneau « Sous le capot ».

**Windows (cmd)**

```cmd
:: 1. Poignée de main : nom du serveur et instructions générales
curl -s http://localhost:3000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer demo-rh-xxxx" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"curl\",\"version\":\"1\"}}}"

:: 2. Liste des outils et de leurs descriptions (ce que « voit » le LLM)
curl -s http://localhost:3000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer demo-rh-xxxx" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}"

:: 3. Appeler un outil
curl -s http://localhost:3000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer demo-rh-xxxx" -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"lister_personnel\",\"arguments\":{\"recherche\":\"sophie\"}}}"
```

**Linux / macOS / Git Bash**

```bash
H=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')

# 1. Poignée de main
curl -s http://localhost:3000/mcp "${H[@]}" -H 'Authorization: Bearer demo-rh-xxxx' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. Liste des outils
curl -s http://localhost:3000/mcp "${H[@]}" -H 'Authorization: Bearer demo-rh-xxxx' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. Appeler un outil
curl -s http://localhost:3000/mcp "${H[@]}" -H 'Authorization: Bearer demo-rh-xxxx' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lister_personnel","arguments":{"recherche":"sophie"}}}'
```

La réponse est au format SSE (`event: message` puis `data: {...}`).

**Montrer les droits par token** : avec `demo-agent-yyyy` (agent autonome), un outil d'écriture est refusé avec un message explicite.

```cmd
curl -s http://localhost:3000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer demo-agent-yyyy" -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"creer_tache\",\"arguments\":{\"titre\":\"test\"}}}"
```

Sans en-tête `Authorization`, le serveur répond `401`.

## Tester le webhook à la main

1. Dans **Paramètres**, cocher « Webhook actif ».
2. Publier une note depuis l'interface : le panneau « Sous le capot » affiche le POST émis (URL, payload, code de réponse). Sans agent à l'écoute sur le port 4000, la réponse indique une erreur de connexion, ce qui est normal tant que `agent/` n'existe pas.

## Brancher GitHub Copilot (VS Code) sur le serveur MCP

Le connecteur est déjà configuré dans `vscode-demo/.vscode/mcp.json` (serveur `appli-rh`, URL `http://localhost:3000/mcp`).

1. Démarrer l'application (`npm start`).
2. Dans VS Code, ouvrir le **dossier `vscode-demo/`** (`code vscode-demo`), pas la racine du dépôt.
3. Ouvrir `.vscode/mcp.json` et cliquer sur **Start** au-dessus du serveur `appli-rh` (ou commande **MCP: List Servers**).
4. À la demande du token, valider `demo-rh-xxxx` (droits lecture + écriture).
5. Dans Copilot Chat, passer en **mode Agent**, ouvrir le sélecteur d'outils : les outils `appli-rh` apparaissent. Essayer : « Liste le personnel ».

Les appels s'affichent aussitôt dans le panneau « Sous le capot » de l'interface web.

## Arborescence

```
app/                 Application RH (Express), serveur MCP, webhook, interface
  src/               server.js, mcp.js, store.js, auth.js, webhook.js, journal.js, seed.js
  public/            interface web
  config/            tokens.json, annuaire.json
  data/db.json       base JSON (créée au lancement)
  test/              tests
agent/               (à venir) orchestrateur + Copilot CLI en ACP + messagerie
vscode-demo/         configuration MCP pour VS Code (.vscode/mcp.json) ; agent RH et skills à venir
```
