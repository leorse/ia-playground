import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decider, reponse, memoriserTitre, OUTILS_AUTORISES } from '../src/autorisations.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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

test('autorisations : nom d’outil seul (sans serveur), comme le envoie Copilot CLI', () => {
  assert.ok(decider({ toolCallId: 'a', title: 'lire_note' }).autoriser);
  assert.ok(decider({ toolCallId: 'b', title: 'lister_mails_envoyes', kind: 'other' }).autoriser);
  assert.ok(decider({ toolCallId: 'c', name: 'envoyer_mail' }).autoriser);
  assert.ok(!decider({ toolCallId: 'd', title: 'lire_notes_perso' }).autoriser);
  assert.ok(!decider({ toolCallId: 'e', title: 'lire_note', kind: 'execute' }).autoriser);
  // titre complet vu dans la notification tool_call, demande d'autorisation sans titre
  assert.ok(!decider({ toolCallId: 'f' }).autoriser);
  memoriserTitre('f', 'appli-rh-lire_note');
  assert.ok(decider({ toolCallId: 'f' }).autoriser);
});

test('autorisations : tous les outils réels des deux serveurs sont autorisés, et la liste ne contient rien d’autre', async () => {
  const lister = async (url, token) => {
    const c = new Client({ name: 'test', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const { tools } = await c.listTools();
    await c.close();
    return tools.map((t) => t.name);
  };
  const reels = [...await lister(`http://localhost:${PORT_APP}/mcp`, 'demo-rh-xxxx'), ...await lister(`http://localhost:${PORT_MAIL}/mcp`, 'demo-mail-wwww')];
  for (const nom of reels) assert.ok(decider({ toolCallId: nom, title: nom }).autoriser, `${nom} devrait être autorisé`);
  assert.deepEqual([...reels].sort(), [...OUTILS_AUTORISES].sort());
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

/* ---------- Orchestrateur démarré pour de vrai (sans jamais lancer Copilot CLI) ---------- */
const PORT_APP = 3994, PORT_AGENT = 4994, PORT_MAIL = 5994;
let app, mail, orchestrateur;

const attendre = async (cond, ms = 15000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const v = await cond(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('condition non remplie');
};
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agent-'));
  app = spawn('node', ['src/server.js'], { cwd: '../app', env: { ...process.env, PORT: PORT_APP, DB_FILE: join(tmp, 'db.json') }, stdio: 'ignore' });
  mail = spawn('node', ['src/server.js'], { cwd: '../mail', env: { ...process.env, PORT: PORT_MAIL, MAIL_DATA_FILE: join(tmp, 'mails.json'), MAIL_OUTBOX_DIR: join(tmp, 'outbox') }, stdio: 'ignore' });
  orchestrateur = spawn('node', ['src/index.js'], {
    env: { ...process.env, PORT: PORT_AGENT, APP_URL: `http://localhost:${PORT_APP}`, APP_MCP_URL: `http://localhost:${PORT_APP}/mcp`, MAIL_MCP_URL: `http://localhost:${PORT_MAIL}/mcp`, WORKSPACE_DIR: tmp },
    stdio: 'ignore',
  });
  await attendre(async () => { try { await fetch(`http://localhost:${PORT_APP}/api/state`); await fetch(`http://localhost:${PORT_MAIL}/api/mails`); await fetch(`http://localhost:${PORT_AGENT}/`); return true; } catch { return false; } });
});
after(() => { app?.kill(); mail?.kill(); orchestrateur?.kill(); });

const webhook = (corps, secret = 'demo-secret-zzzz') => post(`http://localhost:${PORT_AGENT}/webhook`, corps, { 'X-Webhook-Secret': secret });

test('webhook sans secret valide : rejeté', async () => {
  assert.equal((await webhook({ evenement: 'note.creee', note: { id: 'N-0001' } }, 'faux')).status, 401);
});

test('webhook : le ping répond, un événement inconnu est refusé', async () => {
  const ping = await webhook({ evenement: 'ping' });
  assert.equal(ping.status, 200);
  assert.deepEqual(await ping.json(), { pong: true });
  assert.equal((await webhook({ evenement: 'autre.chose' })).status, 400);
  assert.equal((await webhook({ evenement: 'note.creee' })).status, 400); // sans note
});
