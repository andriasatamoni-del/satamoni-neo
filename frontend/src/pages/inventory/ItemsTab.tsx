import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useCan } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { FormDialog } from "../../shared/ui/FormDialog";
import { PlusIcon } from "../../shared/ui/icons";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select } from "../../shared/ui/Field";
import { Badge } from "../../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { ListFilters } from "../../shared/ui/ListFilters";
import { Pagination } from "../../shared/ui/Pagination";
import { useListState } from "../../shared/ui/useListState";
import { TabularImportExport } from "../../shared/ui/TabularImportExport";
import { ITEM_TYPES, UNITS, errorMessage, itemTypeLabel, type InventoryItem, type ItemType } from "./types";

const EMPTY_FORM = { name: "", unit: UNITS[0] as string, itemType: "raw" as ItemType };

export function ItemsTab() {
  const queryClient = useQueryClient();
  const canManage = useCan()(PERMISSION.INVENTORY_ITEMS_MANAGE);
  const list = useListState(["q", "itemType"] as const, { prefix: "items." });
  const itemsQuery = usePaginatedQuery<InventoryItem>(["inventory", "items"], "/inventory/items", list.params);
  const items = itemsQuery.data?.items ?? [];

  const [isAdding, setIsAdding] = useState(false);
  const [removeIssue, setRemoveIssue] = useState<string | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "branch-stock"] });
  }

  const removeItem = useMutation({
    mutationFn: (item: InventoryItem) => apiRequest(`/inventory/items/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoveIssue(null);
      refresh();
    },
    onError: (err) => setRemoveIssue(errorMessage(err)),
  });

  function confirmRemove(item: InventoryItem) {
    if (window.confirm(`احذف الصنف "${item.name}"؟\nهيختفي من المخزون والقوائم، وحركاته القديمة هتفضل في التقارير.`)) {
      removeItem.mutate(item);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>الأصناف ({itemsQuery.data?.total ?? 0})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <TabularImportExport
              path="/inventory/items"
              title="أصناف المخزون"
              permissions={{ export: [PERMISSION.INVENTORY_ITEMS_VIEW, PERMISSION.INVENTORY_ITEMS_MANAGE], import: [PERMISSION.INVENTORY_ITEMS_MANAGE] }}
              exportQuery={list.filters}
              refreshQueryKey={["inventory"]}
            />
            {canManage && (
              <Button size="sm" onClick={() => setIsAdding(true)}>
                <PlusIcon className="h-4 w-4" />
                إضافة صنف
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <ListFilters
            state={list}
            search={{ placeholder: "اسم الصنف" }}
            selects={[{ name: "itemType", label: "النوع", options: ITEM_TYPES.map((t) => ({ value: t.value, label: t.label })) }]}
          />
          {removeIssue && (
            <div role="alert" className="m-4 flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              <span>{removeIssue}</span>
              <button type="button" className="shrink-0 text-red-500 hover:text-red-700" onClick={() => setRemoveIssue(null)}>إخفاء</button>
            </div>
          )}
          <Table>
            <THead>
              <TR><TH>الاسم</TH><TH>الوحدة</TH><TH>النوع</TH>{canManage && <TH></TH>}</TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD className="font-semibold text-slate-900">{i.name}</TD>
                  <TD>{i.unit}</TD>
                  <TD><Badge tone={i.itemType === "raw" ? "neutral" : "brand"}>{itemTypeLabel(i.itemType)}</Badge></TD>
                  {canManage && (
                    <TD>
                      <Button size="sm" variant="danger" disabled={removeItem.isPending} onClick={() => confirmRemove(i)}>احذف</Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {items.length === 0 && !itemsQuery.isLoading && <EmptyState>مفيش أصناف بالفلاتر دي</EmptyState>}
          <Pagination
            total={itemsQuery.data?.total ?? 0}
            limit={list.limit}
            offset={list.offset}
            onPageChange={list.setPage}
            isFetching={itemsQuery.isFetching}
          />
        </CardBody>
      </Card>
      {isAdding && <AddItemDialog onClose={() => setIsAdding(false)} onCreated={refresh} />}
    </div>
  );
}

function AddItemDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const createItem = useMutation({
    mutationFn: () => apiRequest("/inventory/items", { method: "POST", body: form }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <FormDialog title="إضافة صنف" submitLabel="إضافة" isSubmitting={createItem.isPending} error={error} onSubmit={() => createItem.mutate()} onClose={onClose}>
      <div className="grid grid-cols-1 gap-4">
        <Field label="اسم الصنف">
          <Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="الوحدة">
          <Select required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="نوع الصنف">
          <Select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value as ItemType })}>
            {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
      </div>
    </FormDialog>
  );
}
