/** File d'attente : une tâche à la fois, dans l'ordre d'arrivée. */
export function creerFile(traiter) {
  const attente = [];
  let enCours = false;

  async function boucle() {
    if (enCours) return;
    enCours = true;
    while (attente.length) {
      const element = attente.shift();
      try { await traiter(element); } catch (e) { console.error('Erreur de traitement :', e); }
    }
    enCours = false;
  }

  return {
    ajouter(element) { attente.push(element); boucle(); },
    get taille() { return attente.length + (enCours ? 1 : 0); },
  };
}
