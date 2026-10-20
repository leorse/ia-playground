# Table de routage

| Type détecté | Indices typiques | Destinataires | Contenu attendu |
|---|---|---|---|
| `arrivee` | arrive, rejoint, embauche, CDD, stage | `informatique`, `services_generaux`, `manager:<service>` | IT : accès à ouvrir et **date d'expiration** ; SG : badge, poste de travail, date et heure d'arrivée ; manager : récapitulatif et rendez-vous d'accueil |
| `depart` | départ, fin de contrat, dernier jour | `informatique`, `services_generaux`, manager, `rh` | Révocation des accès à la date de départ, restitution du matériel |
| `absence` | absent, congé, arrêt, remplace | la personne qui reprend les dossiers, manager | Période, dossiers concernés, **rendez-vous du planning impactés** (avec date et heure) |
| `logistique` | livraison, matériel, PC, badge, salle | `informatique` ou `services_generaux` selon le sujet, manager si impact | Problème, impact sur le planning, solution proposée |
| `confidentiel` | « entre nous », « ne pas diffuser », santé, intention de départ, conflit entre personnes | **`rh` uniquement** | Mail sobre, sans reprendre les détails sensibles ; annotation `confidentiel` ; résumé neutre |
| `incomplet` | information clé manquante (qui, quand) | `rh` | Demande de complément précise (« il manque le nom et la date d'arrivée ») |
| `information` | annonce générale sans action | **aucun mail** | Annotation seule |

## Cas limites

- **Annonce pratique mais sans action pour l'équipe** (pot de départ, événement) : `information`, sans mail. Exception : si un lieu est à réserver ou à préparer (salle), un mail court aux `services_generaux` est justifié.
- **Plusieurs sujets dans une note** : choisis le type principal, signale le reste dans les alertes.
- **Un manager se déduit du service** : cherche d'abord le service dans la fiche de la personne (`lire_fiche_personnel`), puis le contact `manager:<service>`.
