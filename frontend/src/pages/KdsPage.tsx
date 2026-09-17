import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState } from "../shared/ui/Table";

interface Branch { id: string; name: string; }
interface MenuItemVariant { id: string; label: string; price: number; }
interface MenuItem { id: string; name: string; variants: MenuItemVariant[]; }
interface OrderLine { menuItemId: string; variantId: string; quantity: number; }
interface KdsOrder {
  id: string;
  orderType: string;
  tableNumber: string | null;
  items: OrderLine[];
  kitchenStatus: "NEW" | "ACCEPTED" | "PREPARING" | "READY";
  kitchenAcceptedAt: string | null;
  kitchenReadyAt: string | null;
  createdAt: string;
}

const KITCHEN_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY"] as const;
const COLUMN_LABELS: Record<string, string> = { NEW: "جديد", ACCEPTED: "مقبول", PREPARING: "بيتحضّر", READY: "جاهز" };
const NEXT_ACTION_LABEL: Record<string, string> = { NEW: "قبول الطلب", ACCEPTED: "بدء التحضير", PREPARING: "جاهز" };
const NEXT_STATUS: Record<string, string> = { NEW: "ACCEPTED", ACCEPTED: "PREPARING", PREPARING: "READY" };
const ORDER_TYPE_LABELS: Record<string, string> = { dinein: "صالة", takeaway: "تيك أواي", delivery: "دليفري" };

function waitTone(referenceIso: string, now: number): "green" | "orange" | "red" {
  const minutes = (now - new Date(referenceIso).getTime()) / 60000;
  if (minutes < 10) return "green";
  if (minutes < 20) return "orange";
  return "red";
}

const TONE_CLASSES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  orange: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export function KdsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const [branchId, setBranchId] = useState(user?.branchId ?? "");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!branchId && branchesQuery.data?.length) setBranchId(branchesQuery.data[0].id);
  }, [branchId, branchesQuery.data]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const menuItemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });
  const boardQuery = useQuery({
    queryKey: ["kds-board", branchId],
    queryFn: () => apiRequest<KdsOrder[]>(`/orders/kitchen-board?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 8000, // الشاشة الوحيدة في النظام اللي بتعمل polling - إيد المطبخ مشغولة، مش هترفريش
  });

  const advance = useMutation({
    mutationFn: ({ id, kitchenStatus }: { id: string; kitchenStatus: string }) =>
      apiRequest(`/orders/${id}/kitchen-status`, { method: "PATCH", body: { kitchenStatus } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kds-board", branchId] }),
  });

  const itemLabel = (line: OrderLine) => {
    for (const item of menuItemsQuery.data ?? []) {
      const v = item.variants.find((v) => v.id === line.variantId);
      if (v) return `${item.name} (${v.label}) × ${line.quantity}`;
    }
    return `صنف × ${line.quantity}`;
  };

  const orders = boardQuery.data ?? [];
  const columns = KITCHEN_STATUSES.map((status) => ({ status, orders: orders.filter((o) => o.kitchenStatus === status) }));

  return (
    <div>
      <PageHeader title="شاشة المطبخ (KDS)" description="متابعة الطلبات لحظة بلحظة أثناء التحضير" />

      <Card className="mb-6">
        <CardBody>
          <div className="max-w-xs">
            <Field label="الفرع">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">اختر فرع</option>
                {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      {!branchId ? (
        <Card><CardBody><EmptyState>اختر فرع الأول عشان تشوف طلباته</EmptyState></CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ status, orders: columnOrders }) => (
            <div key={status} className="rounded-xl bg-slate-100 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-slate-700">{COLUMN_LABELS[status]}</h3>
                <Badge tone="neutral">{columnOrders.length}</Badge>
              </div>
              <div className="space-y-3">
                {columnOrders.map((order) => {
                  const referenceIso = order.kitchenAcceptedAt ?? order.createdAt;
                  const tone = waitTone(referenceIso, now);
                  return (
                    <Card key={order.id} className="shadow-sm">
                      <CardBody className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge tone="neutral">
                            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
                            {order.tableNumber ? ` - طاولة ${order.tableNumber}` : ""}
                          </Badge>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
                            {Math.max(0, Math.floor((now - new Date(referenceIso).getTime()) / 60000))} د
                          </span>
                        </div>
                        <ul className="space-y-0.5 text-sm text-slate-700">
                          {order.items.map((line, i) => <li key={i}>{itemLabel(line)}</li>)}
                        </ul>
                        {status !== "READY" && (
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={advance.isPending}
                            onClick={() => advance.mutate({ id: order.id, kitchenStatus: NEXT_STATUS[status] })}
                          >
                            {NEXT_ACTION_LABEL[status]}
                          </Button>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
                {columnOrders.length === 0 && <p className="px-1 text-center text-xs text-slate-400">مفيش طلبات هنا</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
