import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import type { PriceHistoryTarget } from "./catalogTypes";

interface PriceHistoryEntry {
  id: string;
  fieldName: string;
  oldPrice: number | null;
  newPrice: number | null;
  changedByName: string | null;
  createdAt: string;
}

const PRICE_FIELD_LABELS: Record<string, string> = { price: "السعر", talabat_price: "سعر طلبات" };

export function PriceHistoryDialog({ target, onClose }: { target: PriceHistoryTarget; onClose: () => void }) {
  const historyQuery = useQuery({
    queryKey: ["catalog", "price-history", target.variantId],
    queryFn: () => apiRequest<PriceHistoryEntry[]>(`/catalog/items/${target.itemId}/variants/${target.variantId}/price-history`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">سجل أسعار {target.label}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>
        {historyQuery.isLoading && <p className="text-xs text-slate-400">بيتحمّل...</p>}
        {historyQuery.data && historyQuery.data.length === 0 && <EmptyState>مفيش تغييرات أسعار مسجّلة لسه</EmptyState>}
        {historyQuery.data && historyQuery.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>الحقل</TH><TH>من</TH><TH>إلى</TH><TH>بواسطة</TH></TR>
            </THead>
            <TBody>
              {historyQuery.data.map((h) => (
                <TR key={h.id}>
                  <TD className="text-xs">{h.createdAt.slice(0, 10)}</TD>
                  <TD>{PRICE_FIELD_LABELS[h.fieldName] ?? h.fieldName}</TD>
                  <TD>{h.oldPrice ?? "-"}</TD>
                  <TD className="font-semibold">{h.newPrice ?? "-"}</TD>
                  <TD>{h.changedByName ?? "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
