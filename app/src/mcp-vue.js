/**
 * Interroge un serveur MCP comme le ferait un client (poignée de main, puis liste des outils)
 * et renvoie les échanges JSON-RPC bruts : requête envoyée et réponse reçue.
 */
export async function vueMcp(url, token) {
  const appeler = async (id, method, params) => {
    const requete = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
    const rep = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify(requete),
      signal: AbortSignal.timeout(5000),
    });
    const texte = await rep.text();
    // la réponse arrive au format SSE : « event: message » puis « data: {...} »
    const data = texte.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    return { requete, statut: rep.status, reponse: JSON.parse(data || texte) };
  };
  return {
    initialize: await appeler(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'vue-mcp', version: '1' } }),
    outils: await appeler(2, 'tools/list'),
  };
}
