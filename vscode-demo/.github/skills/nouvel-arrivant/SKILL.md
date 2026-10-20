---
name: nouvel-arrivant
description: "À utiliser quand l'utilisateur annonce l'arrivée d'une nouvelle personne (embauche, CDD, stage, alternance…) : crée la fiche, les tâches d'accueil, les demandes d'accès et la note d'annonce dans l'application RH."
---

# Accueil d'un nouvel arrivant

## Procédure

1. **Extraire** du message : prénom, nom, poste, service, type de contrat, date de début, durée ou date de fin, manager.
   - S'il manque une information **bloquante** (nom, date de début, type de contrat), la demander à l'utilisateur et attendre.
   - Sinon, continuer. Une information facultative absente (service, manager) n'empêche pas d'avancer : signale-la dans le récapitulatif. Pour le service, ne devine pas.
   - Si la date est donnée sans année (« le 12 janvier »), prends la prochaine occurrence à venir.
2. **Vérifier** avec `lister_personnel` que la personne n'existe pas déjà. Si elle existe, le dire et ne rien créer en double.
3. **Calculer la date de fin** si une durée est donnée. Le dernier jour est la veille de la date anniversaire : CDD de 3 mois à partir du 12/01/2027 → fin le **11/04/2027**. Marquer `date_fin_calculee` à vrai. Un CDI n'a pas de date de fin.
4. **Créer la fiche** avec `creer_fiche_personnel`.
5. **Créer la tâche principale** « Arrivée de <Prénom Nom> » avec `creer_tache`, datée du premier jour (`debut`), liée à la fiche (`personne_id`).
6. **Créer les sous-tâches** de `checklist-arrivee.md` (`tache_parente` = la tâche principale, `personne_id`), datées par rapport au premier jour.
7. **Créer les demandes d'accès** : pour chaque accès listé dans `matrice-acces.md` pour ce poste (plus les accès « Tout poste »), une tâche avec l'étiquette `demande-acces`, assignée à `informatique`, avec `personne_id` et `fin_validite` = date de fin du contrat (pas de `fin_validite` pour un CDI), `tache_parente` = la tâche principale. Ne pas créer deux fois le même accès.
8. **Publier la note d'annonce** avec `creer_note`, mise en forme à partir de `modele-note.md` (rattachée à la fiche avec `personne_id`).
9. **Répondre** à l'utilisateur avec un récapitulatif : identifiants créés (fiche, tâche principale, nombre de sous-tâches et de demandes d'accès, note), et **ce qui a été déduit ou reste à confirmer** (date de fin calculée, service ou manager non précisés…).

## Fichiers du skill

- `matrice-acces.md` : accès à demander selon le poste
- `checklist-arrivee.md` : étapes types avant / jour J / première semaine
- `modele-note.md` : gabarit de la note d'annonce

## Rappels

- Format des dates pour les outils : `AAAA-MM-JJ` (ou `AAAA-MM-JJTHH:MM` pour une heure).
- Si un poste n'est pas dans la matrice, ne demande que les accès « Tout poste » et demande à l'utilisateur quels autres accès prévoir.
