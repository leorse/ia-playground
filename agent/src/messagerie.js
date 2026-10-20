import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { trace } from './console.js';

const encodeEntete = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mail';
const horodatage = (d) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export function ecrireMail({ a, cc = [], objet, corps, note_id }, dossier = config.outboxDir, maintenant = new Date()) {
  mkdirSync(dossier, { recursive: true });
  const entetes = [
    'From: Assistant RH <assistant-rh@exemple.local>',
    `To: ${a.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeEntete(objet)}`,
    `Date: ${maintenant.toUTCString()}`,
    ...(note_id ? [`X-Note-Id: ${note_id}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  let fichier = `${horodatage(maintenant)}-${slug(objet)}.eml`;
  for (let i = 2; readdirSync(dossier).includes(fichier); i++) fichier = `${horodatage(maintenant)}-${slug(objet)}-${i}.eml`;
  writeFileSync(join(dossier, fichier), `${entetes.join('\r\n')}\r\n\r\n${corps}\r\n`, 'utf8');
  return fichier;
}

export function listerMails(noteId, dossier = config.outboxDir) {
  mkdirSync(dossier, { recursive: true });
  return readdirSync(dossier).filter((f) => f.endsWith('.eml')).sort().flatMap((f) => {
    const texte = readFileSync(join(dossier, f), 'utf8');
    const entete = (nom) => new RegExp(`^${nom}: (.*)$`, 'mi').exec(texte)?.[1]?.trim();
    if (entete('X-Note-Id') !== noteId) return [];
    return [{ fichier: f, a: entete('To'), cc: entete('Cc'), objet: entete('Subject') }];
  });
}

function creerServeur() {
  const s = new McpServer({ name: 'messagerie', version: '0.1.0' }, {
    instructions: "Messagerie de l'équipe (simulée : chaque mail est écrit dans un fichier .eml). À utiliser pour prévenir des personnes.",
  });
  const texte = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });

  s.registerTool('envoyer_mail', {
    description: "Envoie un mail (simulé). À utiliser pour prévenir une ou plusieurs personnes. Un mail par destinataire ou groupe de destinataires partageant le même message : adapte le contenu à chacun. Passe note_id pour que le mail soit rattaché à la note traitée.",
    inputSchema: {
      a: z.array(z.string()).min(1).describe('Adresses des destinataires (obtenues via lister_contacts)'),
      cc: z.array(z.string()).optional(),
      objet: z.string(), corps: z.string().describe('Texte brut'),
      note_id: z.string().optional().describe('Ex. N-0012'),
    },
  }, async (p) => {
    const fichier = ecrireMail(p);
    trace.mail(p.a, p.objet);
    return texte({ envoye: true, fichier });
  });

  s.registerTool('lister_mails_envoyes', {
    description: 'Liste les mails déjà envoyés pour une note, pour éviter les doublons.',
    inputSchema: { note_id: z.string() },
  }, async ({ note_id }) => texte(listerMails(note_id)));

  return s;
}

export function routeurMessagerie() {
  const r = express.Router();
  r.post('/mcp', express.json(), async (req, res) => {
    if (req.get('authorization') !== `Bearer ${config.messagerieToken}`) return res.status(401).json({ error: 'Token absent ou inconnu' });
    const serveur = creerServeur();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); serveur.close(); });
    await serveur.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const non = (_q, res) => res.status(405).json({ error: 'Méthode non supportée' });
  r.get('/mcp', non);
  r.delete('/mcp', non);
  return r;
}
