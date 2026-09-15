import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>المشتريات والموردين</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة مورد</h2>
        <form onSubmit={handleSupplierSubmit} style={{ display: "flex", gap: 8 }}>
          <input required placeholder="اسم المورد" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={{ flex: 1, padding: 6 }} />
          <button type="submit" disabled={createSupplier.isPending}>إضافة</button>
        </form>
        <ul>
          {suppliersQuery.data?.map((s) => <li key={s.id}>{s.name} ({s.status})</li>)}
        </ul>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>تسجيل إذن استلام بضاعة (PO-less)</h2>
        <form onSubmit={handleReceiptSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select required value={receiptForm.branchId} onChange={(e) => setReceiptForm({ ...receiptForm, branchId: e.target.value })} style={{ padding: 6 }}>
              <option value="">اختر فرع</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select required value={receiptForm.inventoryItemId} onChange={(e) => setReceiptForm({ ...receiptForm, inventoryItemId: e.target.value })} style={{ padding: 6 }}>
              <option value="">اختر صنف</option>
              {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
            <input required type="number" placeholder="الكمية" value={receiptForm.quantity} onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })} style={{ padding: 6 }} />
            <input required type="number" placeholder="تكلفة الوحدة" value={receiptForm.unitCost} onChange={(e) => setReceiptForm({ ...receiptForm, unitCost: e.target.value })} style={{ padding: 6 }} />
          </div>
          {receiptError && <p style={{ color: "crimson" }}>{receiptError}</p>}
          <button type="submit" disabled={createReceipt.isPending} style={{ padding: "8px 16px", marginTop: 8 }}>
            تسجيل
          </button>
        </form>
      </section>

      <section>
        <h2>أذون الاستلام</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الفرع</th><th>البنود</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {receiptsQuery.data?.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{branchName(r.branchId)}</td>
                <td>{r.lines.map((l) => `${itemName(l.inventoryItemId)}: ${l.quantity}`).join("، ")}</td>
                <td>{r.status === "CONFIRMED" ? "اتأكد" : "مسودة"}</td>
                <td>
                  {r.status === "DRAFT" && (
                    <button onClick={() => confirmReceipt.mutate(r.id)} disabled={confirmReceipt.isPending}>
                      تأكيد (يرحّل المخزون)
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
