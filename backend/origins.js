function trustedOrigins(env = process.env) {
  const values = [env.PUBLIC_ORIGIN || 'http://localhost:4000',
    ...(env.CORS_ORIGINS || 'http://localhost:5173').split(',')];
  return [...new Set(values.filter(value => value.trim()).map(value => {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid configured origin');
    return url.origin;
  }))];
}
module.exports = { trustedOrigins };
