import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface PurchaseLine {
  inventoryItemId: string; quantity: number; unit: string | null; unitPrice: number; lineTotal: number;
}
interface Purchase {
  id: string; branchId: string; businessDate: string; category: string | null; amount: number; notes: string | null;
  supplierId: string | null; supplierDocumentNumber: string | null; status: "PENDING" | "CONFIRMED" | "REJECTED";
  reviewedBy: string | null; rejectionReason: string | null; postedToInventory: boolean; items: PurchaseLine[];
}
interface Branch { id: string; name: string; }
interface Supplier { id: string; name: string; }
interface InventoryItem { id: string; name: string; unit: string; itemType: string; }

const STATUS_LABELS: Record<string, string> = { PENDING: "بانتظار المراجعة", CONFIRMED: "معتمد", REJECTED: "مرفوض" };
const STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  PENDING: "warning", CONFIRMED: "success", REJECTED: "danger",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

interface ItemRow { inventoryItemId: string; quantity: string; unitPrice: string; }

export function PurchasesPage() {
  const { user } = useAuth();
  const isCashier = user?.role === "cashier";
  const queryClient = useQueryClient();

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const suppliersQuery = useQuery({ queryKey: ["procurement", "suppliers"], queryFn: () => apiRequest<Supplier[]>("/procurement/suppliers") });
  const rawItemsQuery = useQuery({
    queryKey: ["inventory", "items", "raw"],
    queryFn: async () => (await apiRequest<InventoryItem[]>("/inventory/items")).filter((i) => i.itemType === "raw"),
  });

  const [filterBranchId, setFilterBranchId] = useState("");
  const purchasesQuery = useQuery({
    queryKey: ["purchases", "list", filterBranchId],
    queryFn: () => apiRequest<Purchase[]>(filterBranchId ? `/purchases?branchId=${filterBranchId}` : "/purchases"),
  });

  const [form, setForm] = useState({
    branchId: "", businessDate: new Date().toISOString().slice(0, 10), amount: "", notes: "",
    supplierId: "", supplierDocumentNumber: "",
  });
  const [mode, setMode] = useState<"amount" | "items">("amount");
  const [itemRows, setItemRows] = useState<ItemRow[]>([{ inventoryItemId: "", quantity: "", unitPrice: "" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  function addItemRow() {
    setItemRows([...itemRows, { inventoryItemId: "", quantity: "", unitPrice: "" }]);
  }
  function updateItemRow(idx: number, patch: Partial<ItemRow>) {
    setItemRows(itemRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeItemRow(idx: number) {
    setItemRows(itemRows.filter((_, i) => i !== idx));
  }

  const createPurchase = useMutation({
    mutationFn: (acknowledgeDuplicate?: boolean) =>
      apiRequest("/purchases", {
        method: "POST",
        body: {
          branchId: form.branchId,
          businessDate: form.businessDate,
          amount: mode === "amount" ? Number(form.amount) : undefined,
          notes: form.notes || undefined,
          supplierId: form.supplierId || undefined,
          supplierDocumentNumber: form.supplierDocumentNumber || undefined,
          acknowledgeDuplicate,
          items:
            mode === "items"
              ? itemRows
                  .filter((r) => r.inventoryItemId && r.quantity)
                  .map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice) }))
              : undefined,
        },
      }),
    onSuccess: () => {
      setForm({ branchId: form.branchId, businessDate: form.businessDate, amount: "", notes: "", supplierId: "", supplierDocumentNumber: "" });
      setItemRows([{ inventoryItemId: "", quantity: "", unitPrice: "" }]);
      setFormError(null);
      setDuplicateWarning(false);
      queryClient.invalidateQueries({ queryKey: ["purchases", "list"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicateWarning(true);
        setFormError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع");
      }
    },
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const confirmPurchase = useMutation({
    mutationFn: (id: string) => apiRequest(`/purchases/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { setActionError(null); queryClient.invalidateQueries({ queryKey: ["purchases", "list"] }); },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const rejectPurchase = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiRequest(`/purchases/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: () => { setActionError(null); queryClient.invalidateQueries({ queryKey: ["purchases", "list"] }); },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const purchases = purchasesQuery.data ?? [];

  function branchName(id: string): string {
    return branchesQuery.data?.find((b) => b.id === id)?.name ?? id;
  }
  function supplierName(id: string | null): string {
    if (!id) return "-";
    return suppliersQuery.data?.find((s) => s.id === id)?.name ?? id;
  }
  function itemName(id: string): string {
    return rawItemsQuery.data?.find((i) => i.id === id)?.name ?? id;
  }

  return (
    <div>
      <PageHeader title="المشتريات النقدية" description="تسجيل مشتريات نقدية طارئة (فرع/سنتر كيتشن) من غير أمر شراء رسمي" />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader><CardTitle>تسجيل مشترى جديد</CardTitle></CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-slate-500">
              {isCashier
                ? "هيتسجّل على فرعك والنهاردة، وحالته دايمًا بانتظار المراجعة - محتاج مراجعة مدير الفرع أو المحاسب قبل ما يترحّل."
                : "التسجيل هنا هو الاعتماد نفسه: هيترحّل فورًا. مشترى بمبلغ حر (من غير بنود) مبيرحّلش أي حركة مخزون أو قيد محاسبي - مجرد سجل. مشترى ببنود مواد خام حقيقية بيرحّل حركة مخزون وقيد محاسبي (1400/1100) فورًا."}
            </p>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); createPurchase.mutate(undefined); }} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {!isCashier && (
                  <Field label="الفرع">
                    <Select required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                )}
                {!isCashier && (
                  <Field label="التاريخ">
                    <Input required type="date" value={form.businessDate} onChange={(e) => setForm({ ...form, businessDate: e.target.value })} />
                  </Field>
                )}
                {!isCashier && (
                  <Field label="نوع المشترى">
                    <Select value={mode} onChange={(e) => setMode(e.target.value as "amount" | "items")}>
                      <option value="amount">مبلغ حر (من غير بنود)</option>
                      <option value="items">بنود مواد خام</option>
                    </Select>
                  </Field>
                )}
                {mode === "amount" && (
                  <Field label="المبلغ">
                    <Input required type="number" min="0.01" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </Field>
                )}
                {!isCashier && (
                  <Field label="على ذمة مورد (اختياري)">
                    <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                      <option value="">بدون مورد</option>
                      {suppliersQuery.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                )}
                {!isCashier && form.supplierId && (
                  <Field label="رقم مستند المورد (اختياري - لفحص التكرار)">
                    <Input value={form.supplierDocumentNumber} onChange={(e) => setForm({ ...form, supplierDocumentNumber: e.target.value })} />
                  </Field>
                )}
              </div>

              {!isCashier && mode === "items" && (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                  {itemRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
                      <Field label="الصنف">
                        <Select value={row.inventoryItemId} onChange={(e) => updateItemRow(idx, { inventoryItemId: e.target.value })}>
                          <option value="">اختر صنف خام</option>
                          {rawItemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                        </Select>
                      </Field>
                      <Field label="الكمية">
                        <Input type="number" min="0.01" step="any" value={row.quantity} onChange={(e) => updateItemRow(idx, { quantity: e.target.value })} />
                      </Field>
                      <Field label="سعر الوحدة">
                        <Input type="number" min="0" step="any" value={row.unitPrice} onChange={(e) => updateItemRow(idx, { unitPrice: e.target.value })} />
                      </Field>
                      <Button type="button" variant="secondary" size="sm" onClick={() => removeItemRow(idx)}>حذف</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" onClick={addItemRow}>+ بند تاني</Button>
                </div>
              )}

              <Field label="ملاحظات (اختياري)">
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              {formError && (
                <div className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  <p>{formError}</p>
                  {duplicateWarning && (
                    <Button type="button" size="sm" variant="danger" onClick={() => createPurchase.mutate(true)}>
                      تسجيل برضه (مش تكرار)
                    </Button>
                  )}
                </div>
              )}
              <Button type="submit" disabled={createPurchase.isPending}>تسجيل</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>سجل المشتريات ({purchases.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            {!isCashier && (
              <div className="border-b border-slate-100 p-4">
                <Field label="فلترة حسب فرع (اختياري)">
                  <Select value={filterBranchId} onChange={(e) => setFilterBranchId(e.target.value)}>
                    <option value="">كل الفروع</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
            )}
            {actionError && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{actionError}</p>}
            <Table>
              <THead>
                <TR>
                  <TH>التاريخ</TH>{!isCashier && <TH>الفرع</TH>}<TH>النوع</TH><TH>المبلغ</TH><TH>المورد</TH><TH>الحالة</TH><TH>إجراء</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.businessDate.slice(0, 10)}</TD>
                    {!isCashier && <TD>{branchName(p.branchId)}</TD>}
                    <TD>
                      {p.items.length > 0 ? (
                        <span title={p.items.map((l) => `${itemName(l.inventoryItemId)} × ${l.quantity}`).join(", ")}>
                          {p.items.length} بند {p.postedToInventory && "(مُرحّل مخزون)"}
                        </span>
                      ) : (
                        "مبلغ حر"
                      )}
                    </TD>
                    <TD className="font-bold text-slate-900">{fmt(p.amount)}ج</TD>
                    <TD>{supplierName(p.supplierId)}{p.supplierDocumentNumber ? ` (${p.supplierDocumentNumber})` : ""}</TD>
                    <TD>
                      <Badge tone={STATUS_TONES[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      {p.status === "REJECTED" && p.rejectionReason && <div className="mt-1 text-xs text-slate-500">{p.rejectionReason}</div>}
                    </TD>
                    <TD>
                      {p.status === "PENDING" && !isCashier && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button size="sm" onClick={() => confirmPurchase.mutate(p.id)} disabled={confirmPurchase.isPending}>اعتماد</Button>
                          <Input
                            placeholder="سبب الرفض"
                            className="w-32"
                            value={rejectReasons[p.id] ?? ""}
                            onChange={(ev) => setRejectReasons({ ...rejectReasons, [p.id]: ev.target.value })}
                          />
                          <Button
                            size="sm" variant="danger"
                            onClick={() => rejectPurchase.mutate({ id: p.id, reason: rejectReasons[p.id] ?? "" })}
                            disabled={rejectPurchase.isPending}
                          >
                            رفض
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {purchases.length === 0 && <EmptyState>مفيش مشتريات مسجلة لسه</EmptyState>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
