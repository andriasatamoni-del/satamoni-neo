import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Input, Select } from "../../shared/ui/Field";
import { FormDialog } from "../../shared/ui/FormDialog";
import { ImageUploadButton } from "../../shared/ui/ImageUploadButton";
import { PlusIcon } from "../../shared/ui/icons";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { useListState } from "../../shared/ui/useListState";
import { errorText, ROW_ACTION, type Combo, type ComboItem, type MenuItem } from "./catalogTypes";

interface ComboPatch {
  id: string;
  isActive?: boolean;
  imageUrl?: string | null;
  description?: string | null;
  onlineOnly?: boolean;
}

interface AddonRow {
  key: number;
  variantId: string;
  quantity: string;
}

interface ComboItemRow {
  key: number;
  variantId: string;
  quantity: string;
  addons: AddonRow[];
}

let nextRowKey = 0;
const newItemRow = (): ComboItemRow => ({ key: nextRowKey++, variantId: "", quantity: "1", addons: [] });

const quantityOf = (text: string) => Math.max(1, Math.floor(Number(text)) || 1);

export function CombosTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const invalidateCombos = () => queryClient.invalidateQueries({ queryKey: ["catalog", "combos"] });
  const menuQuery = useQuery({ queryKey: ["catalog", "items", "all"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items?kind=all") });
  const menu = menuQuery.data ?? [];

  const list = useListState([] as const, { prefix: "combos." });
  const pageQuery = usePaginatedQuery<Combo>(
    canManage ? ["catalog", "combos", "all"] : ["catalog", "combos"],
    canManage ? "/catalog/combos/all" : "/catalog/combos",
    list.params
  );

  const [isAdding, setIsAdding] = useState(false);

  const updateCombo = useMutation({
    mutationFn: ({ id, ...input }: ComboPatch) => apiRequest(`/catalog/combos/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidateCombos,
  });

  function variantName(variantId: string): string {
    for (const item of menu) {
      const variant = item.variants.find((v) => v.id === variantId);
      if (variant) return item.kind === "addon" || item.variants.length === 1 ? item.name : `${item.name} - ${variant.label}`;
    }
    return "صنف محذوف";
  }

  function describeItem(comboItem: ComboItem): string {
    const addons = (comboItem.addons ?? []).map((addon) => `+ ${variantName(addon.variantId)}${addon.quantity > 1 ? ` ×${addon.quantity}` : ""}`);
    return [`${variantName(comboItem.variantId)} ×${comboItem.quantity}`, ...addons].join(" ");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>العروض ({pageQuery.data?.total ?? 0})</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">عرض بيجمع أكتر من صنف (وإضافاتهم) بسعر واحد</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setIsAdding(true)}>
              <PlusIcon className="h-4 w-4" />
              إضافة عرض
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <Table>
          <THead>
            <TR><TH>الصورة</TH><TH>الاسم والوصف</TH><TH>السعر</TH><TH>الأصناف</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
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
                <TD>
                  <ul className="space-y-0.5 text-xs text-slate-600">
                    {c.items.map((comboItem) => <li key={comboItem.variantId}>{describeItem(comboItem)}</li>)}
                  </ul>
                </TD>
                <TD>{c.isActive ? <Badge tone="success">نشط</Badge> : <Badge tone="neutral">معطّل</Badge>}</TD>
                <TD>
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateCombo.mutate({ id: c.id, onlineOnly: !c.onlineOnly })}
                        disabled={updateCombo.isPending}
                        data-testid={`combo-online-only-${c.name}`}
                        className={`${ROW_ACTION} text-brand-700 hover:bg-brand-50`}
                      >
                        {c.onlineOnly ? "خليه للكل" : "خليه حصري أونلاين"}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCombo.mutate({ id: c.id, isActive: !c.isActive })}
                        disabled={updateCombo.isPending}
                        className={`${ROW_ACTION} ${c.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                      >
                        {c.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                    </div>
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

      {isAdding && (
        <AddComboDialog
          menu={menu}
          onClose={() => setIsAdding(false)}
          onCreated={() => {
            setIsAdding(false);
            invalidateCombos();
          }}
        />
      )}
    </Card>
  );
}

function AddComboDialog({ menu, onCreated, onClose }: { menu: MenuItem[]; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", price: "", description: "", onlineOnly: false });
  const [rows, setRows] = useState<ComboItemRow[]>(() => [newItemRow()]);
  const [error, setError] = useState<string | null>(null);

  const sellableItems = menu.filter((item) => item.kind === "item" && item.isActive && item.variants.length > 0);
  const addons = menu.filter((item) => item.kind === "addon" && item.isActive && item.variants.length > 0);

  const createCombo = useMutation({
    mutationFn: () =>
      apiRequest("/catalog/combos", {
        method: "POST",
        body: {
          name: form.name,
          price: Number(form.price),
          description: form.description.trim() || undefined,
          onlineOnly: form.onlineOnly || undefined,
          items: rows
            .filter((row) => row.variantId)
            .map((row) => ({
              variantId: row.variantId,
              quantity: quantityOf(row.quantity),
              addons: row.addons.map((addon) => ({ variantId: addon.variantId, quantity: quantityOf(addon.quantity) })),
            })),
        },
      }),
    onSuccess: onCreated,
    onError: (err) => setError(errorText(err)),
  });

  function submit() {
    const chosen = rows.filter((row) => row.variantId);
    if (chosen.length === 0) {
      setError("اختار صنف واحد على الأقل");
      return;
    }
    if (new Set(chosen.map((row) => row.variantId)).size !== chosen.length) {
      setError("فيه صنف متكرر - زوّد الكمية بدل ما تكرره");
      return;
    }
    setError(null);
    createCombo.mutate();
  }

  function updateRow(key: number, patch: Partial<ComboItemRow>) {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addAddon(row: ComboItemRow, variantId: string) {
    if (!variantId || row.addons.some((addon) => addon.variantId === variantId)) return;
    updateRow(row.key, { addons: [...row.addons, { key: nextRowKey++, variantId, quantity: "1" }] });
  }

  function updateAddon(row: ComboItemRow, key: number, quantity: string) {
    updateRow(row.key, { addons: row.addons.map((addon) => (addon.key === key ? { ...addon, quantity } : addon)) });
  }

  function removeAddon(row: ComboItemRow, key: number) {
    updateRow(row.key, { addons: row.addons.filter((addon) => addon.key !== key) });
  }

  const addonName = (variantId: string) => addons.find((addon) => addon.variants.some((v) => v.id === variantId))?.name ?? "إضافة";

  return (
    <FormDialog title="إضافة عرض" submitLabel="حفظ" isSubmitting={createCombo.isPending} error={error} onSubmit={submit} onClose={onClose} size="xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="اسم العرض">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="سعر العرض">
          <Input required type="number" min="0.01" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        <Field label="الوصف (اختياري)">
          <Input value={form.description} placeholder="بيظهر للعميل على موقع الطلب" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={form.onlineOnly} onChange={(e) => setForm({ ...form, onlineOnly: e.target.checked })} />
          حصري أونلاين
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-slate-700">أصناف العرض</legend>
        {rows.map((row, index) => {
          const availableAddons = addons.filter((addon) => !row.addons.some((chosen) => addon.variants.some((v) => v.id === chosen.variantId)));
          return (
            <div key={row.key} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <Select value={row.variantId} aria-label={`الصنف ${index + 1}`} onChange={(e) => updateRow(row.key, { variantId: e.target.value })}>
                  <option value="">اختار صنف</option>
                  {sellableItems.map((item) =>
                    item.variants.map((v) => (
                      <option key={v.id} value={v.id}>{item.variants.length === 1 ? item.name : `${item.name} - ${v.label}`}</option>
                    ))
                  )}
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={row.quantity}
                  aria-label={`كمية الصنف ${index + 1}`}
                  className="w-20"
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                />
                <button
                  type="button"
                  title="حذف الصنف"
                  aria-label={`حذف الصنف ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((other) => other.key !== row.key))}
                  className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:invisible"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 ps-3">
                {row.addons.map((addon) => (
                  <span key={addon.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pe-1 ps-2.5 text-xs font-semibold text-brand-700">
                    + {addonName(addon.variantId)}
                    <input
                      type="number"
                      min="1"
                      value={addon.quantity}
                      aria-label={`كمية ${addonName(addon.variantId)}`}
                      onChange={(e) => updateAddon(row, addon.key, e.target.value)}
                      className="w-10 rounded border border-brand-200 bg-white px-1 text-center text-xs"
                    />
                    <button
                      type="button"
                      aria-label={`شيل ${addonName(addon.variantId)}`}
                      onClick={() => removeAddon(row, addon.key)}
                      className="rounded-full px-1 text-brand-400 hover:bg-brand-100 hover:text-brand-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {availableAddons.length > 0 && (
                  <select
                    value=""
                    aria-label={`إضافة على الصنف ${index + 1}`}
                    onChange={(e) => addAddon(row, e.target.value)}
                    className="rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-400"
                  >
                    <option value="">+ إضافة على الصنف</option>
                    {availableAddons.map((addon) => (
                      <option key={addon.variants[0].id} value={addon.variants[0].id}>{addon.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setRows([...rows, newItemRow()])}
          className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          صنف تاني
        </button>
      </fieldset>
    </FormDialog>
  );
}
