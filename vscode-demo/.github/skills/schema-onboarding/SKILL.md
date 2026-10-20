---
name: schema-onboarding
description: "À utiliser quand l'utilisateur demande le schéma ou le diagramme du parcours d'intégration d'une personne : génère un diagramme Mermaid à partir de ses tâches et l'attache à une tâche de l'application RH."
---

# Schéma du parcours d'onboarding

## Procédure

1. **Retrouver la personne** avec `lister_personnel`, puis `lire_fiche_personnel` pour obtenir ses tâches. Identifie la tâche principale « Arrivée de <Prénom Nom> » et ses sous-tâches (`lister_taches` avec `personne_id`).
2. **Classer** les tâches en trois groupes selon leur date par rapport au premier jour : **Avant l'arrivée**, **Jour J**, **Première semaine**. Les demandes d'accès (étiquette `demande-acces`) vont dans « Avant l'arrivée ».
3. **Produire le diagramme** Mermaid en partant de `modele.mmd` : un sous-graphe par groupe, les tâches reliées dans l'ordre chronologique, la date de chaque tâche dans son libellé.
4. **Créer une tâche** « Schéma du parcours – <Prénom> » avec `creer_tache`, rattachée à la tâche principale (`tache_parente`) et à la fiche (`personne_id`).
5. **Attacher le schéma** avec `ajouter_piece_jointe` : type `mermaid`, nom « Parcours d'intégration », contenu = **la source Mermaid brute, sans balises ```**.
6. **Répondre** avec l'identifiant de la tâche créée et un résumé du parcours.

## Conseils Mermaid

- Libellés courts, entre guillemets : `A["Badge – 09/01"]`. Pas de parenthèses ni de deux-points dans un libellé non entouré de guillemets.
- Identifiants de nœuds simples (`A`, `B`, `C1`…).
- Si le diagramme est long, un `flowchart LR` reste lisible ; sinon `flowchart TD`.
