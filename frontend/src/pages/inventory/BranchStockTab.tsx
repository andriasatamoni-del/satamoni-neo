import { useAuth } from "../../shared/auth/AuthContext";
import { useBranchOptions } from "../../shared/auth/useBranchOptions";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Select } from "../../shared/ui/Field";
import { Badge } from "../../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { ListFilters } from "../../shared/ui/ListFilters";
import { Pagination } from "../../shared/ui/Pagination";
import { useListState } from "../../shared/ui/useListState";
import { ITEM_TYPES, formatQuantity, itemTypeLabel, type Branch, type BranchStockRow } from "./types";

export function BranchStockTab() {
  const { user } = useAuth();
  const { branches } = useBranchOptions<Branch>();
  const list = useListState(["q", "itemType", "branchId"] as const, { prefix: "stock." });
  const branchId = list.filters.branchId || user?.branchId || branches[0]?.id || "";
  const stockQuery = usePaginatedQuery<BranchStockRow>(
    ["inventory", "branch-stock"],
    "/inventory/branch-stock",
    { ...list.params, branchId },
    { enabled: !!branchId }
  );
  const rows = stockQuery.data?.items ?? [];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>رصيد الأصناف في الفرع ({stockQuery.data?.total ?? 0})</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <ListFilters
          state={list}
          search={{ placeholder: "اسم الصنف" }}
          selects={[{ name: "itemType", label: "النوع", options: ITEM_TYPES.map((t) => ({ value: t.value, label: t.label })) }]}
        >
          <Field label="الفرع">
            <Select value={branchId} onChange={(e) => list.setFilter("branchId", e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        </ListFilters>
        <Table>
          <THead>
            <TR><TH>الصنف</TH><TH>النوع</TH><TH>الوحدة</TH><TH>الرصيد</TH></TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.inventoryItemId}>
                <TD className="font-semibold text-slate-900">{r.name}</TD>
                <TD><Badge tone={r.itemType === "raw" ? "neutral" : "brand"}>{itemTypeLabel(r.itemType)}</Badge></TD>
                <TD>{r.unit}</TD>
                <TD className={r.quantity < 0 ? "font-semibold text-red-700" : r.quantity === 0 ? "text-slate-400" : "font-semibold text-slate-900"}>
                  {formatQuantity(r.quantity)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {!branchId && <EmptyState>اختر فرع عشان تشوف الرصيد</EmptyState>}
        {branchId && rows.length === 0 && !stockQuery.isLoading && <EmptyState>مفيش أصناف بالفلاتر دي</EmptyState>}
        <Pagination
          total={stockQuery.data?.total ?? 0}
          limit={list.limit}
          offset={list.offset}
          onPageChange={list.setPage}
          isFetching={stockQuery.isFetching}
        />
      </CardBody>
    </Card>
  );
}
