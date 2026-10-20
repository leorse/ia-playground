// Lance application, messagerie et agent autonome ensemble, avec une sortie préfixée.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const services = [
  { nom: 'app    ', dossier: 'app', couleur: 36 },
  { nom: 'mail   ', dossier: 'mail', couleur: 35 },
  { nom: 'agent  ', dossier: 'agent', couleur: 33 },
];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const enfants = services.map(({ nom, dossier, couleur }) => {
  const p = spawn(npm, ['--prefix', dossier, 'start'], { cwd: racine, shell: process.platform === 'win32' });
  const prefixe = (flux) => (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => flux.write(`\x1b[${couleur}m${nom}|\x1b[0m ${l}\n`));
  p.stdout.on('data', prefixe(process.stdout));
  p.stderr.on('data', prefixe(process.stderr));
  p.on('exit', (code) => console.log(`${nom}| arrêté (code ${code})`));
  return p;
});
console.log('Interface : http://localhost:3000   ·   Messagerie : http://localhost:5000   ·   Ctrl+C pour tout arrêter');
const arreter = () => { enfants.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
