// Run: node --test web/api
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { accessVerifier, createHandler } from './server.mjs';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'test-aud';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };

function sign(claims, { kid = 'k1', alg = 'RS256', key = privateKey } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg, kid, typ: 'JWT' })}.${enc(claims)}`;
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
}
const claimsFor = (email, extra = {}) => ({
  aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 3600, email, ...extra,
});

let server;
let base;
let dataDir;
before(async() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-api-'));
  const verify = accessVerifier({ teamDomain: TEAM, audience: AUD, fetchJwks: async() => ({ keys: [jwk] }) });
  const handler = createHandler({ dataDir, verify, maxBytes: 1000 });
  server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const call = (pathname, { token, method = 'GET', body } = {}) => fetch(`${base}${pathname}`, {
  method,
  headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('identifies the signed-in user', async() => {
  const res = await call('/api/me', { token: sign(claimsFor('ann@example.com')) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { email: 'ann@example.com' });
});

test('rejects tokens that are missing, forged, expired, for another app or another issuer', async() => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const bad = {
    missing: undefined,
    forged: sign(claimsFor('ann@example.com'), { key: other }),
    expired: sign(claimsFor('ann@example.com', { exp: Math.floor(Date.now() / 1000) - 120 })),
    otherApp: sign(claimsFor('ann@example.com', { aud: ['other-aud'] })),
    otherIssuer: sign(claimsFor('ann@example.com', { iss: 'https://evil.example' })),
    unknownKey: sign(claimsFor('ann@example.com'), { kid: 'nope' }),
    noneAlg: sign(claimsFor('ann@example.com'), { alg: 'none' }),
  };
  for (const [name, token] of Object.entries(bad)) {
    const res = await call('/api/me', { token });
    assert.equal(res.status, 401, name);
  }
});

test('a service token passes Access but gets no account', async() => {
  const res = await call('/api/me', { token: sign(claimsFor(undefined, { common_name: 'svc' })) });
  assert.equal(res.status, 403);
});

test('saves with versions and refuses to overwrite a newer copy', async() => {
  const token = sign(claimsFor('ann@example.com'));
  assert.equal((await call('/api/state/persist:decks', { token })).status, 404);
  const first = await call('/api/state/persist:decks', { token, method: 'PUT', body: { value: 'v1', version: null } });
  assert.deepEqual(await first.json(), { version: 1 });
  const second = await call('/api/state/persist:decks', { token, method: 'PUT', body: { value: 'v2', version: 1 } });
  assert.deepEqual(await second.json(), { version: 2 });
  const stale = await call('/api/state/persist:decks', { token, method: 'PUT', body: { value: 'old', version: 1 } });
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: 'changed elsewhere', version: 2 });
  const read = await call('/api/state/persist:decks', { token });
  assert.deepEqual(await read.json(), { value: 'v2', version: 2 });
  await call('/api/state/persist:decks', { token, method: 'DELETE' });
  assert.equal((await call('/api/state/persist:decks', { token })).status, 404);
});

test("users never see each other's data", async() => {
  const ann = sign(claimsFor('ann@example.com'));
  const bob = sign(claimsFor('bob@example.com'));
  await call('/api/state/persist:settings', { token: ann, method: 'PUT', body: { value: 'ann', version: null } });
  assert.equal((await call('/api/state/persist:settings', { token: bob })).status, 404);
  // Email case doesn't split one person into two accounts.
  const annUpper = sign(claimsFor('Ann@Example.com'));
  assert.equal((await (await call('/api/state/persist:settings', { token: annUpper })).json()).value, 'ann');
});

test('rejects bad keys, bad bodies and oversized values', async() => {
  const token = sign(claimsFor('ann@example.com'));
  assert.equal((await call('/api/state/..%2Fescape', { token })).status, 400);
  assert.equal((await call('/api/state/.hidden', { token })).status, 400);
  assert.equal((await call('/api/state/k', { token, method: 'PUT', body: { value: 5, version: null } })).status, 400);
  const big = await call('/api/state/k', { token, method: 'PUT', body: { value: 'x'.repeat(2000), version: null } });
  assert.equal(big.status, 413);
});

test('health check needs no identity', async() => {
  assert.equal((await call('/api/healthz')).status, 200);
});
