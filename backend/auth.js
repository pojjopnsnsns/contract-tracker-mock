const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const { trustedOrigins } = require('./origins');
const digest = value => createHash('sha256').update(value).digest('hex');
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Password must contain 12–256 characters');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const actual = await derive(password, salt, 64);
  const expected = Buffer.from(hex,'hex');
  return expected.length === actual.length && timingSafeEqual(expected,actual);
}
function installAuth(app, pool, ah) {
  const sameSite = process.env.SESSION_COOKIE_SAMESITE || 'strict';
  if (!['strict', 'lax', 'none'].includes(sameSite)) throw new Error('Invalid SESSION_COOKIE_SAMESITE');
  const cookieOptions = { httpOnly:true, sameSite, secure:sameSite==='none' || process.env.NODE_ENV==='production', path:'/' };
  const trusted = new Set(trustedOrigins());
  function originAllowed(req) { return req.get('Origin') && trusted.has(req.get('Origin')); }
  app.post('/api/auth/login', ah(async(req,res)=>{
    if (!originAllowed(req)) return res.status(403).json({error:'Untrusted or missing Origin'});
    const {username,password} = req.body || {};
    if (typeof username!=='string' || username.length>100 || typeof password!=='string' || password.length>256) {
      return res.status(400).json({error:'Invalid credentials format'});
    }
    // Database-backed attempt counters work across multiple API processes.
    const keys = [`ip:${digest(req.ip || 'unknown')}`,`user:${digest(username.toLowerCase())}`];
    for (const key of keys) {
      const {rows} = await pool.query(`INSERT INTO auth_attempts(bucket,failures,expires_at)
        VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET
        failures=CASE WHEN auth_attempts.expires_at<now() THEN 1 ELSE auth_attempts.failures+1 END,
        expires_at=CASE WHEN auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.expires_at END
        RETURNING failures`,[key]);
      if (rows[0].failures>20) return res.status(429).json({error:'Too many login attempts; retry in 15 minutes'});
    }
    const {rows} = await pool.query('SELECT * FROM app_users WHERE username=$1 AND active=true',[username.toLowerCase()]);
    const user=rows[0];
    const fallback = '0'.repeat(32)+':'+ '0'.repeat(128);
    const valid = await verifyPassword(password,user?.password_hash || fallback);
    if (!user || !valid) return res.status(401).json({error:'Invalid username or password'});
    const token=randomBytes(32).toString('hex');
    await pool.query('DELETE FROM auth_sessions WHERE expires_at<now()');
    await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[digest(token),user.id]);
    // Do not echo the token into JSON or browser storage.
    res.cookie('contract_session',token,{...cookieOptions,maxAge:8*60*60*1000});
    res.json({user:{id:user.id,username:user.username,role:user.role}});
  }));
  app.use('/api',ah(async(req,res,next)=>{
    if (req.method==='OPTIONS' || req.path==='/health' ||
        (req.method==='POST' && /^\/auth\/login\/?$/i.test(req.path))) return next();
    const cookie=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('contract_session='));
    const token=cookie?.slice('contract_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({error:'Login required',login_url:'/login'});
    const {rows}=await pool.query(`SELECT u.id,u.username,u.role FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[digest(token)]);
    if (!rows.length) return res.status(401).json({error:'Session expired',login_url:'/login'});
    req.user=rows[0];req.sessionHash=digest(token);
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !originAllowed(req)) return res.status(403).json({error:'Untrusted or missing Origin'});
    next();
  }));
  app.get('/api/auth/me',(req,res)=>res.json({user:req.user}));
  app.post('/api/auth/logout',ah(async(req,res)=>{
    await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[req.sessionHash]);
    res.clearCookie('contract_session',cookieOptions).json({ok:true});
  }));
  // Read/seen actions are allowed for all authenticated users.
  app.use('/api',(req,res,next)=>{
    if (req.method==='OPTIONS') return next();
    // Express routes are case-insensitive by default; permission checks must match.
    const routePath = req.path.toLowerCase();
    const adminOnly = req.method==='DELETE' || routePath.startsWith('/audit') || routePath.startsWith('/notify/') || routePath.includes('/baseline');
    const contractWrite = routePath.startsWith('/contracts') && !['GET','HEAD'].includes(req.method);
    if ((adminOnly && req.user?.role!=='admin') || (contractWrite && !['admin','editor'].includes(req.user?.role))) {
      return res.status(403).json({error:'Insufficient permissions'});
    }
    next();
  });
}
module.exports={installAuth,hashPassword,verifyPassword};
