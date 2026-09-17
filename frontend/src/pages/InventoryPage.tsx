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
    </div>
  );
}
