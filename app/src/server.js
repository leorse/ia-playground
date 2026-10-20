import express from 'express';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { identifier } from './auth.js';
import { creerServeurMcp } from './mcp.js';
import { brancherWebhook } from './webhook.js';
import * as store from './store.js';
import * as journal from './journal.js';
import * as agent from './agent.js';

const MAIL_URL = process.env.MAIL_URL || 'http://localhost:5000';

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

/* ---------- MCP (stateless : un serveur par requête) ---------- */
app.post('/mcp', async (req, res) => {
  const client = identifier(req);
  if (!client) {
    journal.log('mcp', { client: 'inconnu', refus: true, resultat: 'Token absent ou inconnu (401)' });
    return res.status(401).json({ error: 'Token absent ou inconnu' });
  }
  const serveur = creerServeurMcp(client);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); serveur.close(); });
  await serveur.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
const nonSupporte = (_req, res) => res.status(405).json({ error: 'Méthode non supportée (serveur sans état)' });
app.get('/mcp', nonSupporte);
app.delete('/mcp', nonSupporte);

/* ---------- API de l'interface ---------- */
app.get('/api/state', (_req, res) => {
  const { personnel, taches, notes, parametres } = store.lireTout();
  res.json({ personnel, taches, notes, parametres, agent: agent.lister(), journal: journal.lister() });
});

app.post('/api/notes', (req, res) => {
  const { titre, contenu } = req.body || {};
  if (!contenu?.trim()) return res.status(400).json({ error: 'contenu requis' });
  res.status(201).json(store.creerNote({ titre, contenu }, 'interface-web'));
});

app.post('/api/parametres', (req, res) => {
  store.majParametres(req.body || {});
  res.json(store.parametres());
});

/* L'orchestrateur de l'agent autonome signale où il en est */
app.post('/api/agent/statut', (req, res) => {
  const { note_id, etat } = req.body || {};
  if (!note_id || !etat) return res.status(400).json({ error: 'note_id et etat requis' });
  agent.signaler(req.body);
  res.json({ ok: true });
});
app.post('/api/agent/activite', (req, res) => {
  if (!req.body?.texte) return res.status(400).json({ error: 'texte requis' });
  agent.activite(req.body);
  res.json({ ok: true });
});

app.post('/api/reinitialiser', async (_req, res) => {
  store.reinitialiser();
  journal.vider();
  agent.vider();
  // vide aussi la boîte mail de démo si le serveur de messagerie tourne
  await fetch(`${MAIL_URL}/api/mails`, { method: 'DELETE', signal: AbortSignal.timeout(2000) }).catch(() => {});
  res.json({ ok: true });
});

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const envoyer = (type, data = {}) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const surChangement = () => envoyer('data');
  const surJournal = (e) => envoyer('journal', e);
  store.events.on('change', surChangement);
  journal.bus.on('journal', surJournal);
  req.on('close', () => { store.events.off('change', surChangement); journal.bus.off('journal', surJournal); });
});

brancherWebhook();
app.listen(PORT, () => console.log(`Application RH : http://localhost:${PORT}  (MCP : http://localhost:${PORT}/mcp)`));
