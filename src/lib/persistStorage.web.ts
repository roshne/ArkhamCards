// redux-persist's storage on web. Behind Cloudflare Access (arkhamcards.rackbops.com) each
// signed-in person's saved state lives on the server (web/api) under their identity, so it
// follows them to any device and nobody sees anyone else's. Where there is no API (a plain static
// server), it falls back to this browser's storage, as before.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSuperseded, supersede } from './prepareWeb.web';

export type StorageMode = { kind: 'server'; email: string } | { kind: 'local' };

// This browser's own older data (saved before accounts existed) goes to the first account that
// signs in here with no saved data of its own. That account "owns" it from then on: any slice the
// server doesn't have yet loads from this browser and is saved up, so a move interrupted part way
// finishes on a later load (the server never deletes a slice). Other accounts never see it, and
// the browser's copy is left in place.
const OWNER = 'arkhamcards:localDataOwner';
let ownsLocalData = false;

async function detectMode(): Promise<StorageMode> {
  const response = await fetch('/api/me', { credentials: 'same-origin' });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  if (response.ok && isJson) {
    const { email, hasData } = await response.json();
    if (!localStorage.getItem(OWNER) && !hasData) {
      localStorage.setItem(OWNER, email);
    }
    ownsLocalData = localStorage.getItem(OWNER) === email;
    return { kind: 'server', email };
  }
  if (response.status === 404 || (response.ok && !isJson)) {
    // No API here: a static server answers 404, or index.html from its page fallback.
    return { kind: 'local' };
  }
  throw new Error(`HTTP ${response.status}`);
}

export const storageMode: Promise<StorageMode> = detectMode().catch((e) => {
  supersede(`Arkham Cards can't reach your saved data (${e.message}), so nothing will load or save. Reload to try again.`);
  throw e;
});

const stateUrl = (key: string) => `/api/state/${encodeURIComponent(key)}`;
// The server's version and value of each key as this page last read or wrote them. A save that
// doesn't carry the server's version is refused (409) instead of overwriting newer data from
// another device or tab; a save of the value the server already has is skipped (redux-persist
// re-saves every slice after loading, which would otherwise bump every version on every load).
const versions: Record<string, number | null> = {};
const saved: Record<string, string | undefined> = {};
const pending: Record<string, string | undefined> = {};
const inflight: Record<string, Promise<void> | undefined> = {};

async function serverGet(key: string): Promise<string | null> {
  const response = await fetch(stateUrl(key), { credentials: 'same-origin' });
  if (response.status === 404) {
    versions[key] = null;
    saved[key] = undefined;
    return ownsLocalData ? AsyncStorage.getItem(key) : null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const { value, version } = await response.json();
  versions[key] = version;
  saved[key] = value;
  return value;
}

async function put(key: string, value: string) {
  let response: Response;
  try {
    response = await fetch(stateUrl(key), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, version: versions[key] ?? null }),
    });
  } catch (e) {
    supersede('Arkham Cards lost its connection while saving, so this tab stopped saving. Reload to try again; your latest change may not be saved.');
    throw e;
  }
  if (response.status === 409) {
    supersede('Your Arkham Cards data was changed in another tab or on another device, so this tab stopped saving. Reload to get the latest; your latest change here was not saved.');
    throw new Error('save refused: changed elsewhere');
  }
  if (!response.ok) {
    supersede(`Arkham Cards couldn't save your data (HTTP ${response.status}), so this tab stopped saving. Reload to try again; your latest change may not be saved.`);
    throw new Error(`save failed: HTTP ${response.status}`);
  }
  versions[key] = (await response.json()).version;
  saved[key] = value;
}

// One save per key at a time, always of the newest value: overlapping saves would each carry the
// same version and the second would be refused as a conflict.
function serverSet(key: string, value: string): Promise<void> {
  pending[key] = value;
  if (!inflight[key]) {
    inflight[key] = (async() => {
      try {
        while (pending[key] !== undefined && !isSuperseded()) {
          const next = pending[key] as string;
          pending[key] = undefined;
          if (next !== saved[key]) {
            await put(key, next);
          }
        }
      } finally {
        inflight[key] = undefined;
      }
    })();
  }
  return inflight[key] as Promise<void>;
}

const persistStorage = {
  async getItem(key: string): Promise<string | null> {
    const mode = await storageMode;
    if (mode.kind === 'local') {
      return AsyncStorage.getItem(key);
    }
    try {
      return await serverGet(key);
    } catch (e) {
      supersede(`Arkham Cards can't load your saved data (${e.message}), so nothing will save. Reload to try again.`);
      throw e;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isSuperseded()) {
      return;
    }
    const mode = await storageMode;
    if (mode.kind === 'local') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await serverSet(key, value);
  },
  // redux-persist only removes keys on purge(), which the app never calls; the server keeps every
  // key so its version count never restarts under an older copy.
  async removeItem(key: string): Promise<void> {
    const mode = await storageMode;
    if (mode.kind === 'local') {
      await AsyncStorage.removeItem(key);
    }
  },
};

export default persistStorage;
