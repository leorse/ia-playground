// Faux Copilot CLI : parle ACP sur stdin/stdout et simule un agent qui interprète une note.
// Sert aux tests et à essayer la chaîne sans consommer de quota Copilot :
//   COPILOT_BIN=node  COPILOT_ARGS=test/faux-copilot.js
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const sessions = new Map();

async function mcp(serveur) {
  const en = Object.fromEntries(serveur.headers.map((h) => [h.name, h.value]));
  const c = new Client({ name: 'faux-copilot', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(serveur.url), { requestInit: { headers: en } }));
  return c;
}

async function autoriser(ctx, sessionId, titre, kind, rawInput) {
  const rep = await ctx.client.request(acp.methods.client.session.requestPermission, {
    sessionId,
    toolCall: { toolCallId: `tc-${Math.random().toString(36).slice(2, 8)}`, title: titre, kind, rawInput },
    options: [
      { optionId: 'oui', name: 'Autoriser', kind: 'allow_once' },
      { optionId: 'non', name: 'Refuser', kind: 'reject_once' },
    ],
  });
  return rep.outcome.outcome === 'selected' && rep.outcome.optionId === 'oui';
}

const dire = (ctx, sessionId, texte) => ctx.client.notify(acp.methods.client.session.update, {
  sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: texte } },
});

const appli = acp.agent({ name: 'faux-copilot' })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: {}, agentInfo: { name: 'faux-copilot', version: '0.0.1' },
  }))
  .onRequest(acp.methods.agent.session.new, ({ params }) => {
    const sessionId = `s-${sessions.size + 1}`;
    sessions.set(sessionId, params);
    return { sessionId };
  })
  .onNotification(acp.methods.agent.session.cancel, () => {})
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    const { sessionId, prompt } = ctx.params;
    const { mcpServers } = sessions.get(sessionId);
    const noteId = /N-\d+/.exec(prompt.map((p) => p.text).join(' '))[0];
    const appliRh = await mcp(mcpServers.find((s) => s.name === 'appli-rh'));
    const messagerie = await mcp(mcpServers.find((s) => s.name === 'messagerie'));
    const appel = async (client, serveur, nom, args) => {
      const titre = `${serveur}-${nom}`;
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: 'tool_call', toolCallId: titre, title: titre, rawInput: args } });
      // comme Copilot CLI : la demande d'autorisation ne porte que le nom de l'outil, sans le serveur
      if (!(await autoriser(ctx, sessionId, nom, 'other', args))) throw new Error(`refus ${titre}`);
      const r = await client.callTool({ name: nom, arguments: args });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: titre, status: r.isError ? 'failed' : 'completed', content: [{ type: 'content', content: { type: 'text', text: r.content[0].text.slice(0, 80) } }] } });
      return r.content[0].text;
    };

    // Tentative hors périmètre : un shell. L'orchestrateur doit refuser.
    const shell = await autoriser(ctx, sessionId, 'Run shell command: cat /etc/passwd', 'execute', { command: 'cat /etc/passwd' });
    await dire(ctx, sessionId, shell ? 'ALERTE: shell autorisé\n' : 'Shell refusé comme prévu.\n');

    const note = JSON.parse(await appel(appliRh, 'appli-rh', 'lire_note', { id: noteId }));
    const texte = note.contenu.toLowerCase();
    const confidentiel = /entre nous|confidentiel/.test(texte);
    const arrivee = !confidentiel && /arriv|rejoin/.test(texte);
    const type = confidentiel ? 'confidentiel' : arrivee ? 'arrivee' : 'information';
    const roles = confidentiel ? ['rh'] : arrivee ? ['informatique', 'services_generaux'] : [];
    const prevenus = [];
    for (const role of roles) {
      const [contact] = JSON.parse(await appel(appliRh, 'appli-rh', 'lister_contacts', { role }));
      await appel(messagerie, 'messagerie', 'envoyer_mail', {
        a: [contact.email], objet: confidentiel ? 'Note à traiter' : `Arrivée annoncée (${role})`,
        corps: confidentiel ? 'Une note sensible est à consulter.' : `Bonjour, une arrivée est annoncée : ${note.contenu}`, note_id: noteId,
      });
      prevenus.push(role);
    }
    await appel(appliRh, 'appli-rh', 'annoter_note', {
      id: noteId, type_detecte: type, resume: confidentiel ? 'Sujet sensible transmis aux RH.' : `Note interprétée comme : ${type}.`,
      personnes_prevenues: prevenus, confidentiel,
    });
    await appliRh.close(); await messagerie.close();
    return { stopReason: 'end_turn' };
  });

appli.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
