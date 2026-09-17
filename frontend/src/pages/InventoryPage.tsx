import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

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

const MOVEMENT_TYPES = [
  { value: "RECEIPT", label: "استلام" },
  { value: "CONSUMPTION", label: "استهلاك" },
  { value: "ADJUSTMENT", label: "تسوية" },
  { value: "TRANSFER_OUT", label: "تحويل لفرع تاني" },
  { value: "TRANSFER_IN", label: "تحويل من فرع تاني" },
];

export function InventoryPage() {
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["inventory", "items"], queryFn: () => apiRequest<InventoryItem[]>("/inventory/items") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });

  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);

  const createItem = useMutation({
    mutationFn: () => apiRequest("/inventory/items", { method: "POST", body: { name: newItemName, unit: newItemUnit } }),
    onSuccess: () => {
      setNewItemName("");
      setNewItemUnit("");
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

  return (
    <div>
      <PageHeader title="المخزون" description="الأصناف وحركات المخزون" />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
    </div>
  );
}
