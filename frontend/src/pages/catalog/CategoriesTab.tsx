import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Input } from "../../shared/ui/Field";
import { Pagination } from "../../shared/ui/Pagination";
import { useClientPagination } from "../../shared/ui/useClientPagination";
import { useListState } from "../../shared/ui/useListState";
import { errorText, type MenuCategory } from "./catalogTypes";

export function CategoriesTab({ canManage, categories }: { canManage: boolean; categories: MenuCategory[] }) {
  const queryClient = useQueryClient();
  const layoutQuery = useQuery({ queryKey: ["catalog", "layout"], queryFn: () => apiRequest<{ combosPosition: number }>("/catalog/layout") });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
    queryClient.invalidateQueries({ queryKey: ["catalog", "layout"] });
    queryClient.invalidateQueries({ queryKey: ["catalog", "items"] });
  };

  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => setError(errorText(err));
  const onSuccess = () => {
    setError(null);
    invalidate();
  };

  const [newName, setNewName] = useState("");
  const createCategory = useMutation({
    mutationFn: () => apiRequest("/catalog/categories", { method: "POST", body: { name: newName } }),
    onSuccess: () => {
      setNewName("");
      onSuccess();
    },
    onError,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const updateCategory = useMutation({
    mutationFn: (input: { id: string; name?: string; isActive?: boolean }) =>
      apiRequest(`/catalog/categories/${input.id}`, { method: "PATCH", body: { name: input.name, isActive: input.isActive } }),
    onSuccess: () => {
      setEditingId(null);
      onSuccess();
    },
    onError,
  });

  const reorderCategories = useMutation({
    mutationFn: (order: string[]) => apiRequest("/catalog/categories/order", { method: "PUT", body: { order } }),
    onSuccess,
    onError,
  });
  const invalidateArchived = () => queryClient.invalidateQueries({ queryKey: ["catalog", "categories", "archived"] });
  const archiveCategory = useMutation({
    mutationFn: (id: string) => apiRequest(`/catalog/categories/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      onSuccess();
      invalidateArchived();
    },
    onError,
  });
  const restoreCategory = useMutation({
    mutationFn: (id: string) => apiRequest(`/catalog/categories/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      onSuccess();
      invalidateArchived();
    },
    onError,
  });

  const [showArchived, setShowArchived] = useState(false);
  const archivedList = useListState([] as const, { prefix: "archived." });
  const archivedPageQuery = usePaginatedQuery<MenuCategory>(
    ["catalog", "categories", "archived"],
    "/catalog/categories",
    { ...archivedList.params, archived: "true" },
    { enabled: canManage && showArchived }
  );

  const orderRows = [
    ...categories.map((c) => ({ key: c.id, order: c.displayOrder, rank: 1, category: c as MenuCategory | null })),
    { key: "combos", order: layoutQuery.data?.combosPosition ?? -1, rank: 0, category: null as MenuCategory | null },
  ].sort((a, b) => a.order - b.order || a.rank - b.rank || (a.category?.name ?? "").localeCompare(b.category?.name ?? "", "ar"));
  const categoriesPage = useClientPagination(orderRows);

  function moveRow(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= orderRows.length) return;
    const keys = orderRows.map((r) => r.key);
    [keys[index], keys[target]] = [keys[target], keys[index]];
    reorderCategories.mutate(keys);
  }

  function confirmArchive(c: MenuCategory) {
    if (window.confirm(`إلغاء قسم "${c.name}"؟\nهيختفي من الكاشير والإعدادات، والأصناف والطلبات القديمة هتفضل سليمة، وتقدر ترجّعه من "الأقسام المؤرشفة".`)) {
      archiveCategory.mutate(c.id);
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createCategory.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الأقسام ({categories.length})</CardTitle>
      </CardHeader>
      <CardBody>
        {canManage && (
          <form onSubmit={handleCreate} className="mb-4 flex items-end gap-3">
            <div className="flex-1">
              <Field label="اسم القسم الجديد">
                <Input required value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" disabled={createCategory.isPending}>إضافة</Button>
          </form>
        )}
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <p className="mb-2 text-xs text-slate-500">الترتيب هنا هو ترتيب أزرار الأقسام في شاشة الطلبات (العروض بتتحرك وسط الأقسام).</p>
        <div className="space-y-1.5">
          {categoriesPage.pageRows.map((row, pageIndex) => {
            const index = categoriesPage.pager.offset + pageIndex;
            const c = row.category;
            const arrows = canManage && (
              <span className="flex flex-col">
                <button type="button" aria-label="لفوق" title="لفوق" disabled={index === 0 || reorderCategories.isPending} onClick={() => moveRow(index, -1)} className="px-1 text-xs leading-none text-slate-500 hover:text-brand-700 disabled:opacity-30">▲</button>
                <button type="button" aria-label="لتحت" title="لتحت" disabled={index === orderRows.length - 1 || reorderCategories.isPending} onClick={() => moveRow(index, 1)} className="px-1 text-xs leading-none text-slate-500 hover:text-brand-700 disabled:opacity-30">▼</button>
              </span>
            );
            if (!c) {
              return (
                <div key={row.key} className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2">
                  {arrows}
                  <span className="flex-1 text-sm font-semibold text-slate-800">العروض</span>
                  <Badge tone="warning">تبويب العروض</Badge>
                </div>
              );
            }
            return (
              <div key={row.key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                {arrows}
                {editingId === c.id ? (
                  <>
                    <Input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="flex-1 py-1" />
                    <Button size="sm" onClick={() => updateCategory.mutate({ id: c.id, name: editingName })} disabled={updateCategory.isPending}>حفظ</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>إلغاء</Button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm font-semibold ${c.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>{c.name}</span>
                    {!c.isActive && <Badge tone="neutral">موقوف</Badge>}
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(c.id); setEditingName(c.name); }}>تعديل</Button>
                        <Button
                          size="sm"
                          variant={c.isActive ? "secondary" : "primary"}
                          onClick={() => updateCategory.mutate({ id: c.id, isActive: !c.isActive })}
                          disabled={updateCategory.isPending}
                        >
                          {c.isActive ? "إيقاف" : "تفعيل"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => confirmArchive(c)} disabled={archiveCategory.isPending}>إلغاء القسم</Button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <Pagination {...categoriesPage.pager} />

        {canManage && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm font-semibold text-slate-600 hover:text-brand-700">
              {showArchived ? "▼" : "◀"} الأقسام المؤرشفة{archivedPageQuery.data ? ` (${archivedPageQuery.data.total})` : ""}
            </button>
            {showArchived && (
              <div className="mt-2 space-y-1.5">
                {archivedPageQuery.data?.total === 0 && <p className="text-sm text-slate-400">مفيش أقسام مؤرشفة</p>}
                {(archivedPageQuery.data?.items ?? []).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="flex-1 text-sm text-slate-500">{c.name}</span>
                    <Button size="sm" variant="secondary" onClick={() => restoreCategory.mutate(c.id)} disabled={restoreCategory.isPending}>استرجاع (موقوف)</Button>
                  </div>
                ))}
                {archivedPageQuery.data && (
                  <Pagination
                    total={archivedPageQuery.data.total}
                    limit={archivedPageQuery.data.limit}
                    offset={archivedPageQuery.data.offset}
                    onPageChange={archivedList.setPage}
                    isFetching={archivedPageQuery.isFetching}
                  />
                )}
                <p className="text-xs text-slate-400">الاسترجاع بيرجّع القسم موقوف؛ فعّله بعد كده لو عايزه يظهر في الكاشير.</p>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
