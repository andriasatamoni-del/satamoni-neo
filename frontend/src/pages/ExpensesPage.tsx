import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface ExpenseCategory {
  id: string; name: string; isActive: boolean; alertThreshold: number | null; accountId: string | null;
}
interface Expense {
  id: string; branchId: string; businessDate: string; categoryId: string; amount: number; notes: string | null;
  supplierId: string | null; status: "DRAFT" | "SUBMITTED" | "POSTED" | "CANCELLED";
  cancellationReason: string | null; journalEntryId: string | null;
}
interface Branch { id: string; name: string; }
interface Account { id: string; code: string; name: string; }
interface Supplier { id: string; name: string; }

const STATUS_LABELS: Record<string, string> = { DRAFT: "مسودة", SUBMITTED: "بانتظار المراجعة", POSTED: "مرحّل", CANCELLED: "ملغى" };
const STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral", SUBMITTED: "warning", POSTED: "success", CANCELLED: "danger",
};

const TABS = [
  { key: "expenses", label: "المصروفات" },
  { key: "categories", label: "بنود المصروفات" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function ExpensesPage() {
  const { user } = useAuth();
  const isCashier = user?.role === "cashier";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("expenses");

  const categoriesQuery = useQuery({ queryKey: ["expenses", "categories"], queryFn: () => apiRequest<ExpenseCategory[]>("/expenses/categories") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const accountsQuery = useQuery({ queryKey: ["accounting", "accounts"], queryFn: () => apiRequest<Account[]>("/accounting/accounts") });
  const suppliersQuery = useQuery({ queryKey: ["procurement", "suppliers"], queryFn: () => apiRequest<Supplier[]>("/procurement/suppliers") });

  const [expenseFilterBranchId, setExpenseFilterBranchId] = useState("");
  const expensesQuery = useQuery({
    queryKey: ["expenses", "list", expenseFilterBranchId],
    queryFn: () => apiRequest<Expense[]>(expenseFilterBranchId ? `/expenses?branchId=${expenseFilterBranchId}` : "/expenses"),
  });

  const [expenseForm, setExpenseForm] = useState({
    branchId: "", businessDate: new Date().toISOString().slice(0, 10), categoryId: "", amount: "", notes: "", supplierId: "",
    status: "POSTED" as "DRAFT" | "SUBMITTED" | "POSTED",
  });
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const createExpense = useMutation({
    mutationFn: () =>
      apiRequest("/expenses", {
        method: "POST",
        body: {
          branchId: expenseForm.branchId,
          businessDate: expenseForm.businessDate,
          categoryId: expenseForm.categoryId,
          amount: Number(expenseForm.amount),
          notes: expenseForm.notes || undefined,
          supplierId: expenseForm.supplierId || undefined,
          status: isCashier ? undefined : expenseForm.status,
        },
      }),
    onSuccess: () => {
      setExpenseForm({ ...expenseForm, categoryId: "", amount: "", notes: "", supplierId: "" });
      setExpenseError(null);
      queryClient.invalidateQueries({ queryKey: ["expenses", "list"] });
    },
    onError: (err) => setExpenseError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [expenseActionError, setExpenseActionError] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});

  const submitExpense = useMutation({
    mutationFn: (id: string) => apiRequest(`/expenses/${id}/submit`, { method: "POST" }),
    onSuccess: () => { setExpenseActionError(null); queryClient.invalidateQueries({ queryKey: ["expenses", "list"] }); },
    onError: (err) => setExpenseActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const reviewExpense = useMutation({
    mutationFn: (id: string) => apiRequest(`/expenses/${id}/review`, { method: "POST" }),
    onSuccess: () => { setExpenseActionError(null); queryClient.invalidateQueries({ queryKey: ["expenses", "list"] }); },
    onError: (err) => setExpenseActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const cancelExpense = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiRequest(`/expenses/${id}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: () => { setExpenseActionError(null); queryClient.invalidateQueries({ queryKey: ["expenses", "list"] }); },
    onError: (err) => setExpenseActionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [categoryForm, setCategoryForm] = useState({ name: "", accountId: "", alertThreshold: "" });
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const createCategory = useMutation({
    mutationFn: () =>
      apiRequest("/expenses/categories", {
        method: "POST",
        body: { name: categoryForm.name, accountId: categoryForm.accountId || undefined, alertThreshold: categoryForm.alertThreshold ? Number(categoryForm.alertThreshold) : undefined },
      }),
    onSuccess: () => {
      setCategoryForm({ name: "", accountId: "", alertThreshold: "" });
      setCategoryError(null);
      queryClient.invalidateQueries({ queryKey: ["expenses", "categories"] });
    },
    onError: (err) => setCategoryError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const toggleCategoryActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/expenses/categories/${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses", "categories"] }),
  });

  const categories = categoriesQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];

  function categoryName(id: string): string {
    return categories.find((c) => c.id === id)?.name ?? id;
  }
  function branchName(id: string): string {
    return branchesQuery.data?.find((b) => b.id === id)?.name ?? id;
  }

  return (
    <div>
      <PageHeader title="المصروفات" description="تسجيل ومراجعة مصروفات الفروع، وبنود المصروفات" />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "expenses" && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>تسجيل مصروف جديد</CardTitle></CardHeader>
            <CardBody>
              <p className="mb-4 text-sm text-slate-500">
                {isCashier
                  ? "هيتسجّل على فرعك والنهاردة، وحالته دايمًا بانتظار المراجعة - محتاج مراجعة مدير الفرع أو المحاسب قبل ما يترحّل."
                  : "الافتراضي (مرحّل) بيسجّل ويرحّل القيد المحاسبي فورًا. اختار مسودة أو بانتظار المراجعة لو عايز مراجعة قبل الترحيل."}
              </p>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); createExpense.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {!isCashier && (
                    <Field label="الفرع">
                      <Select required value={expenseForm.branchId} onChange={(e) => setExpenseForm({ ...expenseForm, branchId: e.target.value })}>
                        <option value="">اختر فرع</option>
                        {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  {!isCashier && (
                    <Field label="التاريخ">
                      <Input required type="date" value={expenseForm.businessDate} onChange={(e) => setExpenseForm({ ...expenseForm, businessDate: e.target.value })} />
                    </Field>
                  )}
                  <Field label="بند المصروف">
                    <Select required value={expenseForm.categoryId} onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}>
                      <option value="">اختر بند</option>
                      {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="المبلغ">
                    <Input required type="number" min="0.01" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                  </Field>
                  {!isCashier && (
                    <Field label="على ذمة مورد (اختياري)">
                      <Select value={expenseForm.supplierId} onChange={(e) => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}>
                        <option value="">كاش</option>
                        {suppliersQuery.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  {!isCashier && (
                    <Field label="الحالة">
                      <Select value={expenseForm.status} onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value as typeof expenseForm.status })}>
                        <option value="POSTED">مرحّل فورًا</option>
                        <option value="SUBMITTED">بانتظار المراجعة</option>
                        <option value="DRAFT">مسودة</option>
                      </Select>
                    </Field>
                  )}
                </div>
                <Field label="ملاحظات (اختياري)">
                  <Input value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
                </Field>
                {expenseError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{expenseError}</p>}
                <Button type="submit" disabled={createExpense.isPending}>تسجيل</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>سجل المصروفات ({expenses.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              {!isCashier && (
                <div className="border-b border-slate-100 p-4">
                  <Field label="فلترة حسب فرع (اختياري)">
                    <Select value={expenseFilterBranchId} onChange={(e) => setExpenseFilterBranchId(e.target.value)}>
                      <option value="">كل الفروع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
              {expenseActionError && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{expenseActionError}</p>}
              <Table>
                <THead>
                  <TR><TH>التاريخ</TH>{!isCashier && <TH>الفرع</TH>}<TH>البند</TH><TH>المبلغ</TH><TH>ملاحظات</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {expenses.map((e) => (
                    <TR key={e.id}>
                      <TD>{e.businessDate.slice(0, 10)}</TD>
                      {!isCashier && <TD>{branchName(e.branchId)}</TD>}
                      <TD className="font-semibold text-slate-900">{categoryName(e.categoryId)}</TD>
                      <TD className="font-bold text-slate-900">{fmt(e.amount)}ج</TD>
                      <TD>{e.notes ?? "-"}</TD>
                      <TD>
                        <Badge tone={STATUS_TONES[e.status]}>{STATUS_LABELS[e.status]}</Badge>
                        {e.status === "CANCELLED" && e.cancellationReason && <div className="mt-1 text-xs text-slate-500">{e.cancellationReason}</div>}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {e.status === "DRAFT" && (
                            <Button size="sm" onClick={() => submitExpense.mutate(e.id)} disabled={submitExpense.isPending}>تقديم</Button>
                          )}
                          {e.status === "SUBMITTED" && !isCashier && (
                            <Button size="sm" onClick={() => reviewExpense.mutate(e.id)} disabled={reviewExpense.isPending}>مراجعة واعتماد</Button>
                          )}
                          {(e.status === "DRAFT" || e.status === "SUBMITTED") && (
                            <>
                              <Input
                                placeholder="سبب الإلغاء"
                                className="w-32"
                                value={cancelReasons[e.id] ?? ""}
                                onChange={(ev) => setCancelReasons({ ...cancelReasons, [e.id]: ev.target.value })}
                              />
                              <Button
                                size="sm" variant="danger"
                                onClick={() => cancelExpense.mutate({ id: e.id, reason: cancelReasons[e.id] ?? "" })}
                                disabled={cancelExpense.isPending}
                              >
                                إلغاء
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {expenses.length === 0 && <EmptyState>مفيش مصروفات مسجلة لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "categories" && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>بند مصروف جديد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); createCategory.mutate(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
                <Field label="اسم البند">
                  <Input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
                </Field>
                <Field label="الحساب المرتبط (اختياري - افتراضيًا 6900)">
                  <Select value={categoryForm.accountId} onChange={(e) => setCategoryForm({ ...categoryForm, accountId: e.target.value })}>
                    <option value="">افتراضي</option>
                    {accountsQuery.data?.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </Select>
                </Field>
                <Field label="حد التنبيه (اختياري)">
                  <Input type="number" min="0" value={categoryForm.alertThreshold} onChange={(e) => setCategoryForm({ ...categoryForm, alertThreshold: e.target.value })} />
                </Field>
                <Button type="submit" disabled={createCategory.isPending}>إضافة</Button>
              </form>
              {categoryError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{categoryError}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>بنود المصروفات ({categories.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>الاسم</TH><TH>الحساب المرتبط</TH><TH>حد التنبيه</TH><TH>الحالة</TH><TH></TH></TR>
                </THead>
                <TBody>
                  {categories.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-semibold text-slate-900">{c.name}</TD>
                      <TD>{c.accountId ? accountsQuery.data?.find((a) => a.id === c.accountId)?.name ?? "-" : "افتراضي (6900)"}</TD>
                      <TD>{c.alertThreshold != null ? fmt(c.alertThreshold) + "ج" : "-"}</TD>
                      <TD><Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "فعّال" : "معطّل"}</Badge></TD>
                      <TD>
                        <Button size="sm" variant="secondary" onClick={() => toggleCategoryActive.mutate({ id: c.id, isActive: !c.isActive })}>
                          {c.isActive ? "تعطيل" : "تفعيل"}
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {categories.length === 0 && <EmptyState>مفيش بنود مصروفات لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
