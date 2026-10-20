const c = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
export const gris = c(90), rouge = c(31), vert = c(32), jaune = c(33), bleu = c(36), gras = c(1);

const heure = () => new Date().toTimeString().slice(0, 8);
const ligne = (etiquette, texte) => console.log(`${gris(heure())} ${etiquette} ${texte}`);

const court = (v, n = 160) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : s ?? '';
};

export const trace = {
  info: (t) => ligne(bleu('•'), t),
  webhook: (t) => ligne(jaune('🔔 webhook'), t),
  note: (id) => console.log(`\n${gras(bleu(`━━━ Traitement de la note ${id} ━━━`))}`),
  agent: (texte) => process.stdout.write(gris(texte)),
  outil: (titre, entree) => ligne(vert('🔧'), `${titre} ${gris(court(entree))}`),
  resultat: (statut, texte) => ligne(statut === 'failed' ? rouge('   ↳ échec') : gris('   ↳'), gris(court(texte, 200))),
  autorise: (titre) => ligne(vert('✔ autorisé'), titre),
  refuse: (titre, raison) => ligne(rouge('✘ REFUSÉ'), `${titre} ${gris(`(${raison})`)}`),
  mail: (a, objet) => ligne(jaune('✉️  mail'), `→ ${a.join(', ')} : ${objet}`),
  erreur: (t) => ligne(rouge('!'), t),
};
