import { Button } from "../../shared/ui/Button";
import { useOfflineSync } from "../../shared/offline/useOfflineSync";

export function OfflineSyncBanner() {
  const { isOnline, pendingOrders, syncing, syncError, syncNow } = useOfflineSync();
  const hasPending = pendingOrders.length > 0;
  if (isOnline && !hasPending && !syncError) return null;

  return (
    <div className={`mb-4 rounded-xl border p-3 text-sm ${!isOnline ? "border-amber-200 bg-amber-50" : "border-brand-200 bg-brand-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-slate-800">
          {!isOnline && "أنت غير متصل بالإنترنت - الطلبات هتتسجّل محليًا وتتزامن أول ما النت يرجع. "}
          {hasPending && `${pendingOrders.length} طلب في انتظار المزامنة.`}
        </div>
        {hasPending && (
          <Button size="sm" variant="secondary" onClick={syncNow} disabled={!isOnline || syncing}>
            {syncing ? "بتتزامن..." : "مزامنة الآن"}
          </Button>
        )}
      </div>
      {syncError && <p className="mt-1 text-red-700">{syncError}</p>}
      {hasPending && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
          {pendingOrders.map((o) => (
            <li key={o.clientRequestId}>{o.summary}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
