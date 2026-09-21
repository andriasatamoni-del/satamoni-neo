import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Field, Input, Select } from "../shared/ui/Field";
import { Tabs } from "../shared/ui/Tabs";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface Account {
  id: string;
  code: string;
  name: string;
  accountType: string;
  isActive: boolean;
}

interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}
interface TrialBalanceResult {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

interface GeneralLedgerLine {
  entryNumber: string | null;
  entryDate: string;
  description: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}
interface GeneralLedgerResult {
  account: { code: string; name: string; accountType: string };
  from: string;
  to: string;
  openingBalance: number;
  lines: GeneralLedgerLine[];
  closingBalance: number;
}

interface IncomeStatementLine {
  code: string;
  name: string;
  amount: number;
}
interface IncomeStatementResult {
  from: string;
  to: string;
  revenueLines: IncomeStatementLine[];
  revenue: number;
  cogsLines: IncomeStatementLine[];
  cogs: number;
  grossProfit: number;
  expenseLines: IncomeStatementLine[];
  totalExpenses: number;
  netIncome: number;
}

const TABS = [
  { key: "income-statement", label: "قائمة الدخل" },
  { key: "trial-balance", label: "ميزان المراجعة" },
  { key: "general-ledger", label: "دفتر الأستاذ" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function FinancialReportsPage() {
  const [tab, setTab] = useState("income-statement");
  const accountsQuery = useQuery({ queryKey: ["accounting", "accounts"], queryFn: () => apiRequest<Account[]>("/accounting/accounts") });

  return (
    <div>
      <PageHeader title="التقارير المحاسبية" description="قائمة الدخل، ميزان المراجعة، ودفتر الأستاذ - مشتقّة مباشرة من القيود المرحّلة" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "income-statement" && <IncomeStatementTab />}
      {tab === "trial-balance" && <TrialBalanceTab />}
      {tab === "general-ledger" && <GeneralLedgerTab accounts={accountsQuery.data ?? []} />}
    </div>
  );
}

function IncomeStatementTab() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const query = useQuery({
    queryKey: ["accounting", "reports", "income-statement", from, to],
    queryFn: () => apiRequest<IncomeStatementResult>(`/accounting/reports/income-statement?from=${from}&to=${to}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>قائمة الدخل</CardTitle>
        <div className="flex items-end gap-3">
          <Field label="من">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <IncomeSection title="الإيرادات" lines={query.data.revenueLines} total={query.data.revenue} />
            <IncomeSection title="تكلفة المبيعات" lines={query.data.cogsLines} total={query.data.cogs} />
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">مجمل الربح</span>
              <span className="text-base font-bold text-slate-900">{fmt(query.data.grossProfit)} ج.م</span>
            </div>
            <IncomeSection title="المصروفات" lines={query.data.expenseLines} total={query.data.totalExpenses} />
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
              <span className="text-sm font-bold text-brand-800">صافي الربح</span>
              <span className="text-lg font-extrabold text-brand-800">{fmt(query.data.netIncome)} ج.م</span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function IncomeSection({ title, lines, total }: { title: string; lines: IncomeStatementLine[]; total: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <span className="text-sm font-bold text-slate-800">{fmt(total)} ج.م</span>
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-slate-400">مفيش حركة في الفترة دي</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.code} className="flex items-center justify-between text-sm text-slate-600">
              <span>{l.code} - {l.name}</span>
              <span>{fmt(l.amount)} ج.م</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrialBalanceTab() {
  const [asOf, setAsOf] = useState(todayStr());
  const query = useQuery({
    queryKey: ["accounting", "reports", "trial-balance", asOf],
    queryFn: () => apiRequest<TrialBalanceResult>(`/accounting/reports/trial-balance?asOf=${asOf}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>ميزان المراجعة</CardTitle>
        <Field label="حتى تاريخ">
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.rows.length === 0 && <EmptyState>مفيش قيود مرحّلة حتى التاريخ ده</EmptyState>}
        {query.data && query.data.rows.length > 0 && (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>الكود</TH>
                  <TH>الحساب</TH>
                  <TH>النوع</TH>
                  <TH>مدين</TH>
                  <TH>دائن</TH>
                  <TH>الرصيد</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.rows.map((r) => (
                  <TR key={r.accountId}>
                    <TD>{r.code}</TD>
                    <TD>{r.name}</TD>
                    <TD>{r.accountType}</TD>
                    <TD>{fmt(r.totalDebit)}</TD>
                    <TD>{fmt(r.totalCredit)}</TD>
                    <TD className="font-semibold">{fmt(r.balance)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-3 flex items-center justify-end gap-6 text-sm font-semibold text-slate-700">
              <span>إجمالي المدين: {fmt(query.data.totalDebit)} ج.م</span>
              <span>إجمالي الدائن: {fmt(query.data.totalCredit)} ج.م</span>
              <span className={query.data.totalDebit === query.data.totalCredit ? "text-emerald-700" : "text-red-700"}>
                {query.data.totalDebit === query.data.totalCredit ? "متزن ✓" : "غير متزن!"}
              </span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function GeneralLedgerTab({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const query = useQuery({
    queryKey: ["accounting", "reports", "general-ledger", accountId, from, to],
    queryFn: () => apiRequest<GeneralLedgerResult>(`/accounting/reports/general-ledger?accountId=${accountId}&from=${from}&to=${to}`),
    enabled: !!accountId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>دفتر الأستاذ</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="الحساب">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">اختار حساب</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="من">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </CardHeader>
      <CardBody>
        {!accountId && <EmptyState>اختار حساب عشان تشوف كشف حركته</EmptyState>}
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <p className="mb-3 text-sm font-semibold text-slate-700">
              رصيد أول المدة: {fmt(query.data.openingBalance)} ج.م
            </p>
            {query.data.lines.length === 0 ? (
              <EmptyState>مفيش حركة في الفترة دي</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>التاريخ</TH>
                    <TH>رقم القيد</TH>
                    <TH>البيان</TH>
                    <TH>مدين</TH>
                    <TH>دائن</TH>
                    <TH>الرصيد الجاري</TH>
                  </TR>
                </THead>
                <TBody>
                  {query.data.lines.map((l, i) => (
                    <TR key={i}>
                      <TD>{l.entryDate}</TD>
                      <TD>{l.entryNumber ?? "-"}</TD>
                      <TD>{l.description ?? "-"}</TD>
                      <TD>{l.debit > 0 ? fmt(l.debit) : "-"}</TD>
                      <TD>{l.credit > 0 ? fmt(l.credit) : "-"}</TD>
                      <TD className="font-semibold">{fmt(l.runningBalance)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="mt-3 text-sm font-semibold text-slate-700">
              رصيد آخر المدة: {fmt(query.data.closingBalance)} ج.م
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
