import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Input, Select } from "../../shared/ui/Field";
import { FormDialog } from "../../shared/ui/FormDialog";
import { ImageUploadButton } from "../../shared/ui/ImageUploadButton";
import { CheckIcon, ClockIcon, PencilIcon, PlusIcon } from "../../shared/ui/icons";
import { ListFilters } from "../../shared/ui/ListFilters";
import { Pagination } from "../../shared/ui/Pagination";
import { TabularImportExport } from "../../shared/ui/TabularImportExport";
import { PERMISSION } from "../../shared/auth/permissions";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { useListState } from "../../shared/ui/useListState";
import type { PriceMenu } from "../orders/posTypes";
import {
  ADDON_VARIANT_LABEL,
  errorText,
  MENU_ITEM_KIND_LABELS,
  ROW_ACTION,
  type MenuCategory,
  type MenuItem,
  type MenuItemKind,
  type PriceHistoryTarget,
} from "./catalogTypes";
import { PriceHistoryDialog } from "./PriceHistoryDialog";

interface SizeRow {
  key: number;
  label: string;
  price: string;
  talabatPrice: string;
}

const PRICE_MENU_LABELS: Record<PriceMenu, string> = { regular: "المنيو العادي", talabat: "طلبات" };

const EMPTY_FORM = { kind: "item" as MenuItemKind, name: "", categoryId: "", addonPrice: "", addonTalabatPrice: "" };

let nextSizeRowKey = 0;
const newSizeRow = (): SizeRow => ({ key: nextSizeRowKey++, label: "", price: "", talabatPrice: "" });

function duplicateLabel(labels: string[]): string | null {
  const seen = new Set<string>();
  for (const label of labels) {
    if (seen.has(label)) return label;
    seen.add(label);
  }
  return null;
}

interface ItemPatch {
  id: string;
  name?: string;
  categoryId?: string | null;
  isActive?: boolean;
  description?: string | null;
  imageUrl?: string | null;
}

export function MenuItemsTab({ canManage, categories }: { canManage: boolean; categories: MenuCategory[] }) {
  const queryClient = useQueryClient();
  const invalidateItems = () => queryClient.invalidateQueries({ queryKey: ["catalog", "items"] });

  const list = useListState(["q", "kind", "categoryId", "status"] as const, { prefix: "items." });
  const pageQuery = usePaginatedQuery<MenuItem>(["catalog", "items"], "/catalog/items", { ...list.params, kind: list.params.kind || "all" });
  const pageItems = pageQuery.data?.items ?? [];

  const [priceMenu, setPriceMenu] = useState<PriceMenu>("regular");
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});
  const [historyTarget, setHistoryTarget] = useState<PriceHistoryTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addingSizeTo, setAddingSizeTo] = useState<MenuItem | null>(null);
  const [editingForm, setEditingForm] = useState({ name: "", categoryId: "", description: "" });

  const updateItem = useMutation({
    mutationFn: ({ id, ...body }: ItemPatch) => apiRequest(`/catalog/items/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      setEditingId(null);
      invalidateItems();
    },
  });

  const updateVariant = useMutation({
    mutationFn: ({ itemId, variantId, price }: { itemId: string; variantId: string; price: number }) =>
      apiRequest(`/catalog/items/${itemId}/variants/${variantId}`, { method: "PATCH", body: priceMenu === "talabat" ? { talabatPrice: price } : { price } }),
    onSuccess: invalidateItems,
  });

  const categoryName = (item: MenuItem) => (item.kind === "addon" ? "—" : categories.find((c) => c.id === item.categoryId)?.name ?? "بدون قسم");

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    setEditingForm({ name: item.name, categoryId: item.categoryId ?? "", description: item.description ?? "" });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>الأصناف والإضافات ({pageQuery.data?.total ?? 0})</CardTitle>
              <div role="radiogroup" aria-label="الأسعار المعروضة" className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
                {(Object.keys(PRICE_MENU_LABELS) as PriceMenu[]).map((menu) => (
                  <button
                    key={menu}
                    type="button"
                    role="radio"
                    aria-checked={priceMenu === menu}
                    onClick={() => setPriceMenu(menu)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      priceMenu === menu ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    أسعار {PRICE_MENU_LABELS[menu]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TabularImportExport
                path="/catalog/items"
                title="المنيو"
                permissions={{ export: [PERMISSION.CATALOG_ITEMS_VIEW, PERMISSION.CATALOG_ITEMS_MANAGE], import: [PERMISSION.CATALOG_ITEMS_MANAGE] }}
                exportQuery={list.filters}
                refreshQueryKey={["catalog", "items"]}
              />
              {canManage && (
                <Button size="sm" onClick={() => setIsAdding(true)}>
                  <PlusIcon className="h-4 w-4" />
                  إضافة صنف
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <ListFilters
            state={list}
            search={{ placeholder: "اسم الصنف أو الوصف" }}
            selects={[
              { name: "kind", label: "النوع", options: [{ value: "item", label: "أصناف" }, { value: "addon", label: "إضافات" }] },
              {
                name: "categoryId",
                label: "القسم",
                options: [...categories.map((c) => ({ value: c.id, label: c.name })), { value: "none", label: "بدون قسم" }],
              },
              { name: "status", label: "الحالة", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
            ]}
          />
          <Table>
            <THead>
              <TR>
                <TH>الصورة</TH><TH>الاسم</TH><TH>القسم</TH><TH>الأحجام والأسعار</TH><TH>الحالة</TH><TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {pageItems.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <ImageUploadButton
                      imageUrl={i.imageUrl}
                      onUploaded={(url) => updateItem.mutate({ id: i.id, imageUrl: url })}
                      readOnly={!canManage}
                      testId={`item-image-${i.name}`}
                    />
                  </TD>
                  {editingId === i.id ? (
                    <>
                      <TD><Input value={editingForm.name} onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })} className="py-1" /></TD>
                      <TD>
                        {i.kind === "addon" ? (
                          "—"
                        ) : (
                          <Select value={editingForm.categoryId} onChange={(e) => setEditingForm({ ...editingForm, categoryId: e.target.value })} className="py-1">
                            <option value="">بدون قسم</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        )}
                      </TD>
                      <TD colSpan={2}>
                        <Input
                          value={editingForm.description}
                          onChange={(e) => setEditingForm({ ...editingForm, description: e.target.value })}
                          placeholder="وصف يظهر للعميل على موقع الطلب"
                          className="py-1"
                        />
                      </TD>
                      <TD>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateItem.mutate({
                                id: i.id,
                                name: editingForm.name,
                                categoryId: i.kind === "addon" ? undefined : editingForm.categoryId || null,
                                description: editingForm.description.trim() || null,
                              })
                            }
                            disabled={updateItem.isPending}
                          >
                            حفظ
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>إلغاء</Button>
                        </div>
                      </TD>
                    </>
                  ) : (
                    <>
                      <TD className={`font-semibold ${i.isActive ? "text-slate-900" : "text-slate-400 line-through"}`}>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {i.name}
                          {i.kind === "addon" && <Badge tone="info">إضافة</Badge>}
                        </span>
                        {i.description && <p className="text-xs font-normal text-slate-400">{i.description}</p>}
                      </TD>
                      <TD>{categoryName(i)}</TD>
                      <TD>
                        {i.variants.length === 0 ? (
                          "—"
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {i.variants.map((v) => {
                              const savedPrice = priceMenu === "talabat" ? v.talabatPrice : v.price;
                              const draftKey = `${priceMenu}:${v.id}`;
                              const enteredText = variantPrices[draftKey] ?? String(savedPrice);
                              const enteredPrice = enteredText.trim() === "" ? null : Number(enteredText);
                              const label = i.kind === "addon" ? "السعر" : v.label;
                              return (
                                <div key={v.id} className="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                                  <span className="text-xs text-slate-500">{label}:</span>
                                  {canManage ? (
                                    <>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={enteredText}
                                        aria-label={`${priceMenu === "talabat" ? "سعر طلبات" : "السعر"} ${i.name} ${v.label}`}
                                        onChange={(e) => setVariantPrices({ ...variantPrices, [draftKey]: e.target.value })}
                                        className="w-20 py-0.5 text-xs"
                                      />
                                      {enteredPrice !== null && enteredPrice !== savedPrice && (
                                        <button
                                          type="button"
                                          title="حفظ السعر"
                                          aria-label={`حفظ سعر ${i.name} ${v.label}`}
                                          onClick={() => updateVariant.mutate({ itemId: i.id, variantId: v.id, price: enteredPrice })}
                                          disabled={updateVariant.isPending}
                                          className="rounded-md bg-emerald-600 p-1 text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                          <CheckIcon className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        title="سجل الأسعار"
                                        aria-label={`سجل أسعار ${i.name} ${v.label}`}
                                        onClick={() => setHistoryTarget({ itemId: i.id, variantId: v.id, label: i.kind === "addon" ? i.name : `${i.name} - ${v.label}` })}
                                        className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                      >
                                        <ClockIcon className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-xs font-semibold text-slate-800">{savedPrice}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </TD>
                      <TD>{i.isActive ? <Badge tone="success">نشط</Badge> : <Badge tone="neutral">معطّل</Badge>}</TD>
                      <TD>
                        {canManage && (
                          <div className="flex flex-wrap items-center gap-1">
                            <button type="button" onClick={() => startEdit(i)} className={`${ROW_ACTION} text-slate-600 hover:bg-slate-100`}>
                              <PencilIcon className="h-3.5 w-3.5" />
                              تعديل
                            </button>
                            {i.kind === "item" && (
                              <button type="button" onClick={() => setAddingSizeTo(i)} className={`${ROW_ACTION} text-brand-700 hover:bg-brand-50`}>
                                <PlusIcon className="h-3.5 w-3.5" />
                                حجم
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => updateItem.mutate({ id: i.id, isActive: !i.isActive })}
                              disabled={updateItem.isPending}
                              className={`${ROW_ACTION} ${i.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                            >
                              {i.isActive ? "تعطيل" : "تفعيل"}
                            </button>
                          </div>
                        )}
                      </TD>
                    </>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {pageItems.length === 0 && !pageQuery.isLoading && <EmptyState>مفيش أصناف بالفلاتر دي</EmptyState>}
          <Pagination total={pageQuery.data?.total ?? 0} limit={list.limit} offset={list.offset} onPageChange={list.setPage} isFetching={pageQuery.isFetching} />
        </CardBody>
      </Card>

      {historyTarget && <PriceHistoryDialog target={historyTarget} onClose={() => setHistoryTarget(null)} />}
      {addingSizeTo && (
        <AddVariantDialog
          item={addingSizeTo}
          onClose={() => setAddingSizeTo(null)}
          onAdded={() => {
            setAddingSizeTo(null);
            invalidateItems();
          }}
        />
      )}
      {isAdding && (
        <AddMenuItemDialog
          categories={categories}
          onClose={() => setIsAdding(false)}
          onCreated={() => {
            setIsAdding(false);
            invalidateItems();
          }}
        />
      )}
    </div>
  );
}

function AddMenuItemDialog({ categories, onCreated, onClose }: { categories: MenuCategory[]; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sizes, setSizes] = useState<SizeRow[]>(() => [newSizeRow()]);
  const [error, setError] = useState<string | null>(null);
  const isAddon = form.kind === "addon";

  const filledSizes = sizes.filter((row) => row.label.trim() !== "");

  const createItem = useMutation({
    mutationFn: () => {
      const variants = isAddon
        ? [{ label: ADDON_VARIANT_LABEL, price: Number(form.addonPrice), talabatPrice: Number(form.addonTalabatPrice) }]
        : filledSizes.map((row) => ({ label: row.label.trim(), price: Number(row.price), talabatPrice: Number(row.talabatPrice) }));
      return apiRequest("/catalog/items", {
        method: "POST",
        body: {
          kind: form.kind,
          name: form.name,
          categoryId: isAddon ? undefined : form.categoryId || undefined,
          variants: variants.length > 0 ? variants : undefined,
        },
      });
    },
    onSuccess: onCreated,
    onError: (err) => setError(errorText(err)),
  });

  function submit() {
    if (!isAddon) {
      const duplicate = duplicateLabel(filledSizes.map((row) => row.label.trim()));
      if (duplicate) {
        setError(`الحجم "${duplicate}" متكرر`);
        return;
      }
    }
    setError(null);
    createItem.mutate();
  }

  function updateSize(key: number, patch: Partial<SizeRow>) {
    setSizes(sizes.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <FormDialog
      title="إضافة صنف"
      submitLabel="حفظ"
      isSubmitting={createItem.isPending}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">النوع</legend>
        <div role="radiogroup" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          {(Object.keys(MENU_ITEM_KIND_LABELS) as MenuItemKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={form.kind === kind}
              onClick={() => setForm({ ...form, kind })}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                form.kind === kind ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {MENU_ITEM_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        {isAddon && (
          <p className="mt-2 text-xs text-slate-500">الإضافة بتتضاف على أي صنف في الطلب، ليها سعر واحد ومالهاش قسم. النوع مش بيتغيّر بعد الحفظ.</p>
        )}
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={isAddon ? "اسم الإضافة" : "اسم الصنف"}>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        {isAddon ? (
          <>
            <Field label="السعر">
              <Input type="number" min="0" required value={form.addonPrice} onChange={(e) => setForm({ ...form, addonPrice: e.target.value })} />
            </Field>
            <Field label="سعر طلبات">
              <Input type="number" min="0" required value={form.addonTalabatPrice} onChange={(e) => setForm({ ...form, addonTalabatPrice: e.target.value })} />
            </Field>
          </>
        ) : (
          <Field label="القسم">
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">بدون قسم</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {!isAddon && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-slate-700">الأحجام والأسعار</legend>
          <p className="text-xs text-slate-500">الصف اللي من غير اسم حجم مش بيتحفظ. تقدر تضيف أحجام تانية بعدين من زرار "+ حجم".</p>
          {sizes.map((row, index) => {
            const isFilled = row.label.trim() !== "";
            return (
              <div key={row.key} className="flex items-center gap-2">
                <Input
                  value={row.label}
                  placeholder="اسم الحجم (مثلاً: صغير)"
                  aria-label={`اسم الحجم ${index + 1}`}
                  onChange={(e) => updateSize(row.key, { label: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  required={isFilled}
                  value={row.price}
                  placeholder="السعر"
                  aria-label={`سعر الحجم ${index + 1}`}
                  onChange={(e) => updateSize(row.key, { price: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  required={isFilled}
                  value={row.talabatPrice}
                  placeholder="سعر طلبات"
                  aria-label={`سعر طلبات الحجم ${index + 1}`}
                  onChange={(e) => updateSize(row.key, { talabatPrice: e.target.value })}
                />
                <button
                  type="button"
                  title="حذف الحجم"
                  aria-label={`حذف الحجم ${index + 1}`}
                  disabled={sizes.length === 1}
                  onClick={() => setSizes(sizes.filter((other) => other.key !== row.key))}
                  className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:invisible"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setSizes([...sizes, newSizeRow()])}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            حجم تاني
          </button>
        </fieldset>
      )}
    </FormDialog>
  );
}

function AddVariantDialog({ item, onAdded, onClose }: { item: MenuItem; onAdded: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ label: "", price: "", talabatPrice: "" });
  const [error, setError] = useState<string | null>(null);

  const addVariant = useMutation({
    mutationFn: () =>
      apiRequest(`/catalog/items/${item.id}/variants`, {
        method: "POST",
        body: { label: form.label.trim(), price: Number(form.price), talabatPrice: Number(form.talabatPrice) },
      }),
    onSuccess: onAdded,
    onError: (err) => setError(errorText(err)),
  });

  function submit() {
    const label = form.label.trim();
    if (item.variants.some((v) => v.label === label)) {
      setError(`الحجم "${label}" موجود بالفعل في ${item.name}`);
      return;
    }
    setError(null);
    addVariant.mutate();
  }

  return (
    <FormDialog title={`حجم جديد لـ${item.name}`} submitLabel="إضافة" isSubmitting={addVariant.isPending} error={error} onSubmit={submit} onClose={onClose}>
      {item.variants.length > 0 && (
        <p className="text-xs text-slate-500">الأحجام الحالية: {item.variants.map((v) => v.label).join("، ")}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="اسم الحجم">
          <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <Field label="السعر">
          <Input type="number" min="0" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        <Field label="سعر طلبات">
          <Input type="number" min="0" required value={form.talabatPrice} onChange={(e) => setForm({ ...form, talabatPrice: e.target.value })} />
        </Field>
      </div>
    </FormDialog>
  );
}
