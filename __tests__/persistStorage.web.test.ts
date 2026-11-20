import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Run with an inline config (the repo's jest preset no longer exists in this React Native):
// npx jest --config '{"testMatch":["**/__tests__/persistStorage.web.test.ts"],"testEnvironment":"node"}'

type Stored = { value: string; version: number };
let server: Record<string, Stored>;
let meResponse: { status: number; body?: unknown; contentType?: string };
let putDelayMs: number;
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

function fakeFetch(url: string, init: { method?: string; body?: string } = {}) {
  const method = init.method || 'GET';
  calls.push(`${method} ${url}`);
  if (url === '/api/me') {
    return Promise.resolve(reply(meResponse.status, meResponse.body, meResponse.contentType));
  }
  const key = decodeURIComponent(url.replace('/api/state/', ''));
  if (method === 'GET') {
    return Promise.resolve(server[key] ? reply(200, server[key]) : reply(404, { error: 'no value' }));
  }
  const { value, version } = JSON.parse(init.body as string);
  return new Promise((resolve) => setTimeout(() => {
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
  let mod: typeof import('../src/lib/persistStorage.web');
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
  // @ts-expect-error assigned inside isolateModules
  return mod;
}

beforeEach(() => {
  server = {};
  meResponse = { status: 200, body: { email: 'ann@example.com' } };
  putDelayMs = 0;
  calls = [];
  supersededMessage = undefined;
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
  it("moves this browser's data to a new account on first sign-in, once", async() => {
    asyncStore['persist:decks'] = 'local decks';
    const storage = load().default;
    expect(await storage.getItem('persist:decks')).toBe('local decks');
    await storage.setItem('persist:decks', 'local decks');
    expect(server['persist:decks']).toEqual({ value: 'local decks', version: 1 });
    expect(local['arkhamcards:migratedTo']).toBe('ann@example.com');

    // The next account signing in on this browser starts empty.
    meResponse = { status: 200, body: { email: 'bob@example.com' } };
    server = {};
    const again = load().default;
    expect(await again.getItem('persist:decks')).toBeNull();
  });

  it('saves with the version it last saw and stops on a conflict', async() => {
    server['persist:decks'] = { value: 'v1', version: 1 };
    const storage = load().default;
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
    const storage = load().default;
    await storage.getItem('persist:campaigns');
    await Promise.all(['a', 'b', 'c'].map((v) => storage.setItem('persist:campaigns', v)));
    expect(supersededMessage).toBeUndefined();
    expect(server['persist:campaigns'].value).toBe('c');
    expect(calls.filter((c) => c.startsWith('PUT')).length).toBeLessThanOrEqual(2);
  });

  it('falls back to browser storage where there is no API', async() => {
    meResponse = { status: 404 };
    const storage = load().default;
    await storage.setItem('persist:settings', 's');
    expect(asyncStore['persist:settings']).toBe('s');
    expect(await storage.getItem('persist:settings')).toBe('s');
    expect(calls).toEqual(['GET /api/me']);
  });

  it('stops, without falling back, when the API is there but failing', async() => {
    meResponse = { status: 502, body: '<html>', contentType: 'text/html' };
    const storage = load().default;
    await expect(storage.getItem('persist:decks')).rejects.toThrow('HTTP 502');
    expect(supersededMessage).toMatch(/can't reach your saved data/);
    expect(asyncStore).toEqual({});
  });
});
