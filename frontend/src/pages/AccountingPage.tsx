import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface Account { id: string; code: string; name: string; accountType: string; isActive: boolean; }
interface JournalEntryLine { accountId: string; debit: number; credit: number; description: string | null; }
interface JournalEntry {
  id: string; entryNumber: string | null; entryDate: string; description: string | null;
  sourceType: string; sourceId: string | null; status: string; lines: JournalEntryLine[];
  reversalOfEntryId: string | null;
}

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COGS", "EXPENSE"];
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "أصول", LIABILITY: "التزامات", EQUITY: "حقوق ملكية", REVENUE: "إيرادات", COGS: "تكلفة المبيعات", EXPENSE: "مصروفات",
};

type LineInput = { accountId: string; debit: string; credit: string };

export function AccountingPage() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounting", "accounts"], queryFn: () => apiRequest<Account[]>("/accounting/accounts") });
  const entriesQuery = useQuery({ queryKey: ["accounting", "journal-entries"], queryFn: () => apiRequest<JournalEntry[]>("/accounting/journal-entries") });

  const [accountForm, setAccountForm] = useState({ code: "", name: "", accountType: "ASSET" });
  const [accountError, setAccountError] = useState<string | null>(null);
  const createAccount = useMutation({
    mutationFn: () => apiRequest("/accounting/accounts", { method: "POST", body: accountForm }),
    onSuccess: () => {
      setAccountForm({ code: "", name: "", accountType: "ASSET" });
      setAccountError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
    },
    onError: (err) => setAccountError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [entryDescription, setEntryDescription] = useState("");
  const [lines, setLines] = useState<LineInput[]>([
    { accountId: "", debit: "", credit: "" },
    { accountId: "", debit: "", credit: "" },
  ]);
  const [entryError, setEntryError] = useState<string | null>(null);
  const createEntry = useMutation({
    mutationFn: () =>
      apiRequest("/accounting/journal-entries", {
        method: "POST",
        body: {
          sourceType: "manual",
          description: entryDescription || undefined,
          lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
        },
      }),
    onSuccess: () => {
      setEntryDescription("");
      setLines([{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }]);
      setEntryError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
    },
    onError: (err) => setEntryError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const reverseEntry = useMutation({
    mutationFn: (id: string) => apiRequest(`/accounting/journal-entries/${id}/reverse`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] }),
  });

  function accountLabel(id: string): string {
    const account = accountsQuery.data?.find((a) => a.id === id);
    return account ? `${account.code} - ${account.name}` : id.slice(0, 8);
  }

  function updateLine(index: number, patch: Partial<LineInput>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const balanced = totalDebit === totalCredit;
  const accounts = accountsQuery.data ?? [];
  const entries = entriesQuery.data ?? [];

  const STATUS_META: Record<string, { label: string; tone: "success" | "danger" | "neutral" }> = {
    POSTED: { label: "مرحّل", tone: "success" },
    REVERSED: { label: "معكوس", tone: "danger" },
    DRAFT: { label: "مسودة", tone: "neutral" },
  };

  return (
    <div>
      <PageHeader title="المحاسبة" description="دليل الحسابات والقيود اليومية" />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>إضافة حساب لدليل الحسابات</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); createAccount.mutate(); }} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="الكود">
                  <Input required value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} />
                </Field>
                <Field label="اسم الحساب">
                  <Input required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
                </Field>
                <Field label="النوع">
                  <Select value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}>
                    {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                  </Select>
                </Field>
              </div>
              {accountError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{accountError}</p>}
              <Button type="submit" disabled={createAccount.isPending}>إضافة</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>دليل الحسابات ({accounts.length})</CardTitle>
          </CardHeader>
          <CardBody className="max-h-80 overflow-y-auto p-0">
            <Table>
              <THead>
                <TR><TH>الكود</TH><TH>الاسم</TH><TH>النوع</TH><TH>الحالة</TH></TR>
              </THead>
              <TBody>
                {accounts.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-mono">{a.code}</TD>
                    <TD className="font-semibold text-slate-900">{a.name}</TD>
                    <TD>{ACCOUNT_TYPE_LABELS[a.accountType] ?? a.accountType}</TD>
                    <TD><Badge tone={a.isActive ? "success" : "neutral"}>{a.isActive ? "فعّال" : "معطّل"}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>قيد يدوي جديد</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); createEntry.mutate(); }} className="space-y-4">
            <Field label="البيان (اختياري)">
              <Input value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} />
            </Field>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                  <Select required value={line.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })}>
                    <option value="">اختر حساب</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </Select>
                  <Input type="number" placeholder="مدين" value={line.debit} onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })} />
                  <Input type="number" placeholder="دائن" value={line.credit} onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })} />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, { accountId: "", debit: "", credit: "" }])}>
                + سطر
              </Button>
              <span className={`text-sm font-semibold ${balanced ? "text-slate-600" : "text-red-600"}`}>
                مدين: {totalDebit} | دائن: {totalCredit} {!balanced && "(غير متزن)"}
              </span>
            </div>

            {entryError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{entryError}</p>}

            <Button type="submit" disabled={createEntry.isPending || !balanced || totalDebit === 0}>
              تسجيل القيد
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>القيود اليومية ({entries.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR><TH>رقم القيد</TH><TH>المصدر</TH><TH>البيان</TH><TH>السطور</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
            </THead>
            <TBody>
              {entries.map((entry) => {
                const meta = STATUS_META[entry.status] ?? { label: entry.status, tone: "neutral" as const };
                return (
                  <TR key={entry.id}>
                    <TD className="font-mono">{entry.entryNumber ?? "-"}</TD>
                    <TD>{entry.sourceType}</TD>
                    <TD>{entry.description ?? "-"}</TD>
                    <TD className="text-xs">
                      {entry.lines.map((l, i) => (
                        <div key={i}>{accountLabel(l.accountId)}: مدين {l.debit} / دائن {l.credit}</div>
                      ))}
                    </TD>
                    <TD><Badge tone={meta.tone}>{meta.label}</Badge></TD>
                    <TD>
                      {entry.status === "POSTED" && (
                        <Button size="sm" variant="secondary" onClick={() => reverseEntry.mutate(entry.id)} disabled={reverseEntry.isPending}>
                          عكس القيد
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {entries.length === 0 && <EmptyState>مفيش قيود لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
