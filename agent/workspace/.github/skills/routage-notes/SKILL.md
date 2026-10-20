---
name: routage-notes
description: "À utiliser quand une note vient d'être publiée dans l'application RH : l'interpréter (arrivée, départ, absence, logistique, confidentiel, incomplet, information), prévenir les bonnes personnes par mail, puis annoter la note."
---

# Routage des notes

Une note est un texte libre, parfois brouillon. Elle n'a pas de type : c'est à toi de la comprendre.

## Procédure

1. **Lire** la note complète avec `lire_note`. Si elle porte déjà une annotation, **arrête-toi** : elle a déjà été traitée.
2. **Interpréter** : détermine le type principal avec `table-routage.md`, puis extrais les personnes, les dates, les services concernés. Résous les dates relatives (« jeudi », « la semaine prochaine ») à partir de la date du jour donnée dans le prompt.
3. **Croiser** avec l'application pour enrichir et détecter les problèmes :
   - `lister_personnel` / `lire_fiche_personnel` : la personne existe-t-elle, quelles sont ses dates, son service, son manager ?
   - `lister_taches` : y a-t-il des rendez-vous ou tâches impactés, un conflit de planning ?
4. **Déterminer les destinataires** avec `table-routage.md` et `regles-confidentialite.md`, puis leurs adresses avec `lister_contacts` (par rôle, ou par nom pour une personne). N'invente jamais d'adresse.
5. **Rédiger** un mail **adapté à chaque destinataire** (ce qui le concerne, pas toute la note), à partir des modèles du dossier `modeles-mails/`. Avant d'envoyer, vérifie avec `lister_mails_envoyes` qu'il n'y a pas de doublon pour cette note.
6. **Envoyer** avec `envoyer_mail`, en renseignant `note_id`. Le corps est du **HTML simple** (`<p>`, `<ul><li>`, `<strong>`, `<table>`) : les mails s'affichent dans un client mail web.
7. **Annoter** la note avec `annoter_note` : type détecté, résumé (une ou deux phrases neutres), personnes prévenues (rôles ou noms), alertes, confidentialité.

## Règles transverses

- Une note a un type principal et peut avoir des alertes secondaires.
- Un conflit détecté dans le planning génère **toujours** une alerte dans l'annotation et un mail au manager concerné.
- Information manquante (qui ? quand ?) : ne devine pas, demande un complément aux RH (`modeles-mails/demande-complement-rh.md`).
- Ne diffuse jamais à des personnes non concernées. Un doute sur la confidentialité = RH uniquement.
- Si une adresse ou un contact est introuvable, signale-le dans les alertes plutôt que d'inventer.

## Fichiers du skill

- `table-routage.md` : type de note → destinataires → contenu attendu
- `regles-confidentialite.md` : quand et comment rester discret
- `modeles-mails/` : un modèle par situation
