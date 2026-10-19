import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = 3999;
const URL_APP = `http://localhost:${PORT}`;
let proc;

async function connecter(token) {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${URL_APP}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const appeler = async (c, name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  return { erreur: r.isError, texte: r.content[0].text };
};

before(async () => {
  proc = spawn('node', ['src/server.js'], { env: { ...process.env, PORT, DB_FILE: join(mkdtempSync(join(tmpdir(), 'rh-')), 'db.json') }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${URL_APP}/api/state`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('serveur non démarré');
});
after(() => proc.kill());

test('sans token : 401', async () => {
  const r = await fetch(`${URL_APP}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('agent RH : liste des outils, création fiche + CDD sans date_fin refusé', async () => {
  const c = await connecter('demo-rh-xxxx');
  const { tools } = await c.listTools();
  assert.equal(tools.length, 14);
  const sans = await appeler(c, 'creer_fiche_personnel', { prenom: 'Jean', nom: 'Bonno', poste: 'Développeur', type_contrat: 'CDD', date_debut: '2027-01-12' });
  assert.ok(sans.erreur);
  assert.match(sans.texte, /date_fin.*obligatoire.*CDD/);
  const ok = await appeler(c, 'creer_fiche_personnel', { prenom: 'Jean', nom: 'Bonno', poste: 'Développeur', type_contrat: 'CDD', date_debut: '2027-01-12', date_fin: '2027-04-11', date_fin_calculee: true });
  assert.ok(!ok.erreur);
  const doublon = await appeler(c, 'creer_fiche_personnel', { prenom: 'Jean', nom: 'Bonno', poste: 'Développeur', type_contrat: 'CDD', date_debut: '2027-01-12', date_fin: '2027-04-11' });
  assert.match(doublon.texte, /existe déjà/);
  const mauvaiseDate = await appeler(c, 'creer_tache', { titre: 'x', debut: '12 janvier' });
  assert.match(mauvaiseDate.texte, /format attendu/);
});

test('agent autonome : lecture + annotation, écriture refusée', async () => {
  const rh = await connecter('demo-rh-xxxx');
  const note = JSON.parse((await appeler(rh, 'creer_note', { titre: 'T', contenu: 'Une stagiaire arrive en février' })).texte);
  const a = await connecter('demo-agent-yyyy');
  const refus = await appeler(a, 'creer_tache', { titre: 'interdit' });
  assert.ok(refus.erreur);
  assert.match(refus.texte, /agent-autonome n'a pas le droit/);
  assert.ok(!(await appeler(a, 'lire_note', { id: note.id })).erreur);
  assert.ok(!(await appeler(a, 'annoter_note', { id: note.id, type_detecte: 'incomplet', resume: 'Manque le nom' })).erreur);
  const lue = JSON.parse((await appeler(a, 'lire_note', { id: note.id })).texte);
  assert.equal(lue.annotations[0].type_detecte, 'incomplet');
  const contact = await appeler(a, 'lister_contacts', { role: 'compta' });
  assert.match(contact.texte, /Rôles disponibles/);
});

test('webhook : émis seulement si actif, avec le secret', async () => {
  const recus = [];
  const { createServer } = await import('node:http');
  const cible = createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d));
    req.on('end', () => { recus.push({ secret: req.headers['x-webhook-secret'], body: JSON.parse(b) }); res.writeHead(202).end(); });
  }).listen(4999);
  const post = (path, body) => fetch(`${URL_APP}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await post('/api/notes', { contenu: 'désactivé' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(recus.length, 0);
  await post('/api/parametres', { webhook: { actif: true, url: 'http://localhost:4999/webhook' } });
  await post('/api/notes', { contenu: 'Jean Bonno rejoindra l’équipe' });
  await new Promise((r) => setTimeout(r, 500));
  cible.close();
  assert.equal(recus.length, 1);
  assert.equal(recus[0].secret, 'demo-secret-zzzz');
  assert.equal(recus[0].body.evenement, 'note.creee');
  const etat = await (await fetch(`${URL_APP}/api/state`)).json();
  assert.ok(etat.journal.some((j) => j.type === 'webhook' && j.statut === 202));
});

test('réinitialisation', async () => {
  await fetch(`${URL_APP}/api/reinitialiser`, { method: 'POST' });
  const etat = await (await fetch(`${URL_APP}/api/state`)).json();
  assert.equal(etat.notes.length, 0);
  assert.equal(etat.personnel.length, 5);
});
