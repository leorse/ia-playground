const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

let mails = [];
let selection = null;
const nouveaux = new Set();
let lus = new Set();
try { lus = new Set(JSON.parse(localStorage.getItem('mails-lus') || '[]')); } catch { /* stockage indisponible */ }
const memoriserLus = () => { try { localStorage.setItem('mails-lus', JSON.stringify([...lus])); } catch { /* ignoré */ } };

function rendreListe() {
  $('#compteur').textContent = `${mails.length} mail${mails.length > 1 ? 's' : ''}`;
  $('#liste').innerHTML = mails.slice().reverse().map((m) => `
    <div class="mail ${lus.has(m.id) ? '' : 'non-lu'} ${m.id === selection ? 'selectionne' : ''} ${nouveaux.has(m.id) ? 'nouveau' : ''}" data-id="${m.id}">
      <div class="ligne"><span class="objet">${esc(m.objet)}</span><span class="meta">${heure(m.date).slice(-8)}</span></div>
      <div class="ligne"><span class="meta">À : ${esc(m.a.join(', '))}</span>${m.note_id ? `<span class="badge">${esc(m.note_id)}</span>` : ''}</div>
      <div class="extrait">${esc(m.extrait)}</div>
    </div>`).join('') || '<p class="vide" style="padding:16px">Aucun mail pour l’instant.</p>';
}

async function ouvrir(id) {
  selection = id;
  lus.add(id); memoriserLus();
  rendreListe();
  const rep = await fetch(`/api/mails/${id}`);
  if (!rep.ok) return;
  const m = await rep.json();
  $('#lecture').innerHTML = `
    <div class="entete">
      <h2>${esc(m.objet)}</h2>
      <div><span class="k">De</span>${esc(m.de)}</div>
      <div><span class="k">À</span>${esc(m.a.join(', '))}</div>
      ${m.cc.length ? `<div><span class="k">Cc</span>${esc(m.cc.join(', '))}</div>` : ''}
      <div><span class="k">Date</span>${heure(m.date)} ${m.note_id ? `<span class="badge">note ${esc(m.note_id)}</span>` : ''}</div>
    </div>
    <iframe sandbox="" title="Contenu du mail"></iframe>`;
  // contenu HTML dans un iframe sans aucune permission (pas de script)
  $('#lecture iframe').srcdoc = `<meta charset="utf-8"><style>body{font:14px/1.5 system-ui,sans-serif;color:#1d2330;margin:12px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>${m.html}`;
}

async function charger() {
  mails = await (await fetch('/api/mails')).json();
  if (selection && !mails.some((m) => m.id === selection)) {
    selection = null;
    $('#lecture').innerHTML = '<p class="vide">Sélectionnez un mail.</p>';
  }
  rendreListe();
}

$('#liste').addEventListener('click', (e) => { const el = e.target.closest('.mail'); if (el) ouvrir(el.dataset.id); });
$('#vider').addEventListener('click', async () => {
  if (confirm('Supprimer tous les mails ?')) await fetch('/api/mails', { method: 'DELETE' });
});

const sse = new EventSource('/api/events');
sse.addEventListener('mail', (e) => { nouveaux.add(JSON.parse(e.data).id); });
sse.addEventListener('change', charger);
charger();

/* onglets Mails / MCP */
function afficherOnglet() {
  const mcp = location.hash === '#/mcp';
  $('#vue-mails').hidden = mcp;
  $('#vue-mcp').hidden = !mcp;
  $('#vider').hidden = mcp;
  $('#compteur').hidden = mcp;
  $('#nav-mails').classList.toggle('actif', !mcp);
  $('#nav-mcp').classList.toggle('actif', mcp);
  if (mcp) McpVue.monter($('#mcp-vue'), '/api/mcp');
}
addEventListener('hashchange', afficherOnglet);
afficherOnglet();
