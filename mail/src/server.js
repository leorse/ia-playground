import express from 'express';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { creerServeurMcp } from './mcp.js';
import * as store from './store.js';

const PORT = process.env.PORT || 5000;
const TOKEN = process.env.MESSAGERIE_TOKEN || 'demo-mail-wwww';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

/* ---------- MCP (sans état) ---------- */
app.post('/mcp', async (req, res) => {
  if (req.get('authorization') !== `Bearer ${TOKEN}`) return res.status(401).json({ error: 'Token absent ou inconnu' });
  const serveur = creerServeurMcp((e) => console.log(`✉️  ${e.mail.id} → ${e.mail.a.join(', ')} : ${e.mail.objet}`));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); serveur.close(); });
  await serveur.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
const non = (_q, res) => res.status(405).json({ error: 'Méthode non supportée (serveur sans état)' });
app.get('/mcp', non);
app.delete('/mcp', non);

/* ---------- API du client web ---------- */
app.use('/api', (_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
app.get('/api/mails', (_req, res) => res.json(store.lister()));
app.get('/api/mails/:id', (req, res) => {
  const m = store.lire(req.params.id);
  return m ? res.json(m) : res.status(404).json({ error: 'mail introuvable' });
});
app.delete('/api/mails', (_req, res) => { store.vider(); res.json({ ok: true }); });

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const envoyer = (type, data = {}) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const surMail = (m) => envoyer('mail', { id: m.id });
  const surChangement = () => envoyer('change');
  store.events.on('mail', surMail);
  store.events.on('change', surChangement);
  req.on('close', () => { store.events.off('mail', surMail); store.events.off('change', surChangement); });
});

app.listen(PORT, () => console.log(`Serveur de messagerie : http://localhost:${PORT}  (MCP : http://localhost:${PORT}/mcp)`));
