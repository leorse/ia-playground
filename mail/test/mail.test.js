import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = 5993;
const URL_MAIL = `http://localhost:${PORT}`;
let proc, tmp;

const connecter = async (token = 'demo-mail-wwww') => {
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${URL_MAIL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return c;
};
const appeler = async (c, name, args) => { const r = await c.callTool({ name, arguments: args }); return { erreur: r.isError, texte: r.content[0].text }; };

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mail-'));
  proc = spawn('node', ['src/server.js'], { env: { ...process.env, PORT, MAIL_DATA_FILE: join(tmp, 'mails.json'), MAIL_OUTBOX_DIR: join(tmp, 'outbox') }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(`${URL_MAIL}/api/mails`); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('serveur non démarré');
});
after(() => proc.kill());

test('MCP sans token : 401', async () => {
  const r = await fetch(`${URL_MAIL}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('envoyer_mail : visible dans l’API, HTML conservé, .eml écrit', async () => {
  const c = await connecter();
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['envoyer_mail', 'lister_mails_envoyes']);
  const ok = await appeler(c, 'envoyer_mail', { a: ['it@exemple.local'], objet: 'Arrivée de Jean', corps: '<p>Bonjour,</p><ul><li>GitLab</li></ul>', note_id: 'N-0001' });
  assert.ok(!ok.erreur);
  const liste = await (await fetch(`${URL_MAIL}/api/mails`)).json();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].html, undefined); // la liste est allégée
  assert.match(liste[0].extrait, /Bonjour/);
  const detail = await (await fetch(`${URL_MAIL}/api/mails/${liste[0].id}`)).json();
  assert.match(detail.html, /<li>GitLab<\/li>/);
  assert.equal(readdirSync(join(tmp, 'outbox')).length, 1);
  assert.match(readFileSync(join(tmp, 'outbox', readdirSync(join(tmp, 'outbox'))[0]), 'utf8'), /Content-Type: text\/html/);
});

test('texte brut converti en HTML ; erreurs explicites ; doublons repérables', async () => {
  const c = await connecter();
  await appeler(c, 'envoyer_mail', { a: ['rh@exemple.local'], objet: 'Note', corps: 'Ligne 1\nLigne 2 & co\n\nParagraphe', note_id: 'N-0002' });
  const liste = await (await fetch(`${URL_MAIL}/api/mails`)).json();
  const detail = await (await fetch(`${URL_MAIL}/api/mails/${liste[1].id}`)).json();
  assert.match(detail.html, /<p>Ligne 1<br>Ligne 2 &amp; co<\/p>/);
  const mauvais = await appeler(c, 'envoyer_mail', { a: ['pas-une-adresse'], objet: 'x', corps: 'y' });
  assert.ok(mauvais.erreur);
  assert.match(mauvais.texte, /Adresse invalide/);
  const deja = JSON.parse((await appeler(c, 'lister_mails_envoyes', { note_id: 'N-0002' })).texte);
  assert.equal(deja.length, 1);
});

test('vider la boîte', async () => {
  await fetch(`${URL_MAIL}/api/mails`, { method: 'DELETE' });
  assert.deepEqual(await (await fetch(`${URL_MAIL}/api/mails`)).json(), []);
});
