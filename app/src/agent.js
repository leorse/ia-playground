import * as store from './store.js';
import { log } from './journal.js';

/** États : en_attente, en_cours, termine, echec, delai. Gardés en mémoire (pas de persistance). */
const statuts = new Map();

export function signaler({ note_id, etat, detail }) {
  const precedent = statuts.get(note_id);
  statuts.set(note_id, { etat, detail, depuis: etat === precedent?.etat ? precedent.depuis : new Date().toISOString(), maj: new Date().toISOString() });
  log('agent', { note_id, etat, texte: detail || etat });
  store.events.emit('change');
}

export function activite({ note_id, texte }) {
  log('agent', { note_id, texte });
}

export const lister = () => Object.fromEntries(statuts);
export const vider = () => statuts.clear();
