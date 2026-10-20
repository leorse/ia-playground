import { config } from './config.js';

let signaleErreur = false;

async function envoyer(chemin, corps) {
  try {
    await fetch(`${config.appUrl}${chemin}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps), signal: AbortSignal.timeout(3000),
    });
    signaleErreur = false;
  } catch (e) {
    if (!signaleErreur) console.warn(`(suivi) application injoignable : ${e.message}`);
    signaleErreur = true;
  }
}

/** Fait remonter à l'application où en est l'agent : visible sur la note et dans le journal. */
export const rapport = {
  etat: (note_id, etat, detail) => envoyer('/api/agent/statut', { note_id, etat, detail }),
  activite: (note_id, texte) => envoyer('/api/agent/activite', { note_id, texte }),
};
