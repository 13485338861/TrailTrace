import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'trailtrace_tiles';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export interface TileEntry {
  url: string;
  blob: Blob;
  timestamp: number;
}

/** 保存瓦片到 IndexedDB */
export async function saveTile(url: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { url, blob, timestamp: Date.now() });
}

/** 从 IndexedDB 获取瓦片 */
export async function getTile(url: string): Promise<Blob | undefined> {
  const db = await getDB();
  const entry = await db.get(STORE_NAME, url);
  return entry?.blob;
}

/** 获取缓存统计信息 */
export async function getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
  const db = await getDB();
  let count = 0;
  let sizeBytes = 0;
  let cursor = await db.transaction(STORE_NAME, 'readonly').store.openCursor();
  while (cursor) {
    count++;
    const entry = cursor.value as TileEntry;
    sizeBytes += entry.blob.size;
    cursor = await cursor.continue();
  }
  return { count, sizeBytes };
}

/** 清除所有缓存 */
export async function clearTileCache(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 预缓存指定区域和缩放级别的瓦片 */
export async function prefetchTiles(
  urlTemplate: string,
  bounds: { north: number; south: number; east: number; west: number },
  zooms: number[],
  onProgress?: (done: number, total: number, failed: number) => void
): Promise<{ total: number; cached: number; failed: number }> {
  // First count total tiles
  let total = 0;
  const jobs: { z: number; x: number; y: number; url: string }[] = [];
  for (const z of zooms) {
    const n = Math.pow(2, z);
    const xMin = Math.floor((bounds.west + 180) / 360 * n);
    const xMax = Math.ceil((bounds.east + 180) / 360 * n);
    const yMin = Math.floor((1 - Math.log(Math.tan(bounds.north * Math.PI / 180) + 1 / Math.cos(bounds.north * Math.PI / 180)) / Math.PI) / 2 * n);
    const yMax = Math.ceil((1 - Math.log(Math.tan(bounds.south * Math.PI / 180) + 1 / Math.cos(bounds.south * Math.PI / 180)) / Math.PI) / 2 * n);
    for (let x = Math.max(0, xMin); x <= Math.min(n - 1, xMax); x++) {
      for (let y = Math.max(0, yMin); y <= Math.min(n - 1, yMax); y++) {
        const url = urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace(/{s}/g, '1');
        jobs.push({ z, x, y, url });
      }
    }
  }
  total = jobs.length;
  let cached = 0;
  let failed = 0;
  onProgress?.(0, total, 0);

  let done = 0;
  for (const job of jobs) {
    try {
      const existing = await getTile(job.url);
      if (existing) { cached++; done++; onProgress?.(done, total, failed); continue; }
      const resp = await fetch(job.url);
      if (!resp.ok) { failed++; done++; onProgress?.(done, total, failed); continue; }
      const blob = await resp.blob();
      await saveTile(job.url, blob);
      cached++;
    } catch {
      failed++;
    }
    done++;
    onProgress?.(done, total, failed);
    if (done % 5 === 0) await sleep(0); // yield to UI
  }

  return { total, cached, failed };
}

/** 格式化缓存大小 */
export function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
