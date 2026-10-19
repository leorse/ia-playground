const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (s = '') => (window.marked ? marked.parse(s) : `<pre>${esc(s)}</pre>`);
const fmt = (d) => (d ? esc(String(d).replace('T', ' ')) : '–');
const ico = { a_faire: '☐', en_cours: '◐', fait: '☑' };

let etat = null;
if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });

async function charger() {
  etat = await (await fetch('/api/state')).json();
  rendre();
}

function lienPersonne(id) {
  const p = etat.personnel.find((x) => x.id === id);
  return p ? `<a href="#/personnel/${p.id}">${esc(p.prenom)} ${esc(p.nom)}</a>` : '';
}
const badgesTache = (t) =>
  (t.etiquettes || []).map((e) => `<span class="badge">${esc(e)}</span>`).join('') +
  (t.fin_validite ? `<span class="badge warn">expire ${esc(t.fin_validite)}</span>` : '');

function ligneTache(t, niveau = 0) {
  return `<div class="${niveau ? 'sous' : ''}">${ico[t.statut] || '☐'} <a href="#/taches/${t.id}">${esc(t.titre)}</a>
    <span class="meta">${t.id} · ${fmt(t.debut || t.echeance)} · ${esc(t.assigne || 'non assignée')}</span> ${badgesTache(t)}</div>`;
}

function blocNote(n, lien = true) {
  const ann = n.annotations.map((a) => `
    <div class="annotation ${a.confidentiel ? 'confidentiel' : ''}">
      <b>🤖 ${esc(a.type_detecte)}</b> ${a.confidentiel ? '<span class="badge ko">confidentiel</span>' : ''}
      <span class="meta">par ${esc(a.auteur)}</span><br>${esc(a.resume)}
      ${a.personnes_prevenues?.length ? `<div>✉️ Prévenus : ${a.personnes_prevenues.map(esc).join(', ')}</div>` : ''}
      ${a.alertes?.map((x) => `<div><span class="badge warn">alerte</span> ${esc(x)}</div>`).join('') || ''}
    </div>`).join('');
  return `<div class="carte"><h3>${lien ? `<a href="#/notes/${n.id}">` : ''}${esc(n.titre || '(sans titre)')}${lien ? '</a>' : ''}
    <span class="meta">${n.id} · ${esc(n.auteur)} · ${fmt(n.cree_le.slice(0, 16))}</span></h3>
    <div>${md(n.contenu)}</div>${ann}</div>`;
}

const vues = {
  dashboard() {
    const avenir = etat.personnel.filter((p) => p.statut === 'a_venir');
    const taches = etat.taches.filter((t) => t.statut !== 'fait' && !t.tache_parente).slice(0, 8);
    return `<div class="grille">
      <div class="carte"><h2>Prochaines arrivées</h2>${avenir.map((p) => `<div>${lienPersonne(p.id)} – ${esc(p.poste)} <span class="meta">${esc(p.date_debut)}</span></div>`).join('') || '<span class="meta">Aucune</span>'}</div>
      <div class="carte"><h2>Tâches à venir</h2>${taches.map((t) => ligneTache(t)).join('') || '<span class="meta">Aucune</span>'}</div>
    </div><h2>Dernières notes</h2>${etat.notes.slice(-3).reverse().map((n) => blocNote(n)).join('') || '<span class="meta">Aucune note</span>'}`;
  },
  personnel(id) {
    if (id) {
      const p = etat.personnel.find((x) => x.id === id);
      if (!p) return '<p>Fiche introuvable.</p>';
      const ts = etat.taches.filter((t) => t.personne_id === id);
      return `<div class="carte"><h2>${esc(p.prenom)} ${esc(p.nom)} <span class="badge">${esc(p.statut)}</span></h2>
        <table>${[['Identifiant', p.id], ['Poste', p.poste], ['Service', p.service], ['Contrat', p.type_contrat], ['Début', p.date_debut],
          ['Fin', (p.date_fin || '–') + (p.date_fin_calculee ? ' <span class="badge warn">date de fin à confirmer</span>' : '')],
          ['Manager', p.manager], ['Email', p.email], ['Créée par', p.auteur]].map(([k, v]) => `<tr><th>${k}</th><td>${k === 'Fin' ? v : esc(v) || '–'}</td></tr>`).join('')}</table></div>
        <div class="carte"><h3>Tâches et demandes d'accès liées</h3>${ts.map((t) => ligneTache(t)).join('') || '<span class="meta">Aucune</span>'}</div>`;
    }
    return `<div class="carte"><table><tr><th>ID</th><th>Nom</th><th>Poste</th><th>Contrat</th><th>Début</th><th>Statut</th></tr>
      ${etat.personnel.map((p) => `<tr><td>${p.id}</td><td>${lienPersonne(p.id)}${p.date_fin_calculee ? ' <span class="badge warn">fin à confirmer</span>' : ''}</td>
      <td>${esc(p.poste)}</td><td>${esc(p.type_contrat)}</td><td>${esc(p.date_debut)}</td><td>${esc(p.statut)}</td></tr>`).join('')}</table></div>`;
  },
  taches(id) {
    if (id) {
      const t = etat.taches.find((x) => x.id === id);
      if (!t) return '<p>Tâche introuvable.</p>';
      const sous = etat.taches.filter((s) => s.tache_parente === id);
      return `<div class="carte"><h2>${esc(t.titre)} <span class="meta">${t.id}</span></h2>
        <div>${ico[t.statut]} ${esc(t.statut)} · ${fmt(t.debut)} → ${fmt(t.echeance)} · ${esc(t.assigne || 'non assignée')} · ${esc(t.priorite)} ${badgesTache(t)}</div>
        ${t.personne_id ? `<div>Concerne : ${lienPersonne(t.personne_id)}</div>` : ''}
        ${t.tache_parente ? `<div>Parente : <a href="#/taches/${t.tache_parente}">${t.tache_parente}</a></div>` : ''}
        <div>${md(t.description)}</div></div>
        ${t.pieces_jointes.map((pj) => `<div class="carte"><h3>📎 ${esc(pj.nom)} <span class="meta">${pj.type}</span></h3>
          ${pj.type === 'mermaid' ? `<div class="mermaid">${esc(pj.contenu)}</div>` : pj.type === 'markdown' ? md(pj.contenu) : `<pre>${esc(pj.contenu)}</pre>`}</div>`).join('')}
        ${sous.length ? `<div class="carte"><h3>Sous-tâches</h3>${sous.map((s) => ligneTache(s)).join('')}</div>` : ''}`;
    }
    const racines = etat.taches.filter((t) => !t.tache_parente);
    return `<div class="carte">${racines.map((t) => ligneTache(t) + etat.taches.filter((s) => s.tache_parente === t.id).map((s) => ligneTache(s, 1)).join('')).join('') || '<span class="meta">Aucune tâche</span>'}</div>`;
  },
  notes(id) {
    if (id) {
      const n = etat.notes.find((x) => x.id === id);
      return n ? blocNote(n, false) : '<p>Note introuvable.</p>';
    }
    return `<div class="carte"><h2>Nouvelle note</h2>
      <p class="meta">Texte libre : l'agent autonome (si le webhook est activé) l'interprète.</p>
      <textarea id="contenu" placeholder="Ex. Sophie absente toute la semaine prochaine, Marc reprend ses dossiers…"></textarea>
      <p><button id="publier">Publier</button></p></div>
      ${etat.notes.slice().reverse().map((n) => blocNote(n)).join('') || '<span class="meta">Aucune note</span>'}`;
  },
  parametres() {
    const w = etat.parametres.webhook;
    return `<div class="carte"><h2>Notifier l'agent autonome (webhook)</h2>
      <label><input type="checkbox" id="w-actif" style="width:auto" ${w.actif ? 'checked' : ''}> Webhook actif</label>
      <label>URL de l'agent</label><input id="w-url" value="${esc(w.url)}">
      <label>Secret partagé</label><input id="w-secret" value="${esc(w.secret)}">
      <p><button id="enregistrer">Enregistrer</button></p></div>`;
  },
};

function rendre() {
  const [, page = '', id] = location.hash.split('/');
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('actif', a.getAttribute('href') === `#/${page}`));
  // ne pas écraser une saisie en cours dans le formulaire de note
  const saisie = $('#contenu')?.value;
  $('#vue').innerHTML = (vues[page || 'dashboard'] || vues.dashboard)(id);
  if (saisie && $('#contenu')) $('#contenu').value = saisie;
  rendreJournal();
  if (window.mermaid) mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
}

function rendreJournal() {
  const rep = (j) => (typeof j === 'string' ? j : JSON.stringify(j));
  $('#journal').innerHTML = etat.journal.slice().reverse().map((e) => {
    const h = e.date.slice(11, 19);
    if (e.type === 'webhook') {
      return `<div class="j"><span class="quoi">🔔 webhook</span> <span class="meta">${h}</span> → ${esc(e.url)} <span class="badge ${e.statut === 202 || e.statut === 200 ? 'ok' : 'ko'}">${esc(e.statut ?? e.erreur)}</span><pre>${esc(JSON.stringify(e.payload))}</pre></div>`;
    }
    const res = e.erreur || (e.refus ? e.resultat : rep(e.resultat));
    return `<div class="j ${e.refus ? 'refus' : ''}"><span class="quoi">🔧 ${esc(e.outil || 'mcp')}</span> <span class="meta">${h} · ${esc(e.client)}</span>
      ${e.refus ? '<span class="badge ko">refusé</span>' : e.erreur ? '<span class="badge warn">erreur</span>' : ''}
      <pre>${esc(JSON.stringify(e.parametres ?? ''))}</pre><pre>→ ${esc((res || '').slice(0, 400))}</pre></div>`;
  }).join('') || '<span class="meta">Aucune activité</span>';
}

document.addEventListener('click', async (ev) => {
  if (ev.target.id === 'publier') {
    const contenu = $('#contenu').value.trim();
    if (!contenu) return;
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contenu }) });
    $('#contenu').value = '';
  } else if (ev.target.id === 'enregistrer') {
    await fetch('/api/parametres', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook: { actif: $('#w-actif').checked, url: $('#w-url').value, secret: $('#w-secret').value } }) });
    ev.target.textContent = 'Enregistré ✓';
  } else if (ev.target.id === 'reset') {
    if (confirm('Remettre les données de départ ?')) await fetch('/api/reinitialiser', { method: 'POST' });
  }
});

let attente;
const rafraichir = () => { clearTimeout(attente); attente = setTimeout(charger, 150); };
const sse = new EventSource('/api/events');
sse.addEventListener('data', rafraichir);
sse.addEventListener('journal', rafraichir);
addEventListener('hashchange', rendre);
charger();
