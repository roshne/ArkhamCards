import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Run with an inline config (the repo's jest preset no longer exists in this React Native):
// npx jest --config '{"testMatch":["**/__tests__/*.test.ts"],"testEnvironment":"node"}'

type Stored = { value: string; version: number };
let server: Record<string, Stored>;
let me: { status: number; email?: string; contentType?: string };
let putDelayMs: number;
let failPutFor: string | undefined;
let calls: string[];
let supersededMessage: string | undefined;
let asyncStore: Record<string, string>;
let local: Record<string, string>;

const reply = (status: number, body?: unknown, contentType = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => contentType },
  json: async() => body,
});

// A one-account stand-in for web/api: versions, 409s and hasData behave like the real server.
function fakeFetch(url: string, init: { method?: string; body?: string } = {}) {
  const method = init.method || 'GET';
  calls.push(`${method} ${url}`);
  if (url === '/api/me') {
    const body = { email: me.email, hasData: Object.keys(server).length > 0 };
    return Promise.resolve(reply(me.status, body, me.contentType));
  }
  const key = decodeURIComponent(url.replace('/api/state/', ''));
  if (method === 'GET') {
    return Promise.resolve(server[key] ? reply(200, server[key]) : reply(404, { error: 'no value' }));
  }
  const { value, version } = JSON.parse(init.body as string);
  return new Promise((resolve) => setTimeout(() => {
    if (key === failPutFor) {
      resolve(reply(503, { error: 'unavailable' }));
      return;
    }
    const current = server[key]?.version ?? null;
    if (version !== current) {
      resolve(reply(409, { version: current }));
      return;
    }
    server[key] = { value, version: (current || 0) + 1 };
    resolve(reply(200, { version: server[key].version }));
  }, putDelayMs));
}

function load() {
  supersededMessage = undefined;
  let mod: typeof import('../src/lib/persistStorage.web') | undefined;
  jest.isolateModules(() => {
    jest.doMock('../src/lib/prepareWeb.web', () => ({
      isSuperseded: () => supersededMessage !== undefined,
      supersede: (message: string) => {
        supersededMessage = supersededMessage ?? message;
      },
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: async(k: string) => asyncStore[k] ?? null,
        setItem: async(k: string, v: string) => {
          asyncStore[k] = v;
        },
        removeItem: async(k: string) => {
          delete asyncStore[k];
        },
      },
    }));
    mod = require('../src/lib/persistStorage.web');
  });
  return (mod as typeof import('../src/lib/persistStorage.web')).default;
}

// What redux-persist does on load: read every slice, then save every slice back.
async function loadAndResave(storage: ReturnType<typeof load>, keys: string[]) {
  const values = await Promise.all(keys.map((k) => storage.getItem(k)));
  await Promise.allSettled(keys.map((k, i) => storage.setItem(k, values[i] ?? `default ${k}`)));
  return values;
}

beforeEach(() => {
  server = {};
  me = { status: 200, email: 'ann@example.com' };
  putDelayMs = 0;
  failPutFor = undefined;
  calls = [];
  asyncStore = {};
  local = {};
  Object.assign(globalThis, {
    fetch: fakeFetch,
    localStorage: {
      getItem: (k: string) => local[k] ?? null,
      setItem: (k: string, v: string) => {
        local[k] = v;
      },
    },
  });
});

describe('persistStorage on web', () => {
  it("gives this browser's older data to the first account with none, and no one else", async() => {
    asyncStore['persist:decks'] = 'local decks';
    expect(await loadAndResave(load(), ['persist:decks'])).toEqual(['local decks']);
    expect(server['persist:decks']).toEqual({ value: 'local decks', version: 1 });

    me = { status: 200, email: 'bob@example.com' };
    server = {};
    expect(await load().getItem('persist:decks')).toBeNull();
  });

  it('leaves the older data alone when the account already has data elsewhere', async() => {
    asyncStore['persist:campaigns'] = 'local campaigns';
    server['persist:settings'] = { value: 'from my phone', version: 4 };
    expect(await load().getItem('persist:campaigns')).toBeNull();
    expect(local['arkhamcards:localDataOwner']).toBeUndefined();
  });

  it('resumes an interrupted move on the next load', async() => {
    asyncStore['persist:decks'] = 'local decks';
    asyncStore['persist:campaigns'] = 'local campaigns';
    failPutFor = 'persist:campaigns';
    await loadAndResave(load(), ['persist:decks', 'persist:campaigns']);
    expect(server['persist:decks']?.value).toBe('local decks');
    expect(server['persist:campaigns']).toBeUndefined();

    failPutFor = undefined;
    const storage = load();
    expect(await loadAndResave(storage, ['persist:decks', 'persist:campaigns']))
      .toEqual(['local decks', 'local campaigns']);
    expect(server['persist:campaigns']).toEqual({ value: 'local campaigns', version: 1 });
  });

  it("doesn't re-save what the server already has, so opening another device changes nothing", async() => {
    server['persist:decks'] = { value: 'v1', version: 1 };
    calls = [];
    await loadAndResave(load(), ['persist:decks']);
    expect(calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
    expect(server['persist:decks'].version).toBe(1);
  });

  it('saves with the version it last saw and stops on a conflict', async() => {
    server['persist:decks'] = { value: 'v1', version: 1 };
    const storage = load();
    expect(await storage.getItem('persist:decks')).toBe('v1');
    await storage.setItem('persist:decks', 'v2');
    expect(server['persist:decks']).toEqual({ value: 'v2', version: 2 });

    server['persist:decks'] = { value: 'from my phone', version: 3 };
    await expect(storage.setItem('persist:decks', 'v3')).rejects.toThrow('changed elsewhere');
    expect(supersededMessage).toMatch(/changed in another tab or on another device/);
    expect(server['persist:decks'].value).toBe('from my phone');

    calls = [];
    await storage.setItem('persist:decks', 'v4');
    expect(calls).toEqual([]);
  });

  it('sends rapid saves one at a time, ending with the newest value', async() => {
    putDelayMs = 20;
    const storage = load();
    await storage.getItem('persist:campaigns');
    await Promise.all(['a', 'b', 'c'].map((v) => storage.setItem('persist:campaigns', v)));
    expect(supersededMessage).toBeUndefined();
    expect(server['persist:campaigns'].value).toBe('c');
    expect(calls.filter((c) => c.startsWith('PUT')).length).toBeLessThanOrEqual(2);
  });

  it('falls back to browser storage where there is no API', async() => {
    me = { status: 404 };
    const storage = load();
    await storage.setItem('persist:settings', 's');
    expect(asyncStore['persist:settings']).toBe('s');
    expect(await storage.getItem('persist:settings')).toBe('s');
    expect(calls).toEqual(['GET /api/me']);
  });

  it('stops, without falling back, when the API is there but failing', async() => {
    me = { status: 502, contentType: 'text/html' };
    const storage = load();
    await expect(storage.getItem('persist:decks')).rejects.toThrow('HTTP 502');
    expect(supersededMessage).toMatch(/can't reach your saved data/);
    expect(asyncStore).toEqual({});
  });
});
