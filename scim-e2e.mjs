// SCIM E2E validation for IBM Verify. Reads creds from pwmgr, never prints secret.
import { execSync } from 'node:child_process';

const TENANT = 'https://YOUR-TENANT.verify.ibm.com';
const PW = 'C:/Users/fabia/OneDrive/Escritorio/pwmgr/cli.mjs';
const get = (k) => execSync(`node "${PW}" get ${k}`, { encoding: 'utf8' }).trim();

const CLIENT_ID = get('api-client-id');
const CLIENT_SECRET = get('api-client-secret');
const log = (...a) => console.log(...a);

function mask(s){ return s ? `len=${s.length}` : 'EMPTY'; }
log('creds: id=', CLIENT_ID, 'secret=', mask(CLIENT_SECRET));

async function main() {
  // 1) token
  const body = new URLSearchParams({ grant_type:'client_credentials', client_id:CLIENT_ID, client_secret:CLIENT_SECRET, scope:'openid' });
  const tr = await fetch(`${TENANT}/v1.0/endpoint/default/token`, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body
  });
  const tj = await tr.json().catch(()=>({}));
  if(!tr.ok){ log('TOKEN FAIL', tr.status, JSON.stringify(tj).slice(0,300)); process.exit(2); }
  const token = tj.access_token;
  log('TOKEN OK status', tr.status, 'token', token?('len='+token.length):'MISSING');
  const H = { 'Authorization':`Bearer ${token}`, 'Content-Type':'application/scim+json', 'Accept':'application/scim+json' };

  const emails = ['pike.test1@example.com','pike.test2@example.com'];
  const created = [];
  for(const em of emails){
    const payload = {
      schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: em,
      name:{ givenName:'Pike', familyName:'Test' },
      emails:[{ value:em, type:'work', primary:true }],
      active:true
    };
    const r = await fetch(`${TENANT}/v2.0/Users`, { method:'POST', headers:H, body:JSON.stringify(payload) });
    const j = await r.json().catch(()=>({}));
    log(`CREATE ${em} -> status ${r.status} id=${j.id||'-'} ${r.ok?'':JSON.stringify(j).slice(0,200)}`);
    if(r.status===201 && j.id) created.push(j.id);
  }

  // GET confirm
  for(const id of created){
    const r = await fetch(`${TENANT}/v2.0/Users/${id}`, { headers:H });
    const j = await r.json().catch(()=>({}));
    log(`GET ${id} -> status ${r.status} userName=${j.userName||'-'}`);
  }

  // DELETE cleanup
  let delOk=0;
  for(const id of created){
    const r = await fetch(`${TENANT}/v2.0/Users/${id}`, { method:'DELETE', headers:H });
    log(`DELETE ${id} -> status ${r.status}`);
    if(r.status===204 || r.status===200) delOk++;
  }

  log(`RESULT created=${created.length}/2 deleted=${delOk}/${created.length}`);
  process.exit(created.length===2 && delOk===created.length ? 0 : 3);
}
main().catch(e=>{ log('ERR', e.message); process.exit(9); });
