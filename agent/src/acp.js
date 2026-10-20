import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { traiterDemande, memoriserTitre } from './autorisations.js';
import { trace } from './console.js';

/** Lance Copilot CLI en mode ACP et renvoie le flux ndjson sur stdin/stdout. */
export function lancerCopilot({ bin, args, cwd }) {
  const enfant = spawn(bin, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: process.platform === 'win32', // copilot est un .cmd sous Windows
  });
  const termine = new Promise((resolve) => enfant.on('exit', resolve));
  enfant.on('error', (e) => trace.erreur(`Impossible de lancer ${bin} : ${e.message}`));
  return {
    cible: acp.ndJsonStream(Writable.toWeb(enfant.stdin), Readable.toWeb(enfant.stdout)),
    termine,
    arreter: () => enfant.kill(),
  };
}

const texteDe = (contenu) => (contenu ?? []).map((c) => c?.content?.text ?? c?.text ?? '').filter(Boolean).join(' ');

export function promptNote({ noteId, auteur, date = new Date() }) {
  return `Nous sommes le ${date.toISOString().slice(0, 10)}. Une nouvelle note vient d'être publiée dans l'application RH : ${noteId} (auteur : ${auteur}). ` +
    'Lis-la, interprète-la selon le skill routage-notes, prévient les bonnes personnes par mail, puis annote la note.';
}

/**
 * Client ACP : pilote un agent (Copilot CLI) et ouvre une session par note.
 * `lancer()` renvoie { cible, termine, arreter } ; `cible` est un flux ACP (ou une AgentApp en test).
 */
export function creerClientAcp({ lancer, serveursMcp, workspaceDir, timeoutMs, rapport = { activite() {} } }) {
  let processus = null;
  let connexion = null;

  async function assurerConnexion() {
    if (connexion) return connexion;
    const app = acp.client({ name: 'orchestrateur' })
      .onRequest(acp.methods.client.session.requestPermission, ({ params }) => traiterDemande(params));
    processus = lancer();
    const c = app.connect(processus.cible);
    c.closed.then(() => { if (connexion === c) { trace.erreur('Connexion ACP fermée'); connexion = null; } });
    try {
      const init = await c.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'orchestrateur-demo', version: '0.1.0' },
      });
      trace.info(`ACP initialisé (agent : ${init.agentInfo?.name ?? 'inconnu'} ${init.agentInfo?.version ?? ''})`);
    } catch (e) {
      c.close(e); processus.arreter?.(); processus = null;
      throw e;
    }
    connexion = c;
    return c;
  }

  async function traiterNote({ noteId, auteur }) {
    trace.note(noteId);
    const c = await assurerConnexion();
    const session = await c.agent.buildSession({ cwd: workspaceDir, mcpServers: serveursMcp }).start();
    let delaiDepasse = false;
    const minuteur = setTimeout(() => {
      delaiDepasse = true;
      trace.erreur(`Délai dépassé (${timeoutMs / 1000} s) : annulation de la session`);
      c.agent.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId }).catch(() => {});
    }, timeoutMs);

    session.prompt(promptNote({ noteId, auteur })).catch((e) => trace.erreur(`Erreur de prompt : ${e.message}`));
    let arret = 'inconnu';
    try {
      for (;;) {
        const m = await session.nextUpdate();
        if (m.kind === 'stop') { arret = m.stopReason; break; }
        afficher(m.update, (texte) => rapport.activite(noteId, texte));
      }
    } finally {
      clearTimeout(minuteur);
      session.dispose();
    }
    process.stdout.write('\n');
    trace.info(`Note ${noteId} terminée (${delaiDepasse ? 'délai dépassé' : arret})`);
    return { stopReason: arret, delaiDepasse };
  }

  return {
    traiterNote,
    arreter() { connexion?.close(); processus?.arreter?.(); connexion = null; },
  };
}

function afficher(u, signaler) {
  switch (u.sessionUpdate) {
    case 'agent_message_chunk': if (u.content?.type === 'text') trace.agent(u.content.text); break;
    case 'tool_call': memoriserTitre(u.toolCallId, u.title); process.stdout.write('\n'); trace.outil(u.title, u.rawInput); signaler(`🔧 ${u.title}`); break;
    case 'tool_call_update':
      if (u.status === 'completed' || u.status === 'failed') {
        trace.resultat(u.status, texteDe(u.content) || JSON.stringify(u.rawOutput ?? ''));
        if (u.status === 'failed') signaler(`⚠ outil en échec : ${u.title ?? u.toolCallId}`);
      }
      break;
    default: break;
  }
}
