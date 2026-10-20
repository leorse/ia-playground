import express from 'express';
import { config } from './config.js';
import { creerFile } from './file.js';
import { creerClientAcp, lancerCopilot } from './acp.js';
import { rapport } from './rapport.js';
import { trace } from './console.js';

const serveursMcp = [
  { type: 'http', name: 'appli-rh', url: config.appMcpUrl, headers: [{ name: 'Authorization', value: `Bearer ${config.appMcpToken}` }] },
  { type: 'http', name: 'messagerie', url: config.mailMcpUrl, headers: [{ name: 'Authorization', value: `Bearer ${config.messagerieToken}` }] },
];

const acp = creerClientAcp({
  lancer: () => lancerCopilot({ bin: config.copilotBin, args: config.copilotArgs, cwd: config.workspaceDir }),
  serveursMcp,
  workspaceDir: config.workspaceDir,
  timeoutMs: config.sessionTimeoutMs,
  rapport,
});

const file = creerFile(async (evenement) => {
  const id = evenement.note.id;
  await rapport.etat(id, 'en_cours', 'Session ACP ouverte');
  try {
    const { delaiDepasse, stopReason } = await acp.traiterNote({ noteId: id, auteur: evenement.auteur });
    if (delaiDepasse) await rapport.etat(id, 'delai', `Annulée après ${config.sessionTimeoutMs / 1000} s`);
    else await rapport.etat(id, 'termine', `Fin : ${stopReason}`);
  } catch (e) {
    trace.erreur(`Échec du traitement de ${id} : ${e.message}`);
    await rapport.etat(id, 'echec', e.message);
  }
});

const app = express();

app.post('/webhook', express.json(), (req, res) => {
  if (req.get('x-webhook-secret') !== config.webhookSecret) {
    trace.erreur('Webhook rejeté : secret invalide');
    return res.status(401).json({ error: 'secret invalide' });
  }
  const evenement = req.body;
  if (evenement?.evenement !== 'note.creee' || !evenement.note?.id) return res.status(400).json({ error: 'événement non géré' });
  res.status(202).json({ accepte: true });
  trace.webhook(`${evenement.evenement} ${evenement.note.id} « ${evenement.note.extrait ?? ''} » (file : ${file.taille + 1})`);
  rapport.etat(evenement.note.id, 'en_attente', 'Webhook reçu');
  file.ajouter(evenement);
});

app.listen(config.port, () => {
  console.log(`Orchestrateur : webhook http://localhost:${config.port}/webhook`);
  console.log(`MCP : application ${config.appMcpUrl} · messagerie ${config.mailMcpUrl}`);
  console.log(`Copilot CLI : ${config.copilotBin} ${config.copilotArgs.join(' ')}  (dossier de travail : ${config.workspaceDir})`);
});

process.on('SIGINT', () => { acp.arreter(); process.exit(0); });
