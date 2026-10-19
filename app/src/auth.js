import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tokens = JSON.parse(readFileSync(fileURLToPath(new URL('../config/tokens.json', import.meta.url)), 'utf8'));

export function identifier(req) {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  return m ? tokens[m[1]] || null : null;
}

export const aLeDroit = (client, droit) => client.droits.includes(droit);
