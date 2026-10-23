// Onglet « MCP » : ce que le serveur expose à un client MCP, en tableau ou en JSON brut.
// (Même fichier dans app/public et mail/public.)
const McpVue = (() => {
  const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const parametres = (schema = {}) => Object.entries(schema.properties || {}).map(([nom, p]) => {
    const requis = (schema.required || []).includes(nom);
    const type = p.enum ? p.enum.join(' | ') : p.type === 'array' ? `${p.items?.type ?? 'any'}[]` : p.type;
    return `<div><code>${esc(nom)}${requis ? '<b title="obligatoire">*</b>' : ''}</code> <span class="meta">${esc(type)}</span>${p.description ? ` <span class="meta">– ${esc(p.description)}</span>` : ''}</div>`;
  }).join('') || '<span class="meta">aucun</span>';

  function tableau(d) {
    const info = d.initialize.reponse.result || {};
    const outils = d.outils.reponse.result?.tools || [];
    const droits = d.droits;
    return `<div class="carte-mcp">
        <h2>${esc(info.serverInfo?.name ?? 'serveur MCP')} <span class="meta">v${esc(info.serverInfo?.version ?? '?')} · ${esc(d.url)}</span></h2>
        <p><b>Instructions envoyées au client :</b> ${esc(info.instructions ?? '–')}</p>
        ${droits ? `<p class="meta">Tous les outils sont listés quel que soit le token : les droits sont vérifiés à l'appel (colonne « Droit requis »).</p>` : ''}
      </div>
      <table class="mcp-table"><thead><tr><th>Fonction</th>${droits ? '<th>Droit requis</th>' : ''}<th>Description</th><th>Paramètres</th></tr></thead><tbody>
      ${outils.map((o) => `<tr><td><code>${esc(o.name)}</code></td>${droits ? `<td><span class="badge">${esc(droits[o.name] ?? '?')}</span></td>` : ''}<td>${esc(o.description)}</td><td>${parametres(o.inputSchema)}</td></tr>`).join('')}
      </tbody></table><p class="meta">${outils.length} fonction${outils.length > 1 ? 's' : ''}.</p>`;
  }

  const json = (titre, e) => `<h3>${titre}</h3>
    <div class="meta">Requête du client</div><pre>${esc(JSON.stringify(e.requete, null, 2))}</pre>
    <div class="meta">Réponse du serveur (HTTP ${e.statut})</div><pre>${esc(JSON.stringify(e.reponse, null, 2))}</pre>`;

  async function monter(conteneur, urlApi) {
    conteneur.innerHTML = '<p class="meta">Chargement…</p>';
    let d;
    try {
      const r = await fetch(urlApi);
      d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
    } catch (e) {
      conteneur.innerHTML = `<p class="meta">Impossible de lire le serveur MCP : ${esc(e.message)}</p>`;
      return;
    }
    let vueJson = false;
    try { vueJson = localStorage.getItem('mcp-vue-json') === '1'; } catch { /* stockage indisponible */ }
    const dessiner = () => {
      conteneur.innerHTML = `<div class="mcp-barre"><label><input type="checkbox" id="mcp-json" style="width:auto" ${vueJson ? 'checked' : ''}> Vue JSON</label>
        <span class="meta">${vueJson ? 'Échanges bruts, tels que les voit un client MCP' : 'Ce que le serveur annonce aux clients MCP'}</span>
        <button id="mcp-actualiser" class="secondaire">Actualiser</button></div>
        ${vueJson ? json('1. Poignée de main : <code>initialize</code>', d.initialize) + json('2. Liste des outils : <code>tools/list</code>', d.outils) : tableau(d)}`;
      conteneur.querySelector('#mcp-json').addEventListener('change', (e) => {
        vueJson = e.target.checked;
        try { localStorage.setItem('mcp-vue-json', vueJson ? '1' : '0'); } catch { /* ignoré */ }
        dessiner();
      });
      conteneur.querySelector('#mcp-actualiser').addEventListener('click', () => monter(conteneur, urlApi));
    };
    dessiner();
  }

  return { monter };
})();
