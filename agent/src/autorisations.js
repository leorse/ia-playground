import { trace } from './console.js';

/** Serveurs MCP dont l'agent peut appeler les outils. Tout le reste est refusé. */
export const SERVEURS_AUTORISES = ['appli-rh', 'messagerie'];

/**
 * Outils de ces deux serveurs. Copilot CLI nomme parfois l'outil avec le serveur
 * (« appli-rh-lire_note ») et parfois sans (« lire_note ») dans sa demande d'autorisation :
 * on reconnaît donc aussi le nom seul. Un test compare cette liste aux serveurs réels.
 */
export const OUTILS_AUTORISES = [
  'lister_personnel', 'lire_fiche_personnel', 'creer_fiche_personnel', 'modifier_fiche_personnel',
  'lister_taches', 'lire_tache', 'creer_tache', 'modifier_tache', 'ajouter_piece_jointe',
  'creer_note', 'lister_notes', 'lire_note', 'annoter_note', 'lister_contacts', // appli-rh
  'envoyer_mail', 'lister_mails_envoyes', // messagerie
];

// Types d'outil ACP qui sortent du cadre : shell, fichiers, réseau…
const TYPES_REFUSES = new Set(['execute', 'edit', 'delete', 'move', 'fetch', 'read', 'search']);

const mot = (noms) => new RegExp(`(^|[^a-z0-9_])(${noms.join('|')})([^a-z0-9_]|$)`, 'i');
const motifServeur = mot(SERVEURS_AUTORISES);
const motifOutil = mot(OUTILS_AUTORISES);

// Titres vus dans les notifications `tool_call`, retrouvés par identifiant quand la demande d'autorisation est plus pauvre
const titresConnus = new Map();
export const memoriserTitre = (toolCallId, titre) => { if (toolCallId && titre) titresConnus.set(toolCallId, titre); };

/**
 * Décide d'une demande d'autorisation ACP.
 * Un outil est accepté s'il est identifiable comme outil d'un des serveurs autorisés (nom ou titre
 * de la forme « appli-rh-lire_note », « messagerie/envoyer_mail », ou simplement « lire_note »)
 * et si son type n'est pas shell / fichier / réseau.
 */
export function decider(toolCall) {
  const titre = toolCall.title || toolCall.name || toolCall.toolCallId;
  if (toolCall.kind && TYPES_REFUSES.has(toolCall.kind)) {
    return { autoriser: false, titre, raison: `type d'outil « ${toolCall.kind} » interdit` };
  }
  const candidats = [toolCall.name, toolCall.title, titresConnus.get(toolCall.toolCallId), toolCall.rawInput?.server, toolCall.rawInput?.tool, toolCall._meta?.mcpServer]
    .filter((x) => typeof x === 'string');
  if (candidats.some((x) => motifServeur.test(x) || motifOutil.test(x))) return { autoriser: true, titre, raison: 'outil MCP autorisé' };
  return { autoriser: false, titre, raison: 'ne provient ni de appli-rh ni de messagerie' };
}

/** Choisit l'option ACP correspondant à la décision. */
export function reponse(options, decision) {
  const genres = decision.autoriser ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
  const option = genres.map((g) => options.find((o) => o.kind === g)).find(Boolean);
  return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : { outcome: { outcome: 'cancelled' } };
}

export function traiterDemande({ toolCall, options }) {
  const decision = decider(toolCall);
  if (decision.autoriser) trace.autorise(decision.titre);
  else {
    trace.refuse(decision.titre, decision.raison);
    // détail brut pour comprendre un refus inattendu
    trace.info(`   demande refusée : ${JSON.stringify({ kind: toolCall.kind, name: toolCall.name, title: toolCall.title, toolCallId: toolCall.toolCallId, rawInput: toolCall.rawInput, _meta: toolCall._meta })}`);
  }
  return reponse(options, decision);
}
