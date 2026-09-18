const {pool,initSchema}=require('../db');
const {hashPassword}=require('../auth');
async function main(){
  const [command,usernameArg,role]=process.argv.slice(2);
  const username=(usernameArg || '').toLowerCase();
  if(!/^[a-z0-9._-]{3,100}$/.test(username))throw Error('Username: 3–100 characters (a-z, 0-9, dot, underscore, dash)');
  await initSchema();
  if(command==='create'){
    if(!['admin','editor','viewer'].includes(role))throw Error('Role must be admin, editor or viewer');
    const hash=await hashPassword(process.env.USER_PASSWORD);
    await pool.query('INSERT INTO app_users(username,password_hash,role) VALUES($1,$2,$3)',[username,hash,role]);
  }else if(command==='password'){
    const hash=await hashPassword(process.env.USER_PASSWORD);
    const client=await pool.connect();
    try{await client.query('BEGIN');const {rows}=await client.query('UPDATE app_users SET password_hash=$1 WHERE username=$2 RETURNING id',[hash,username]);
      if(!rows.length)throw Error('User not found');
      await client.query('DELETE FROM auth_sessions WHERE user_id=$1',[rows[0].id]);await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }else if(command==='disable'){
    const {rowCount}=await pool.query('UPDATE app_users SET active=false WHERE username=$1',[username]);if(!rowCount)throw Error('User not found');
  }else throw Error('Usage: npm run user -- create <username> <role> | password <username> | disable <username>');
  console.log('User updated:',username);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
