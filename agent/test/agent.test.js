import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decider, reponse } from '../src/autorisations.js';
import { creerFile } from '../src/file.js';

test('autorisations : outils MCP autorisés, le reste refusé', () => {
  assert.ok(decider({ title: 'appli-rh-lire_note', kind: 'other' }).autoriser);
  assert.ok(decider({ name: 'messagerie/envoyer_mail' }).autoriser);
  assert.ok(decider({ title: 'MCP: appli-rh lister_contacts' }).autoriser);
  assert.ok(!decider({ title: 'Run shell command', kind: 'execute' }).autoriser);
  assert.ok(!decider({ title: 'Write file notes.txt', kind: 'edit' }).autoriser);
  assert.ok(!decider({ title: 'curl appli-rh.evil', kind: 'fetch' }).autoriser);
  assert.ok(!decider({ title: 'autre-serveur-outil', kind: 'other' }).autoriser);
  assert.ok(!decider({ title: 'appli-rhx-outil' }).autoriser);
});

test('autorisations : choix de l’option ACP', () => {
  const options = [{ optionId: 'a', kind: 'allow_once' }, { optionId: 'r', kind: 'reject_once' }];
  assert.equal(reponse(options, { autoriser: true }).outcome.optionId, 'a');
  assert.equal(reponse(options, { autoriser: false }).outcome.optionId, 'r');
  assert.equal(reponse([{ optionId: 'a', kind: 'allow_once' }], { autoriser: false }).outcome.outcome, 'cancelled');
});

test('file : un traitement à la fois, dans l’ordre', async () => {
  const ordre = [];
  const file = creerFile(async (x) => { ordre.push(`début ${x}`); await new Promise((r) => setTimeout(r, 20)); ordre.push(`fin ${x}`); });
  file.ajouter(1); file.ajouter(2);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(ordre, ['début 1', 'fin 1', 'début 2', 'fin 2']);
});

/* ---------- Chaîne complète avec un faux Copilot CLI ---------- */
const PORT_APP = 3994, PORT_AGENT = 4994, PORT_MAIL = 5994;
let app, mail, orchestrateur, sortie = '';

const attendre = async (cond, ms = 15000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const v = await cond(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`condition non remplie\n--- sortie orchestrateur ---\n${sortie}`);
};
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agent-'));
  app = spawn('node', ['src/server.js'], { cwd: '../app', env: { ...process.env, PORT: PORT_APP, DB_FILE: join(tmp, 'db.json') }, stdio: 'ignore' });
  mail = spawn('node', ['src/server.js'], { cwd: '../mail', env: { ...process.env, PORT: PORT_MAIL, MAIL_DATA_FILE: join(tmp, 'mails.json'), MAIL_OUTBOX_DIR: join(tmp, 'outbox') }, stdio: 'ignore' });
  orchestrateur = spawn('node', ['src/index.js'], {
    env: { ...process.env, PORT: PORT_AGENT, APP_URL: `http://localhost:${PORT_APP}`, APP_MCP_URL: `http://localhost:${PORT_APP}/mcp`, MAIL_MCP_URL: `http://localhost:${PORT_MAIL}/mcp`, COPILOT_BIN: 'node', COPILOT_ARGS: fileURLToPath(new URL('./faux-copilot.js', import.meta.url)), WORKSPACE_DIR: tmp, SESSION_TIMEOUT_S: '30' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  orchestrateur.stdout.on('data', (d) => (sortie += d));
  orchestrateur.stderr.on('data', (d) => (sortie += d));
  await attendre(async () => { try { await fetch(`http://localhost:${PORT_APP}/api/state`); await fetch(`http://localhost:${PORT_MAIL}/api/mails`); await fetch(`http://localhost:${PORT_AGENT}/`); return true; } catch { return false; } });
  await post(`http://localhost:${PORT_APP}/api/parametres`, { webhook: { actif: true, url: `http://localhost:${PORT_AGENT}/webhook` } });
});
after(() => { app?.kill(); mail?.kill(); orchestrateur?.kill(); });

const etatApp = async () => (await fetch(`http://localhost:${PORT_APP}/api/state`)).json();
const mails = async () => (await fetch(`http://localhost:${PORT_MAIL}/api/mails`)).json();

test('webhook sans secret valide : rejeté', async () => {
  const r = await post(`http://localhost:${PORT_AGENT}/webhook`, { evenement: 'note.creee', note: { id: 'N-0001' } }, { 'X-Webhook-Secret': 'faux' });
  assert.equal(r.status, 401);
});

test('note d’arrivée : session ACP, mails .eml, annotation, shell refusé', async () => {
  await post(`http://localhost:${PORT_APP}/api/notes`, { contenu: 'Jean Bonno rejoindra l’équipe produit le 12 janvier.' });
  const note = await attendre(async () => (await etatApp()).notes.find((n) => n.annotations.length));
  assert.equal(note.annotations[0].type_detecte, 'arrivee');
  assert.equal(note.annotations[0].auteur, 'agent-autonome');
  const recus = await mails();
  assert.equal(recus.length, 2);
  assert.deepEqual(recus.map((m) => m.a[0]).sort(), ['it@exemple.local', 'sg@exemple.local']);
  assert.ok(recus.every((m) => m.note_id === 'N-0001'));
  // l'état de l'agent remonte dans l'application
  const suivi = await attendre(async () => (await etatApp()).agent['N-0001']?.etat === 'termine');
  assert.ok(suivi);
  const etat = await etatApp();
  assert.ok(etat.journal.some((j) => j.type === 'agent' && j.etat === 'en_cours'));
  assert.ok(etat.journal.some((j) => j.type === 'agent' && /lire_note/.test(j.texte)));
  assert.match(sortie, /REFUSÉ/);
  assert.doesNotMatch(sortie, /shell autorisé/);
});

test('note confidentielle : un seul mail, aux RH', async () => {
  await post(`http://localhost:${PORT_APP}/api/notes`, { contenu: 'Karim pense partir, à garder entre nous.' });
  const note = await attendre(async () => (await etatApp()).notes.find((n) => n.id === 'N-0002' && n.annotations.length));
  assert.equal(note.annotations[0].type_detecte, 'confidentiel');
  assert.ok(note.annotations[0].confidentiel);
  const nouveaux = (await mails()).filter((m) => m.note_id === 'N-0002');
  assert.equal(nouveaux.length, 1);
  assert.deepEqual(nouveaux[0].a, ['rh@exemple.local']);
});
