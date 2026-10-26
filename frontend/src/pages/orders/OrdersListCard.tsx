import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
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
  const ordersQuery = usePaginatedQuery<Order>(["orders"], "/orders", { ...listState.params, branchId });
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;

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
