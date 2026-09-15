import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>المخزون</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة صنف</h2>
        <form onSubmit={handleItemSubmit} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
          <input required placeholder="اسم الصنف" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: 6 }} />
          <input required placeholder="الوحدة (كيلو/لتر/قطعة)" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} style={{ padding: 6 }} />
          <button type="submit" disabled={createItem.isPending}>إضافة</button>
        </form>
        {itemError && <p style={{ color: "crimson" }}>{itemError}</p>}
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>تسجيل حركة مخزون</h2>
        <form onSubmit={handleMovementSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              الصنف
              <select required value={movementForm.inventoryItemId} onChange={(e) => setMovementForm({ ...movementForm, inventoryItemId: e.target.value })} style={{ display: "block", width: "100%", padding: 6 }}>
                <option value="">اختر صنف</option>
                {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </label>
            <label>
              الفرع
              <select required value={movementForm.branchId} onChange={(e) => setMovementForm({ ...movementForm, branchId: e.target.value })} style={{ display: "block", width: "100%", padding: 6 }}>
                <option value="">اختر فرع</option>
                {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>
              نوع الحركة
              <select value={movementForm.movementType} onChange={(e) => setMovementForm({ ...movementForm, movementType: e.target.value })} style={{ display: "block", width: "100%", padding: 6 }}>
                {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              الكمية (سالبة للخصم)
              <input required type="number" step="any" value={movementForm.quantityDelta} onChange={(e) => setMovementForm({ ...movementForm, quantityDelta: e.target.value })} style={{ display: "block", width: "100%", padding: 6 }} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 8 }}>
            السبب (اختياري)
            <input value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} style={{ display: "block", width: "100%", padding: 6 }} />
          </label>
          {movementError && <p style={{ color: "crimson" }}>{movementError}</p>}
          {movementResult && <p style={{ color: "green" }}>{movementResult}</p>}
          <button type="submit" disabled={recordMovement.isPending} style={{ padding: "8px 16px", marginTop: 8 }}>
            تسجيل
          </button>
        </form>
      </section>

      <section>
        <h2>الأصناف ({itemsQuery.data?.length ?? 0})</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الاسم</th><th>الوحدة</th><th>النوع</th><th>سياسة الرصيد السالب</th>
            </tr>
          </thead>
          <tbody>
            {itemsQuery.data?.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{i.name}</td>
                <td>{i.unit}</td>
                <td>{i.itemType === "raw" ? "خام" : "مصنّع"}</td>
                <td>{i.negativeStockPolicy === "STRICT" ? "ممنوع" : "بموافقة"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
