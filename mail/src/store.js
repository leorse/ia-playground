import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const FICHIER = process.env.MAIL_DATA_FILE || join(racine, 'data', 'mails.json');
const OUTBOX = process.env.MAIL_OUTBOX_DIR || join(racine, 'outbox');
const EXPEDITEUR = 'Assistant RH <assistant-rh@exemple.local>';

export const events = new EventEmitter(); // 'change', 'mail'
export class ErreurMail extends Error {}

let mails = existsSync(FICHIER) ? JSON.parse(readFileSync(FICHIER, 'utf8')) : [];

const sauver = () => {
  mkdirSync(dirname(FICHIER), { recursive: true });
  writeFileSync(FICHIER, JSON.stringify(mails, null, 2));
};

const echapper = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const estHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s);

/** Texte brut → HTML simple ; HTML → inchangé. */
export const versHtml = (corps) => (estHtml(corps) ? corps
  : corps.split(/\n{2,}/).map((p) => `<p>${echapper(p).replace(/\n/g, '<br>')}</p>`).join('\n'));

const texteDe = (html) => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

const encodeEntete = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mail';

function ecrireEml(m) {
  mkdirSync(OUTBOX, { recursive: true });
  const d = new Date(m.date);
  const horo = d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  let nom = `${horo}-${slug(m.objet)}.eml`;
  for (let i = 2; readdirSync(OUTBOX).includes(nom); i++) nom = `${horo}-${slug(m.objet)}-${i}.eml`;
  const entetes = [
    `From: ${m.de}`, `To: ${m.a.join(', ')}`, ...(m.cc.length ? [`Cc: ${m.cc.join(', ')}`] : []),
    `Subject: ${encodeEntete(m.objet)}`, `Date: ${d.toUTCString()}`, ...(m.note_id ? [`X-Note-Id: ${m.note_id}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit',
  ];
  writeFileSync(join(OUTBOX, nom), `${entetes.join('\r\n')}\r\n\r\n${m.html}\r\n`, 'utf8');
  return nom;
}

export function envoyer({ a, cc = [], objet, corps, note_id }) {
  if (!a?.length) throw new ErreurMail('Au moins un destinataire est requis dans `a`.');
  const invalide = [...a, ...cc].find((x) => !/^[^@\s]+@[^@\s]+$/.test(x));
  if (invalide) throw new ErreurMail(`Adresse invalide : "${invalide}". Utilise l'adresse renvoyée par lister_contacts.`);
  if (!objet?.trim()) throw new ErreurMail("`objet` est obligatoire.");
  if (!corps?.trim()) throw new ErreurMail("`corps` est obligatoire.");
  const html = versHtml(corps);
  const mail = {
    id: `M-${String(mails.reduce((n, m) => Math.max(n, Number(m.id.slice(2))), 0) + 1).padStart(4, '0')}`,
    date: new Date().toISOString(), de: EXPEDITEUR, a, cc, objet, html, extrait: texteDe(html).slice(0, 140), note_id,
  };
  mail.fichier = ecrireEml(mail);
  mails.push(mail);
  sauver();
  events.emit('mail', mail);
  events.emit('change');
  return mail;
}

export const resume = ({ html, ...reste }) => reste;
export const lister = () => mails.map(resume);
export const lire = (id) => mails.find((m) => m.id === id);
export const parNote = (noteId) => mails.filter((m) => m.note_id === noteId).map(({ id, a, cc, objet, date }) => ({ id, a, cc, objet, date }));

export function vider() {
  mails = [];
  sauver();
  events.emit('change');
}
