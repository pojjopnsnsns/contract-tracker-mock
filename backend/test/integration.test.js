const test=require('node:test');const assert=require('node:assert/strict');
const enabled=Boolean(process.env.TEST_DATABASE_URL);
// Use a dedicated disposable database, never a production database.
if(enabled)process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
test('API authentication, hierarchy, renewal cycles, audit and per-user reads',{skip:!enabled},async t=>{
 const {pool,initSchema}=require('../db');const {hashPassword}=require('../auth');
 const {app}=require('../server');await initSchema();await initSchema();
 const suffix=Date.now();
 for(const role of ['admin','editor','viewer'])await pool.query('INSERT INTO app_users(username,password_hash,role) VALUES($1,$2,$3)',[`${role}${suffix}`,await hashPassword('test-only-password-123'),role]);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=`http://127.0.0.1:${server.address().port}`;const origin='http://localhost:4000';
 t.after(async()=>{await new Promise(r=>server.close(r));await pool.end();});
 async function request(method,path,body,cookie,customOrigin=origin){
   const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:customOrigin,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   return {status:r.status,data:r.status===204?null:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 assert.equal((await request('GET','/api/contracts')).status,401);
 const cookies={};for(const role of ['admin','editor','viewer']){
   const r=await request('POST','/api/auth/login',{username:`${role}${suffix}`,password:'test-only-password-123'});assert.equal(r.status,200);cookies[role]=r.cookie;
 }
 assert.equal((await request('POST','/api/contracts',{contract_name:'blocked'},cookies.viewer)).status,403);
 assert.equal((await request('POST','/api/CONTRACTS',{contract_name:'blocked',end_date:'2028-01-01'},cookies.viewer)).status,403);
 assert.equal((await request('GET','/api/AUDIT',undefined,cookies.viewer)).status,403);
 assert.equal((await request('POST','/api/contracts',{},cookies.admin,'https://evil.invalid')).status,403);
 async function create(body){const r=await request('POST','/api/contracts',{contract_name:'test',end_date:'2028-01-01',...body},cookies.editor);assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
 const master=await create({contract_name:'Original Master'});
 const child=await create({contract_name:'Child',contract_type:'Amendment',parent_contract_id:master.id,end_date:'2029-01-01',status:'Negotiation in progress'});
 assert.equal((await request('GET',`/api/contracts/${master.id}`,undefined,cookies.viewer)).data.end_date,'2029-01-01');
 assert.equal((await request('DELETE',`/api/contracts/${master.id}`,undefined,cookies.admin)).status,409);
 assert.equal((await request('DELETE',`/api/contracts/${child.id}`,undefined,cookies.editor)).status,403);
 assert.equal((await request('DELETE',`/api/contracts/${child.id}`,undefined,cookies.admin)).status,204);
 let restored=(await request('GET',`/api/contracts/${master.id}`,undefined,cookies.admin)).data;
 assert.equal(restored.end_date,'2028-01-01');assert.equal(restored.status,'Upcoming renewal');
 const second=await create({contract_name:'Other Master',end_date:'2030-01-01'});
 const moving=await create({contract_type:'Addendum',parent_contract_id:master.id,end_date:'2029-06-01'});
 assert.equal((await request('PUT',`/api/contracts/${moving.id}`,{parent_contract_id:second.id},cookies.editor)).status,200);
 assert.equal((await request('GET',`/api/contracts/${master.id}`,undefined,cookies.admin)).data.end_date,'2028-01-01');
 assert.equal((await request('GET',`/api/contracts/${second.id}`,undefined,cookies.admin)).data.end_date,'2029-06-01');
 assert.equal((await request('PUT',`/api/contracts/${second.id}`,{end_date:'2031-01-01'},cookies.editor)).status,409);
 assert.equal((await request('POST','/api/contracts',{contract_name:'bad',contract_type:'Amendment',parent_contract_id:moving.id,end_date:'2030-01-01'},cookies.editor)).status,400);
 const soon=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 const alert=await create({contract_name:'Alert contract',end_date:soon});
 await request('GET','/api/notifications',undefined,cookies.viewer);await request('GET','/api/notifications',undefined,cookies.admin);
 let counts=(await pool.query("SELECT count(*)::int AS count FROM notification_log WHERE contract_id=$1 AND channel='app'",[alert.id])).rows[0].count;
 assert.equal(counts,4);
 let list=(await request('GET','/api/notifications',undefined,cookies.viewer)).data;
 const notification=list.find(n=>n.contract_id===alert.id);assert(notification);
 await request('POST',`/api/notifications/${notification.id}/seen`,{},cookies.viewer);
 assert.equal((await request('GET','/api/notifications',undefined,cookies.viewer)).data.find(n=>n.id===notification.id).seen,true);
 assert.equal((await request('GET','/api/notifications',undefined,cookies.admin)).data.find(n=>n.id===notification.id).seen,false);
 await request('PUT',`/api/contracts/${alert.id}`,{status:'Renewed'},cookies.editor);
 assert(!(await request('GET','/api/notifications',undefined,cookies.viewer)).data.some(n=>n.contract_id===alert.id));
 await request('PUT',`/api/contracts/${alert.id}`,{status:'Upcoming renewal'},cookies.editor);
 await request('GET','/api/notifications',undefined,cookies.viewer);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM notification_log WHERE contract_id=$1 AND channel='app'",[alert.id])).rows[0].count,8);
 assert.equal((await request('GET','/api/audit',undefined,cookies.viewer)).status,403);
 const audit=(await request('GET',`/api/audit?contract_id=${master.id}`,undefined,cookies.admin)).data;
 assert(audit.some(a=>a.actor_name===`editor${suffix}`));assert(audit.some(a=>a.actor_name===`admin${suffix}`));
 await pool.query('UPDATE contracts SET baseline_needs_review=true WHERE id=$1',[second.id]);
 assert.equal((await request('DELETE',`/api/contracts/${moving.id}`,undefined,cookies.admin)).status,409);
 assert.equal((await request('PUT',`/api/contracts/${second.id}/baseline`,{original_end_date:'2030-01-01',original_status:'Upcoming renewal'},cookies.admin)).status,200);
 assert.equal((await request('DELETE',`/api/contracts/${moving.id}`,undefined,cookies.admin)).status,204);
 assert.equal((await request('GET',`/api/contracts/${second.id}`,undefined,cookies.admin)).data.end_date,'2030-01-01');
 await request('POST','/api/auth/logout',{},cookies.viewer);
 assert.equal((await request('GET','/api/contracts',undefined,cookies.viewer)).status,401);
 await assert.rejects(pool.query("INSERT INTO contracts(contract_name,contract_type,end_date,status,parent_contract_id) VALUES('invalid','Amendment','2030-01-01','Renewed',$1)",[99999999]));
});
