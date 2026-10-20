import express from 'express';
import { config } from './config.js';
import { creerFile } from './file.js';
import { creerClientAcp, lancerCopilot } from './acp.js';
import { routeurMessagerie } from './messagerie.js';
import { trace } from './console.js';

const serveursMcp = [
  { type: 'http', name: 'appli-rh', url: config.appMcpUrl, headers: [{ name: 'Authorization', value: `Bearer ${config.appMcpToken}` }] },
  { type: 'http', name: 'messagerie', url: `http://localhost:${config.port}/mcp`, headers: [{ name: 'Authorization', value: `Bearer ${config.messagerieToken}` }] },
];

const acp = creerClientAcp({
  lancer: () => lancerCopilot({ bin: config.copilotBin, args: config.copilotArgs, cwd: config.workspaceDir }),
  serveursMcp,
  workspaceDir: config.workspaceDir,
  timeoutMs: config.sessionTimeoutMs,
});

const file = creerFile(async (evenement) => {
  try {
    await acp.traiterNote({ noteId: evenement.note.id, auteur: evenement.auteur });
  } catch (e) {
    trace.erreur(`Échec du traitement de ${evenement.note.id} : ${e.message}`);
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
  file.ajouter(evenement);
});

app.use(routeurMessagerie());

app.listen(config.port, () => {
  console.log(`Orchestrateur : webhook http://localhost:${config.port}/webhook · messagerie MCP http://localhost:${config.port}/mcp`);
  console.log(`Copilot CLI : ${config.copilotBin} ${config.copilotArgs.join(' ')}  (dossier de travail : ${config.workspaceDir})`);
});

process.on('SIGINT', () => { acp.arreter(); process.exit(0); });
