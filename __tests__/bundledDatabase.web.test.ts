import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Run with the inline config in web/README.md. Checks that the bundled card data is swapped in on
// every load but re-applied to the saved state only when that state doesn't already describe it.

const metadata = { schemaVersion: 55, cache: { lastModified: 'L1' }, packs: [{ code: 'core' }] };
let mockState: { packs: { all: unknown[] }; cards: { schemaVersion?: number; cache?: { lastModified?: string } } };
const mockReplaceDatabase = jest.fn(async() => undefined);

jest.mock('../assets/generated/arkham4.db', () => 'db-module');
jest.mock('../assets/generated/arkham4.metadata.txt', () => 'metadata-module');
jest.mock('expo-asset', () => ({
  Asset: { fromModule: (m: string) => ({ uri: m === 'db-module' ? '/arkham4.db' : '/arkham4.metadata.txt' }) },
}));
jest.mock('../src/application/store', () => ({ store: { getState: () => mockState } }));
jest.mock('../src/data/sqlite/Database', () => ({ __esModule: true, default: { SCHEMA_VERSION: 55 } }));
jest.mock('../src/data/sqlite/webSqlite', () => ({ replaceDatabase: mockReplaceDatabase }));

const { loadBundledDatabaseIfNeeded } = require('../src/data/sqlite/bundledDatabase.web');
const connection = { query: jest.fn(async() => undefined) };

beforeEach(() => {
  mockReplaceDatabase.mockClear();
  Object.assign(globalThis, {
    fetch: async(url: string) => ({
      ok: true,
      json: async() => metadata,
      arrayBuffer: async() => new ArrayBuffer(8),
      url,
    }),
  });
});

describe('loadBundledDatabaseIfNeeded on web', () => {
  it('applies the bundle to a fresh account', async() => {
    mockState = { packs: { all: [] }, cards: {} };
    expect(await loadBundledDatabaseIfNeeded(connection, 'en')).toEqual(metadata);
    expect(mockReplaceDatabase).toHaveBeenCalledTimes(1);
  });

  it("swaps in the cards but doesn't re-apply what the saved state already has", async() => {
    mockState = { packs: { all: [{ code: 'core' }] }, cards: { schemaVersion: 55, cache: { lastModified: 'L1' } } };
    expect(await loadBundledDatabaseIfNeeded(connection, 'en')).toBeNull();
    expect(mockReplaceDatabase).toHaveBeenCalledTimes(1);
  });

  it('re-applies when the saved card cache is from another bundle', async() => {
    mockState = { packs: { all: [{ code: 'core' }] }, cards: { schemaVersion: 55, cache: { lastModified: 'L0' } } };
    expect(await loadBundledDatabaseIfNeeded(connection, 'en')).toEqual(metadata);
  });
});
