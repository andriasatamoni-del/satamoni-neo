import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface Supplier { id: string; name: string; status: string; }
interface Branch { id: string; name: string; }
interface InventoryItem { id: string; name: string; unit: string; }
interface GoodsReceipt {
  id: string;
  branchId: string;
  status: "DRAFT" | "CONFIRMED";
  lines: { inventoryItemId: string; quantity: number; unitCost: number }[];
}

export function ProcurementPage() {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ["procurement", "suppliers"], queryFn: () => apiRequest<Supplier[]>("/procurement/suppliers") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const itemsQuery = useQuery({ queryKey: ["inventory", "items"], queryFn: () => apiRequest<InventoryItem[]>("/inventory/items") });
  const receiptsQuery = useQuery({ queryKey: ["procurement", "goods-receipts"], queryFn: () => apiRequest<GoodsReceipt[]>("/procurement/goods-receipts") });

  const [supplierName, setSupplierName] = useState("");
  const createSupplier = useMutation({
    mutationFn: () => apiRequest("/procurement/suppliers", { method: "POST", body: { name: supplierName } }),
    onSuccess: () => {
      setSupplierName("");
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers"] });
    },
  });

  const [receiptForm, setReceiptForm] = useState({ branchId: "", inventoryItemId: "", quantity: "", unitCost: "" });
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const createReceipt = useMutation({
    mutationFn: () =>
      apiRequest("/procurement/goods-receipts", {
        method: "POST",
        body: {
          branchId: receiptForm.branchId,
          lines: [{ inventoryItemId: receiptForm.inventoryItemId, quantity: Number(receiptForm.quantity), unitCost: Number(receiptForm.unitCost) }],
        },
      }),
    onSuccess: () => {
      setReceiptForm({ branchId: "", inventoryItemId: "", quantity: "", unitCost: "" });
      setReceiptError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "goods-receipts"] });
    },
    onError: (err) => setReceiptError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const confirmReceipt = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/goods-receipts/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement", "goods-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  function handleSupplierSubmit(e: FormEvent) {
    e.preventDefault();
    createSupplier.mutate();
  }
  function handleReceiptSubmit(e: FormEvent) {
    e.preventDefault();
    createReceipt.mutate();
  }

  const itemName = (id: string) => itemsQuery.data?.find((i) => i.id === id)?.name ?? id;
  const branchName = (id: string) => branchesQuery.data?.find((b) => b.id === id)?.name ?? id;
  const suppliers = suppliersQuery.data ?? [];
  const receipts = receiptsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="المشتريات والموردين" description="الموردين وأذون استلام البضاعة" />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>إضافة مورد</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSupplierSubmit} className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <Field label="اسم المورد">
                  <Input required value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" disabled={createSupplier.isPending}>إضافة</Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {suppliers.map((s) => (
                <Badge key={s.id} tone="neutral">{s.name} - {s.status}</Badge>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تسجيل إذن استلام بضاعة (PO-less)</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleReceiptSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="الفرع">
                  <Select required value={receiptForm.branchId} onChange={(e) => setReceiptForm({ ...receiptForm, branchId: e.target.value })}>
                    <option value="">اختر فرع</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="الصنف">
                  <Select required value={receiptForm.inventoryItemId} onChange={(e) => setReceiptForm({ ...receiptForm, inventoryItemId: e.target.value })}>
                    <option value="">اختر صنف</option>
                    {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </Select>
                </Field>
                <Field label="الكمية">
                  <Input required type="number" value={receiptForm.quantity} onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })} />
                </Field>
                <Field label="تكلفة الوحدة">
                  <Input required type="number" value={receiptForm.unitCost} onChange={(e) => setReceiptForm({ ...receiptForm, unitCost: e.target.value })} />
                </Field>
              </div>
              {receiptError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{receiptError}</p>}
              <Button type="submit" disabled={createReceipt.isPending}>تسجيل</Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>أذون الاستلام ({receipts.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>الفرع</TH><TH>البنود</TH><TH>الحالة</TH><TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {receipts.map((r) => (
                <TR key={r.id}>
                  <TD className="font-semibold text-slate-900">{branchName(r.branchId)}</TD>
                  <TD>{r.lines.map((l) => `${itemName(l.inventoryItemId)}: ${l.quantity}`).join("، ")}</TD>
                  <TD><Badge tone={r.status === "CONFIRMED" ? "success" : "neutral"}>{r.status === "CONFIRMED" ? "اتأكد" : "مسودة"}</Badge></TD>
                  <TD>
                    {r.status === "DRAFT" && (
                      <Button size="sm" variant="secondary" onClick={() => confirmReceipt.mutate(r.id)} disabled={confirmReceipt.isPending}>
                        تأكيد (يرحّل المخزون)
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {receipts.length === 0 && <EmptyState>مفيش أذون استلام لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
