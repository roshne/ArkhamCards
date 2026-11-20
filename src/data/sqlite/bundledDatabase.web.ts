import { Asset } from 'expo-asset';
import { Connection } from 'typeorm/browser';
import Database from './Database';
import { replaceDatabase } from './webSqlite';
import type { BundledDatabaseMetadata } from './bundledDatabase';

export type { BundledDatabaseMetadata };

// Web variant: the in-memory database starts empty on every page load, so instead of ATTACHing
// the bundled file (sql.js has no file system to attach from) we swap it in wholesale.
// The bundled cards are English and load whatever the language setting: web has no other card
// source, since the card server refuses browser requests (CORS).
export async function loadBundledDatabaseIfNeeded(
  connection: Connection,
  _userLang?: string
): Promise<BundledDatabaseMetadata | null> {
  try {
    const dbAsset = Asset.fromModule(require('../../../assets/generated/arkham4.db'));
    const metadataAsset = Asset.fromModule(require('../../../assets/generated/arkham4.metadata.txt'));
    const metadata: BundledDatabaseMetadata = await (await fetch(metadataAsset.uri)).json();
    if (metadata.schemaVersion !== Database.SCHEMA_VERSION) {
      console.log(`Bundled database schema version ${metadata.schemaVersion} does not match ${Database.SCHEMA_VERSION} - skipping restore`);
      return null;
    }
    const response = await fetch(dbAsset.uri);
    if (!response.ok) {
      throw new Error(`Fetching bundled database failed: HTTP ${response.status}`);
    }
    await replaceDatabase('arkham4', new Uint8Array(await response.arrayBuffer()));
    await connection.query('PRAGMA foreign_keys = ON');
    return metadata;
  } catch (error) {
    console.error('Error loading bundled database:', error);
    return null;
  }
}
