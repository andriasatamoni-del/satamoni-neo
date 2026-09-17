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

interface Branch { id: string; name: string; }
interface Treasury { id: string; name: string; kind: "MAIN" | "BANK"; branchId: string | null; accountCode: string; balance: number; }
interface Bank { id: string; name: string; isActive: boolean; }
interface BankAccount {
  id: string; bankId: string; bankName: string; treasuryId: string; accountCode: string;
  accountNumber: string | null; iban: string | null; bankBranchName: string | null; notes: string | null;
  isActive: boolean; balance: number;
}

const KIND_LABELS: Record<string, string> = { MAIN: "خزينة رئيسية", BANK: "حساب بنكي" };
const TABS = [
  { key: "treasuries", label: "الخزائن" },
  { key: "banks", label: "البنوك" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function TreasuriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("treasuries");
  const canFilterByBranch = user?.role === "admin" || user?.role === "accountant";
  const [branchId, setBranchId] = useState("");

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const treasuriesQuery = useQuery({
    queryKey: ["treasuries", branchId],
    queryFn: () => apiRequest<Treasury[]>(`/treasuries${branchId ? `?branchId=${branchId}` : ""}`),
  });
  const banksQuery = useQuery({ queryKey: ["banks"], queryFn: () => apiRequest<Bank[]>("/banks") });
  const bankAccountsQuery = useQuery({ queryKey: ["banks", "accounts"], queryFn: () => apiRequest<BankAccount[]>("/banks/accounts") });

  const branchName = (id: string | null) => (id ? branchesQuery.data?.find((b) => b.id === id)?.name ?? id : "مشتركة");

  // --- إنشاء خزينة رئيسية لفرع ناقصها (فروع اتستوردت من الريبو القديم قبل ما الإنشاء التلقائي يتفعّل) ---
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const provisionMainTreasury = useMutation({
    mutationFn: () => {
      const branch = branchesQuery.data?.find((b) => b.id === branchId);
      return apiRequest("/treasuries", { method: "POST", body: { name: `خزينة ${branch?.name ?? ""} الرئيسية`, branchId } });
    },
    onSuccess: () => {
      setProvisionError(null);
      queryClient.invalidateQueries({ queryKey: ["treasuries"] });
    },
    onError: (err) => setProvisionError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  // --- تحويل بين خزينتين ---
  const [transferForm, setTransferForm] = useState({ fromTreasuryId: "", toTreasuryId: "", amount: "", notes: "" });
  const [transferError, setTransferError] = useState<string | null>(null);
  const transfer = useMutation({
    mutationFn: () =>
      apiRequest(`/treasuries/${transferForm.fromTreasuryId}/transfer`, {
        method: "POST",
        body: { toTreasuryId: transferForm.toTreasuryId, amount: Number(transferForm.amount), notes: transferForm.notes || undefined },
      }),
    onSuccess: () => {
      setTransferError(null);
      setTransferForm({ fromTreasuryId: "", toTreasuryId: "", amount: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["treasuries"] });
      queryClient.invalidateQueries({ queryKey: ["banks", "accounts"] });
    },
    onError: (err) => setTransferError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  // --- البنوك ---
  const [bankForm, setBankForm] = useState({ name: "" });
  const [bankError, setBankError] = useState<string | null>(null);
  const createBank = useMutation({
    mutationFn: () => apiRequest("/banks", { method: "POST", body: bankForm }),
    onSuccess: () => {
      setBankError(null);
      setBankForm({ name: "" });
      queryClient.invalidateQueries({ queryKey: ["banks"] });
    },
    onError: (err) => setBankError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const toggleBankActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/banks/${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["banks"] }),
  });

  // --- الحسابات البنكية ---
  const [accountForm, setAccountForm] = useState({ bankId: "", name: "", accountNumber: "", iban: "", bankBranchName: "", branchId: "" });
  const [accountError, setAccountError] = useState<string | null>(null);
  const createAccount = useMutation({
    mutationFn: () =>
      apiRequest("/banks/accounts", {
        method: "POST",
        body: {
          bankId: accountForm.bankId, name: accountForm.name,
          accountNumber: accountForm.accountNumber || undefined, iban: accountForm.iban || undefined,
          bankBranchName: accountForm.bankBranchName || undefined, branchId: accountForm.branchId || undefined,
        },
      }),
    onSuccess: () => {
      setAccountError(null);
      setAccountForm({ bankId: "", name: "", accountNumber: "", iban: "", bankBranchName: "", branchId: "" });
      queryClient.invalidateQueries({ queryKey: ["banks", "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["treasuries"] });
    },
    onError: (err) => setAccountError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const treasuries = treasuriesQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الخزائن والبنوك" description="متابعة أرصدة الخزائن والحسابات البنكية والتحويل بينها" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "treasuries" && (
        <>
          {canFilterByBranch && (
            <Card className="mb-6">
              <CardBody>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="max-w-xs flex-1">
                    <Field label="الفرع">
                      <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                        <option value="">كل الفروع</option>
                        {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                  {branchId && !treasuriesQuery.isLoading && !treasuries.some((t) => t.kind === "MAIN") && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={provisionMainTreasury.isPending}
                      onClick={() => provisionMainTreasury.mutate()}
                    >
                      {provisionMainTreasury.isPending ? "بيتنشئ..." : "+ إنشاء خزينة رئيسية لهذا الفرع"}
                    </Button>
                  )}
                </div>
                {provisionError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{provisionError}</p>}
              </CardBody>
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader><CardTitle>تحويل بين خزينتين</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); transfer.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="من خزينة">
                    <Select required value={transferForm.fromTreasuryId} onChange={(e) => setTransferForm({ ...transferForm, fromTreasuryId: e.target.value })}>
                      <option value="">اختر خزينة</option>
                      {treasuries.map((t) => <option key={t.id} value={t.id}>{t.name} ({fmt(t.balance)}ج)</option>)}
                    </Select>
                  </Field>
                  <Field label="لخزينة">
                    <Select required value={transferForm.toTreasuryId} onChange={(e) => setTransferForm({ ...transferForm, toTreasuryId: e.target.value })}>
                      <option value="">اختر خزينة</option>
                      {treasuries.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="المبلغ">
                    <Input required type="number" min="0.01" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} />
                  </Field>
                  <Field label="ملاحظات (اختياري)">
                    <Input value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} />
                  </Field>
                </div>
                {transferError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{transferError}</p>}
                <Button type="submit" disabled={transfer.isPending}>{transfer.isPending ? "بيتحوّل..." : "تحويل"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>الخزائن ({treasuries.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>الاسم</TH>
                    <TH>النوع</TH>
                    <TH>الفرع</TH>
                    <TH>كود الحساب</TH>
                    <TH>الرصيد</TH>
                  </TR>
                </THead>
                <TBody>
                  {treasuries.map((t) => (
                    <TR key={t.id}>
                      <TD className="font-semibold text-slate-900">{t.name}</TD>
                      <TD><Badge tone={t.kind === "MAIN" ? "brand" : "info"}>{KIND_LABELS[t.kind]}</Badge></TD>
                      <TD>{branchName(t.branchId)}</TD>
                      <TD className="font-mono text-xs">{t.accountCode}</TD>
                      <TD className={`font-bold ${t.balance < 0 ? "text-red-600" : "text-slate-900"}`}>{fmt(t.balance)}ج</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {treasuries.length === 0 && <EmptyState>مفيش خزائن لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "banks" && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>بنك جديد</CardTitle></CardHeader>
              <CardBody>
                <form onSubmit={(e: FormEvent) => { e.preventDefault(); createBank.mutate(); }} className="space-y-4">
                  <Field label="اسم البنك">
                    <Input required value={bankForm.name} onChange={(e) => setBankForm({ name: e.target.value })} />
                  </Field>
                  {bankError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{bankError}</p>}
                  <Button type="submit" disabled={createBank.isPending}>إضافة البنك</Button>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>البنوك ({banksQuery.data?.length ?? 0})</CardTitle></CardHeader>
              <CardBody className="p-0">
                <Table>
                  <THead><TR><TH>الاسم</TH><TH>الحالة</TH><TH>إجراء</TH></TR></THead>
                  <TBody>
                    {banksQuery.data?.map((b) => (
                      <TR key={b.id}>
                        <TD className="font-semibold text-slate-900">{b.name}</TD>
                        <TD><Badge tone={b.isActive ? "success" : "danger"}>{b.isActive ? "نشط" : "متوقف"}</Badge></TD>
                        <TD>
                          <Button size="sm" variant={b.isActive ? "danger" : "primary"} disabled={toggleBankActive.isPending}
                            onClick={() => toggleBankActive.mutate({ id: b.id, isActive: !b.isActive })}>
                            {b.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {(banksQuery.data?.length ?? 0) === 0 && <EmptyState>مفيش بنوك لسه</EmptyState>}
              </CardBody>
            </Card>
          </div>

          <Card className="my-6">
            <CardHeader><CardTitle>حساب بنكي جديد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); createAccount.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="البنك">
                    <Select required value={accountForm.bankId} onChange={(e) => setAccountForm({ ...accountForm, bankId: e.target.value })}>
                      <option value="">اختر بنك</option>
                      {banksQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="اسم الحساب">
                    <Input required placeholder="مثلًا: بنك مصر - فرع الجيزة" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
                  </Field>
                  <Field label="رقم الحساب (اختياري)">
                    <Input value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} />
                  </Field>
                  <Field label="IBAN (اختياري)">
                    <Input value={accountForm.iban} onChange={(e) => setAccountForm({ ...accountForm, iban: e.target.value })} />
                  </Field>
                  <Field label="فرع البنك (اختياري)">
                    <Input value={accountForm.bankBranchName} onChange={(e) => setAccountForm({ ...accountForm, bankBranchName: e.target.value })} />
                  </Field>
                  <Field label="ربط بفرع معيّن (اختياري)">
                    <Select value={accountForm.branchId} onChange={(e) => setAccountForm({ ...accountForm, branchId: e.target.value })}>
                      <option value="">- مشترك على مستوى الشركة -</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                </div>
                {accountError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{accountError}</p>}
                <Button type="submit" disabled={createAccount.isPending}>{createAccount.isPending ? "بيتسجّل..." : "إنشاء الحساب"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>الحسابات البنكية ({bankAccountsQuery.data?.length ?? 0})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>البنك</TH>
                    <TH>رقم الحساب</TH>
                    <TH>IBAN</TH>
                    <TH>الرصيد</TH>
                    <TH>الحالة</TH>
                  </TR>
                </THead>
                <TBody>
                  {bankAccountsQuery.data?.map((a) => (
                    <TR key={a.id}>
                      <TD className="font-semibold text-slate-900">{a.bankName}</TD>
                      <TD className="font-mono text-xs">{a.accountNumber ?? "-"}</TD>
                      <TD className="font-mono text-xs">{a.iban ?? "-"}</TD>
                      <TD className={`font-bold ${a.balance < 0 ? "text-red-600" : "text-slate-900"}`}>{fmt(a.balance)}ج</TD>
                      <TD><Badge tone={a.isActive ? "success" : "danger"}>{a.isActive ? "نشط" : "متوقف"}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {(bankAccountsQuery.data?.length ?? 0) === 0 && <EmptyState>مفيش حسابات بنكية لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
