import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/AuthContext";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Badge, StatusBadge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { ListFilters } from "../../shared/ui/ListFilters";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { useListState } from "../../shared/ui/useListState";
import { formatPrice, labelOf, ORDER_TYPES, orderTypeLabel, SOURCE_LABELS, STATUS_LABELS } from "./posLabels";
import type { Order, OrderLine } from "./posTypes";

const ORDERS_REFRESH_MS = 10_000;
const CLOCK_SKEW_MARGIN_MS = 5 * 60_000;

const toOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

const ORDER_FILTERS = [
  { name: "status" as const, label: "الحالة", options: toOptions(STATUS_LABELS) },
  { name: "orderType" as const, label: "النوع", options: ORDER_TYPES },
  { name: "source" as const, label: "المصدر", options: [{ value: "pos", label: "الكاشير" }, ...toOptions(SOURCE_LABELS)] },
];

export function useOrdersListState() {
  return useListState(["q", "status", "orderType", "source", "from", "to"] as const, { prefix: "orders." });
}

export type OrdersListState = ReturnType<typeof useOrdersListState>;

export function OrdersListCard({
  listState,
  branchId,
  canManageOrders,
  describeOrderLine,
}: {
  listState: OrdersListState;
  branchId: string;
  canManageOrders: boolean;
  describeOrderLine: (line: OrderLine) => string;
}) {
  const queryClient = useQueryClient();
  const ordersQuery = usePaginatedQuery<Order>(["orders"], "/orders", { ...listState.params, branchId }, { refetchInterval: ORDERS_REFRESH_MS });
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const newOrders = useIncomingOrders(ordersQuery.data ? orders : undefined);

  const completeOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/orders/${id}/status`, { method: "PATCH", body: { status: "completed" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>الطلبات ({total})</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {newOrders.count > 0 && (
          <div role="alert" className="m-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            <span>{newOrders.count === 1 ? "وصل طلب جديد" : `وصلت ${newOrders.count} طلبات جديدة`}</span>
            <button type="button" className="shrink-0 text-amber-600 hover:text-amber-900" onClick={newOrders.dismiss}>تمام</button>
          </div>
        )}
        <ListFilters state={listState} search={{ placeholder: "اسم العميل أو التليفون أو الترابيزة" }} dateRange selects={ORDER_FILTERS} />
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
            {orders.map((order) => (
              <TR key={order.id}>
                <TD><OrderTypeBadges order={order} /></TD>
                <TD className="max-w-xs"><OrderContents order={order} describeOrderLine={describeOrderLine} /></TD>
                <TD className="font-bold text-slate-900">{formatPrice(order.total)}</TD>
                <TD><StatusBadge status={labelOf(STATUS_LABELS, order.status)} /></TD>
                <TD>
                  {order.status === "preparing" && canManageOrders && (
                    <Button size="sm" variant="secondary" onClick={() => completeOrder.mutate(order.id)} disabled={completeOrder.isPending}>
                      إتمام
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {orders.length === 0 && !ordersQuery.isLoading && <EmptyState>مفيش طلبات بالفلاتر دي</EmptyState>}
        <Pagination
          total={total}
          limit={listState.limit}
          offset={listState.offset}
          onPageChange={listState.setPage}
          isFetching={ordersQuery.isFetching}
        />
      </CardBody>
    </Card>
  );
}

function OrderTypeBadges({ order }: { order: Order }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone="neutral">{orderTypeLabel(order.orderType)}</Badge>
      {order.source && order.source !== "pos" && (
        <Badge tone="info" data-testid="order-source-badge">{labelOf(SOURCE_LABELS, order.source)}</Badge>
      )}
    </div>
  );
}

function OrderContents({ order, describeOrderLine }: { order: Order; describeOrderLine: (line: OrderLine) => string }) {
  const showWebsiteCustomer = order.source === "website" && (order.customerName || order.customerPhone);
  return (
    <>
      {order.items.map((line) => `${describeOrderLine(line)} × ${line.quantity}`).join("، ")}
      {showWebsiteCustomer && (
        <p className="mt-1 text-xs text-slate-500">
          {order.customerName} <span dir="ltr">{order.customerPhone}</span>
          {order.addressDetails && ` · ${order.addressDetails}`}
        </p>
      )}
      {order.customerNotes && <p className="mt-1 text-xs font-semibold text-amber-700">📝 {order.customerNotes}</p>}
    </>
  );
}

function useIncomingOrders(orders: Order[] | undefined) {
  const { user } = useAuth();
  const [watchingSince] = useState(() => Date.now() - CLOCK_SKEW_MARGIN_MS);
  const alerted = useRef<Set<string> | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!orders) return;
    if (!alerted.current) {
      alerted.current = new Set(orders.map((o) => o.id));
      return;
    }
    const seen = alerted.current;
    const incoming = orders.filter(
      (o) =>
        !seen.has(o.id) &&
        o.createdBy !== user?.id &&
        o.createdAt !== undefined &&
        new Date(o.createdAt).getTime() > watchingSince
    );
    if (incoming.length === 0) return;
    incoming.forEach((o) => seen.add(o.id));
    setCount((c) => c + incoming.length);
    playNewOrderChime();
  }, [orders, user?.id, watchingSince]);

  return { count, dismiss: () => setCount(0) };
}

function playNewOrderChime() {
  try {
    const audio = new AudioContext();
    [880, 1320].forEach((frequency, i) => {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      const start = audio.currentTime + i * 0.25;
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.2, start);
      volume.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      tone.connect(volume).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.2);
    });
    setTimeout(() => audio.close(), 1000);
  } catch {
    return;
  }
}
