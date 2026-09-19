const test = require('node:test');
const assert = require('node:assert/strict');
const { trustedOrigins } = require('../origins');

test('configured origins are normalized without allowing wildcards', () => {
  assert.deepEqual(trustedOrigins({ PUBLIC_ORIGIN: 'https://api.example.com/',
    CORS_ORIGINS: 'https://web.example.com/, https://web.example.com' }),
  ['https://api.example.com', 'https://web.example.com']);
  assert.throws(() => trustedOrigins({ CORS_ORIGINS: '*' }));
});

test('preflight bypasses authentication and login remains public', async t => {
  process.env.CORS_ORIGINS = 'https://web.example.com/';
  process.env.PUBLIC_ORIGIN = 'https://api.example.com';
  const { app } = require('../server');
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = 'https://web.example.com';
  for (const path of ['/api/auth/login', '/api/contracts', '/api/audit']) {
    const response = await fetch(base + path, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET,POST,PUT,DELETE,OPTIONS');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type,Authorization');
    assert.equal(await response.text(), '');
  }
  const rejected = await fetch(base + '/api/contracts', { method: 'OPTIONS',
    headers: { Origin: 'https://untrusted.example.com', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  const login = await fetch(base + '/api/auth/login', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(login.status, 400);
  assert.equal((await login.json()).error, 'Invalid credentials format');
  assert.equal(login.headers.get('access-control-allow-origin'), origin);
  const protectedResponse = await fetch(base + '/api/contracts', { headers: { Origin: origin } });
  assert.equal(protectedResponse.status, 401);
  assert.equal(protectedResponse.headers.get('access-control-allow-origin'), origin);
});
