// طابور الطلبات المحلي لوضع الكاشير الأوفلاين (OFFLINE) - IndexedDB بدل localStorage عشان المتصفح
// نفسه بيضمن الكتابة قبل ما يأكد نجاحها (localStorage ممكن يتعمله overwrite جزئي لو حصل crash)، وده
// مهم هنا لأننا بنحمي طلبات بيع حقيقية لحد ما تتزامن مع السيرفر.
const DB_NAME = "satamoni-offline";
const DB_VERSION = 1;
const PENDING_ORDERS_STORE = "pending-orders";
const SNAPSHOT_STORE = "snapshots";

export interface QueuedOrder {
  clientRequestId: string;
  payload: Record<string, unknown>;
  summary: string;
  createdAt: number;
}

const QUEUE_CHANGED_EVENT = "satamoni-offline-queue-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PENDING_ORDERS_STORE)) {
        db.createObjectStore(PENDING_ORDERS_STORE, { keyPath: "clientRequestId" });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = fn(tx.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

function notifyQueueChanged(): void {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export function onQueueChanged(handler: () => void): () => void {
  window.addEventListener(QUEUE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, handler);
}

export async function enqueueOrder(order: QueuedOrder): Promise<void> {
  try {
    await withStore(PENDING_ORDERS_STORE, "readwrite", (store) => store.put(order));
  } finally {
    notifyQueueChanged();
  }
}

export async function listQueuedOrders(): Promise<QueuedOrder[]> {
  try {
    const orders = await withStore<QueuedOrder[]>(PENDING_ORDERS_STORE, "readonly", (store) => store.getAll());
    return orders.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeQueuedOrder(clientRequestId: string): Promise<void> {
  try {
    await withStore(PENDING_ORDERS_STORE, "readwrite", (store) => store.delete(clientRequestId));
  } finally {
    notifyQueueChanged();
  }
}

export async function saveSnapshot(key: string, data: unknown): Promise<void> {
  try {
    await withStore(SNAPSHOT_STORE, "readwrite", (store) => store.put({ key, data, savedAt: Date.now() }));
  } catch {
    // فشل حفظ الـsnapshot مش خطأ يوقف التطبيق - أسوأ حالة، القراءة الأوفلاين مش هتلاقي نسخة محفوظة
  }
}

export async function loadSnapshot<T>(key: string): Promise<T | null> {
  try {
    const row = await withStore<{ key: string; data: T } | undefined>(SNAPSHOT_STORE, "readonly", (store) => store.get(key));
    return row?.data ?? null;
  } catch {
    return null;
  }
}
