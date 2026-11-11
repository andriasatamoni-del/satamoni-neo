import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Input, Select } from "../../shared/ui/Field";
import { ImageUploadButton } from "../../shared/ui/ImageUploadButton";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { useListState } from "../../shared/ui/useListState";
import { errorText, type Combo, type MenuItem } from "./catalogTypes";

interface ComboItemRow { variantId: string; quantity: string; }

interface ComboPatch {
  id: string;
  isActive?: boolean;
  imageUrl?: string | null;
  description?: string | null;
  onlineOnly?: boolean;
}

const EMPTY_ROW: ComboItemRow = { variantId: "", quantity: "1" };

export function CombosTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const invalidateCombos = () => queryClient.invalidateQueries({ queryKey: ["catalog", "combos"] });
  const itemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });
  const items = itemsQuery.data ?? [];

  const list = useListState([] as const, { prefix: "combos." });
  const pageQuery = usePaginatedQuery<Combo>(
    canManage ? ["catalog", "combos", "all"] : ["catalog", "combos"],
    canManage ? "/catalog/combos/all" : "/catalog/combos",
    list.params
  );

  const [form, setForm] = useState({ name: "", price: "" });
  const [rows, setRows] = useState<ComboItemRow[]>([EMPTY_ROW]);
  const [error, setError] = useState<string | null>(null);

  const createCombo = useMutation({
    mutationFn: () =>
      apiRequest("/catalog/combos", {
        method: "POST",
        body: {
          name: form.name,
          price: Number(form.price),
          items: rows.filter((r) => r.variantId).map((r) => ({ variantId: r.variantId, quantity: Number(r.quantity) || 1 })),
        },
      }),
    onSuccess: () => {
      setForm({ name: "", price: "" });
      setRows([EMPTY_ROW]);
      setError(null);
      invalidateCombos();
    },
    onError: (err) => setError(errorText(err)),
  });

  const updateCombo = useMutation({
    mutationFn: ({ id, ...input }: ComboPatch) => apiRequest(`/catalog/combos/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidateCombos,
  });

  function updateRow(index: number, patch: Partial<ComboItemRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function variantDisplayName(variantId: string): string {
    for (const item of items) {
      const v = item.variants.find((vv) => vv.id === variantId);
      if (v) return `${item.name} - ${v.label}`;
    }
    return variantId;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createCombo.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>العروض ({pageQuery.data?.total ?? 0})</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-sm text-slate-500">عرض بيجمع أكتر من حجم بسعر واحد مختلف عن مجموع أسعارهم</p>
        {canManage && (
          <form onSubmit={handleSubmit} className="mb-6 space-y-3 border-b border-slate-100 pb-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="اسم العرض">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="السعر">
                <Input required type="number" min="0.01" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
            </div>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
                  <Field label="الصنف/الحجم">
                    <Select value={row.variantId} onChange={(e) => updateRow(index, { variantId: e.target.value })}>
                      <option value="">اختر حجم</option>
                      {items.flatMap((it) => it.variants.map((v) => <option key={v.id} value={v.id}>{it.name} - {v.label}</option>))}
                    </Select>
                  </Field>
                  <Field label="الكمية">
                    <Input type="number" min="1" value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} />
                  </Field>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setRows(rows.filter((_, i) => i !== index))}>حذف</Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, EMPTY_ROW])}>+ بند تاني</Button>
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
            <Button type="submit" disabled={createCombo.isPending}>إضافة عرض</Button>
          </form>
        )}

        <Table>
          <THead>
            <TR><TH>الصورة</TH><TH>الاسم والوصف</TH><TH>السعر</TH><TH>الأصناف</TH><TH>الحالة</TH><TH></TH></TR>
          </THead>
          <TBody>
            {(pageQuery.data?.items ?? []).map((c) => (
              <TR key={c.id}>
                <TD>
                  <ImageUploadButton imageUrl={c.imageUrl} onUploaded={(url) => updateCombo.mutate({ id: c.id, imageUrl: url })} readOnly={!canManage} testId={`combo-image-${c.name}`} />
                </TD>
                <TD className="font-semibold text-slate-900">
                  {c.name} {c.onlineOnly && <Badge tone="brand">حصري أونلاين</Badge>}
                  {!canManage && c.description && <p className="text-xs font-normal text-slate-400">{c.description}</p>}
                  {canManage && (
                    <Input
                      key={c.description ?? ""}
                      defaultValue={c.description ?? ""}
                      placeholder="وصف العرض للموقع"
                      className="mt-1 py-0.5 text-xs font-normal"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (c.description ?? "")) updateCombo.mutate({ id: c.id, description: value || null });
                      }}
                    />
                  )}
                </TD>
                <TD>{c.price}ج</TD>
                <TD className="text-xs text-slate-500">{c.items.map((i) => `${variantDisplayName(i.variantId)} ×${i.quantity}`).join("، ")}</TD>
                <TD>{c.isActive ? <Badge tone="success">نشط</Badge> : <Badge tone="neutral">معطّل</Badge>}</TD>
                <TD>
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateCombo.mutate({ id: c.id, onlineOnly: !c.onlineOnly })}
                        disabled={updateCombo.isPending}
                        data-testid={`combo-online-only-${c.name}`}
                      >
                        {c.onlineOnly ? "خليه للكل" : "خليه حصري أونلاين"}
                      </Button>
                      <Button
                        size="sm"
                        variant={c.isActive ? "secondary" : "primary"}
                        onClick={() => updateCombo.mutate({ id: c.id, isActive: !c.isActive })}
                        disabled={updateCombo.isPending}
                      >
                        {c.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                    </>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {pageQuery.data?.total === 0 && <EmptyState>مفيش عروض لسه</EmptyState>}
        {pageQuery.data && (
          <Pagination total={pageQuery.data.total} limit={pageQuery.data.limit} offset={pageQuery.data.offset} onPageChange={list.setPage} isFetching={pageQuery.isFetching} />
        )}
      </CardBody>
    </Card>
  );
}
