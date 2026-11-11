import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Input, Select } from "../../shared/ui/Field";
import { ImageUploadButton } from "../../shared/ui/ImageUploadButton";
import { ListFilters } from "../../shared/ui/ListFilters";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { useListState } from "../../shared/ui/useListState";
import type { PriceMenu } from "../orders/posTypes";
import {
  ADDON_VARIANT_LABEL,
  errorText,
  MENU_ITEM_KIND_LABELS,
  type MenuCategory,
  type MenuItem,
  type MenuItemKind,
  type PriceHistoryTarget,
} from "./catalogTypes";
import { PriceHistoryDialog } from "./PriceHistoryDialog";

const EMPTY_FORM = { kind: "item" as MenuItemKind, name: "", categoryId: "", variantLabel: "", price: "", talabatPrice: "" };

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
      {canManage && <AddMenuItemCard categories={categories} onCreated={invalidateItems} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>الأصناف والإضافات ({pageQuery.data?.total ?? 0})</CardTitle>
            <div className="flex gap-1.5">
              <Button size="sm" variant={priceMenu === "regular" ? "primary" : "secondary"} onClick={() => setPriceMenu("regular")}>أسعار المنيو العادي</Button>
              <Button size="sm" variant={priceMenu === "talabat" ? "primary" : "secondary"} onClick={() => setPriceMenu("talabat")}>أسعار طلبات</Button>
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
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => enteredPrice !== null && updateVariant.mutate({ itemId: i.id, variantId: v.id, price: enteredPrice })}
                                        disabled={updateVariant.isPending || enteredPrice === null || enteredPrice === savedPrice}
                                      >
                                        حفظ
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setHistoryTarget({ itemId: i.id, variantId: v.id, label: i.kind === "addon" ? i.name : `${i.name} - ${v.label}` })}
                                      >
                                        السجل
                                      </Button>
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
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(i)}>تعديل</Button>
                            <Button
                              size="sm"
                              variant={i.isActive ? "secondary" : "primary"}
                              onClick={() => updateItem.mutate({ id: i.id, isActive: !i.isActive })}
                              disabled={updateItem.isPending}
                            >
                              {i.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
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
    </div>
  );
}

function AddMenuItemCard({ categories, onCreated }: { categories: MenuCategory[]; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const isAddon = form.kind === "addon";

  const createItem = useMutation({
    mutationFn: () => {
      const label = isAddon ? ADDON_VARIANT_LABEL : form.variantLabel.trim();
      return apiRequest("/catalog/items", {
        method: "POST",
        body: {
          kind: form.kind,
          name: form.name,
          categoryId: isAddon ? undefined : form.categoryId || undefined,
          variants: label ? [{ label, price: Number(form.price), talabatPrice: Number(form.talabatPrice) }] : undefined,
        },
      });
    },
    onSuccess: () => {
      setForm({ ...EMPTY_FORM, kind: form.kind });
      setError(null);
      onCreated();
    },
    onError: (err) => setError(errorText(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createItem.mutate();
  }

  const pricesRequired = isAddon || form.variantLabel.trim() !== "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>إضافة صنف</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            {!isAddon && (
              <Field label="القسم">
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">بدون قسم</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            )}
            {!isAddon && (
              <Field label="اسم الحجم (اختياري)">
                <Input value={form.variantLabel} onChange={(e) => setForm({ ...form, variantLabel: e.target.value })} />
              </Field>
            )}
            <Field label="السعر">
              <Input type="number" min="0" required={pricesRequired} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
            <Field label="سعر طلبات">
              <Input type="number" min="0" required={pricesRequired} value={form.talabatPrice} onChange={(e) => setForm({ ...form, talabatPrice: e.target.value })} />
            </Field>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <Button type="submit" disabled={createItem.isPending}>حفظ</Button>
        </form>
      </CardBody>
    </Card>
  );
}
