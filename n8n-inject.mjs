// Inject SCIM creds into n8n credential + activate workflow. No secrets printed.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const mcp = JSON.parse(readFileSync(`${os.homedir()}/.pi/agent/mcp.json`, 'utf8'));
const srv = (mcp.mcpServers || mcp).n8n;
const envp = srv.env || {};
let API = (envp.N8N_API_URL || '').replace(/\/$/, '');
const KEY = envp.N8N_API_KEY;
if (!API.endsWith('/api/v1')) API = API + (API.includes('/api/') ? '' : '/api/v1');
const PW = 'C:/Users/fabia/OneDrive/Escritorio/pwmgr/cli.mjs';
const get = (k) => execSync(`node "${PW}" get ${k}`, { encoding: 'utf8' }).trim();
const CLIENT_ID = get('api-client-id');
const CLIENT_SECRET = get('api-client-secret');

const CRED_ID = 'lRgURi90b9DGfmjD';
const WF_ID = 'HqNhDPFlJEKh5Z2t';
const H = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };
const log = (...a) => console.log(...a);
log('n8n API base:', API);

async function j(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, data: d };
}

async function main() {
  // Check current credential (GET won't return data values)
  const c = await j('GET', `/credentials/schema/httpCustomAuth`).catch(()=>({}));
  log('schema check status', c.status);

  // Update credential data via PATCH (supported on this n8n version)
  const credBody = {
    name: 'IBM Verify - Client Credentials (SCIM)',
    type: 'httpCustomAuth',
    data: { json: JSON.stringify({ body: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET } }) }
  };
  let cu = await j('PATCH', `/credentials/${CRED_ID}`, credBody);
  log('PATCH credential status', cu.status, cu.ok ? 'OK name='+(cu.data&&cu.data.name) : JSON.stringify(cu.data).slice(0,200));

  // Try activate (will fail for manual-trigger-only workflows — expected)
  let act = await j('POST', `/workflows/${WF_ID}/activate`);
  log('ACTIVATE status', act.status, act.ok ? 'OK' : (act.data&&act.data.message||'').slice(0,120));

  // Confirm workflow active state
  let wf = await j('GET', `/workflows/${WF_ID}`);
  log('WF active =', wf.data && wf.data.active, 'name=', wf.data && wf.data.name);
}
main().catch(e => { log('ERR', e.message); process.exit(9); });
