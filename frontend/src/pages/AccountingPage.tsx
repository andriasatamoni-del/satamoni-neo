import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>المحاسبة</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة حساب لدليل الحسابات</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); createAccount.mutate(); }}
          style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: 8 }}
        >
          <input required placeholder="الكود" value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} style={{ padding: 6 }} />
          <input required placeholder="اسم الحساب" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} style={{ padding: 6 }} />
          <select value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })} style={{ padding: 6 }}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
          </select>
          <button type="submit" disabled={createAccount.isPending}>إضافة</button>
        </form>
        {accountError && <p style={{ color: "crimson" }}>{accountError}</p>}
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>دليل الحسابات</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الكود</th><th>الاسم</th><th>النوع</th><th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {accountsQuery.data?.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{a.code}</td>
                <td>{a.name}</td>
                <td>{ACCOUNT_TYPE_LABELS[a.accountType] ?? a.accountType}</td>
                <td>{a.isActive ? "فعّال" : "معطّل"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>قيد يدوي جديد</h2>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createEntry.mutate(); }}>
          <input
            placeholder="البيان (اختياري)"
            value={entryDescription}
            onChange={(e) => setEntryDescription(e.target.value)}
            style={{ padding: 6, width: "100%", marginBottom: 8, boxSizing: "border-box" }}
          />
          {lines.map((line, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <select required value={line.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })} style={{ padding: 6 }}>
                <option value="">اختر حساب</option>
                {accountsQuery.data?.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
              <input type="number" placeholder="مدين" value={line.debit} onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })} style={{ padding: 6 }} />
              <input type="number" placeholder="دائن" value={line.credit} onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })} style={{ padding: 6 }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={() => setLines((prev) => [...prev, { accountId: "", debit: "", credit: "" }])}>
              + سطر
            </button>
            <span style={{ marginInlineStart: "auto" }}>
              مدين: {totalDebit} | دائن: {totalCredit} {totalDebit !== totalCredit && <strong style={{ color: "crimson" }}> (غير متزن)</strong>}
            </span>
          </div>
          <button type="submit" disabled={createEntry.isPending || totalDebit !== totalCredit || totalDebit === 0}>
            تسجيل القيد
          </button>
        </form>
        {entryError && <p style={{ color: "crimson" }}>{entryError}</p>}
      </section>

      <section>
        <h2>القيود اليومية</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>رقم القيد</th><th>المصدر</th><th>البيان</th><th>السطور</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {entriesQuery.data?.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{entry.entryNumber ?? "-"}</td>
                <td>{entry.sourceType}</td>
                <td>{entry.description ?? "-"}</td>
                <td>
                  {entry.lines.map((l, i) => (
                    <div key={i}>{accountLabel(l.accountId)}: مدين {l.debit} / دائن {l.credit}</div>
                  ))}
                </td>
                <td>{entry.status === "POSTED" ? "مرحّل" : entry.status === "REVERSED" ? "معكوس" : "مسودة"}</td>
                <td>
                  {entry.status === "POSTED" && (
                    <button onClick={() => reverseEntry.mutate(entry.id)} disabled={reverseEntry.isPending}>
                      عكس القيد
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
