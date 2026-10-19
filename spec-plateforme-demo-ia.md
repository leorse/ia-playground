# Spécification – Plateforme de démonstration « IA, agents et MCP »

> Version 0.2 – Octobre 2026
> Pile technique : Node.js
> Évolutions depuis la v0.1 : notes en texte libre et fiches du personnel, agent RH dans VS Code avec skills, agent autonome reconstruit sur **Copilot CLI piloté en ACP** (pas d'accès API direct à un LLM), serveur MCP « messagerie », scénarios d'interprétation de texte.

---

## 1. Contexte et objectifs

L'objectif est de construire une petite plateforme de **vulgarisation** qui montre concrètement, sur un même cas d'usage RH, comment s'articulent :

- une **application métier classique** (tâches, notes, fiches du personnel), sans IA ;
- un **serveur MCP** qui expose cette application à une IA ;
- un **agent conversationnel avec persona** (agent RH dans VS Code / Copilot) qui utilise des **skills** ;
- un **agent autonome**, réveillé par un **webhook**, qui **interprète du texte libre** et décide seul qui prévenir.

### Messages pédagogiques visés

1. Le LLM n'a jamais été entraîné sur l'application : il la découvre **uniquement grâce aux descriptions des outils** exposés par le serveur MCP.
2. Le client MCP ne réfléchit pas : il **relaie** entre le LLM et le serveur. La décision vient du modèle.
3. **Persona** = qui est l'agent (rôle, ton, périmètre). **Skill** = savoir-faire chargé à la demande (procédure, référentiels, modèles). **Outil MCP** = capacité d'agir. Les trois se combinent.
4. Un agent autonome utilise **les mêmes briques** qu'un chat : seul change **qui le déclenche**.
5. La **valeur ajoutée du LLM** est l'interprétation : comprendre une note brouillonne, en déduire le type, croiser avec d'autres données, détecter un conflit ou une information manquante, et faire preuve de discrétion.
6. Trois protocoles complémentaires : **webhook** (l'application prévient), **ACP** (un programme pilote un agent), **MCP** (l'agent utilise des outils).
7. Les **garde-fous** (droits par token, secret de webhook, politique d'autorisation des outils) restent côté application et orchestrateur, jamais dans la bonne volonté du modèle.

### Cas d'usage fil rouge

**L'arrivée de Jean Bonno**, développeur en CDD de 3 mois à partir du 12 janvier 2027 : création de sa fiche, de son planning d'onboarding et de ses demandes d'accès, annonce à l'équipe, puis notification automatique des personnes concernées. D'autres notes (absence, retard de matériel, sujet confidentiel…) illustrent la capacité d'interprétation de l'agent autonome.

---

## 2. Vue d'ensemble de l'architecture

```
┌────────────────────────────┐        MCP (HTTP + token)        ┌─────────────────────────────┐
│  VS Code + Copilot Chat    │ ───────────────────────────────▶ │                             │
│  (hôte + client MCP)       │                                  │   Application RH            │
│  - persona « Agent RH »    │                                  │   (serveur Node.js)         │
│  - skill nouvel-arrivant   │                                  │                             │
│  - skill schema-onboarding │                                  │   - Interface web           │
└────────────────────────────┘                                  │   - Tâches, notes, fiches,  │
                                                                │     annuaire                │
                                webhook « note.creee »          │   - Point d'accès /mcp      │
┌──────────────────────────────────────────┐   (secret)         │   - Émetteur de webhook     │
│  Agent autonome                          │ ◀───────────────── │     (désactivé par défaut)  │
│                                          │                    └─────────────────────────────┘
│  ┌────────────────────────────────────┐  │                                 ▲
│  │ Orchestrateur (Node.js)            │  │                                 │
│  │ - POST /webhook                    │  │                                 │ MCP (HTTP + token
│  │ - client ACP                       │  │                                 │  lecture + annotation)
│  │ - politique d'autorisation         │  │                                 │
│  │ - serveur MCP « messagerie » /mcp ─┼──┼──▶ outbox/*.eml                 │
│  └───────────────┬────────────────────┘  │                                 │
│                  │ ACP (stdio)           │                                 │
│  ┌───────────────▼────────────────────┐  │                                 │
│  │ Copilot CLI (copilot --acp)        │──┼─────────────────────────────────┘
│  │ - persona + skill routage-notes    │  │
│  │ - client MCP (appli + messagerie)  │──┼──▶ MCP messagerie (orchestrateur)
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

| Composant | Rôle | Port par défaut |
|---|---|---|
| `app/` | Application RH + serveur MCP + émetteur de webhook | 3000 |
| `agent/` | Orchestrateur : récepteur de webhook, client ACP, serveur MCP « messagerie » | 4000 |
| `agent/workspace/` | Dossier de travail de Copilot CLI : persona et skills de l'agent autonome | – |
| `vscode-demo/` | Espace de travail VS Code : configuration MCP, agent RH, skills | – |

---

## 3. Choix techniques

| Sujet | Choix | Justification |
|---|---|---|
| Runtime | Node.js 22 LTS ou plus | Version stable récente |
| Serveur web | Express | Simple, suffisant pour une démo |
| MCP (serveurs) | `@modelcontextprotocol/sdk`, transport Streamable HTTP | SDK officiel |
| Validation des paramètres | `zod` | Utilisé par le SDK MCP pour décrire les schémas d'outils |
| LLM côté IDE | GitHub Copilot Chat (VS Code, mode Agent) | Disponible dans l'IDE |
| LLM côté agent autonome | **GitHub Copilot CLI en mode ACP** (`copilot --acp --stdio`) | Pas d'accès API direct à un LLM ; Copilot CLI utilise l'authentification Copilot |
| Client ACP | `@agentclientprotocol/sdk` | SDK TypeScript utilisé dans la documentation de Copilot CLI |
| Stockage | Fichier JSON (`data/db.json`) | Zéro dépendance, lisible, réinitialisable |
| Interface web | HTML + JS vanilla, Mermaid et un rendu markdown chargés depuis un CDN | Pas de build front |
| Rafraîchissement | Server-Sent Events (SSE) | Les éléments doivent **apparaître en direct** pendant la démo |
| Transport réseau | HTTP simple (pas de HTTPS) | Démo en local / réseau fermé – à signaler comme limite |

> **Préversion** : le support d'ACP dans Copilot CLI est en préversion publique et peut évoluer. Prévoir de figer la version de Copilot CLI utilisée pour la démo.

---

## 4. Composant 1 – Application RH

### 4.1 Modèle de données

#### Fiche du personnel

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | string | oui (généré) | Ex. `P-0007` |
| `prenom`, `nom` | string | oui | |
| `poste` | string | oui | Ex. « Développeur » |
| `service` | string | non | Ex. « Équipe produit » |
| `type_contrat` | enum `CDI` / `CDD` / `stage` / `alternance` / `interim` | oui | |
| `date_debut` | date | oui | |
| `date_fin` | date | non (obligatoire hors CDI) | |
| `date_fin_calculee` | booléen | non | `true` si la date de fin a été déduite par l'IA (ex. « 3 mois ») et doit être confirmée par les RH |
| `manager` | string | non | Nom du manager |
| `email` | string | non | Adresse professionnelle prévue |
| `statut` | enum `a_venir` / `actif` / `parti` | oui (défaut `a_venir`) | |
| `auteur`, `cree_le`, `modifie_le` | – | oui (générés) | |

#### Tâche

Champs de la v0.1 (`id`, `titre`, `description`, `debut`, `echeance`, `assigne`, `etiquettes`, `priorite`, `statut`, `tache_parente`, `pieces_jointes`, `auteur`, `cree_le`, `modifie_le`), plus :

| Champ | Type | Description |
|---|---|---|
| `personne_id` | string | Lien vers la fiche du personnel concernée |
| `fin_validite` | date | Pour une demande d'accès : date d'expiration de l'accès demandé |

Les **demandes d'accès** sont des tâches portant l'étiquette `demande-acces`, assignées au rôle « informatique », avec `personne_id` et `fin_validite`.

#### Pièce jointe

Inchangée : `id`, `nom`, `type` (`mermaid` / `markdown` / `texte`), `contenu`, `ajoute_le`. Les schémas sont stockés en **source Mermaid** et dessinés par l'application.

#### Note

C'est l'objet central de l'agent autonome. **Elle n'a volontairement pas de type** : c'est l'agent qui l'interprète.

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | string | oui (généré) | Ex. `N-0012` |
| `titre` | string | non | |
| `contenu` | string (markdown) | oui | Texte libre, éventuellement brouillon |
| `personne_id` | string | non | Lien vers une fiche, si l'auteur le précise |
| `auteur`, `cree_le` | – | oui (générés) | |
| `annotations` | Annotation[] | non | Ajoutées par l'agent autonome, voir ci-dessous |

#### Annotation (écrite par l'agent autonome)

| Champ | Type | Description |
|---|---|---|
| `type_detecte` | enum (voir § 6.4) | Ce que l'agent a compris |
| `resume` | string | Une ou deux phrases |
| `personnes_prevenues` | string[] | Rôles ou noms des destinataires des mails |
| `alertes` | string[] | Conflits ou informations manquantes détectés |
| `confidentiel` | booléen | La note a été jugée sensible |
| `auteur`, `ajoute_le` | – | Générés |

L'interface affiche les annotations sous la note : on **voit ce que l'IA a compris**.

#### Annuaire

Fichier `app/config/annuaire.json`, exposé en lecture via MCP. Il associe des **rôles** à des contacts, pour que les skills raisonnent par rôle et non par adresse :

| Rôle | Exemple de contact |
|---|---|
| `rh` | Claire Dumas – rh@exemple.local |
| `informatique` | Support IT – it@exemple.local |
| `services_generaux` | Accueil & logistique – sg@exemple.local |
| `direction` | Anne Roy – direction@exemple.local |
| `manager:<service>` | Paul Girard (Équipe produit) – paul.girard@exemple.local |

Les salariés de l'annuaire (ex. Sophie, Marc, Karim) sont également présents pour les scénarios.

#### Paramètres de l'application

| Paramètre | Défaut | Description |
|---|---|---|
| `webhook.actif` | `false` | Interrupteur « notifier l'agent autonome » |
| `webhook.url` | `http://localhost:4000/webhook` | Adresse de l'orchestrateur |
| `webhook.evenements` | `["note.creee"]` | Événements notifiés |

### 4.2 Interface web

- **Tableau de bord** : prochaines arrivées (fiches `a_venir`), tâches à venir, dernières notes.
- **Fiches du personnel** : liste et détail, avec les tâches et demandes d'accès liées. Badge « date de fin à confirmer » si `date_fin_calculee`.
- **Tâches** : liste groupée par tâche parente ; détail avec description markdown et **schémas Mermaid rendus**.
- **Notes** : liste et détail ; **formulaire de saisie libre** (zone de texte, rien d'autre) pour déclencher les scénarios ; annotations de l'agent affichées sous chaque note.
- **Paramètres** : interrupteur du webhook (désactivé par défaut), URL de l'agent.
- **Journal d'activité** (panneau « sous le capot »), en direct :
  - appels MCP reçus (client, outil, paramètres, résultat, refus de droits) ;
  - webhooks émis (URL, payload, code de réponse).
- **Bouton « Réinitialiser la démo »** : remet les données de départ (annuaire et salariés existants conservés, le reste vidé).

### 4.3 Authentification et droits

Gestion rudimentaire par **token**, dans `app/config/tokens.json`, transmis en `Authorization: Bearer <token>`.

| Nom du token | Utilisé par | Droits |
|---|---|---|
| `agent-rh-vscode` | Copilot Chat dans VS Code | `lecture`, `ecriture` |
| `agent-autonome` | Copilot CLI piloté par l'orchestrateur | `lecture`, `annotation` |

- Trois niveaux de droits : `lecture` (consulter), `ecriture` (créer et modifier tâches, notes, fiches, pièces jointes), `annotation` (uniquement `annoter_note`).
- Sans token ou token inconnu → `401`. Outil non autorisé pour ce token → erreur MCP explicite (« le token agent-autonome n'a pas le droit d'écriture »).
- Le nom du token alimente le champ `auteur` et le journal.

> Intérêt pédagogique : l'agent autonome peut **lire** et **annoter**, mais ne peut **rien créer ni modifier**. Les droits sont imposés par l'application, pas par le prompt.

### 4.4 Serveur MCP

- Point d'accès : `POST /mcp` (Streamable HTTP).
- Nom : `appli-rh`. Instructions générales envoyées à l'initialisation : « Application RH de l'équipe : fiches du personnel, tâches et planning, notes internes, annuaire. À utiliser pour tout ce qui concerne une arrivée, un départ, une absence, des accès, des rendez-vous ou l'organisation de l'équipe. »

#### Outils exposés

Les descriptions sont **la documentation de l'application pour l'IA** : elles doivent préciser quand utiliser l'outil, les formats et les enchaînements.

| Outil | Droit | Description (résumé) | Paramètres principaux |
|---|---|---|---|
| `lister_personnel` | lecture | Recherche des fiches par nom, statut, service ou période d'arrivée. À utiliser pour vérifier si une personne existe déjà avant d'en créer une. | `recherche`, `statut`, `service`, `arrivee_du`, `arrivee_au` |
| `lire_fiche_personnel` | lecture | Détail d'une fiche, avec ses tâches et demandes d'accès. | `id` |
| `creer_fiche_personnel` | écriture | Crée la fiche d'un nouvel arrivant. Si l'utilisateur donne une durée (« 3 mois ») plutôt qu'une date de fin, calcule la date et mets `date_fin_calculee` à vrai. | champs de la fiche |
| `modifier_fiche_personnel` | écriture | Modifie une fiche existante (seuls les champs fournis). | `id` + champs |
| `lister_taches` | lecture | Liste les tâches, avec filtres. À utiliser pour retrouver un identifiant ou vérifier un conflit de planning. | `etiquette`, `assigne`, `personne_id`, `statut`, `a_partir_du`, `jusqu_au` |
| `lire_tache` | lecture | Détail d'une tâche, sous-tâches et pièces jointes. | `id` |
| `creer_tache` | écriture | Crée une tâche ou un rendez-vous. Pour une demande d'accès, utilise l'étiquette `demande-acces`, assigne-la au rôle informatique et renseigne `fin_validite`. | `titre`, `description`, `debut`, `echeance`, `assigne`, `etiquettes`, `priorite`, `tache_parente`, `personne_id`, `fin_validite` |
| `modifier_tache` | écriture | Modifie une tâche (seuls les champs fournis). | `id` + champs |
| `ajouter_piece_jointe` | écriture | Attache un document à une tâche. Pour un schéma : type `mermaid`, source brute sans balises de code. | `id_tache`, `nom`, `type`, `contenu` |
| `creer_note` | écriture | Publie une note interne visible par l'équipe, en markdown (titres, listes, tableaux autorisés). | `titre`, `contenu`, `personne_id` |
| `lister_notes` | lecture | Liste les notes récentes. | `depuis`, `personne_id` |
| `lire_note` | lecture | Contenu complet d'une note et de ses annotations. | `id` |
| `annoter_note` | annotation | Ajoute l'interprétation de l'agent à une note : type détecté, résumé, personnes prévenues, alertes, confidentialité. | `id`, champs de l'annotation |
| `lister_contacts` | lecture | Annuaire : trouve le contact correspondant à un rôle (`rh`, `informatique`, `services_generaux`, `manager:<service>`…) ou à un nom. | `role`, `recherche` |

#### Gestion des erreurs

Les messages d'erreur sont **rédigés pour qu'un LLM puisse se corriger** :
- « Date invalide pour `date_debut` : format attendu AAAA-MM-JJ, reçu "12 janvier". »
- « Une fiche existe déjà pour Jean Bonno (P-0007). Utilise `modifier_fiche_personnel` si besoin. »
- « `date_fin` est obligatoire pour un contrat CDD. »
- « Aucun contact pour le rôle "compta". Rôles disponibles : rh, informatique, services_generaux, direction, manager:<service>. »

### 4.5 Émetteur de webhook

- Actif seulement si `webhook.actif = true`. Événement par défaut : `note.creee`, quelle que soit l'origine de la note (interface web ou Copilot).
- `POST <webhook.url>`, en-tête `X-Webhook-Secret: <secret partagé>`, corps :

```json
{
  "evenement": "note.creee",
  "date": "2026-11-03T10:15:00+01:00",
  "auteur": "agent-rh-vscode",
  "note": { "id": "N-0012", "titre": "Arrivée de Jean Bonno", "extrait": "Jean Bonno rejoindra l'équipe produit le 12 janvier…" }
}
```

- Le payload ne contient qu'un **extrait** : l'agent doit aller lire la note complète via MCP (ce qui montre l'aller-retour).
- Envoi asynchrone, délai d'attente 5 s, pas de nouvelle tentative en v1 ; envoi et résultat inscrits dans le journal.

---

## 5. Composant 2 – VS Code : l'agent RH

VS Code est l'**hôte** : il intègre le client MCP et le LLM (Copilot Chat en **mode Agent**).

### 5.1 Configuration MCP

`vscode-demo/.vscode/mcp.json` :

```json
{
  "inputs": [
    { "type": "promptString", "id": "token-rh", "description": "Token de l'application RH", "password": true }
  ],
  "servers": {
    "appli-rh": {
      "type": "http",
      "url": "http://192.168.1.20:3000/mcp",
      "headers": { "Authorization": "Bearer ${input:token-rh}" }
    }
  }
}
```

### 5.2 Persona « Agent RH »

Agent personnalisé : `vscode-demo/.github/agents/agent-rh.agent.md`.

- **Rôle** : assistant RH de l'équipe, spécialiste des arrivées, départs et de l'organisation.
- **Comportement** : quand une information RH est donnée, il **agit** dans l'application (fiche, tâches, note) sans attendre qu'on lui détaille chaque étape ; il récapitule ensuite ce qu'il a créé, avec les identifiants.
- **Prudence** : il signale toute donnée déduite (ex. date de fin calculée) et demande confirmation en cas d'ambiguïté réelle (ex. poste inconnu de la matrice d'accès).
- **Périmètre** : refuse les sujets de rémunération et les données personnelles sensibles (santé, vie privée).
- **Ton** : professionnel, chaleureux, concis.
- **Outils autorisés** : serveur `appli-rh` uniquement.

### 5.3 Skill « nouvel-arrivant »

Emplacement : `vscode-demo/.github/skills/nouvel-arrivant/` (à vérifier selon la version de Copilot).

```
nouvel-arrivant/
├── SKILL.md               # description + procédure
├── matrice-acces.md       # accès à demander selon le poste
├── checklist-arrivee.md   # étapes types avant / jour J / première semaine
└── modele-note.md         # gabarit de la note d'annonce
```

**Description** : « À utiliser quand l'utilisateur annonce l'arrivée d'une nouvelle personne (embauche, CDD, stage, alternance…). »

**Procédure** :
1. Extraire du message : prénom, nom, poste, service, type de contrat, date de début, durée ou date de fin, manager. S'il manque une information **bloquante** (nom, date de début, type de contrat), la demander ; sinon continuer.
2. Vérifier avec `lister_personnel` que la personne n'existe pas déjà.
3. Calculer la date de fin si une durée est donnée (CDD de 3 mois à partir du 12/01/2027 → fin le 11/04/2027) et marquer `date_fin_calculee`.
4. `creer_fiche_personnel`.
5. `creer_tache` : tâche principale « Arrivée de <Prénom Nom> », datée du premier jour, liée à la fiche.
6. Créer les sous-tâches de `checklist-arrivee.md` (badge, poste de travail, accueil par le manager, présentation de l'équipe…), datées par rapport au premier jour.
7. Pour chaque accès listé dans `matrice-acces.md` pour ce poste : une tâche `demande-acces`, assignée au rôle informatique, avec `fin_validite` = date de fin du contrat (aucune expiration pour un CDI).
8. `creer_note` : annonce mise en forme à partir de `modele-note.md` (titre, phrase d'accueil, tableau récapitulatif poste / service / contrat / dates / manager, prochaines étapes).
9. Répondre à l'utilisateur avec un récapitulatif et les identifiants créés, en signalant les données déduites.

**Extrait attendu de `matrice-acces.md`** :

| Poste | Accès |
|---|---|
| Développeur | Messagerie, GitLab (groupe produit), VPN, environnement de recette, outil de tickets |
| Commercial | Messagerie, CRM, VPN |
| Tout poste | Messagerie, intranet, badge |

### 5.4 Skill « schema-onboarding »

Repris de la v0.1 : à partir des tâches d'onboarding d'une personne, produire un diagramme Mermaid du parcours (avant l'arrivée / jour J / première semaine), créer une tâche « Schéma du parcours – <Prénom> » rattachée à la tâche principale, et y attacher le schéma avec `ajouter_piece_jointe`.

Emplacement : `vscode-demo/.github/skills/schema-onboarding/` (`SKILL.md`, `modele.mmd`).

### 5.5 Ce qui n'est **pas** fourni

Pour la première partie de la démo, on peut montrer Copilot en mode Agent **sans persona ni skill** : il utilise l'application avec les seules descriptions MCP. On active ensuite l'agent RH et ses skills pour montrer le gain (enchaînement complet, mise en forme, accès selon le poste).

---

## 6. Composant 3 – Agent autonome (orchestrateur + Copilot CLI en ACP)

### 6.1 Principe

Aucun LLM n'est accessible par API en dehors de l'IDE. L'agent autonome est donc composé de :
- **Copilot CLI**, lancé en mode ACP : c'est **le cerveau** (LLM, boucle agentique, client MCP, lecture de la persona et des skills dans son dossier de travail) ;
- **l'orchestrateur Node.js** : il reçoit le webhook, **pilote Copilot CLI via ACP**, décide des autorisations et fournit l'outil d'envoi de mail via son propre serveur MCP.

### 6.2 Orchestrateur

Processus Node.js qui tourne en permanence (port 4000), avec trois rôles.

**a) Récepteur de webhook – `POST /webhook`**
1. Vérifie `X-Webhook-Secret` ; sinon `401` et événement ignoré.
2. Répond immédiatement `202 Accepted`.
3. Place l'événement dans une **file d'attente** : les notes sont traitées **une par une**.

**b) Client ACP**
1. Au démarrage, lance `copilot --acp --stdio` comme sous-processus (avec les options de filtrage d'outils, voir 6.5) et fait la poignée de main ACP (`initialize`).
2. Pour chaque note : ouvre une **nouvelle session** dont le dossier de travail est `agent/workspace/` (chaque note est traitée dans un contexte propre).
3. Envoie le prompt :
   > « Une nouvelle note vient d'être publiée dans l'application RH : <id> (auteur : <auteur>). Lis-la, interprète-la selon le skill routage-notes, prévient les bonnes personnes par mail, puis annote la note. »
4. Reçoit le **flux des mises à jour** (messages de l'agent, outils appelés, résultats) et l'affiche en console, de façon lisible pour la démo.
5. Répond aux **demandes d'autorisation** selon la politique (6.5).
6. Délai maximal par note : 3 minutes, puis annulation de la session et trace dans la console.

**c) Serveur MCP « messagerie » – `POST /mcp`**

Un deuxième serveur MCP, minimal, fourni par l'orchestrateur, protégé par un token local.

| Outil | Description | Paramètres |
|---|---|---|
| `envoyer_mail` | Envoie un mail (simulé). À utiliser pour prévenir une ou plusieurs personnes. Un mail par destinataire ou groupe de destinataires partageant le même message. | `a` (liste), `cc` (liste, optionnel), `objet`, `corps` (texte), `note_id` (optionnel) |
| `lister_mails_envoyes` | Liste les mails déjà envoyés pour une note, pour éviter les doublons. | `note_id` |

Effet de `envoyer_mail` : écriture d'un fichier **`.eml`** dans `agent/outbox/` (`AAAAMMJJ-HHMMSS-<objet-court>.eml`, en-têtes `From`, `To`, `Cc`, `Subject`, `Date`), ouvrable dans n'importe quel client mail.

> Pédagogiquement, Copilot CLI est ainsi branché sur **deux serveurs MCP** : l'application RH et la messagerie.

### 6.3 Dossier de travail de Copilot CLI

```
agent/workspace/
├── AGENTS.md                       # persona de l'agent autonome (ou fichier d'instructions reconnu par la version utilisée)
└── .github/skills/routage-notes/
    ├── SKILL.md                    # procédure d'interprétation et de routage
    ├── table-routage.md            # type de note → destinataires → contenu attendu
    ├── regles-confidentialite.md
    └── modeles-mails/
        ├── arrivee-informatique.md
        ├── arrivee-services-generaux.md
        ├── arrivee-manager.md
        ├── absence.md
        ├── alerte-conflit.md
        └── demande-complement-rh.md
```

**Persona (`AGENTS.md`)** :
- « Tu es l'assistant RH de l'équipe. Tu es réveillé automatiquement quand une note est publiée. Personne ne lit tes réponses en direct : tu agis uniquement par des mails et des annotations. »
- « Tu ne crées et ne modifies jamais rien dans l'application. »
- « Tu n'inventes jamais une information : si elle manque, tu demandes un complément aux RH. »
- « En cas de doute sur la confidentialité, tu choisis toujours l'option la plus discrète. »

### 6.4 Skill « routage-notes »

**Procédure (`SKILL.md`)** :
1. Lire la note complète (`lire_note`). Si elle est déjà annotée, s'arrêter.
2. **Interpréter** : déterminer le type (table ci-dessous), extraire personnes, dates, services concernés.
3. **Croiser** avec l'application : fiches (`lister_personnel`, `lire_fiche_personnel`), planning (`lister_taches`) pour détecter conflits et incohérences.
4. **Déterminer les destinataires** à partir de `table-routage.md`, puis les adresses via `lister_contacts`.
5. **Rédiger** un mail **adapté à chaque destinataire** (ce qui le concerne, pas toute la note), à partir des modèles. Vérifier avec `lister_mails_envoyes` qu'il n'y a pas de doublon.
6. `envoyer_mail`.
7. `annoter_note` : type, résumé, personnes prévenues, alertes, confidentialité.

**Table de routage (`table-routage.md`)** :

| Type détecté | Indices typiques | Destinataires | Contenu attendu |
|---|---|---|---|
| `arrivee` | arrive, rejoint, embauche, CDD, stage | informatique, services généraux, manager du service | IT : accès à ouvrir et **date d'expiration** ; SG : badge, poste, date et heure ; manager : récapitulatif et rendez-vous d'accueil |
| `depart` | départ, fin de contrat, dernier jour | informatique, services généraux, manager, RH | Révocation des accès à la date de départ, restitution du matériel |
| `absence` | absent, congé, arrêt, remplace | personne qui reprend les dossiers, manager | Période, dossiers concernés, **rendez-vous du planning impactés** |
| `logistique` | livraison, matériel, PC, badge, salle | informatique ou services généraux, manager si impact | Problème, impact sur le planning, solution proposée |
| `confidentiel` | « entre nous », « ne pas diffuser », santé, intention de départ, conflit entre personnes | **RH uniquement** | Mail sobre, sans reprendre les détails sensibles ; annotation `confidentiel` ; résumé neutre |
| `incomplet` | information clé manquante (qui, quand) | RH | Demande de complément précise (« il manque le nom et la date d'arrivée ») |
| `information` | annonce générale sans action | aucun mail | Annotation seule |

**Règles transverses** : une note peut avoir un type principal et des alertes secondaires ; un conflit détecté dans le planning génère toujours une alerte et un mail au manager concerné ; ne jamais diffuser à des personnes non concernées.

### 6.5 Garde-fous : deux niveaux

1. **Au lancement de Copilot CLI** : les options de filtrage d'outils (`--available-tools` / `--excluded-tools`) limitent ce que l'agent peut utiliser ; en mode ACP elles s'appliquent à chaque session ouverte.
2. **Politique d'autorisation de l'orchestrateur** (réponse aux demandes d'autorisation ACP) :
   - **autoriser** les outils des serveurs `appli-rh` et `messagerie` ;
   - **refuser** tout le reste (commandes shell, écriture de fichiers, accès réseau…) ;
   - **journaliser** chaque décision, en particulier les refus.

S'ajoutent les droits du token `agent-autonome` (lecture + annotation) imposés par l'application.

### 6.6 Configuration (`agent/.env`)

| Variable | Exemple | Description |
|---|---|---|
| `PORT` | `4000` | Port du webhook et du serveur MCP messagerie |
| `WEBHOOK_SECRET` | `demo-secret-zzzz` | Secret partagé avec l'application |
| `APP_MCP_URL` | `http://localhost:3000/mcp` | Serveur MCP de l'application |
| `APP_MCP_TOKEN` | `demo-agent-yyyy` | Token `agent-autonome` |
| `MESSAGERIE_TOKEN` | `demo-mail-wwww` | Token du serveur MCP messagerie |
| `COPILOT_BIN` | `copilot` | Exécutable de Copilot CLI |
| `COPILOT_ARGS` | `--acp --stdio` + filtres d'outils | Arguments de lancement |
| `WORKSPACE_DIR` | `./workspace` | Dossier de travail des sessions |
| `OUTBOX_DIR` | `./outbox` | Dossier des mails simulés |
| `SESSION_TIMEOUT_S` | `180` | Délai maximal par note |

Copilot CLI doit être **installé et authentifié** sur la machine de l'orchestrateur.

---

## 7. Scénarios

### 7.1 Scénario principal – Arrivée de Jean Bonno (VS Code)

**Message dans le chat, agent RH sélectionné** :
> « Un nouvel arrivant, Jean Bonno, arrive en tant que développeur le 12 janvier en CDD pour 3 mois. Il lui faudra des accès. »

**Résultat attendu dans l'application** :
- Fiche `P-…` : Jean Bonno, développeur, CDD, du 12/01/2027 au 11/04/2027, badge « date de fin à confirmer ».
- Tâche principale « Arrivée de Jean Bonno » au 12/01/2027, avec ses sous-tâches (badge, poste, accueil manager, présentation de l'équipe…).
- Demandes d'accès (messagerie, GitLab, VPN, recette, tickets) assignées à l'informatique, **expirant le 11/04/2027**.
- Note d'annonce **mise en forme** (titre, tableau récapitulatif, prochaines étapes).
- Réponse de l'agent RH : récapitulatif avec identifiants, et mention que la date de fin a été calculée.

**Suite** : « Fais-moi le schéma de son parcours » → skill `schema-onboarding`, tâche avec schéma rendu.

### 7.2 Scénarios d'interprétation – agent autonome

Webhook activé. Chaque note est saisie en texte libre dans l'interface (ou produite par l'agent RH).

| # | Note | Ce que l'agent doit comprendre | Résultat attendu |
|---|---|---|---|
| A | Note d'annonce de Jean Bonno (créée en 7.1) | Arrivée, CDD, accès à durée limitée | 3 mails distincts : informatique (accès + expiration au 11/04), services généraux (badge, poste pour le 12/01), manager (récapitulatif + rendez-vous d'accueil). Annotation `arrivee`. |
| B | « Sophie absente toute la semaine prochaine, Marc reprend ses dossiers, attention réunion client jeudi » | Absence ; Marc est le remplaçant ; un rendez-vous est impacté | Il lit le planning, retrouve la réunion client, écrit à Marc (dossiers + réunion de jeudi avec date et heure) et au manager. Annotation `absence` + alerte. |
| C | « Le PC de Jean ne sera livré que le 15 » | Logistique ; **conflit** avec l'arrivée du 12 (rien ne l'indique dans la note) | Il croise avec la fiche de Jean, alerte l'informatique et le manager, propose un prêt de matériel. Annotation `logistique` + alerte « poste indisponible du 12 au 15 ». |
| D | « Karim m'a dit qu'il pensait partir, à garder entre nous » | Sujet **confidentiel** | Un seul mail, aux RH, sobre, sans détail ; aucun mail au manager. Annotation `confidentiel`, résumé neutre. |
| E | « Une stagiaire arrive en février » | Arrivée **incomplète** | Mail aux RH demandant nom, date exacte, service et tuteur. Aucun mail à l'informatique. Annotation `incomplet`. |
| F | « Pot de départ de Lucie vendredi à 17h en salle B » | Information générale (ou logistique légère) | Pas de mail, ou un mail aux services généraux pour la salle selon la table ; annotation dans tous les cas. Permet de discuter des choix de l'agent. |

### 7.3 Déroulé de démonstration

| # | Étape | Ce qu'on fait | Ce qu'on montre |
|---|---|---|---|
| 0 | Départ | Appli avec annuaire et quelques salariés, webhook désactivé | L'application seule, sans IA |
| 1 | Découverte MCP | Démarrer le serveur `appli-rh` dans VS Code | Poignée de main et liste des outils (journal d'activité) |
| 2 | Sans doc | Copilot en mode Agent, sans persona : « J'ai rendez-vous avec Paul mardi à 14h » | Une tâche est créée alors qu'on ne l'a pas demandé, grâce aux seules descriptions |
| 3 | Persona + skill | Sélectionner l'agent RH, envoyer le message Jean Bonno | Fiche, tâches, demandes d'accès et note mise en forme **apparaissent en direct** |
| 4 | Schéma | « Fais-moi le schéma de son parcours » | Skill outil, diagramme rendu dans l'appli |
| 5 | Autonomie | Activer le webhook ; republier ou créer une note d'arrivée | Webhook émis → orchestrateur → session ACP → appels MCP → **`.eml` dans outbox** → annotation visible sous la note |
| 6 | Interprétation | Saisir les notes B, C, D, E | Valeur du LLM : déduction, croisement, discrétion, refus d'inventer |
| 7 | Garde-fous | Montrer un refus d'autorisation dans la console de l'orchestrateur, ou un refus de droit dans le journal de l'appli | Les limites sont imposées par le système, pas par le modèle |

---

## 8. Garde-fous et limites (à présenter)

- **Droits par token** : l'agent autonome ne peut que lire et annoter.
- **Secret de webhook** : l'orchestrateur rejette les événements non authentifiés.
- **Double filtrage des outils** de Copilot CLI (options de lancement + politique d'autorisation).
- **Confirmation dans VS Code** avant chaque appel d'outil côté agent RH.
- **Agent prudent** : n'invente pas, escalade vers les RH, privilégie la discrétion.
- **Pas de boucle infinie** : l'agent autonome ne crée pas de notes, il ne peut donc pas se réveiller lui-même.
- **Limites assumées** : pas de HTTPS (tokens en clair), pas de nouvelle tentative de webhook, stockage JSON, mails simulés, ACP en préversion, consommation du quota Copilot à chaque note traitée.

---

## 9. Arborescence du projet

```
demo-ia-mcp/
├── app/
│   ├── src/
│   │   ├── server.js            # Express : interface, API, SSE, montage /mcp
│   │   ├── mcp.js               # Serveur MCP appli-rh et ses outils
│   │   ├── store.js             # Lecture/écriture de data/db.json
│   │   ├── auth.js              # Tokens et droits (lecture / ecriture / annotation)
│   │   ├── webhook.js           # Émission des notifications
│   │   └── journal.js           # Journal d'activité + diffusion SSE
│   ├── public/                  # index.html, app.js, style.css
│   ├── config/
│   │   ├── tokens.json
│   │   └── annuaire.json
│   ├── data/
│   │   ├── db.json
│   │   └── seed.json            # Données de départ pour la réinitialisation
│   └── .env
├── agent/
│   ├── src/
│   │   ├── index.js             # Express : /webhook et /mcp (messagerie)
│   │   ├── file.js              # File d'attente des notes
│   │   ├── acp.js               # Lancement de Copilot CLI, sessions, flux de mises à jour
│   │   ├── autorisations.js     # Politique de réponse aux demandes d'autorisation
│   │   ├── messagerie.js        # Serveur MCP messagerie : envoyer_mail → .eml
│   │   └── console.js           # Affichage lisible pour la démo
│   ├── workspace/               # Dossier de travail de Copilot CLI
│   │   ├── AGENTS.md
│   │   └── .github/skills/routage-notes/
│   ├── outbox/
│   └── .env
├── vscode-demo/
│   ├── .vscode/mcp.json
│   └── .github/
│       ├── agents/agent-rh.agent.md
│       └── skills/
│           ├── nouvel-arrivant/
│           └── schema-onboarding/
└── README.md                    # Installation, lancement, déroulé de la démo
```

---

## 10. Critères d'acceptation

**Application**
- [ ] L'application démarre avec une seule commande, avec annuaire et salariés de départ.
- [ ] Les éléments créés via MCP apparaissent dans l'interface en moins de 3 secondes, sans recharger la page.
- [ ] Un appel d'écriture avec le token `agent-autonome` est refusé avec un message explicite.
- [ ] Webhook désactivé : aucune notification. Webhook activé : chaque note créée déclenche un POST.
- [ ] Le journal d'activité montre appels MCP, refus de droits et webhooks émis.
- [ ] « Réinitialiser la démo » remet l'état initial.

**Agent RH (VS Code)**
- [ ] VS Code se connecte au serveur `appli-rh` et liste ses outils.
- [ ] Sans persona ni skill, Copilot crée une tâche à partir d'une phrase qui ne demande pas explicitement de tâche.
- [ ] Avec l'agent RH, le message « Jean Bonno » produit : la fiche avec date de fin calculée au 11/04/2027, la tâche principale et ses sous-tâches, les demandes d'accès expirant à la fin du contrat, et une note mise en forme.
- [ ] Le skill `schema-onboarding` produit une pièce jointe Mermaid correctement dessinée.

**Agent autonome**
- [ ] Un webhook sans secret valide est rejeté.
- [ ] L'orchestrateur lance Copilot CLI en ACP, ouvre une session par note et affiche le flux des mises à jour.
- [ ] Toute demande d'autorisation hors `appli-rh` et `messagerie` est refusée et journalisée.
- [ ] Les scénarios A à E produisent les mails et annotations décrits en 7.2, en moins de 2 minutes par note.
- [ ] La note D (confidentielle) ne génère **aucun** mail hors RH.
- [ ] La note E (incomplète) ne génère **aucun** mail à l'informatique.

---

## 11. Points ouverts

1. **Déclaration des serveurs MCP pour Copilot CLI** : dans la configuration MCP de Copilot CLI, ou transmis à l'ouverture de chaque session ACP. À valider selon la version utilisée.
2. **Prise en charge des skills et du fichier de persona par Copilot CLI** (emplacement et nom des fichiers reconnus) : à vérifier ; à défaut, injecter persona et procédure dans le prompt de session.
3. **Emplacements exacts** des agents personnalisés et des skills dans VS Code, selon la version de Copilot.
4. **Quota Copilot** : chaque note consomme des requêtes ; prévoir une limite côté orchestrateur pendant les démos publiques.
5. **Annuaire** : exposé par l'application (choix actuel) ou embarqué dans le skill de routage.
6. **Visibilité de l'agent autonome dans l'appli** : renvoyer aussi son flux d'activité vers le journal de l'application, pour tout montrer sur un seul écran.
