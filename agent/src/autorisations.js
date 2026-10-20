import { trace } from './console.js';

/** Serveurs MCP dont l'agent peut appeler les outils. Tout le reste est refusé. */
export const SERVEURS_AUTORISES = ['appli-rh', 'messagerie'];

// Types d'outil ACP qui sortent du cadre : shell, fichiers, réseau…
const TYPES_REFUSES = new Set(['execute', 'edit', 'delete', 'move', 'fetch', 'read', 'search']);

const motif = new RegExp(`(^|[^a-z0-9_])(${SERVEURS_AUTORISES.join('|')})([^a-z0-9_]|$)`, 'i');

/**
 * Décide d'une demande d'autorisation ACP.
 * Un outil est accepté s'il est identifiable comme outil d'un serveur autorisé
 * (nom ou titre de la forme « appli-rh-lire_note », « messagerie/envoyer_mail »…) et
 * si son type n'est pas shell / fichier / réseau.
 */
export function decider(toolCall) {
  const titre = toolCall.title || toolCall.name || toolCall.toolCallId;
  if (toolCall.kind && TYPES_REFUSES.has(toolCall.kind)) {
    return { autoriser: false, titre, raison: `type d'outil « ${toolCall.kind} » interdit` };
  }
  const candidats = [toolCall.name, toolCall.title, toolCall.rawInput?.server, toolCall._meta?.mcpServer]
    .filter((x) => typeof x === 'string');
  if (candidats.some((x) => motif.test(x))) return { autoriser: true, titre, raison: 'outil MCP autorisé' };
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
  else trace.refuse(decision.titre, decision.raison);
  return reponse(options, decision);
}
