import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { donneesDeDepart, annuaire } from './seed.js';

const FICHIER = process.env.DB_FILE || fileURLToPath(new URL('../data/db.json', import.meta.url));
export const events = new EventEmitter(); // 'change', 'note.creee'

const PARAMETRES = { webhook: { actif: false, url: 'http://localhost:4000/webhook', secret: 'demo-secret-zzzz', evenements: ['note.creee'] } };

let db;

function charger() {
  if (existsSync(FICHIER)) {
    db = JSON.parse(readFileSync(FICHIER, 'utf8'));
  } else {
    db = { ...donneesDeDepart(), parametres: structuredClone(PARAMETRES) };
    sauver(false);
  }
}

function sauver(notifier = true) {
  mkdirSync(dirname(FICHIER), { recursive: true });
  writeFileSync(FICHIER, JSON.stringify(db, null, 2));
  if (notifier) events.emit('change');
}

const maintenant = () => new Date().toISOString();
const nouvelId = (prefixe) => `${prefixe}-${String(++db.compteurs[prefixe]).padStart(4, '0')}`;

export class ErreurMetier extends Error {}
const erreur = (msg) => { throw new ErreurMetier(msg); };

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_DATE_HEURE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
const verifierDate = (champ, v, re = RE_DATE) => {
  if (v != null && !re.test(v) || (v != null && Number.isNaN(Date.parse(v)))) {
    erreur(`Date invalide pour \`${champ}\` : format attendu ${re === RE_DATE ? 'AAAA-MM-JJ' : 'AAAA-MM-JJ ou AAAA-MM-JJTHH:MM'}, reçu "${v}".`);
  }
};

charger();

export const lireTout = () => db;
export const parametres = () => db.parametres;

export function reinitialiser() {
  db = { ...donneesDeDepart(), parametres: db.parametres };
  sauver();
}

export function majParametres(p) {
  db.parametres.webhook = { ...db.parametres.webhook, ...p.webhook };
  sauver();
}

/* ---------- Personnel ---------- */

export function listerPersonnel({ recherche, statut, service, arrivee_du, arrivee_au } = {}) {
  const r = recherche?.toLowerCase();
  return db.personnel.filter((p) =>
    (!r || `${p.prenom} ${p.nom}`.toLowerCase().includes(r)) &&
    (!statut || p.statut === statut) &&
    (!service || p.service?.toLowerCase() === service.toLowerCase()) &&
    (!arrivee_du || p.date_debut >= arrivee_du) &&
    (!arrivee_au || p.date_debut <= arrivee_au));
}

export function lireFiche(id) {
  const p = db.personnel.find((x) => x.id === id);
  if (!p) erreur(`Aucune fiche avec l'identifiant "${id}". Utilise lister_personnel pour retrouver l'identifiant.`);
  return { ...p, taches: db.taches.filter((t) => t.personne_id === id) };
}

export function creerFiche(d, auteur) {
  const existante = db.personnel.find((p) => p.prenom.toLowerCase() === d.prenom.toLowerCase() && p.nom.toLowerCase() === d.nom.toLowerCase());
  if (existante) erreur(`Une fiche existe déjà pour ${d.prenom} ${d.nom} (${existante.id}). Utilise \`modifier_fiche_personnel\` si besoin.`);
  verifierDate('date_debut', d.date_debut);
  verifierDate('date_fin', d.date_fin);
  if (d.type_contrat !== 'CDI' && !d.date_fin) erreur(`\`date_fin\` est obligatoire pour un contrat ${d.type_contrat}.`);
  const t = maintenant();
  const fiche = { id: nouvelId('P'), statut: 'a_venir', ...d, auteur, cree_le: t, modifie_le: t };
  db.personnel.push(fiche);
  sauver();
  return fiche;
}

export function modifierFiche({ id, ...champs }) {
  const p = db.personnel.find((x) => x.id === id);
  if (!p) erreur(`Aucune fiche avec l'identifiant "${id}".`);
  verifierDate('date_debut', champs.date_debut);
  verifierDate('date_fin', champs.date_fin);
  Object.assign(p, champs, { modifie_le: maintenant() });
  sauver();
  return p;
}

/* ---------- Tâches ---------- */

export function listerTaches({ etiquette, assigne, personne_id, statut, a_partir_du, jusqu_au } = {}) {
  const jour = (t) => (t.debut || t.echeance || '').slice(0, 10);
  return db.taches.filter((t) =>
    (!etiquette || t.etiquettes?.includes(etiquette)) &&
    (!assigne || t.assigne?.toLowerCase().includes(assigne.toLowerCase())) &&
    (!personne_id || t.personne_id === personne_id) &&
    (!statut || t.statut === statut) &&
    (!a_partir_du || (jour(t) && jour(t) >= a_partir_du)) &&
    (!jusqu_au || (jour(t) && jour(t) <= jusqu_au)));
}

export function lireTache(id) {
  const t = db.taches.find((x) => x.id === id);
  if (!t) erreur(`Aucune tâche avec l'identifiant "${id}". Utilise lister_taches pour la retrouver.`);
  return { ...t, sous_taches: db.taches.filter((s) => s.tache_parente === id).map((s) => ({ id: s.id, titre: s.titre, statut: s.statut })) };
}

export function creerTache(d, auteur) {
  verifierDate('debut', d.debut, RE_DATE_HEURE);
  verifierDate('echeance', d.echeance, RE_DATE_HEURE);
  verifierDate('fin_validite', d.fin_validite);
  if (d.tache_parente && !db.taches.some((t) => t.id === d.tache_parente)) erreur(`Tâche parente "${d.tache_parente}" introuvable.`);
  if (d.personne_id && !db.personnel.some((p) => p.id === d.personne_id)) erreur(`Fiche "${d.personne_id}" introuvable.`);
  const t = maintenant();
  const tache = { id: nouvelId('T'), etiquettes: [], priorite: 'normale', statut: 'a_faire', tache_parente: null, pieces_jointes: [], ...d, auteur, cree_le: t, modifie_le: t };
  db.taches.push(tache);
  sauver();
  return tache;
}

export function modifierTache({ id, ...champs }) {
  const t = db.taches.find((x) => x.id === id);
  if (!t) erreur(`Aucune tâche avec l'identifiant "${id}".`);
  verifierDate('debut', champs.debut, RE_DATE_HEURE);
  verifierDate('echeance', champs.echeance, RE_DATE_HEURE);
  Object.assign(t, champs, { modifie_le: maintenant() });
  sauver();
  return t;
}

export function ajouterPieceJointe({ id_tache, nom, type, contenu }) {
  const t = db.taches.find((x) => x.id === id_tache);
  if (!t) erreur(`Aucune tâche avec l'identifiant "${id_tache}".`);
  if (type === 'mermaid' && /^\s*```/.test(contenu)) erreur('Pour une pièce jointe `mermaid`, fournis la source brute, sans balises ``` .');
  const pj = { id: `PJ-${t.pieces_jointes.length + 1}`, nom, type, contenu, ajoute_le: maintenant() };
  t.pieces_jointes.push(pj);
  t.modifie_le = maintenant();
  sauver();
  return pj;
}

/* ---------- Notes ---------- */

export function creerNote(d, auteur) {
  if (d.personne_id && !db.personnel.some((p) => p.id === d.personne_id)) erreur(`Fiche "${d.personne_id}" introuvable.`);
  const note = { id: nouvelId('N'), titre: d.titre || '', contenu: d.contenu, personne_id: d.personne_id, auteur, cree_le: maintenant(), annotations: [] };
  db.notes.push(note);
  sauver();
  events.emit('note.creee', note);
  return note;
}

export const listerNotes = ({ depuis, personne_id } = {}) =>
  db.notes.filter((n) => (!depuis || n.cree_le >= depuis) && (!personne_id || n.personne_id === personne_id));

export function lireNote(id) {
  const n = db.notes.find((x) => x.id === id);
  if (!n) erreur(`Aucune note avec l'identifiant "${id}". Utilise lister_notes pour la retrouver.`);
  return n;
}

export const TYPES_NOTE = ['arrivee', 'depart', 'absence', 'logistique', 'confidentiel', 'incomplet', 'information'];

export function annoterNote({ id, ...a }, auteur) {
  const n = lireNote(id);
  const annotation = { personnes_prevenues: [], alertes: [], confidentiel: false, ...a, auteur, ajoute_le: maintenant() };
  n.annotations.push(annotation);
  sauver();
  return annotation;
}

/* ---------- Annuaire ---------- */

export function listerContacts({ role, recherche } = {}) {
  if (role) {
    const c = annuaire.roles[role];
    if (!c) erreur(`Aucun contact pour le rôle "${role}". Rôles disponibles : ${Object.keys(annuaire.roles).join(', ')}.`);
    return [{ role, ...c }];
  }
  const r = recherche?.toLowerCase();
  const tous = [...Object.entries(annuaire.roles).map(([rl, c]) => ({ role: rl, ...c })), ...annuaire.salaries];
  return r ? tous.filter((c) => JSON.stringify(c).toLowerCase().includes(r)) : tous;
}
