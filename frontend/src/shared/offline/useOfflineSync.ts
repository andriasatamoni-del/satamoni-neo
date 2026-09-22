import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "../api/client";
import { listQueuedOrders, onQueueChanged, removeQueuedOrder, type QueuedOrder } from "./db";

export interface UseOfflineSync {
  isOnline: boolean;
  pendingOrders: QueuedOrder[];
  syncing: boolean;
  syncError: string | null;
  syncNow: () => void;
}

// بيزامن طابور الطلبات المحلي مع السيرفر أول ما النت يرجع (أو يدويًا لما المستخدم يضغط "مزامنة الآن").
// بيبعت الطلبات بالترتيب اللي اتسجّلت بيه (FIFO) وبيوقف عند أول فشل حقيقي (رد سيرفر برفض الطلب، مش
// مجرد انقطاع نت) عشان الكاشير/الأدمن ياخد باله ويعالجه بدل ما يتفوّت بصمت.
export function useOfflineSync(): UseOfflineSync {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOrders, setPendingOrders] = useState<QueuedOrder[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(() => {
    listQueuedOrders().then(setPendingOrders);
  }, []);

  const syncNow = useCallback(() => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);

    (async () => {
      const queue = await listQueuedOrders();
      for (const entry of queue) {
        try {
          await apiRequest("/orders", { method: "POST", body: entry.payload });
          await removeQueuedOrder(entry.clientRequestId);
        } catch (err) {
          if (err instanceof ApiError) {
            setSyncError(`فشلت مزامنة طلب (${entry.summary}): ${err.message}`);
          } else {
            setSyncError(null); // لسه أوفلاين على الأغلب - هنعيد المحاولة تلقائيًا لما النت يرجع
          }
          break;
        }
      }
      await refresh();
      syncingRef.current = false;
      setSyncing(false);
    })();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const offQueue = onQueueChanged(refresh);

    function handleOnline() {
      setIsOnline(true);
      syncNow();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (navigator.onLine) syncNow();

    // شبكة الـWi-Fi ممكن "تتصل" بس من غير إنترنت فعلي (بوابة كابتف مثلًا) - حدث 'online' وحده مش
    // مضمون دايمًا، فبنعمل محاولة مزامنة دورية كـfallback بسيط
    const interval = window.setInterval(() => {
      if (navigator.onLine) syncNow();
    }, 30000);

    return () => {
      offQueue();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOnline, pendingOrders, syncing, syncError, syncNow };
}
