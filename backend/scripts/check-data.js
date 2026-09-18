const {pool,initSchema}=require('../db');
(async()=>{
 await initSchema();
 const {rows}=await pool.query(`SELECT c.id,c.contract_name,
  c.baseline_needs_review,
  (c.contract_name IS NULL OR length(btrim(c.contract_name))=0) AS invalid_name,
  (c.status IS NULL OR c.status NOT IN ('Upcoming renewal','Negotiation in progress','Renewed','Expired/Not renewed')) AS invalid_status,
  (c.contract_type IS NULL OR c.contract_type NOT IN ('Master','Amendment','Addendum')) AS invalid_type,
  (c.cost_amount<0 OR c.cost_amount>9007199254740991) AS invalid_amount,
  (c.start_date>c.end_date) AS invalid_dates,
  ((c.contract_type='Master' AND c.parent_contract_id IS NOT NULL) OR
   (c.contract_type IN ('Amendment','Addendum') AND (p.id IS NULL OR p.contract_type<>'Master' OR c.id=p.id))) AS invalid_parent
 FROM contracts c LEFT JOIN contracts p ON p.id=c.parent_contract_id`);
 const issues=rows.filter(r=>Object.entries(r).some(([k,v])=>k!=='id'&&k!=='contract_name'&&v===true));
 console.table(issues);console.log(`${issues.length} contracts need review`);
 if(issues.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
