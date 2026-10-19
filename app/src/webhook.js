import * as store from './store.js';
import { log } from './journal.js';

async function emettre(evenement, note) {
  const { webhook } = store.parametres();
  if (!webhook.actif || !webhook.evenements.includes(evenement)) return;
  const payload = {
    evenement,
    date: new Date().toISOString(),
    auteur: note.auteur,
    note: { id: note.id, titre: note.titre, extrait: note.contenu.slice(0, 120) },
  };
  try {
    const rep = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    log('webhook', { url: webhook.url, payload, statut: rep.status });
  } catch (e) {
    log('webhook', { url: webhook.url, payload, erreur: e.message });
  }
}

export function brancherWebhook() {
  store.events.on('note.creee', (note) => { emettre('note.creee', note); });
}
