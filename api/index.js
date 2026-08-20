module.exports = async function handler(req, res) {
  const server = await import('../dist/server/server.mjs');
  return server.reqHandler(req, res);
}
