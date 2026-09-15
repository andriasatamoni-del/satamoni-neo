import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

interface Branch { id: string; name: string; }
interface MenuItemVariant { id: string; label: string; price: number; }
interface MenuItem { id: string; name: string; variants: MenuItemVariant[]; }
interface OrderLine { menuItemId: string; variantId: string; quantity: number; unitPrice: number; lineTotal: number; }
interface Order {
  id: string;
  branchId: string;
  orderType: string;
  items: OrderLine[];
  total: number;
  status: string;
  kitchenStatus: string;
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "بيتحضّر", out_for_delivery: "في الطريق", completed: "مكتمل", cancelled: "ملغي",
};

export function OrdersPage() {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const menuItemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => apiRequest<Order[]>("/orders") });

  const [form, setForm] = useState({ branchId: "", orderType: "takeaway", variantId: "", quantity: "1" });
  const [error, setError] = useState<string | null>(null);

  const createOrder = useMutation({
    mutationFn: () =>
      apiRequest("/orders", {
        method: "POST",
        body: {
          branchId: form.branchId,
          orderType: form.orderType,
          items: [{ variantId: form.variantId, quantity: Number(form.quantity) }],
        },
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const completeOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/orders/${id}/status`, { method: "PATCH", body: { status: "completed" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createOrder.mutate();
  }

  const allVariants = menuItemsQuery.data?.flatMap((item) => item.variants.map((v) => ({ ...v, itemName: item.name }))) ?? [];
  const variantLabel = (variantId: string) => {
    for (const item of menuItemsQuery.data ?? []) {
      const v = item.variants.find((v) => v.id === variantId);
      if (v) return `${item.name} (${v.label})`;
    }
    return variantId;
  };

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>الطلبات (POS)</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>تسجيل طلب جديد</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} style={{ padding: 6 }}>
              <option value="">اختر فرع</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })} style={{ padding: 6 }}>
              <option value="takeaway">تيك أواي</option>
              <option value="dinein">صالة</option>
              <option value="delivery">دليفري</option>
            </select>
            <select required value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })} style={{ padding: 6 }}>
              <option value="">اختر صنف</option>
              {allVariants.map((v) => <option key={v.id} value={v.id}>{v.itemName} ({v.label}) - {v.price}ج</option>)}
            </select>
            <input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ padding: 6 }} />
          </div>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={createOrder.isPending} style={{ padding: "8px 16px", marginTop: 8 }}>
            تسجيل الطلب
          </button>
        </form>
      </section>

      <section>
        <h2>الطلبات</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>النوع</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {ordersQuery.data?.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{o.orderType}</td>
                <td>{o.items.map((i) => `${variantLabel(i.variantId)} × ${i.quantity}`).join("، ")}</td>
                <td>{o.total}ج</td>
                <td>{STATUS_LABELS[o.status] ?? o.status}</td>
                <td>
                  {o.status === "preparing" && (
                    <button onClick={() => completeOrder.mutate(o.id)} disabled={completeOrder.isPending}>
                      إتمام
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
