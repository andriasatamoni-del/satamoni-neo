import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
  itemType: "raw" | "manufactured";
  negativeStockPolicy: "STRICT" | "ALLOW_WITH_APPROVAL";
}

interface Branch {
  id: string;
  name: string;
}

interface StocktakeBoardRow {
  inventoryItemId: string;
  name: string;
  unit: string;
  unitCost: number | null;
  systemQuantity: number;
}

interface StocktakeLine {
  inventoryItemId: string;
  systemQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  unitCost: number | null;
  varianceValue: number | null;
  reason: string | null;
  chargeAccountCode: string | null;
}

interface Stocktake {
  id: string;
  branchId: string;
  notes: string | null;
  totalVarianceValue: number;
  createdAt: string;
  lines: StocktakeLine[];
}

interface LowStockRow {
  branchId: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  reorderPoint: number | null;
  status: "OUT" | "NEEDS_REORDER";
}

interface TransferRequestLine {
  id: string;
  inventoryItemId: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  dispatchedQuantity: number | null;
  receivedQuantity: number | null;
}

interface TransferRequest {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  requiredDate: string | null;
  notes: string | null;
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "DISPATCHED" | "RECEIVED" | "CANCELLED";
  rejectionReason: string | null;
  cancellationReason: string | null;
  createdAt: string;
  lines: TransferRequestLine[];
}

const LOW_STOCK_STATUS_LABELS: Record<string, string> = { OUT: "خلص خالص", NEEDS_REORDER: "محتاج إعادة طلب" };

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "بانتظار الاعتماد", APPROVED: "معتمد", REJECTED: "مرفوض",
  DISPATCHED: "متشحن", RECEIVED: "متسلّم", CANCELLED: "ملغى",
};
const TRANSFER_STATUS_TONES: Record<string, "neutral" | "brand" | "success" | "danger" | "warning"> = {
  SUBMITTED: "warning", APPROVED: "brand", REJECTED: "danger",
  DISPATCHED: "brand", RECEIVED: "success", CANCELLED: "neutral",
};

const MOVEMENT_TYPES = [
  { value: "RECEIPT", label: "استلام" },
  { value: "CONSUMPTION", label: "استهلاك" },
  { value: "ADJUSTMENT", label: "تسوية" },
  { value: "TRANSFER_OUT", label: "تحويل لفرع تاني" },
  { value: "TRANSFER_IN", label: "تحويل من فرع تاني" },
];

const TABS = [
  { key: "items", label: "الأصناف والحركات" },
  { key: "stocktake", label: "الجرد الفعلي" },
  { key: "low-stock", label: "حدود المخزون والتنبيهات" },
  { key: "transfers", label: "طلبات التحويل بين الفروع" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("items");
  const itemsQuery = useQuery({ queryKey: ["inventory", "items"], queryFn: () => apiRequest<InventoryItem[]>("/inventory/items") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });

  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemType, setNewItemType] = useState("raw");
  const [itemError, setItemError] = useState<string | null>(null);

  const createItem = useMutation({
    mutationFn: () =>
      apiRequest("/inventory/items", { method: "POST", body: { name: newItemName, unit: newItemUnit, itemType: newItemType } }),
    onSuccess: () => {
      setNewItemName("");
      setNewItemUnit("");
      setNewItemType("raw");
      setItemError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    },
    onError: (err) => setItemError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [movementForm, setMovementForm] = useState({
    inventoryItemId: "", branchId: "", movementType: "RECEIPT", quantityDelta: "", reason: "",
  });
  const [movementResult, setMovementResult] = useState<string | null>(null);
  const [movementError, setMovementError] = useState<string | null>(null);

  const recordMovement = useMutation({
    mutationFn: () =>
      apiRequest<{ balanceAfter: number }>("/inventory/movements", {
        method: "POST",
        body: {
          inventoryItemId: movementForm.inventoryItemId,
          branchId: movementForm.branchId,
          movementType: movementForm.movementType,
          quantityDelta: Number(movementForm.quantityDelta),
          reason: movementForm.reason || undefined,
        },
      }),
    onSuccess: (res) => {
      setMovementResult(`تمت الحركة - الرصيد الجديد: ${res.balanceAfter}`);
      setMovementError(null);
    },
    onError: (err) => {
      setMovementError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع");
      setMovementResult(null);
    },
  });

  function handleItemSubmit(e: FormEvent) {
    e.preventDefault();
    createItem.mutate();
  }

  function handleMovementSubmit(e: FormEvent) {
    e.preventDefault();
    recordMovement.mutate();
  }

  const items = itemsQuery.data ?? [];

  const [stocktakeBranchId, setStocktakeBranchId] = useState("");
  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});
  const [stocktakeNotes, setStocktakeNotes] = useState("");
  const [stocktakeError, setStocktakeError] = useState<string | null>(null);
  const [stocktakeResult, setStocktakeResult] = useState<string | null>(null);
  const [openStocktakeId, setOpenStocktakeId] = useState<string | null>(null);

  const [lowStockBranchId, setLowStockBranchId] = useState("");
  const [reorderPointDrafts, setReorderPointDrafts] = useState<Record<string, string>>({});
  const lowStockQuery = useQuery({
    queryKey: ["inventory", "low-stock", lowStockBranchId],
    queryFn: () => apiRequest<LowStockRow[]>(`/inventory/low-stock?branchId=${lowStockBranchId}`),
    enabled: !!lowStockBranchId,
  });
  const updateThreshold = useMutation({
    mutationFn: ({ inventoryItemId, reorderPoint }: { inventoryItemId: string; reorderPoint: number }) =>
      apiRequest("/inventory/stock-thresholds", {
        method: "PATCH",
        body: { branchId: lowStockBranchId, inventoryItemId, reorderPoint },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "low-stock", lowStockBranchId] }),
  });

  const boardQuery = useQuery({
    queryKey: ["inventory", "stocktakes", "board", stocktakeBranchId],
    queryFn: () => apiRequest<StocktakeBoardRow[]>(`/inventory/stocktakes/board?branchId=${stocktakeBranchId}`),
    enabled: !!stocktakeBranchId,
  });

  const stocktakesQuery = useQuery({
    queryKey: ["inventory", "stocktakes", stocktakeBranchId],
    queryFn: () => apiRequest<Stocktake[]>(`/inventory/stocktakes?branchId=${stocktakeBranchId}`),
    enabled: !!stocktakeBranchId,
  });

  const createStocktake = useMutation({
    mutationFn: () =>
      apiRequest<Stocktake>("/inventory/stocktakes", {
        method: "POST",
        body: {
          branchId: stocktakeBranchId,
          notes: stocktakeNotes || undefined,
          lines: Object.entries(actualQuantities)
            .filter(([, v]) => v.trim() !== "")
            .map(([inventoryItemId, v]) => ({ inventoryItemId, actualQuantity: Number(v) })),
        },
      }),
    onSuccess: (res) => {
      setStocktakeResult(
        res.lines.length === 0
          ? "تم حفظ الجرد - كل الأصناف مطابقة"
          : `تم حفظ الجرد - عدد البنود المختلفة: ${res.lines.length}، إجمالي الفرق: ${fmt(res.totalVarianceValue)}`
      );
      setStocktakeError(null);
      setActualQuantities({});
      queryClient.invalidateQueries({ queryKey: ["inventory", "stocktakes"] });
    },
    onError: (err) => {
      setStocktakeError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع");
      setStocktakeResult(null);
    },
  });

  function handleStocktakeSubmit(e: FormEvent) {
    e.preventDefault();
    createStocktake.mutate();
  }

  const board = boardQuery.data ?? [];
  const stocktakes = stocktakesQuery.data ?? [];
  const openStocktake = stocktakes.find((s) => s.id === openStocktakeId) ?? null;

  const [transferForm, setTransferForm] = useState({ fromBranchId: "", toBranchId: "", requiredDate: "" });
  const [transferLines, setTransferLines] = useState<{ inventoryItemId: string; requestedQuantity: string }[]>([
    { inventoryItemId: "", requestedQuantity: "" },
  ]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferFilterBranchId, setTransferFilterBranchId] = useState("");

  const transferRequestsQuery = useQuery({
    queryKey: ["inventory", "transfer-requests", transferFilterBranchId],
    queryFn: () =>
      apiRequest<TransferRequest[]>(
        transferFilterBranchId ? `/inventory/transfer-requests?fromBranchId=${transferFilterBranchId}` : "/inventory/transfer-requests"
      ),
  });

  const createTransferRequest = useMutation({
    mutationFn: () =>
      apiRequest("/inventory/transfer-requests", {
        method: "POST",
        body: {
          fromBranchId: transferForm.fromBranchId,
          toBranchId: transferForm.toBranchId,
          requiredDate: transferForm.requiredDate || undefined,
          lines: transferLines
            .filter((l) => l.inventoryItemId && l.requestedQuantity)
            .map((l) => ({ inventoryItemId: l.inventoryItemId, requestedQuantity: Number(l.requestedQuantity) })),
        },
      }),
    onSuccess: () => {
      setTransferLines([{ inventoryItemId: "", requestedQuantity: "" }]);
      setTransferError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfer-requests"] });
    },
    onError: (err) => setTransferError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [transferActionError, setTransferActionError] = useState<string | null>(null);
  const [transferCancelReasons, setTransferCancelReasons] = useState<Record<string, string>>({});

  const approveTransferRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/inventory/transfer-requests/${id}/approve`, { method: "POST", body: {} }),
    onSuccess: () => {
      setTransferActionError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfer-requests"] });
    },
    onError: (err) => setTransferActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const dispatchTransferRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/inventory/transfer-requests/${id}/dispatch`, { method: "POST", body: {} }),
    onSuccess: () => {
      setTransferActionError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfer-requests"] });
    },
    onError: (err) => setTransferActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const receiveTransferRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/inventory/transfer-requests/${id}/receive`, { method: "POST", body: {} }),
    onSuccess: () => {
      setTransferActionError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfer-requests"] });
    },
    onError: (err) => setTransferActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const cancelTransferRequest = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/inventory/transfer-requests/${id}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      setTransferActionError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfer-requests"] });
    },
    onError: (err) => setTransferActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const transferRequests = transferRequestsQuery.data ?? [];

  function branchName(id: string): string {
    return branchesQuery.data?.find((b) => b.id === id)?.name ?? id;
  }
  function itemName(id: string): string {
    return items.find((i) => i.id === id)?.name ?? id;
  }

  return (
    <div>
      <PageHeader title="المخزون" description="الأصناف وحركات المخزون والجرد الفعلي" />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "items" && (
        <>
          <div className="mb-6 mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>إضافة صنف</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleItemSubmit} className="space-y-4">
                  <Field label="اسم الصنف">
                    <Input required value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
                  </Field>
                  <Field label="الوحدة (كيلو/لتر/قطعة)">
                    <Input required value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} />
                  </Field>
                  <Field label="نوع الصنف">
                    <Select value={newItemType} onChange={(e) => setNewItemType(e.target.value)}>
                      <option value="raw">خام</option>
                      <option value="manufactured">مصنّع (ناتج تصنيع/تعبئة)</option>
                    </Select>
                  </Field>
                  {itemError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{itemError}</p>}
                  <Button type="submit" disabled={createItem.isPending}>إضافة</Button>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تسجيل حركة مخزون</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleMovementSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="الصنف">
                      <Select required value={movementForm.inventoryItemId} onChange={(e) => setMovementForm({ ...movementForm, inventoryItemId: e.target.value })}>
                        <option value="">اختر صنف</option>
                        {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                      </Select>
                    </Field>
                    <Field label="الفرع">
                      <Select required value={movementForm.branchId} onChange={(e) => setMovementForm({ ...movementForm, branchId: e.target.value })}>
                        <option value="">اختر فرع</option>
                        {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="نوع الحركة">
                      <Select value={movementForm.movementType} onChange={(e) => setMovementForm({ ...movementForm, movementType: e.target.value })}>
                        {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="الكمية (سالبة للخصم)">
                      <Input required type="number" step="any" value={movementForm.quantityDelta} onChange={(e) => setMovementForm({ ...movementForm, quantityDelta: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="السبب (اختياري)">
                    <Input value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} />
                  </Field>
                  {movementError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{movementError}</p>}
                  {movementResult && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{movementResult}</p>}
                  <Button type="submit" disabled={recordMovement.isPending}>تسجيل</Button>
                </form>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>الأصناف ({items.length})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>الاسم</TH><TH>الوحدة</TH><TH>النوع</TH><TH>سياسة الرصيد السالب</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-semibold text-slate-900">{i.name}</TD>
                      <TD>{i.unit}</TD>
                      <TD><Badge tone={i.itemType === "raw" ? "neutral" : "brand"}>{i.itemType === "raw" ? "خام" : "مصنّع"}</Badge></TD>
                      <TD><Badge tone={i.negativeStockPolicy === "STRICT" ? "danger" : "warning"}>{i.negativeStockPolicy === "STRICT" ? "ممنوع" : "بموافقة"}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {items.length === 0 && <EmptyState>مفيش أصناف لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "stocktake" && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>جرد فعلي جديد</CardTitle>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleStocktakeSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="الفرع">
                    <Select
                      required
                      value={stocktakeBranchId}
                      onChange={(e) => {
                        setStocktakeBranchId(e.target.value);
                        setActualQuantities({});
                        setStocktakeResult(null);
                        setStocktakeError(null);
                      }}
                    >
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="ملاحظات (اختياري)">
                    <Input value={stocktakeNotes} onChange={(e) => setStocktakeNotes(e.target.value)} />
                  </Field>
                </div>

                {stocktakeBranchId && (
                  <Table>
                    <THead>
                      <TR>
                        <TH>الصنف</TH><TH>الوحدة</TH><TH>رصيد النظام</TH><TH>الكمية الفعلية</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {board.map((row) => (
                        <TR key={row.inventoryItemId}>
                          <TD className="font-semibold text-slate-900">{row.name}</TD>
                          <TD>{row.unit}</TD>
                          <TD>{fmt(row.systemQuantity)}</TD>
                          <TD>
                            <Input
                              type="number"
                              step="any"
                              placeholder={fmt(row.systemQuantity)}
                              value={actualQuantities[row.inventoryItemId] ?? ""}
                              onChange={(e) =>
                                setActualQuantities({ ...actualQuantities, [row.inventoryItemId]: e.target.value })
                              }
                            />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                {stocktakeBranchId && board.length === 0 && <EmptyState>مفيش أصناف لسه</EmptyState>}

                {stocktakeError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{stocktakeError}</p>}
                {stocktakeResult && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{stocktakeResult}</p>}
                <Button type="submit" disabled={createStocktake.isPending || !stocktakeBranchId}>حفظ الجرد</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>سجل الجرد ({stocktakes.length})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>التاريخ</TH><TH>ملاحظات</TH><TH>عدد البنود</TH><TH>إجمالي الفرق</TH><TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {stocktakes.map((s) => (
                    <TR key={s.id}>
                      <TD>{new Date(s.createdAt).toLocaleString("en-US")}</TD>
                      <TD>{s.notes ?? "-"}</TD>
                      <TD>{s.lines.length}</TD>
                      <TD className={s.totalVarianceValue < 0 ? "text-red-700" : s.totalVarianceValue > 0 ? "text-emerald-700" : ""}>
                        {fmt(s.totalVarianceValue)}
                      </TD>
                      <TD>
                        <Button variant="ghost" onClick={() => setOpenStocktakeId(openStocktakeId === s.id ? null : s.id)}>
                          {openStocktakeId === s.id ? "إخفاء" : "تفاصيل"}
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {stocktakeBranchId && stocktakes.length === 0 && <EmptyState>مفيش جرد لسه</EmptyState>}
              {!stocktakeBranchId && <EmptyState>اختر فرع لعرض سجل الجرد</EmptyState>}
            </CardBody>
          </Card>

          {openStocktake && (
            <Card>
              <CardHeader>
                <CardTitle>تفاصيل الجرد - {new Date(openStocktake.createdAt).toLocaleString("en-US")}</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>الصنف</TH><TH>رصيد النظام</TH><TH>الفعلي</TH><TH>الفرق</TH><TH>قيمة الفرق</TH><TH>حساب الفرق</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {openStocktake.lines.map((l, idx) => (
                      <TR key={idx}>
                        <TD>{board.find((b) => b.inventoryItemId === l.inventoryItemId)?.name ?? l.inventoryItemId}</TD>
                        <TD>{fmt(l.systemQuantity)}</TD>
                        <TD>{fmt(l.actualQuantity)}</TD>
                        <TD className={l.varianceQuantity < 0 ? "text-red-700" : l.varianceQuantity > 0 ? "text-emerald-700" : ""}>
                          {fmt(l.varianceQuantity)}
                        </TD>
                        <TD>{l.varianceValue === null ? "-" : fmt(l.varianceValue)}</TD>
                        <TD>{l.chargeAccountCode ?? "-"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {openStocktake.lines.length === 0 && <EmptyState>كل الأصناف كانت مطابقة</EmptyState>}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === "low-stock" && (
        <div className="space-y-6">
          <Card>
            <CardBody>
              <Field label="الفرع">
                <Select value={lowStockBranchId} onChange={(e) => setLowStockBranchId(e.target.value)}>
                  <option value="">اختر فرع</option>
                  {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            </CardBody>
          </Card>

          {lowStockBranchId && (
            <>
              <Card>
                <CardHeader><CardTitle>ضبط حد إعادة الطلب</CardTitle></CardHeader>
                <CardBody className="p-0">
                  <Table>
                    <THead>
                      <TR><TH>الصنف</TH><TH>الوحدة</TH><TH>حد إعادة الطلب</TH><TH></TH></TR>
                    </THead>
                    <TBody>
                      {items.map((item) => {
                        const existing = lowStockQuery.data?.find((r) => r.inventoryItemId === item.id);
                        const draft = reorderPointDrafts[item.id] ?? (existing?.reorderPoint != null ? String(existing.reorderPoint) : "");
                        return (
                          <TR key={item.id}>
                            <TD className="font-semibold text-slate-900">{item.name}</TD>
                            <TD>{item.unit}</TD>
                            <TD>
                              <Input
                                type="number"
                                min="0"
                                className="w-28"
                                value={draft}
                                onChange={(e) => setReorderPointDrafts({ ...reorderPointDrafts, [item.id]: e.target.value })}
                              />
                            </TD>
                            <TD>
                              <Button
                                size="sm"
                                disabled={updateThreshold.isPending || draft === ""}
                                onClick={() => updateThreshold.mutate({ inventoryItemId: item.id, reorderPoint: Number(draft) })}
                              >
                                حفظ
                              </Button>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                  {items.length === 0 && <EmptyState>مفيش أصناف لسه</EmptyState>}
                </CardBody>
              </Card>

              <Card>
                <CardHeader><CardTitle>تنبيهات المخزون المنخفض ({lowStockQuery.data?.length ?? 0})</CardTitle></CardHeader>
                <CardBody className="p-0">
                  <Table>
                    <THead>
                      <TR><TH>الصنف</TH><TH>الرصيد الحالي</TH><TH>حد إعادة الطلب</TH><TH>الحالة</TH></TR>
                    </THead>
                    <TBody>
                      {lowStockQuery.data?.map((r) => (
                        <TR key={r.inventoryItemId}>
                          <TD className="font-semibold text-slate-900">{r.itemName}</TD>
                          <TD>{fmt(r.quantity)} {r.unit}</TD>
                          <TD>{r.reorderPoint === null ? "-" : fmt(r.reorderPoint)}</TD>
                          <TD><Badge tone={r.status === "OUT" ? "danger" : "warning"}>{LOW_STOCK_STATUS_LABELS[r.status]}</Badge></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {lowStockQuery.data?.length === 0 && <EmptyState>مفيش أصناف منخفضة دلوقتي - كل حاجة تمام</EmptyState>}
                </CardBody>
              </Card>
            </>
          )}
          {!lowStockBranchId && <EmptyState>اختر فرع عشان تشوف حدود المخزون والتنبيهات</EmptyState>}
        </div>
      )}

      {tab === "transfers" && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>طلب تحويل جديد</CardTitle></CardHeader>
            <CardBody>
              <form
                onSubmit={(e: FormEvent) => { e.preventDefault(); createTransferRequest.mutate(); }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="من فرع (المصدر - غالبًا السنتر كيتشن)">
                    <Select required value={transferForm.fromBranchId} onChange={(e) => setTransferForm({ ...transferForm, fromBranchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="لفرع (الطالب)">
                    <Select required value={transferForm.toBranchId} onChange={(e) => setTransferForm({ ...transferForm, toBranchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="التاريخ المطلوب (اختياري)">
                    <Input type="date" value={transferForm.requiredDate} onChange={(e) => setTransferForm({ ...transferForm, requiredDate: e.target.value })} />
                  </Field>
                </div>

                <div className="space-y-2">
                  {transferLines.map((line, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Select
                        value={line.inventoryItemId}
                        onChange={(e) => setTransferLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, inventoryItemId: e.target.value } : l)))}
                      >
                        <option value="">اختر صنف</option>
                        {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                      </Select>
                      <Input
                        type="number"
                        step="any"
                        placeholder="الكمية المطلوبة"
                        value={line.requestedQuantity}
                        onChange={(e) => setTransferLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, requestedQuantity: e.target.value } : l)))}
                      />
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setTransferLines((prev) => [...prev, { inventoryItemId: "", requestedQuantity: "" }])}
                >
                  + صنف
                </Button>

                {transferError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{transferError}</p>}
                <div><Button type="submit" disabled={createTransferRequest.isPending}>إرسال الطلب</Button></div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>سجل طلبات التحويل ({transferRequests.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <div className="border-b border-slate-100 p-4">
                <Field label="فلترة حسب فرع المصدر (اختياري)">
                  <Select value={transferFilterBranchId} onChange={(e) => setTransferFilterBranchId(e.target.value)}>
                    <option value="">كل الفروع</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
              {transferActionError && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{transferActionError}</p>}
              <Table>
                <THead>
                  <TR><TH>من</TH><TH>لـ</TH><TH>البنود</TH><TH>التاريخ المطلوب</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {transferRequests.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-semibold text-slate-900">{branchName(r.fromBranchId)}</TD>
                      <TD>{branchName(r.toBranchId)}</TD>
                      <TD className="max-w-xs truncate">
                        {r.lines.map((l) => `${itemName(l.inventoryItemId)} (${l.requestedQuantity})`).join("، ")}
                      </TD>
                      <TD>{r.requiredDate ? r.requiredDate.slice(0, 10) : "-"}</TD>
                      <TD>
                        <Badge tone={TRANSFER_STATUS_TONES[r.status]}>{TRANSFER_STATUS_LABELS[r.status]}</Badge>
                        {r.status === "CANCELLED" && r.cancellationReason && <div className="mt-1 text-xs text-slate-500">{r.cancellationReason}</div>}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.status === "SUBMITTED" && (
                            <>
                              <Button size="sm" onClick={() => approveTransferRequest.mutate(r.id)} disabled={approveTransferRequest.isPending}>اعتماد</Button>
                              <Input
                                placeholder="سبب الإلغاء"
                                className="w-32"
                                value={transferCancelReasons[r.id] ?? ""}
                                onChange={(e) => setTransferCancelReasons({ ...transferCancelReasons, [r.id]: e.target.value })}
                              />
                              <Button
                                size="sm" variant="danger"
                                onClick={() => cancelTransferRequest.mutate({ id: r.id, reason: transferCancelReasons[r.id] ?? "" })}
                                disabled={cancelTransferRequest.isPending}
                              >
                                إلغاء
                              </Button>
                            </>
                          )}
                          {r.status === "APPROVED" && (
                            <>
                              <Button size="sm" onClick={() => dispatchTransferRequest.mutate(r.id)} disabled={dispatchTransferRequest.isPending}>شحن</Button>
                              <Input
                                placeholder="سبب الإلغاء"
                                className="w-32"
                                value={transferCancelReasons[r.id] ?? ""}
                                onChange={(e) => setTransferCancelReasons({ ...transferCancelReasons, [r.id]: e.target.value })}
                              />
                              <Button
                                size="sm" variant="danger"
                                onClick={() => cancelTransferRequest.mutate({ id: r.id, reason: transferCancelReasons[r.id] ?? "" })}
                                disabled={cancelTransferRequest.isPending}
                              >
                                إلغاء
                              </Button>
                            </>
                          )}
                          {r.status === "DISPATCHED" && (
                            <Button size="sm" onClick={() => receiveTransferRequest.mutate(r.id)} disabled={receiveTransferRequest.isPending}>استلام</Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {transferRequests.length === 0 && <EmptyState>مفيش طلبات تحويل لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
