import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useAuth, useCan } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { isCompanyWide } from "../../shared/auth/roles";
import { useBranchOptions } from "../../shared/auth/useBranchOptions";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select } from "../../shared/ui/Field";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { Pagination } from "../../shared/ui/Pagination";
import { useListState } from "../../shared/ui/useListState";
import { errorMessage, formatQuantity, type Branch, type BranchStockRow, type InventoryItem } from "./types";

interface TransferLine {
  inventoryItemId: string;
  receivedQuantity: number | null;
  requestedQuantity: number;
}

interface Transfer {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  notes: string | null;
  createdAt: string;
  lines: TransferLine[];
}

const EMPTY_LINE = { inventoryItemId: "", quantity: "" };

export function TransfersTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const allowed = useCan();
  const canRegister = allowed(PERMISSION.INVENTORY_TRANSFERS_REGISTER);
  const canViewHistory = allowed(PERMISSION.INVENTORY_ITEMS_VIEW, PERMISSION.INVENTORY_MOVEMENTS_RECORD);
  const { branches } = useBranchOptions<Branch>();
  const companyWide = isCompanyWide(user);

  const [chosenFromBranchId, setChosenFromBranchId] = useState("");
  const fromBranchId = companyWide ? chosenFromBranchId : user?.branchId ?? "";
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([EMPTY_LINE]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sourceStockQuery = useQuery({
    queryKey: ["inventory", "branch-stock", "all", fromBranchId],
    queryFn: () => apiRequest<BranchStockRow[]>(`/inventory/branch-stock?branchId=${fromBranchId}`),
    enabled: canRegister && !!fromBranchId,
  });
  const sourceStock = sourceStockQuery.data ?? [];

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items", "all"],
    queryFn: () => apiRequest<InventoryItem[]>("/inventory/items"),
    enabled: canViewHistory,
  });

  const list = useListState([] as const, { prefix: "tr." });
  const historyQuery = usePaginatedQuery<Transfer>(["inventory", "transfer-requests"], "/inventory/transfer-requests", { ...list.params, status: "RECEIVED" }, { enabled: canViewHistory });
  const history = historyQuery.data?.items ?? [];

  const registerTransfer = useMutation({
    mutationFn: () =>
      apiRequest("/inventory/transfers", {
        method: "POST",
        body: {
          fromBranchId,
          toBranchId,
          notes: notes.trim() || undefined,
          lines: lines
            .filter((l) => l.inventoryItemId && l.quantity)
            .map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity) })),
        },
      }),
    onSuccess: () => {
      setLines([EMPTY_LINE]);
      setNotes("");
      setError(null);
      setSuccess(`تم تسجيل التحويل إلى ${branchName(toBranchId)}`);
      queryClient.invalidateQueries({ queryKey: ["inventory", "branch-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfer-requests"] });
    },
    onError: (err) => {
      setError(errorMessage(err));
      setSuccess(null);
    },
  });

  function branchName(id: string): string {
    return branches.find((b) => b.id === id)?.name ?? "فرع";
  }

  function itemLabel(id: string): string {
    return itemsQuery.data?.find((i) => i.id === id)?.name ?? "صنف محذوف";
  }

  function updateLine(index: number, patch: Partial<typeof EMPTY_LINE>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    registerTransfer.mutate();
  }

  return (
    <div className="mt-6 space-y-6">
      {canRegister && (
        <Card>
          <CardHeader><CardTitle>تسجيل تحويل أصناف لفرع تاني</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="من فرع">
                  {companyWide ? (
                    <Select required value={chosenFromBranchId} onChange={(e) => { setChosenFromBranchId(e.target.value); setLines([EMPTY_LINE]); }}>
                      <option value="">اختر فرع</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  ) : (
                    <Input disabled value={branchName(fromBranchId)} />
                  )}
                </Field>
                <Field label="إلى فرع">
                  <Select required value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
                    <option value="">اختر فرع</option>
                    {branches.filter((b) => b.id !== fromBranchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="ملاحظة (اختياري)">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>

              <div className="space-y-2">
                {lines.map((line, i) => {
                  const available = sourceStock.find((s) => s.inventoryItemId === line.inventoryItemId);
                  return (
                    <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[2fr_1fr_auto]">
                      <Select value={line.inventoryItemId} disabled={!fromBranchId} onChange={(e) => updateLine(i, { inventoryItemId: e.target.value })}>
                        <option value="">اختر صنف</option>
                        {sourceStock.map((s) => (
                          <option key={s.inventoryItemId} value={s.inventoryItemId}>
                            {s.name} - متاح {formatQuantity(s.quantity)} {s.unit}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        placeholder={available ? `الكمية (${available.unit})` : "الكمية"}
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        حذف
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, EMPTY_LINE])}>+ صنف</Button>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
              {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{success}</p>}
              <div><Button type="submit" disabled={registerTransfer.isPending || !fromBranchId || !toBranchId}>تسجيل التحويل</Button></div>
            </form>
          </CardBody>
        </Card>
      )}

      {canViewHistory && (
        <Card>
          <CardHeader><CardTitle>سجل التحويلات ({historyQuery.data?.total ?? 0})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR><TH>التاريخ</TH><TH>من</TH><TH>إلى</TH><TH>الأصناف</TH><TH>ملاحظة</TH></TR>
              </THead>
              <TBody>
                {history.map((t) => (
                  <TR key={t.id}>
                    <TD>{new Date(t.createdAt).toLocaleString("en-US")}</TD>
                    <TD className="font-semibold text-slate-900">{branchName(t.fromBranchId)}</TD>
                    <TD>{branchName(t.toBranchId)}</TD>
                    <TD className="max-w-xs truncate">
                      {t.lines.map((l) => `${itemLabel(l.inventoryItemId)} (${formatQuantity(l.receivedQuantity ?? l.requestedQuantity)})`).join("، ")}
                    </TD>
                    <TD>{t.notes ?? "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {history.length === 0 && !historyQuery.isLoading && <EmptyState>مفيش تحويلات لسه</EmptyState>}
            <Pagination
              total={historyQuery.data?.total ?? 0}
              limit={list.limit}
              offset={list.offset}
              onPageChange={list.setPage}
              isFetching={historyQuery.isFetching}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
