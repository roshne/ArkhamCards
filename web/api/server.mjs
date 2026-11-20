// Per-user saved state for the web build (see web/README.md). Cloudflare Access sits in front and
// signs every request it lets through (Cf-Access-Jwt-Assertion); the signature, audience, issuer
// and expiry are checked here before the email in it is trusted. Each user's data is a set of
// keys (redux-persist slices), each stored as one JSON file with a version number, so a client
// writing over a newer copy gets 409 instead of silently replacing it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const KEY_RE = /^[A-Za-z0-9_:-][A-Za-z0-9_.:-]{0,99}$/;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function base64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Returns a function that verifies an Access JWT and resolves to its claims, or throws.
export function accessVerifier({ teamDomain, audience, fetchJwks, now = () => Date.now() }) {
  let keys = new Map();
  let attemptedAt = -Infinity;
  let inflight = null;
  // At most one fetch at a time and one every 10 s, so a burst of unknown key ids can't turn into
  // a burst of fetches; Cloudflare rotates keys rarely.
  const refresh = () => {
    if (inflight || now() - attemptedAt < 10_000) {
      return inflight || Promise.resolve();
    }
    attemptedAt = now();
    inflight = fetchJwks(`https://${teamDomain}/cdn-cgi/access/certs`)
      .then((jwks) => {
        keys = new Map(jwks.keys.map((jwk) => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })]));
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
  return async(token) => {
    const parts = (token || '').split('.');
    if (parts.length !== 3) {
      throw new Error('malformed token');
    }
    const header = base64urlJson(parts[0]);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new Error('unexpected token algorithm');
    }
    if (!keys.has(header.kid)) {
      await refresh();
    }
    const key = keys.get(header.kid);
    if (!key) {
      throw new Error('unknown signing key');
    }
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!crypto.verify('RSA-SHA256', signed, key, Buffer.from(parts[2], 'base64url'))) {
      throw new Error('bad signature');
    }
    const claims = base64urlJson(parts[1]);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const nowSeconds = now() / 1000;
    if (!aud.includes(audience)) {
      throw new Error('wrong audience');
    }
    if (claims.iss !== `https://${teamDomain}`) {
      throw new Error('wrong issuer');
    }
    if (typeof claims.exp !== 'number' || claims.exp < nowSeconds - 30) {
      throw new Error('expired');
    }
    return claims;
  };
}

// An oversized body is drained, not kept, so the client still gets its 413. nginx caps uploads
// at 25 MB before they reach here.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => (size > limit ?
      reject(Object.assign(new Error('too large'), { status: 413 })) :
      resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

// The app saves about 13 keys; the caps keep one account from filling the VM's small disk.
export function createHandler({
  dataDir, verify, maxBytes = 25 * 1024 * 1024, maxKeys = 50, maxUserBytes = 200 * 1024 * 1024,
}) {
  const userDir = (email) =>
    path.join(dataDir, crypto.createHash('sha256').update(email.toLowerCase()).digest('hex'));

  const handle = async(req, res) => {
    const url = new URL(req.url, 'http://api');
    if (url.pathname === '/api/healthz') {
      send(res, 200, { ok: true });
      return;
    }
    let claims;
    try {
      claims = await verify(req.headers['cf-access-jwt-assertion']);
    } catch (e) {
      send(res, 401, { error: `not signed in: ${e.message}` });
      return;
    }
    if (typeof claims.email !== 'string' || !claims.email) {
      // A service token passes Access but is nobody's account.
      send(res, 403, { error: 'no user identity' });
      return;
    }
    if (url.pathname === '/api/me' && req.method === 'GET') {
      // hasData lets the client move a browser's older data only into an account with none.
      const dir = userDir(claims.email);
      const hasData = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.json'));
      send(res, 200, { email: claims.email, hasData });
      return;
    }
    const match = url.pathname.match(/^\/api\/state\/([^/]+)$/);
    if (!match) {
      send(res, 404, { error: 'not found' });
      return;
    }
    const key = decodeURIComponent(match[1]);
    if (!KEY_RE.test(key)) {
      send(res, 400, { error: 'invalid key' });
      return;
    }
    const dir = userDir(claims.email);
    // Encoded: keys contain ':', which Windows file names can't.
    const file = path.join(dir, `${encodeURIComponent(key)}.json`);
    const current = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

    if (req.method === 'GET') {
      const stored = current();
      if (stored) {
        send(res, 200, stored);
      } else {
        send(res, 404, { error: 'no value' });
      }
      return;
    }
    if (req.method === 'PUT') {
      let body;
      try {
        body = JSON.parse(await readBody(req, maxBytes));
      } catch (e) {
        send(res, e.status || 400, { error: e.status ? 'value too large' : 'invalid JSON' });
        return;
      }
      if (typeof body.value !== 'string' || !(body.version === null || Number.isInteger(body.version))) {
        send(res, 400, { error: 'expected { value: string, version: integer | null }' });
        return;
      }
      // Synchronous from here on: no other request can run between the check and the write.
      const stored = current();
      const version = stored ? stored.version : null;
      if (body.version !== version) {
        send(res, 409, { error: 'changed elsewhere', version });
        return;
      }
      fs.mkdirSync(dir, { recursive: true });
      const others = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && path.join(dir, f) !== file);
      const otherBytes = others.reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
      if (others.length >= maxKeys || otherBytes + Buffer.byteLength(body.value) > maxUserBytes) {
        send(res, 507, { error: 'account storage is full' });
        return;
      }
      const next = { value: body.value, version: (version || 0) + 1 };
      // Write, flush and rename, so a crash leaves either the old file or the new one.
      const tmp = `${file}.${process.pid}.tmp`;
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeSync(fd, JSON.stringify(next));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, file);
      send(res, 200, { version: next.version });
      return;
    }
    // No DELETE: redux-persist only removes keys on purge(), which the app never calls, and
    // deleting would restart a key's version count.
    send(res, 405, { error: 'method not allowed' });
  };
  return (req, res) => handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) {
      send(res, 500, { error: 'internal error' });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, DATA_DIR = '/data', PORT = '8080' } = process.env;
  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD) {
    console.error('ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set');
    process.exit(1);
  }
  const verify = accessVerifier({
    teamDomain: ACCESS_TEAM_DOMAIN,
    audience: ACCESS_AUD,
    fetchJwks: async(url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        throw new Error(`fetching signing keys failed: HTTP ${response.status}`);
      }
      return response.json();
    },
  });
  const handler = createHandler({ dataDir: DATA_DIR, verify });
  http.createServer(handler).listen(Number(PORT), () => console.log(`state api on :${PORT}, data in ${DATA_DIR}`));
}
