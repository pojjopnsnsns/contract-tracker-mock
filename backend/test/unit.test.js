const test=require('node:test');const assert=require('node:assert/strict');
const {daysUntil,alertLevel}=require('../alerts');
const {hashPassword,verifyPassword}=require('../auth');
test('Bangkok date and threshold boundaries, independent of server timezone',()=>{
 const now=new Date('2026-09-18T18:00:00Z');
 assert.equal(daysUntil('2026-09-19',now),0);
 assert.equal(daysUntil('2026-09-18',now),-1);
 assert.equal(daysUntil('2026-02-30',now),null);
 for(const [days,level] of [[-1,'overdue'],[0,'critical'],[30,'critical'],[31,'urgent'],[60,'urgent'],[61,'warning'],[90,'warning'],[91,'ok']]){
   const date=new Date(Date.UTC(2026,8,19+days)).toISOString().slice(0,10);
   assert.equal(alertLevel({end_date:date,status:'Upcoming renewal'},now).level,level);
 }
 assert.equal(alertLevel({end_date:'2026-09-18',status:'Renewed'},now).level,'ok');
 assert.equal(alertLevel({end_date:'2026-09-18',status:'Expired/Not renewed'},now).level,'ok');
});
test('Salted password hashes and verification',async()=>{
 const password='test-only-password-123';const first=await hashPassword(password),second=await hashPassword(password);
 assert.notEqual(first,second);assert(await verifyPassword(password,first));assert.equal(await verifyPassword('incorrect',first),false);
 await assert.rejects(hashPassword('short'));
});
