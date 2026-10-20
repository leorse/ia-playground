import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const racine = fileURLToPath(new URL('..', import.meta.url));
const envFile = resolve(racine, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const e = process.env;
const chemin = (v, defaut) => resolve(racine, v || defaut);

export const config = {
  port: Number(e.PORT || 4000),
  webhookSecret: e.WEBHOOK_SECRET || 'demo-secret-zzzz',
  appMcpUrl: e.APP_MCP_URL || 'http://localhost:3000/mcp',
  appMcpToken: e.APP_MCP_TOKEN || 'demo-agent-yyyy',
  messagerieToken: e.MESSAGERIE_TOKEN || 'demo-mail-wwww',
  copilotBin: e.COPILOT_BIN || 'copilot',
  // Filtres d'outils : voir README (agent) ; à ajuster selon la version de Copilot CLI
  copilotArgs: (e.COPILOT_ARGS || '--acp --stdio').split(/\s+/).filter(Boolean),
  workspaceDir: chemin(e.WORKSPACE_DIR, './workspace'),
  outboxDir: chemin(e.OUTBOX_DIR, './outbox'),
  sessionTimeoutMs: Number(e.SESSION_TIMEOUT_S || 180) * 1000,
};
