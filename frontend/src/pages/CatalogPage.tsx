import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface MenuCategory {
  id: string;
  name: string;
  menuGroup: string;
  isActive: boolean;
}

interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  isActive: boolean;
  variants: { id: string; label: string; price: number; talabatPrice: number | null }[];
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => apiRequest<MenuCategory[]>("/catalog/categories") });
  const itemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });

  const [categoryName, setCategoryName] = useState("");
  const createCategory = useMutation({
    mutationFn: () => apiRequest("/catalog/categories", { method: "POST", body: { name: categoryName } }),
    onSuccess: () => {
      setCategoryName("");
      queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
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
      queryClient.invalidateQueries({ queryKey: ["catalog", "items"] });
    },
    onError: (err) => setItemError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  function handleCategorySubmit(e: FormEvent) {
    e.preventDefault();
    createCategory.mutate();
  }
  function handleItemSubmit(e: FormEvent) {
    e.preventDefault();
    createItem.mutate();
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
            <CardTitle>إضافة قسم</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleCategorySubmit} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label="اسم القسم">
                  <Input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" disabled={createCategory.isPending}>إضافة</Button>
            </form>
            {categories.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <span key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {c.name}
                  </span>
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
                <TH>الاسم</TH><TH>القسم</TH><TH>الأحجام والأسعار</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD className="font-semibold text-slate-900">{i.name}</TD>
                  <TD>{categoryName_(i.categoryId)}</TD>
                  <TD>{i.variants.map((v) => `${v.label}: ${v.price}ج`).join("، ") || "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {items.length === 0 && <EmptyState>مفيش أصناف لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
