import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as store from './store.js';
import { aLeDroit } from './auth.js';
import { log } from './journal.js';

const INSTRUCTIONS = "Application RH de l'équipe : fiches du personnel, tâches et planning, notes internes, annuaire. À utiliser pour tout ce qui concerne une arrivée, un départ, une absence, des accès, des rendez-vous ou l'organisation de l'équipe.";

const dateJour = z.string().describe('Format AAAA-MM-JJ');
const dateHeure = z.string().describe('Format AAAA-MM-JJ ou AAAA-MM-JJTHH:MM (heure locale)');
const TYPES_CONTRAT = ['CDI', 'CDD', 'stage', 'alternance', 'interim'];

/** Crée un serveur MCP dont les outils appliquent les droits du client authentifié. */
export function creerServeurMcp(client) {
  const serveur = new McpServer({ name: 'appli-rh', version: '0.1.0' }, { instructions: INSTRUCTIONS });

  const outil = (nom, droit, description, schema, fn) => {
    serveur.registerTool(nom, { description, inputSchema: schema }, async (params) => {
      const entree = { client: client.nom, outil: nom, parametres: params };
      if (!aLeDroit(client, droit)) {
        const message = `Refusé : le token ${client.nom} n'a pas le droit de ${droit} (droits : ${client.droits.join(', ')}). L'outil ${nom} n'est pas disponible pour ce client.`;
        log('mcp', { ...entree, refus: true, resultat: message });
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
      try {
        const resultat = fn(params, client.nom);
        log('mcp', { ...entree, resultat });
        return { content: [{ type: 'text', text: JSON.stringify(resultat, null, 2) }] };
      } catch (e) {
        if (!(e instanceof store.ErreurMetier)) throw e;
        log('mcp', { ...entree, erreur: e.message });
        return { isError: true, content: [{ type: 'text', text: e.message }] };
      }
    });
  };

  /* ----- Personnel ----- */
  outil('lister_personnel', 'lecture',
    "Recherche des fiches du personnel par nom, statut, service ou période d'arrivée. À utiliser pour vérifier si une personne existe déjà avant d'en créer une, ou pour retrouver son identifiant.",
    {
      recherche: z.string().optional().describe('Fragment du prénom ou du nom'),
      statut: z.enum(['a_venir', 'actif', 'parti']).optional(),
      service: z.string().optional(),
      arrivee_du: dateJour.optional(),
      arrivee_au: dateJour.optional(),
    }, (p) => store.listerPersonnel(p));

  outil('lire_fiche_personnel', 'lecture',
    "Détail d'une fiche du personnel, avec les tâches et demandes d'accès qui lui sont liées.",
    { id: z.string().describe('Identifiant, ex. P-0007') }, ({ id }) => store.lireFiche(id));

  outil('creer_fiche_personnel', 'ecriture',
    "Crée la fiche d'un nouvel arrivant. Vérifie d'abord avec lister_personnel qu'elle n'existe pas. Si l'utilisateur donne une durée (« 3 mois ») plutôt qu'une date de fin, calcule la date de fin (le dernier jour est la veille de la date anniversaire : début 2027-01-12 + 3 mois → 2027-04-11) et mets date_fin_calculee à true pour que les RH la confirment. date_fin est obligatoire hors CDI.",
    {
      prenom: z.string(), nom: z.string(), poste: z.string().describe('Ex. Développeur'),
      service: z.string().optional().describe('Ex. Équipe produit'),
      type_contrat: z.enum(TYPES_CONTRAT),
      date_debut: dateJour, date_fin: dateJour.optional(),
      date_fin_calculee: z.boolean().optional().describe('true si la date de fin a été déduite d\'une durée'),
      manager: z.string().optional(), email: z.string().optional(),
    }, (p, auteur) => store.creerFiche(p, auteur));

  outil('modifier_fiche_personnel', 'ecriture',
    'Modifie une fiche existante. Seuls les champs fournis sont changés.',
    {
      id: z.string(), prenom: z.string().optional(), nom: z.string().optional(), poste: z.string().optional(),
      service: z.string().optional(), type_contrat: z.enum(TYPES_CONTRAT).optional(),
      date_debut: dateJour.optional(), date_fin: dateJour.optional(), date_fin_calculee: z.boolean().optional(),
      manager: z.string().optional(), email: z.string().optional(), statut: z.enum(['a_venir', 'actif', 'parti']).optional(),
    }, (p) => store.modifierFiche(p));

  /* ----- Tâches ----- */
  outil('lister_taches', 'lecture',
    "Liste les tâches et rendez-vous, avec filtres. À utiliser pour retrouver un identifiant, consulter le planning d'une période ou vérifier un conflit de planning (réunion, rendez-vous).",
    {
      etiquette: z.string().optional(), assigne: z.string().optional(), personne_id: z.string().optional(),
      statut: z.enum(['a_faire', 'en_cours', 'fait']).optional(),
      a_partir_du: dateJour.optional(), jusqu_au: dateJour.optional(),
    }, (p) => store.listerTaches(p));

  outil('lire_tache', 'lecture', "Détail d'une tâche : description, sous-tâches et pièces jointes.",
    { id: z.string().describe('Ex. T-0012') }, ({ id }) => store.lireTache(id));

  const champsTache = {
    titre: z.string(), description: z.string().optional().describe('Markdown autorisé'),
    debut: dateHeure.optional(), echeance: dateHeure.optional(),
    assigne: z.string().optional().describe('Nom d\'une personne ou rôle (ex. informatique)'),
    etiquettes: z.array(z.string()).optional(),
    priorite: z.enum(['basse', 'normale', 'haute']).optional(),
    tache_parente: z.string().optional().describe('Identifiant de la tâche parente, pour une sous-tâche'),
    personne_id: z.string().optional().describe('Fiche du personnel concernée'),
    fin_validite: dateJour.optional().describe("Demande d'accès : date d'expiration de l'accès"),
  };

  outil('creer_tache', 'ecriture',
    "Crée une tâche, une sous-tâche ou un rendez-vous (à utiliser même si l'utilisateur ne dit pas explicitement « crée une tâche » : une réunion, un rendez-vous ou une échéance annoncés doivent être consignés). Pour une demande d'accès, utilise l'étiquette `demande-acces`, assigne-la au rôle `informatique`, renseigne personne_id et fin_validite (date de fin du contrat, rien pour un CDI).",
    champsTache, (p, auteur) => store.creerTache(p, auteur));

  outil('modifier_tache', 'ecriture', 'Modifie une tâche. Seuls les champs fournis sont changés.',
    {
      id: z.string(), ...Object.fromEntries(Object.entries(champsTache).map(([k, v]) => [k, v.optional()])),
      statut: z.enum(['a_faire', 'en_cours', 'fait']).optional(),
    }, (p) => store.modifierTache(p));

  outil('ajouter_piece_jointe', 'ecriture',
    "Attache un document à une tâche. Pour un schéma, utilise le type `mermaid` et fournis la source Mermaid brute, sans balises de code ```.",
    { id_tache: z.string(), nom: z.string(), type: z.enum(['mermaid', 'markdown', 'texte']), contenu: z.string() },
    (p) => store.ajouterPieceJointe(p));

  /* ----- Notes ----- */
  outil('creer_note', 'ecriture',
    "Publie une note interne visible par toute l'équipe. Le contenu est en markdown (titres, listes, tableaux autorisés). Utilise personne_id pour rattacher la note à une fiche.",
    { titre: z.string().optional(), contenu: z.string().describe('Markdown'), personne_id: z.string().optional() },
    (p, auteur) => store.creerNote(p, auteur));

  outil('lister_notes', 'lecture', 'Liste les notes récentes (sans leur annotation détaillée).',
    { depuis: z.string().optional().describe('Date ISO : notes créées après'), personne_id: z.string().optional() },
    (p) => store.listerNotes(p).map(({ id, titre, auteur, cree_le, personne_id, annotations }) =>
      ({ id, titre, auteur, cree_le, personne_id, annotee: annotations.length > 0 })));

  outil('lire_note', 'lecture', "Contenu complet d'une note et de ses annotations éventuelles.",
    { id: z.string().describe('Ex. N-0012') }, ({ id }) => store.lireNote(id));

  outil('annoter_note', 'annotation',
    "Ajoute à une note l'interprétation de l'agent : type détecté, résumé, personnes prévenues, alertes (conflits, informations manquantes) et caractère confidentiel. Seul outil d'écriture ouvert à l'agent autonome.",
    {
      id: z.string(), type_detecte: z.enum(store.TYPES_NOTE),
      resume: z.string().describe('Une ou deux phrases neutres'),
      personnes_prevenues: z.array(z.string()).optional().describe('Rôles ou noms des destinataires des mails'),
      alertes: z.array(z.string()).optional(), confidentiel: z.boolean().optional(),
    }, (p, auteur) => store.annoterNote(p, auteur));

  /* ----- Annuaire ----- */
  outil('lister_contacts', 'lecture',
    "Annuaire : trouve le contact d'un rôle (rh, informatique, services_generaux, direction, manager:<service>) ou d'une personne par son nom.",
    { role: z.string().optional(), recherche: z.string().optional() }, (p) => store.listerContacts(p));

  return serveur;
}
