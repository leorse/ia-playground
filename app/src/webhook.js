import * as store from './store.js';
import { log } from './journal.js';

const erreurReseau = (e) => `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}`;

async function poster(payload) {
  const { webhook } = store.parametres();
  try {
    const rep = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    log('webhook', { url: webhook.url, payload, statut: rep.status });
    return { statut: rep.status };
  } catch (e) {
    log('webhook', { url: webhook.url, payload, erreur: erreurReseau(e) });
    return { erreur: erreurReseau(e) };
  }
}

async function emettre(evenement, note) {
  const { webhook } = store.parametres();
  if (!webhook.actif || !webhook.evenements.includes(evenement)) {
    log('webhook', { ignore: true, evenement, note_id: note.id, raison: webhook.actif ? 'événement non notifié' : 'webhook désactivé (Paramètres)' });
    return;
  }
  await poster({
    evenement,
    date: new Date().toISOString(),
    auteur: note.auteur,
    note: { id: note.id, titre: note.titre, extrait: note.contenu.slice(0, 120) },
  });
}

/** Envoie un ping à l'agent, même si le webhook est désactivé : sert à vérifier URL et secret. */
export const tester = () => poster({ evenement: 'ping', date: new Date().toISOString() });

export function brancherWebhook() {
  store.events.on('note.creee', (note) => { emettre('note.creee', note); });
}
