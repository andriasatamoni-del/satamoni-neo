import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>قائمة الطعام</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة قسم</h2>
        <form onSubmit={handleCategorySubmit} style={{ display: "flex", gap: 8 }}>
          <input required placeholder="اسم القسم" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} style={{ flex: 1, padding: 6 }} />
          <button type="submit" disabled={createCategory.isPending}>إضافة</button>
        </form>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة صنف</h2>
        <form onSubmit={handleItemSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input required placeholder="اسم الصنف" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} style={{ padding: 6 }} />
            <select value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} style={{ padding: 6 }}>
              <option value="">بدون قسم</option>
              {categoriesQuery.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="اسم الحجم (اختياري)" value={itemForm.variantLabel} onChange={(e) => setItemForm({ ...itemForm, variantLabel: e.target.value })} style={{ padding: 6 }} />
            <input type="number" placeholder="السعر" value={itemForm.variantPrice} onChange={(e) => setItemForm({ ...itemForm, variantPrice: e.target.value })} style={{ padding: 6 }} />
          </div>
          {itemError && <p style={{ color: "crimson" }}>{itemError}</p>}
          <button type="submit" disabled={createItem.isPending} style={{ padding: "8px 16px", marginTop: 8 }}>
            إضافة
          </button>
        </form>
      </section>

      <section>
        <h2>الأصناف ({itemsQuery.data?.length ?? 0})</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الاسم</th><th>الأحجام والأسعار</th>
            </tr>
          </thead>
          <tbody>
            {itemsQuery.data?.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{i.name}</td>
                <td>{i.variants.map((v) => `${v.label}: ${v.price}ج`).join("، ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
