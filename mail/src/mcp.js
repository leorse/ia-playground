import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as store from './store.js';

const texte = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });

export function creerServeurMcp(journaliser = () => {}) {
  const s = new McpServer({ name: 'messagerie', version: '0.1.0' }, {
    instructions: "Messagerie de l'équipe (simulée : les mails s'affichent dans un client web). À utiliser pour prévenir des personnes.",
  });

  s.registerTool('envoyer_mail', {
    description: "Envoie un mail (simulé). À utiliser pour prévenir une ou plusieurs personnes. Un mail par destinataire ou groupe de destinataires partageant le même message : adapte le contenu à chacun. Le corps est du HTML simple (<p>, <ul><li>, <strong>, <table>…) ; du texte brut est aussi accepté. Passe note_id pour rattacher le mail à la note traitée.",
    inputSchema: {
      a: z.array(z.string()).min(1).describe('Adresses des destinataires (obtenues via lister_contacts)'),
      cc: z.array(z.string()).optional(),
      objet: z.string(),
      corps: z.string().describe('HTML simple ou texte brut'),
      note_id: z.string().optional().describe('Ex. N-0012'),
    },
  }, async (p) => {
    try {
      const m = store.envoyer(p);
      journaliser({ outil: 'envoyer_mail', mail: store.resume(m) });
      return texte({ envoye: true, id: m.id, fichier: m.fichier });
    } catch (e) {
      if (!(e instanceof store.ErreurMail)) throw e;
      return { isError: true, content: [{ type: 'text', text: e.message }] };
    }
  });

  s.registerTool('lister_mails_envoyes', {
    description: 'Liste les mails déjà envoyés pour une note, pour éviter les doublons avant d\'en envoyer un nouveau.',
    inputSchema: { note_id: z.string() },
  }, async ({ note_id }) => texte(store.parNote(note_id)));

  return s;
}
