import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Badge, StatusBadge } from "../shared/ui/Badge";
import { ShiftBanner } from "./orders/ShiftBanner";
import { ShiftReviewPanel } from "./orders/ShiftReviewPanel";

interface Branch { id: string; name: string; }
interface MenuItemVariant { id: string; label: string; price: number; }
interface MenuItem { id: string; name: string; variants: MenuItemVariant[]; }
interface PaymentMethod { id: string; name: string; }
interface OrderLine { menuItemId: string; variantId: string; quantity: number; unitPrice: number; lineTotal: number; }
interface Order {
  id: string;
  branchId: string;
  orderType: string;
  items: OrderLine[];
  total: number;
  status: string;
  kitchenStatus: string;
  paymentMethodId: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "بيتحضّر", out_for_delivery: "في الطريق", completed: "مكتمل", cancelled: "ملغي",
};

const ORDER_TYPES = [
  { value: "takeaway", label: "تيك أواي" },
  { value: "dinein", label: "صالة" },
  { value: "delivery", label: "دليفري" },
];

export function OrdersPage() {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const menuItemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => apiRequest<Order[]>("/orders") });
  const paymentMethodsQuery = useQuery({ queryKey: ["payment-control", "methods"], queryFn: () => apiRequest<PaymentMethod[]>("/payment-control/payment-methods") });

  const [form, setForm] = useState({ branchId: "", orderType: "takeaway", variantId: "", quantity: "1", paymentMethodId: "" });
  const [error, setError] = useState<string | null>(null);

  const createOrder = useMutation({
    mutationFn: () =>
      apiRequest("/orders", {
        method: "POST",
        body: {
          branchId: form.branchId,
          orderType: form.orderType,
          items: [{ variantId: form.variantId, quantity: Number(form.quantity) }],
          paymentMethodId: form.paymentMethodId || undefined,
        },
      }),
    onSuccess: () => {
      setError(null);
      setForm((f) => ({ ...f, variantId: "", quantity: "1" }));
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
  const orders = ordersQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الطلبات (POS)" description="تسجيل ومتابعة طلبات البيع" />

      <ShiftBanner />
      <ShiftReviewPanel />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>تسجيل طلب جديد</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ORDER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, orderType: t.value })}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    form.orderType === t.value
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="الفرع">
                <Select required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">اختر فرع</option>
                  {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="الصنف">
                <Select required value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })}>
                  <option value="">اختر صنف</option>
                  {allVariants.map((v) => (
                    <option key={v.id} value={v.id}>{v.itemName} ({v.label}) - {v.price}ج</option>
                  ))}
                </Select>
              </Field>
              <Field label="الكمية">
                <Input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </Field>
              <Field label="طريقة الدفع (اختياري)">
                <Select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}>
                  <option value="">- بدون -</option>
                  {paymentMethodsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Field>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

            <Button type="submit" disabled={createOrder.isPending}>
              {createOrder.isPending ? "بيتسجّل..." : "تسجيل الطلب"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الطلبات ({orders.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>النوع</TH>
                <TH>الأصناف</TH>
                <TH>الإجمالي</TH>
                <TH>الحالة</TH>
                <TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD><Badge tone="neutral">{ORDER_TYPES.find((t) => t.value === o.orderType)?.label ?? o.orderType}</Badge></TD>
                  <TD className="max-w-xs">{o.items.map((i) => `${variantLabel(i.variantId)} × ${i.quantity}`).join("، ")}</TD>
                  <TD className="font-bold text-slate-900">{o.total}ج</TD>
                  <TD><StatusBadge status={STATUS_LABELS[o.status] ?? o.status} /></TD>
                  <TD>
                    {o.status === "preparing" && (
                      <Button size="sm" variant="secondary" onClick={() => completeOrder.mutate(o.id)} disabled={completeOrder.isPending}>
                        إتمام
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {orders.length === 0 && <EmptyState>مفيش طلبات لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
