import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface MenuCategory {
  id: string;
  name: string;
  menuGroup: string;
  isActive: boolean;
}

interface MenuItemVariant { id: string; label: string; price: number; talabatPrice: number | null; }
interface MenuItemModifierVariantPrice { variantId: string; priceDelta: number; }
interface MenuItemModifier {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  variantPrices: MenuItemModifierVariantPrice[];
}
interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  isBest: boolean;
  isActive: boolean;
  variants: MenuItemVariant[];
  modifiers: MenuItemModifier[];
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => apiRequest<MenuCategory[]>("/catalog/categories") });
  const itemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });

  const invalidateCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
    queryClient.invalidateQueries({ queryKey: ["catalog", "items"] });
  };

  const [categoryName, setCategoryName] = useState("");
  const createCategory = useMutation({
    mutationFn: () => apiRequest("/catalog/categories", { method: "POST", body: { name: categoryName } }),
    onSuccess: () => {
      setCategoryName("");
      invalidateCatalog();
    },
  });

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const updateCategory = useMutation({
    mutationFn: (input: { id: string; name?: string; isActive?: boolean }) =>
      apiRequest(`/catalog/categories/${input.id}`, { method: "PATCH", body: { name: input.name, isActive: input.isActive } }),
    onSuccess: () => {
      setEditingCategoryId(null);
      invalidateCatalog();
    },
  });

  const [itemForm, setItemForm] = useState({ name: "", categoryId: "", variantLabel: "", variantPrice: "" });
  const [itemError, setItemError] = useState<string | null>(null);
  const createItem = useMutation({
    mutationFn: () =>
      apiRequest("/catalog/items", {
        method: "POST",
        body: {
          name: itemForm.name,
          categoryId: itemForm.categoryId || undefined,
          variants: itemForm.variantLabel ? [{ label: itemForm.variantLabel, price: Number(itemForm.variantPrice) }] : undefined,
        },
      }),
    onSuccess: () => {
      setItemForm({ name: "", categoryId: "", variantLabel: "", variantPrice: "" });
      setItemError(null);
      invalidateCatalog();
    },
    onError: (err) => setItemError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemForm, setEditingItemForm] = useState({ name: "", categoryId: "" });
  const updateItem = useMutation({
    mutationFn: (input: { id: string; name?: string; categoryId?: string | null; isActive?: boolean }) =>
      apiRequest(`/catalog/items/${input.id}`, {
        method: "PATCH",
        body: { name: input.name, categoryId: input.categoryId, isActive: input.isActive },
      }),
    onSuccess: () => {
      setEditingItemId(null);
      invalidateCatalog();
    },
  });

  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});
  const updateVariant = useMutation({
    mutationFn: ({ itemId, variantId, price }: { itemId: string; variantId: string; price: number }) =>
      apiRequest(`/catalog/items/${itemId}/variants/${variantId}`, { method: "PATCH", body: { price } }),
    onSuccess: () => invalidateCatalog(),
  });

  const [modifiersItemId, setModifiersItemId] = useState<string | null>(null);
  const [newModifierName, setNewModifierName] = useState("");
  const [newModifierPrice, setNewModifierPrice] = useState("");
  const [modifierError, setModifierError] = useState<string | null>(null);
  const [modifierPrices, setModifierPrices] = useState<Record<string, string>>({});
  const [variantOverrides, setVariantOverrides] = useState<Record<string, string>>({});

  const addModifier = useMutation({
    mutationFn: ({ itemId, name, priceDelta }: { itemId: string; name: string; priceDelta: number }) =>
      apiRequest(`/catalog/items/${itemId}/modifiers`, { method: "POST", body: { name, priceDelta } }),
    onSuccess: () => {
      setNewModifierName("");
      setNewModifierPrice("");
      setModifierError(null);
      invalidateCatalog();
    },
    onError: (err) => setModifierError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const updateModifier = useMutation({
    mutationFn: ({ itemId, modifierId, ...input }: { itemId: string; modifierId: string; name?: string; priceDelta?: number; isActive?: boolean }) =>
      apiRequest(`/catalog/items/${itemId}/modifiers/${modifierId}`, { method: "PATCH", body: input }),
    onSuccess: () => invalidateCatalog(),
  });

  const setModifierVariantPrice = useMutation({
    mutationFn: ({ itemId, modifierId, variantId, priceDelta }: { itemId: string; modifierId: string; variantId: string; priceDelta: number }) =>
      apiRequest(`/catalog/items/${itemId}/modifiers/${modifierId}/variant-prices/${variantId}`, { method: "PUT", body: { priceDelta } }),
    onSuccess: () => invalidateCatalog(),
  });

  const clearModifierVariantPrice = useMutation({
    mutationFn: ({ itemId, modifierId, variantId }: { itemId: string; modifierId: string; variantId: string }) =>
      apiRequest(`/catalog/items/${itemId}/modifiers/${modifierId}/variant-prices/${variantId}`, { method: "DELETE" }),
    onSuccess: () => invalidateCatalog(),
  });

  function handleCategorySubmit(e: FormEvent) {
    e.preventDefault();
    createCategory.mutate();
  }
  function handleItemSubmit(e: FormEvent) {
    e.preventDefault();
    createItem.mutate();
  }
  function startEditCategory(c: MenuCategory) {
    setEditingCategoryId(c.id);
    setEditingCategoryName(c.name);
  }
  function startEditItem(i: MenuItem) {
    setEditingItemId(i.id);
    setEditingItemForm({ name: i.name, categoryId: i.categoryId ?? "" });
  }

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const categoryName_ = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "بدون قسم";

  return (
    <div>
      <PageHeader title="قائمة الطعام" description="الأقسام والأصناف والأحجام" />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>الأقسام ({categories.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleCategorySubmit} className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <Field label="اسم القسم الجديد">
                  <Input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" disabled={createCategory.isPending}>إضافة</Button>
            </form>
            {categories.length > 0 && (
              <div className="space-y-1.5">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                    {editingCategoryId === c.id ? (
                      <>
                        <Input
                          autoFocus
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          className="flex-1 py-1"
                        />
                        <Button size="sm" onClick={() => updateCategory.mutate({ id: c.id, name: editingCategoryName })} disabled={updateCategory.isPending}>
                          حفظ
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCategoryId(null)}>إلغاء</Button>
                      </>
                    ) : (
                      <>
                        <span className={`flex-1 text-sm font-semibold ${c.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>{c.name}</span>
                        {!c.isActive && <Badge tone="neutral">معطّل</Badge>}
                        <Button size="sm" variant="ghost" onClick={() => startEditCategory(c)}>تعديل</Button>
                        <Button
                          size="sm"
                          variant={c.isActive ? "secondary" : "primary"}
                          onClick={() => updateCategory.mutate({ id: c.id, isActive: !c.isActive })}
                          disabled={updateCategory.isPending}
                        >
                          {c.isActive ? "تعطيل" : "تفعيل"}
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>إضافة صنف</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleItemSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="اسم الصنف">
                  <Input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
                </Field>
                <Field label="القسم">
                  <Select value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}>
                    <option value="">بدون قسم</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="اسم الحجم (اختياري)">
                  <Input value={itemForm.variantLabel} onChange={(e) => setItemForm({ ...itemForm, variantLabel: e.target.value })} />
                </Field>
                <Field label="السعر">
                  <Input type="number" value={itemForm.variantPrice} onChange={(e) => setItemForm({ ...itemForm, variantPrice: e.target.value })} />
                </Field>
              </div>
              {itemError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{itemError}</p>}
              <Button type="submit" disabled={createItem.isPending}>إضافة</Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الأصناف ({items.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>الاسم</TH><TH>القسم</TH><TH>الأحجام والأسعار</TH><TH>الحالة</TH><TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  {editingItemId === i.id ? (
                    <>
                      <TD><Input value={editingItemForm.name} onChange={(e) => setEditingItemForm({ ...editingItemForm, name: e.target.value })} className="py-1" /></TD>
                      <TD>
                        <Select
                          value={editingItemForm.categoryId}
                          onChange={(e) => setEditingItemForm({ ...editingItemForm, categoryId: e.target.value })}
                          className="py-1"
                        >
                          <option value="">بدون قسم</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </TD>
                      <TD colSpan={2} className="text-xs text-slate-400">تقدر تعدّل الأسعار من غير ما تدخل هنا</TD>
                      <TD>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateItem.mutate({ id: i.id, name: editingItemForm.name, categoryId: editingItemForm.categoryId || null })
                            }
                            disabled={updateItem.isPending}
                          >
                            حفظ
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)}>إلغاء</Button>
                        </div>
                      </TD>
                    </>
                  ) : (
                    <>
                      <TD className={`font-semibold ${i.isActive ? "text-slate-900" : "text-slate-400 line-through"}`}>{i.name}</TD>
                      <TD>{categoryName_(i.categoryId)}</TD>
                      <TD>
                        {i.variants.length === 0 ? (
                          "—"
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {i.variants.map((v) => (
                              <div key={v.id} className="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                                <span className="text-xs text-slate-500">{v.label}:</span>
                                <Input
                                  type="number"
                                  value={variantPrices[v.id] ?? String(v.price)}
                                  onChange={(e) => setVariantPrices({ ...variantPrices, [v.id]: e.target.value })}
                                  className="w-20 py-0.5 text-xs"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => updateVariant.mutate({ itemId: i.id, variantId: v.id, price: Number(variantPrices[v.id] ?? v.price) })}
                                  disabled={updateVariant.isPending || Number(variantPrices[v.id] ?? v.price) === v.price}
                                >
                                  حفظ
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD>{i.isActive ? <Badge tone="success">نشط</Badge> : <Badge tone="neutral">معطّل</Badge>}</TD>
                      <TD>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => startEditItem(i)}>تعديل</Button>
                          <Button size="sm" variant="ghost" onClick={() => setModifiersItemId(i.id)}>
                            المرفقات ({i.modifiers.length})
                          </Button>
                          <Button
                            size="sm"
                            variant={i.isActive ? "secondary" : "primary"}
                            onClick={() => updateItem.mutate({ id: i.id, isActive: !i.isActive })}
                            disabled={updateItem.isPending}
                          >
                            {i.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                        </div>
                      </TD>
                    </>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {items.length === 0 && <EmptyState>مفيش أصناف لسه</EmptyState>}
        </CardBody>
      </Card>

      {modifiersItemId && (() => {
        const item = items.find((i) => i.id === modifiersItemId);
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModifiersItemId(null)}>
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">مرفقات {item.name}</h3>
                <button type="button" onClick={() => setModifiersItemId(null)} className="text-slate-400 hover:text-slate-700">×</button>
              </div>

              <div className="space-y-3">
                {item.modifiers.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`flex-1 text-sm font-semibold ${m.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>{m.name}</span>
                      <Input
                        type="number"
                        value={modifierPrices[m.id] ?? String(m.priceDelta)}
                        onChange={(e) => setModifierPrices({ ...modifierPrices, [m.id]: e.target.value })}
                        className="w-20 py-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updateModifier.isPending || Number(modifierPrices[m.id] ?? m.priceDelta) === m.priceDelta}
                        onClick={() => updateModifier.mutate({ itemId: item.id, modifierId: m.id, priceDelta: Number(modifierPrices[m.id] ?? m.priceDelta) })}
                      >
                        حفظ
                      </Button>
                      <Button
                        size="sm"
                        variant={m.isActive ? "secondary" : "primary"}
                        disabled={updateModifier.isPending}
                        onClick={() => updateModifier.mutate({ itemId: item.id, modifierId: m.id, isActive: !m.isActive })}
                      >
                        {m.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                    </div>

                    {item.variants.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                        <p className="text-xs text-slate-400">سعر مخصوص لكل حجم (فاضي = يستخدم السعر الافتراضي فوق)</p>
                        {item.variants.map((v) => {
                          const override = m.variantPrices.find((vp) => vp.variantId === v.id);
                          const key = `${m.id}:${v.id}`;
                          return (
                            <div key={v.id} className="flex items-center gap-2">
                              <span className="w-16 text-xs text-slate-500">{v.label}</span>
                              <Input
                                type="number"
                                placeholder="افتراضي"
                                value={variantOverrides[key] ?? (override ? String(override.priceDelta) : "")}
                                onChange={(e) => setVariantOverrides({ ...variantOverrides, [key]: e.target.value })}
                                className="w-20 py-0.5 text-xs"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={setModifierVariantPrice.isPending || !(variantOverrides[key] ?? "").trim()}
                                onClick={() =>
                                  setModifierVariantPrice.mutate({ itemId: item.id, modifierId: m.id, variantId: v.id, priceDelta: Number(variantOverrides[key]) })
                                }
                              >
                                حفظ
                              </Button>
                              {override && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={clearModifierVariantPrice.isPending}
                                  onClick={() => {
                                    setVariantOverrides({ ...variantOverrides, [key]: "" });
                                    clearModifierVariantPrice.mutate({ itemId: item.id, modifierId: m.id, variantId: v.id });
                                  }}
                                >
                                  إلغاء
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {item.modifiers.length === 0 && <p className="py-2 text-center text-sm text-slate-400">مفيش مرفقات لسه</p>}
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500">إضافة مرفق جديد</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="اسم المرفق">
                      <Input value={newModifierName} onChange={(e) => setNewModifierName(e.target.value)} className="py-1" />
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field label="السعر">
                      <Input type="number" value={newModifierPrice} onChange={(e) => setNewModifierPrice(e.target.value)} className="py-1" />
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    disabled={addModifier.isPending || !newModifierName.trim()}
                    onClick={() => addModifier.mutate({ itemId: item.id, name: newModifierName, priceDelta: Number(newModifierPrice) || 0 })}
                  >
                    إضافة
                  </Button>
                </div>
                {modifierError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{modifierError}</p>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
