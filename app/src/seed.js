import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const annuaire = JSON.parse(readFileSync(fileURLToPath(new URL('../config/annuaire.json', import.meta.url)), 'utf8'));

const iso = (d) => d.toISOString().slice(0, 10);

/** Prochaine occurrence d'un jour (0=dim … 6=sam), au moins 1 jour après aujourd'hui. */
function prochain(jour, depuis = new Date()) {
  const d = new Date(depuis);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== jour) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Données de départ. Les dates sont relatives à aujourd'hui pour que les scénarios restent cohérents. */
export function donneesDeDepart() {
  const jeudi = prochain(4, new Date(Date.now() + 7 * 864e5)); // jeudi de la semaine prochaine
  const maintenant = new Date().toISOString();
  return {
    compteurs: { P: 0, T: 2, N: 0, A: 0 },
    personnel: annuaire.salaries.map((s, i) => {
      const [prenom, ...reste] = s.nom.split(' ');
      return {
        id: `P-000${i + 1}`, prenom, nom: reste.join(' '), poste: s.poste, service: s.service,
        type_contrat: 'CDI', date_debut: '2022-09-01', statut: 'actif',
        manager: s.poste === 'Manager' ? 'Anne Roy' : 'Paul Girard', email: s.email,
        auteur: 'seed', cree_le: maintenant, modifie_le: maintenant,
      };
    }),
    taches: [
      {
        id: 'T-0001', titre: 'Réunion client – Revue de sprint', description: 'Revue avec le client Exemplia.',
        debut: `${iso(jeudi)}T14:00`, echeance: `${iso(jeudi)}T15:30`, assigne: 'Sophie Martin',
        etiquettes: ['reunion', 'client'], priorite: 'haute', statut: 'a_faire', tache_parente: null,
        pieces_jointes: [], auteur: 'seed', cree_le: maintenant, modifie_le: maintenant,
      },
      {
        id: 'T-0002', titre: 'Rétrospective d’équipe', description: '',
        debut: `${iso(prochain(5))}T16:00`, echeance: `${iso(prochain(5))}T17:00`, assigne: 'Paul Girard',
        etiquettes: ['reunion'], priorite: 'normale', statut: 'a_faire', tache_parente: null,
        pieces_jointes: [], auteur: 'seed', cree_le: maintenant, modifie_le: maintenant,
      },
    ],
    notes: [],
  };
}
