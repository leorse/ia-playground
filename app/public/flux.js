// Schéma des flux en direct : une liaison s'allume quand un échange a lieu, puis s'estompe.
const Flux = (() => {
  const DUREE = 4000; // temps pendant lequel une liaison reste allumée avant de s'estomper (ms)
  const MAX_LIGNES = 14;

  const LIENS = {
    'vscode-rh': { noeuds: ['vscode', 'mcprh', 'appli'], nom: 'VS Code → MCP RH' },
    'agent-rh': { noeuds: ['agent', 'mcprh', 'appli'], nom: 'Agent → MCP RH' },
    'app-agent': { noeuds: ['appli', 'agent'], nom: 'Appli RH → Agent (webhook)' },
    'agent-mail': { noeuds: ['agent', 'mcpmail', 'mail'], nom: 'Agent → MCP Mail' },
  };

  const activite = {}; // lien → { t, ko, libelle }
  const noeudsActifs = {}; // noeud → t
  const lignes = []; // { t, nom, libelle, ko }
  let seme = false;
  let agentOccupe = false;

  const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const court = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  /** Traduit une entrée du journal de l'application en échange à afficher. */
  function traduire(e) {
    if (e.type === 'mcp') {
      const lien = { 'agent-rh-vscode': 'vscode-rh', 'agent-autonome': 'agent-rh' }[e.client];
      return lien ? { lien, libelle: e.outil || 'mcp', ko: !!(e.refus || e.erreur) } : null;
    }
    if (e.type === 'webhook') {
      if (e.ignore) return null;
      const evt = e.payload?.evenement;
      return { lien: 'app-agent', libelle: evt === 'ping' ? 'ping (test)' : `note ${e.payload?.note?.id ?? ''}`.trim(), ko: !!(e.erreur || e.statut >= 400) };
    }
    if (e.type === 'flux') return LIENS[e.lien] ? { lien: e.lien, libelle: e.libelle || '', ko: false } : null;
    if (e.type === 'agent') return { noeud: 'agent', ligne: e.etat ? `état : ${e.etat.replace('_', ' ')}` : null, ko: e.etat === 'echec' || e.etat === 'delai' };
    return null;
  }

  function traiter(e) {
    const m = traduire(e);
    if (!m) return;
    const t = Date.now();
    if (m.lien) {
      activite[m.lien] = { t, ko: m.ko, libelle: m.libelle };
      LIENS[m.lien].noeuds.forEach((n) => { noeudsActifs[n] = t; });
      lignes.unshift({ t, nom: LIENS[m.lien].nom, libelle: m.libelle, ko: m.ko });
    } else {
      noeudsActifs[m.noeud] = t;
      if (m.ligne) lignes.unshift({ t, nom: 'Agent', libelle: m.ligne, ko: m.ko });
    }
    lignes.length = Math.min(lignes.length, MAX_LIGNES);
    rendreLignes();
    appliquer();
  }

  /** Remplit l'historique depuis le journal existant (sans rien allumer). */
  function semer(journal) {
    if (seme) return;
    seme = true;
    if (lignes.length) return;
    for (const e of journal.slice(-60)) {
      const m = traduire(e);
      if (!m) continue;
      if (m.lien) lignes.unshift({ t: Date.parse(e.date), nom: LIENS[m.lien].nom, libelle: m.libelle, ko: m.ko });
      else if (m.ligne) lignes.unshift({ t: Date.parse(e.date), nom: 'Agent', libelle: m.ligne, ko: m.ko });
    }
    lignes.length = Math.min(lignes.length, MAX_LIGNES);
  }

  function appliquer() {
    const maintenant = Date.now();
    for (const [id, l] of Object.entries(LIENS)) {
      const el = document.querySelector(`#flux-svg [data-lien="${id}"]`);
      if (!el) continue;
      const a = activite[id];
      const allume = a && maintenant - a.t < DUREE;
      el.classList.toggle('on', !!allume);
      el.classList.toggle('ko', !!(allume && a.ko));
      const lib = el.querySelector('.lib');
      if (a && lib.textContent !== court(a.libelle, 22)) lib.textContent = court(a.libelle, 22);
    }
    for (const n of ['vscode', 'mcprh', 'appli', 'agent', 'mcpmail', 'mail']) {
      const el = document.querySelector(`#flux-svg [data-noeud="${n}"]`);
      if (el) el.classList.toggle('on', maintenant - (noeudsActifs[n] || 0) < DUREE);
    }
    document.querySelector('#flux-svg [data-noeud="agent"]')?.classList.toggle('occupe', agentOccupe);
  }

  function rendreLignes() {
    const ol = document.querySelector('#flux-log');
    if (!ol) return;
    ol.innerHTML = lignes.map((l) => `<li class="${l.ko ? 'ko' : ''}"><span class="meta">${new Date(l.t).toTimeString().slice(0, 8)}</span>
      <b>${esc(l.nom)}</b> <span>${esc(l.libelle)}</span>${l.ko ? ' <span class="badge ko">échec</span>' : ''}</li>`).join('')
      || '<li class="meta">Aucun échange pour l’instant. Lancez un prompt dans VS Code ou publiez une note.</li>';
  }

  const noeud = (id, x, y, w, h, fill, stroke, contenu) =>
    `<g class="noeud" data-noeud="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>${contenu}</g>`;
  const icone = (nom, x, y, t) => `<image class="icone" href="icons/${nom}.svg" x="${x}" y="${y}" width="${t}" height="${t}"/>`;
  const lien = (id, type, chemin, xs, ys, xd, yd, nom) =>
    `<g class="lien ${type}" data-lien="${id}"><path d="${chemin}" fill="none"/>
      <text class="etiq" x="${xs}" y="${ys}" text-anchor="middle">${nom}</text>
      <text class="lib" x="${xd}" y="${yd}" text-anchor="middle"></text></g>`;

  function html() {
    return `<p class="meta">Chaque échange allume la liaison concernée quelques secondes, puis elle s’estompe.
        <a class="legende" href="#" id="lien-mail" target="_blank" rel="noopener">Ouvrir la boîte mail ↗</a>
        <span class="legende"><i class="pastille repos"></i>au repos <i class="pastille mcp"></i>appel MCP <i class="pastille hook"></i>webhook <i class="pastille ko"></i>échec ou refus</span></p>
      <div class="carte flux">
      <svg id="flux-svg" viewBox="0 0 760 520" role="img" aria-label="Schéma des flux entre VS Code, l'application RH, l'agent et le serveur mail">
        <defs>
          ${[['repos', '#7c8596'], ['mcp', '#2ea043'], ['hook', '#f2a516'], ['ko', '#e5484d']].map(([n, c]) =>
            `<marker id="f-${n}" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L11 5 L0 10 z" fill="${c}"/></marker>`).join('')}
        </defs>
        ${lien('vscode-rh', 'mcp', 'M180 110 H305', 242, 98, 242, 130, 'MCP')}
        ${lien('agent-rh', 'mcp', 'M132 280 V215 H351 V150', 240, 205, 240, 232, 'MCP')}
        ${lien('app-agent', 'hook', 'M510 185 V340 H245', 378, 330, 378, 358, 'Webhook')}
        ${lien('agent-mail', 'mcp', 'M132 400 V435 H412', 270, 425, 270, 452, 'MCP')}
        ${noeud('appli', 370, 30, 275, 155, '#2a1f1c', '#f2a516', `${icone('clipboard', 494, 44, 56)}<text x="522" y="146" text-anchor="middle" class="t-grand">Appli RH</text>`)}
        ${noeud('mail', 480, 365, 255, 130, '#0c3b2b', '#2e9e6b', `${icone('mail', 592, 374, 52)}<text x="618" y="462" text-anchor="middle" class="t-grand">Serveur Mail</text>`)}
        ${noeud('vscode', 10, 55, 170, 110, '#18253f', '#2bb5a0', `${icone('vscode_logo', 73, 63, 44)}<text x="95" y="132" text-anchor="middle" class="t-grand gras">VS Code</text><text x="95" y="151" text-anchor="middle" class="t-petit">GitHub Copilot</text>`)}
        ${noeud('mcprh', 305, 70, 92, 80, '#17304f', '#2f83c4', '<text x="351" y="105" text-anchor="middle" class="t-grand">MCP</text><text x="351" y="132" text-anchor="middle" class="t-grand">RH</text>')}
        ${noeud('agent', 20, 280, 225, 120, '#14243d', '#2f83c4', `${icone('robot', 106, 286, 52)}<text x="132" y="361" text-anchor="middle" class="t-grand">Agent</text><text x="132" y="384" text-anchor="middle" class="t-petit">orchestrateur + Copilot CLI</text>`)}
        ${noeud('mcpmail', 412, 395, 90, 80, '#17304f', '#2f83c4', '<text x="457" y="430" text-anchor="middle" class="t-grand">MCP</text><text x="457" y="457" text-anchor="middle" class="t-grand">Mail</text>')}
      </svg></div>
      <h3>Déroulé</h3><ol id="flux-log"></ol>`;
  }

  function init(journal) {
    semer(journal);
    rendreLignes();
    appliquer();
  }

  function majEtatAgent(statuts = {}) {
    agentOccupe = Object.values(statuts).some((s) => s.etat === 'en_cours' || s.etat === 'en_attente');
    appliquer();
  }

  setInterval(appliquer, 250);
  return { html, init, traiter, majEtatAgent };
})();
