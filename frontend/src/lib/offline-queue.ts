export type QueuedScanStatus = "pending" | "scanning" | "failed";

export type QueuedScan = {
  id: string;
  createdAt: number;
  blob: Blob;
  fileName: string;
  status: QueuedScanStatus;
  error?: string | null;
  ocrText?: string | null;
  ocrConfidence?: number | null;
};

export type QueuedOfflineItemStatus = "pending" | "syncing" | "failed";

export type QueuedOfflineItem = {
  id: string;
  createdAt: number;
  photos: Blob[];
  storeName?: string;
  branch?: string | null;
  name?: string;
  price?: number | null;
  sku?: string | null;
  unit?: string;
  productType?: string | null;
  location?: { lat: number; lng: number; label?: string } | null;
  status: QueuedOfflineItemStatus;
  error?: string | null;
};

const DB_NAME = "vuepresyo_offline_db";
const DB_VERSION = 3;
const STORE_NAME = "offline_scans";
const CACHE_STORE_NAME = "cached_data";
const OFFLINE_ITEMS_STORE = "offline_enlist_items";

export type CacheEntry<T = unknown> = {
  key: string;
  data: T;
  updatedAt: number;
};

let customIdbFactory: IDBFactory | null = null;

export function setCustomIndexedDB(factory: IDBFactory | null) {
  customIdbFactory = factory;
}

function getIdbFactory(): IDBFactory | undefined {
  if (customIdbFactory) return customIdbFactory;
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }
  return undefined;
}

function generateScanId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "scan_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = getIdbFactory();
    if (!factory) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = factory.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(OFFLINE_ITEMS_STORE)) {
        const store = db.createObjectStore(OFFLINE_ITEMS_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function setCachedData<T>(key: string, data: T): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const entry: CacheEntry<T> = {
      key,
      data,
      updatedAt: Date.now(),
    };
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to set cached data"));
  });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE_NAME, "readonly");
    const store = tx.objectStore(CACHE_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      const entry = req.result as CacheEntry<T> | undefined;
      resolve(entry ? entry.data : null);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to get cached data"));
  });
}

export async function safeSetCachedData<T>(key: string, data: T): Promise<void> {
  try {
    await setCachedData(key, data);
  } catch (err) {
    console.warn(`[offline-cache] Failed to cache ${key}:`, err);
  }
}

export async function safeGetCachedData<T>(key: string): Promise<T | null> {
  try {
    return await getCachedData<T>(key);
  } catch {
    return null;
  }
}

export type StoredPhotoRecord = {
  data: ArrayBuffer;
  type: string;
};

async function photoToStored(photo: Blob | StoredPhotoRecord): Promise<StoredPhotoRecord> {
  if (photo && typeof photo === "object" && "data" in photo && photo.data instanceof ArrayBuffer) {
    return photo as StoredPhotoRecord;
  }
  if (photo instanceof Blob) {
    try {
      const data = await photo.arrayBuffer();
      return { data, type: photo.type || "image/jpeg" };
    } catch {
      return { data: new ArrayBuffer(0), type: photo.type || "image/jpeg" };
    }
  }
  return { data: new ArrayBuffer(0), type: "image/jpeg" };
}

function storedToBlob(stored: unknown): Blob {
  if (stored && typeof stored === "object" && "data" in stored) {
    const rec = stored as { data: ArrayBuffer | Uint8Array; type?: string };
    return new Blob([rec.data as BlobPart], { type: rec.type || "image/jpeg" });
  }
  if (stored instanceof Blob) {
    return stored;
  }
  if (stored instanceof ArrayBuffer || ArrayBuffer.isView(stored)) {
    return new Blob([stored as BlobPart], { type: "image/jpeg" });
  }
  return new Blob([], { type: "image/jpeg" });
}

export async function enqueueOfflineScan(
  blob: Blob,
  meta?: {
    fileName?: string;
    ocrText?: string;
    ocrConfidence?: number;
  },
): Promise<QueuedScan> {
  const storedBlob = await photoToStored(blob);
  const db = await openOfflineDb();
  const scanToStore = {
    id: generateScanId(),
    createdAt: Date.now(),
    blob: storedBlob,
    fileName: meta?.fileName ?? `receipt_${new Date().toISOString().slice(0, 10)}.jpg`,
    status: "pending" as QueuedScanStatus,
    ocrText: meta?.ocrText ?? null,
    ocrConfidence: meta?.ocrConfidence ?? null,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(scanToStore);

    request.onsuccess = () =>
      resolve({
        ...scanToStore,
        blob: storedToBlob(storedBlob),
      });
    request.onerror = () => reject(request.error ?? new Error("Failed to enqueue scan"));
  });
}

export async function getOfflineScans(): Promise<QueuedScan[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const rawScans = (request.result as Array<Omit<QueuedScan, "blob"> & { blob: unknown }>) || [];
      const scans: QueuedScan[] = rawScans.map((s) => ({
        ...s,
        blob: storedToBlob(s.blob),
      }));
      scans.sort((a, b) => b.createdAt - a.createdAt);
      resolve(scans);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to read scans"));
  });
}

export async function getOfflineScan(id: string): Promise<QueuedScan | null> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const raw = request.result as (Omit<QueuedScan, "blob"> & { blob: unknown }) | undefined;
      if (!raw) {
        resolve(null);
        return;
      }
      resolve({
        ...raw,
        blob: storedToBlob(raw.blob),
      });
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to get scan"));
  });
}

export async function updateOfflineScan(
  id: string,
  patch: Partial<Omit<QueuedScan, "id" | "createdAt">> & { blob?: Blob },
): Promise<void> {
  let storedBlob: StoredPhotoRecord | undefined;
  if (patch.blob) {
    storedBlob = await photoToStored(patch.blob);
  }
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedScan | undefined;
      if (!existing) {
        reject(new Error(`Scan with id ${id} not found`));
        return;
      }
      const updated = {
        ...existing,
        ...patch,
        ...(storedBlob ? { blob: storedBlob } : {}),
      };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error("Failed to update scan"));
    };

    getReq.onerror = () => reject(getReq.error ?? new Error("Failed to fetch scan to update"));
  });
}

export async function deleteOfflineScan(id: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete scan"));
  });
}

export async function clearOfflineScans(): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to clear scans"));
  });
}

export async function enqueueOfflineItem(
  item: Omit<QueuedOfflineItem, "id" | "createdAt" | "status">,
): Promise<QueuedOfflineItem> {
  const storedPhotos = await Promise.all((item.photos || []).map(photoToStored));
  const db = await openOfflineDb();
  const queuedToStore = {
    ...item,
    id: generateScanId(),
    createdAt: Date.now(),
    status: "pending" as QueuedOfflineItemStatus,
    photos: storedPhotos,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_ITEMS_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_ITEMS_STORE);
    const req = store.add(queuedToStore);
    req.onsuccess = () =>
      resolve({
        ...queuedToStore,
        photos: storedPhotos.map(storedToBlob),
      });
    req.onerror = () => reject(req.error ?? new Error("Failed to enqueue offline item"));
  });
}

export async function getOfflineItems(): Promise<QueuedOfflineItem[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_ITEMS_STORE, "readonly");
    const store = tx.objectStore(OFFLINE_ITEMS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rawItems =
        (req.result as Array<Omit<QueuedOfflineItem, "photos"> & { photos?: unknown[] }>) || [];
      const items: QueuedOfflineItem[] = rawItems.map((item) => ({
        ...item,
        photos: Array.isArray(item.photos) ? item.photos.map(storedToBlob) : [],
      }));
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to get offline items"));
  });
}

export async function getOfflineItem(id: string): Promise<QueuedOfflineItem | null> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_ITEMS_STORE, "readonly");
    const store = tx.objectStore(OFFLINE_ITEMS_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const raw = req.result as
        | (Omit<QueuedOfflineItem, "photos"> & { photos?: unknown[] })
        | undefined;
      if (!raw) {
        resolve(null);
        return;
      }
      resolve({
        ...raw,
        photos: Array.isArray(raw.photos) ? raw.photos.map(storedToBlob) : [],
      });
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to get offline item"));
  });
}

export async function updateOfflineItem(
  id: string,
  patch: Partial<Omit<QueuedOfflineItem, "id" | "createdAt">> & { photos?: Blob[] },
): Promise<void> {
  let storedPhotos: StoredPhotoRecord[] | undefined;
  if (patch.photos) {
    storedPhotos = await Promise.all(patch.photos.map(photoToStored));
  }
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_ITEMS_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_ITEMS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedOfflineItem | undefined;
      if (!existing) {
        reject(new Error(`Offline item with id ${id} not found`));
        return;
      }
      const updated = {
        ...existing,
        ...patch,
        ...(storedPhotos ? { photos: storedPhotos } : {}),
      };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error("Failed to update offline item"));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error("Failed to fetch offline item"));
  });
}

export async function deleteOfflineItem(id: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_ITEMS_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_ITEMS_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to delete offline item"));
  });
}

export async function clearOfflineItems(): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_ITEMS_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_ITEMS_STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to clear offline items"));
  });
}

export type QueuedEnlistItem = QueuedOfflineItem;

export const getQueuedScans = getOfflineScans;
export const getQueuedEnlistItems = getOfflineItems;

const queueListeners = new Set<() => void>();

export function notifyOfflineQueueChanged(): void {
  for (const listener of queueListeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function subscribeToOfflineQueue(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}


