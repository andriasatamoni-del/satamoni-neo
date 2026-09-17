import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select, Textarea } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface Supplier { id: string; name: string; status: string; }
interface Branch { id: string; name: string; }
interface InventoryItem { id: string; name: string; unit: string; }
interface Treasury { id: string; name: string; branchId: string | null; balance: number; }
interface GoodsReceipt {
  id: string;
  supplierId: string;
  branchId: string;
  status: "DRAFT" | "CONFIRMED";
  lines: { inventoryItemId: string; quantity: number; unitCost: number }[];
}
interface SupplierInvoice {
  id: string;
  supplierId: string;
  branchId: string;
  goodsReceiptId: string | null;
  supplierInvoiceNumber: string;
  lines: { inventoryItemId: string; invoicedQuantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  total: number;
  matchedTotal: number;
  varianceAmount: number;
  status: "MATCHED" | "VARIANCE_PENDING" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  createdAt: string;
}
interface SupplierPayment {
  id: string;
  supplierId: string;
  branchId: string;
  supplierInvoiceId: string | null;
  treasuryId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string | null;
  createdAt: string;
}
interface PurchaseRequest {
  id: string;
  branchId: string;
  reason: string | null;
  lines: { inventoryItemId: string; requestedQuantity: number; unit: string | null; notes: string | null }[];
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CONVERTED_TO_PO" | "CANCELLED";
  rejectionReason: string | null;
  convertedToPurchaseOrderId: string | null;
  createdAt: string;
}
interface PurchaseReturn {
  id: string;
  branchId: string;
  supplierId: string | null;
  goodsReceiptId: string | null;
  reason: string;
  lines: { inventoryItemId: string; quantity: number; unit: string; unitCost: number | null; lineValue: number | null }[];
  totalValue: number | null;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  createdAt: string;
}

const TABS = [
  { key: "receipts", label: "أذون الاستلام" },
  { key: "invoices", label: "فواتير الموردين" },
  { key: "payments", label: "سدادات الموردين" },
  { key: "purchase-requests", label: "طلبات الشراء" },
  { key: "purchase-returns", label: "مرتجعات المشتريات" },
];

const PR_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مقدّم - محتاج اعتماد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  CONVERTED_TO_PO: "اتحوّل لأمر شراء",
  CANCELLED: "ملغي",
};
const PR_STATUS_TONES: Record<string, "success" | "warning" | "brand" | "info" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "brand",
  REJECTED: "danger",
  CONVERTED_TO_PO: "success",
  CANCELLED: "danger",
};
const RETURN_STATUS_LABELS: Record<string, string> = { DRAFT: "مسودة", POSTED: "اترحّل", CANCELLED: "ملغي" };
const RETURN_STATUS_TONES: Record<string, "success" | "warning" | "brand" | "info" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  POSTED: "success",
  CANCELLED: "danger",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  MATCHED: "مطابقة",
  VARIANCE_PENDING: "فيها فرق - محتاجة اعتماد",
  APPROVED: "معتمدة",
  PARTIALLY_PAID: "مسدودة جزئيًا",
  PAID: "مسدودة بالكامل",
  CANCELLED: "ملغاة",
};
const INVOICE_STATUS_TONES: Record<string, "success" | "warning" | "brand" | "info" | "danger" | "neutral"> = {
  MATCHED: "info",
  VARIANCE_PENDING: "warning",
  APPROVED: "brand",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "danger",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function ProcurementPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("receipts");
  const canApproveOrCancel = user?.role === "admin" || user?.role === "accountant";

  const suppliersQuery = useQuery({ queryKey: ["procurement", "suppliers"], queryFn: () => apiRequest<Supplier[]>("/procurement/suppliers") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const itemsQuery = useQuery({ queryKey: ["inventory", "items"], queryFn: () => apiRequest<InventoryItem[]>("/inventory/items") });
  const receiptsQuery = useQuery({ queryKey: ["procurement", "goods-receipts"], queryFn: () => apiRequest<GoodsReceipt[]>("/procurement/goods-receipts") });
  const treasuriesQuery = useQuery({ queryKey: ["treasuries"], queryFn: () => apiRequest<Treasury[]>("/treasuries") });
  const invoicesQuery = useQuery({ queryKey: ["procurement", "supplier-invoices"], queryFn: () => apiRequest<SupplierInvoice[]>("/procurement/supplier-invoices") });
  const paymentsQuery = useQuery({ queryKey: ["procurement", "supplier-payments"], queryFn: () => apiRequest<SupplierPayment[]>("/procurement/supplier-payments") });
  const purchaseRequestsQuery = useQuery({ queryKey: ["procurement", "purchase-requests"], queryFn: () => apiRequest<PurchaseRequest[]>("/procurement/purchase-requests") });
  const purchaseReturnsQuery = useQuery({ queryKey: ["procurement", "purchase-returns"], queryFn: () => apiRequest<PurchaseReturn[]>("/procurement/purchase-returns") });

  const [newSupplierName, setNewSupplierName] = useState("");
  const createSupplier = useMutation({
    mutationFn: () => apiRequest("/procurement/suppliers", { method: "POST", body: { name: newSupplierName } }),
    onSuccess: () => {
      setNewSupplierName("");
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers"] });
    },
  });

  const [receiptForm, setReceiptForm] = useState({ supplierId: "", branchId: "", inventoryItemId: "", quantity: "", unitCost: "" });
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const createReceipt = useMutation({
    mutationFn: () =>
      apiRequest("/procurement/goods-receipts", {
        method: "POST",
        body: {
          supplierId: receiptForm.supplierId,
          branchId: receiptForm.branchId,
          lines: [{ inventoryItemId: receiptForm.inventoryItemId, quantity: Number(receiptForm.quantity), unitCost: Number(receiptForm.unitCost) }],
        },
      }),
    onSuccess: () => {
      setReceiptForm({ supplierId: "", branchId: "", inventoryItemId: "", quantity: "", unitCost: "" });
      setReceiptError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "goods-receipts"] });
    },
    onError: (err) => setReceiptError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const confirmReceipt = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/goods-receipts/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement", "goods-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers", "balance"] });
    },
  });

  // --- فواتير الموردين ---
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: "", branchId: "", goodsReceiptId: "", supplierInvoiceNumber: "", inventoryItemId: "", invoicedQuantity: "", unitPrice: "",
  });
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const createInvoice = useMutation({
    mutationFn: () =>
      apiRequest("/procurement/supplier-invoices", {
        method: "POST",
        body: {
          supplierId: invoiceForm.supplierId,
          branchId: invoiceForm.branchId,
          goodsReceiptId: invoiceForm.goodsReceiptId || undefined,
          supplierInvoiceNumber: invoiceForm.supplierInvoiceNumber,
          lines: [{ inventoryItemId: invoiceForm.inventoryItemId, invoicedQuantity: Number(invoiceForm.invoicedQuantity), unitPrice: Number(invoiceForm.unitPrice) }],
        },
      }),
    onSuccess: () => {
      setInvoiceForm({ supplierId: "", branchId: "", goodsReceiptId: "", supplierInvoiceNumber: "", inventoryItemId: "", invoicedQuantity: "", unitPrice: "" });
      setInvoiceError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "supplier-invoices"] });
    },
    onError: (err) => setInvoiceError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const approveInvoice = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/supplier-invoices/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement", "supplier-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers", "balance"] });
    },
  });

  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const cancelInvoice = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest(`/procurement/supplier-invoices/${id}/cancel`, { method: "POST", body: { reason: reason || undefined } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement", "supplier-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers", "balance"] });
    },
  });

  // --- سدادات الموردين ---
  const [paymentForm, setPaymentForm] = useState({ supplierId: "", branchId: "", treasuryId: "", supplierInvoiceId: "", amount: "", referenceNumber: "", notes: "" });
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const createPayment = useMutation({
    mutationFn: () =>
      apiRequest("/procurement/supplier-payments", {
        method: "POST",
        body: {
          supplierId: paymentForm.supplierId,
          branchId: paymentForm.branchId,
          treasuryId: paymentForm.treasuryId,
          supplierInvoiceId: paymentForm.supplierInvoiceId || undefined,
          amount: Number(paymentForm.amount),
          referenceNumber: paymentForm.referenceNumber || undefined,
          notes: paymentForm.notes || undefined,
        },
      }),
    onSuccess: () => {
      setPaymentForm({ supplierId: "", branchId: "", treasuryId: "", supplierInvoiceId: "", amount: "", referenceNumber: "", notes: "" });
      setPaymentError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "supplier-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["treasuries"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers", "balance"] });
    },
    onError: (err) => setPaymentError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [balanceSupplierId, setBalanceSupplierId] = useState("");
  const balanceQuery = useQuery({
    queryKey: ["procurement", "suppliers", "balance", balanceSupplierId],
    queryFn: () => apiRequest<{ supplierId: string; balance: number }>(`/procurement/suppliers/${balanceSupplierId}/balance`),
    enabled: !!balanceSupplierId,
  });

  // --- طلبات الشراء ---
  const [purchaseRequestForm, setPurchaseRequestForm] = useState({ branchId: "", reason: "", inventoryItemId: "", requestedQuantity: "" });
  const [purchaseRequestError, setPurchaseRequestError] = useState<string | null>(null);
  const createPurchaseRequest = useMutation({
    mutationFn: () =>
      apiRequest("/procurement/purchase-requests", {
        method: "POST",
        body: {
          branchId: purchaseRequestForm.branchId,
          reason: purchaseRequestForm.reason || undefined,
          lines: [{ inventoryItemId: purchaseRequestForm.inventoryItemId, requestedQuantity: Number(purchaseRequestForm.requestedQuantity) }],
        },
      }),
    onSuccess: () => {
      setPurchaseRequestForm({ branchId: "", reason: "", inventoryItemId: "", requestedQuantity: "" });
      setPurchaseRequestError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-requests"] });
    },
    onError: (err) => setPurchaseRequestError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const submitPurchaseRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/purchase-requests/${id}/submit`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-requests"] }),
  });
  const approvePurchaseRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/purchase-requests/${id}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-requests"] }),
  });
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const rejectPurchaseRequest = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/procurement/purchase-requests/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-requests"] }),
  });
  const cancelPurchaseRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/purchase-requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-requests"] }),
  });
  const [convertForm, setConvertForm] = useState<Record<string, { supplierId: string; unitPrice: string }>>({});
  const [convertError, setConvertError] = useState<string | null>(null);
  const convertToPurchaseOrder = useMutation({
    mutationFn: (request: PurchaseRequest) => {
      const form = convertForm[request.id];
      return apiRequest("/procurement/purchase-orders", {
        method: "POST",
        body: {
          supplierId: form?.supplierId,
          branchId: request.branchId,
          purchaseRequestId: request.id,
          lines: request.lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: l.requestedQuantity,
            unitPrice: Number(form?.unitPrice ?? 0),
          })),
        },
      });
    },
    onSuccess: () => {
      setConvertError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-orders"] });
    },
    onError: (err) => setConvertError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  // --- مرتجعات المشتريات ---
  const [purchaseReturnForm, setPurchaseReturnForm] = useState({
    branchId: "", supplierId: "", goodsReceiptId: "", reason: "", inventoryItemId: "", quantity: "", unit: "",
  });
  const [purchaseReturnError, setPurchaseReturnError] = useState<string | null>(null);
  const createPurchaseReturn = useMutation({
    mutationFn: () =>
      apiRequest("/procurement/purchase-returns", {
        method: "POST",
        body: {
          branchId: purchaseReturnForm.branchId,
          supplierId: purchaseReturnForm.supplierId || undefined,
          goodsReceiptId: purchaseReturnForm.goodsReceiptId || undefined,
          reason: purchaseReturnForm.reason,
          lines: [{ inventoryItemId: purchaseReturnForm.inventoryItemId, quantity: Number(purchaseReturnForm.quantity), unit: purchaseReturnForm.unit }],
        },
      }),
    onSuccess: () => {
      setPurchaseReturnForm({ branchId: "", supplierId: "", goodsReceiptId: "", reason: "", inventoryItemId: "", quantity: "", unit: "" });
      setPurchaseReturnError(null);
      queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-returns"] });
    },
    onError: (err) => setPurchaseReturnError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const postPurchaseReturn = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/purchase-returns/${id}/post`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-returns"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers", "balance"] });
    },
  });
  const cancelPurchaseReturn = useMutation({
    mutationFn: (id: string) => apiRequest(`/procurement/purchase-returns/${id}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-returns"] }),
  });

  function handleSupplierSubmit(e: FormEvent) {
    e.preventDefault();
    createSupplier.mutate();
  }
  function handleReceiptSubmit(e: FormEvent) {
    e.preventDefault();
    createReceipt.mutate();
  }
  function handleInvoiceSubmit(e: FormEvent) {
    e.preventDefault();
    createInvoice.mutate();
  }
  function handlePaymentSubmit(e: FormEvent) {
    e.preventDefault();
    createPayment.mutate();
  }
  function handlePurchaseRequestSubmit(e: FormEvent) {
    e.preventDefault();
    createPurchaseRequest.mutate();
  }
  function handlePurchaseReturnSubmit(e: FormEvent) {
    e.preventDefault();
    createPurchaseReturn.mutate();
  }

  const itemName = (id: string) => itemsQuery.data?.find((i) => i.id === id)?.name ?? id;
  const branchName = (id: string) => branchesQuery.data?.find((b) => b.id === id)?.name ?? id;
  const supplierName = (id: string) => suppliersQuery.data?.find((s) => s.id === id)?.name ?? id;
  const suppliers = suppliersQuery.data ?? [];
  const receipts = receiptsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const confirmedReceiptsForInvoiceForm = receipts.filter(
    (r) => r.status === "CONFIRMED" && (!invoiceForm.supplierId || r.supplierId === invoiceForm.supplierId)
  );
  const unpaidInvoicesForPaymentForm = invoices.filter(
    (i) => ["APPROVED", "MATCHED", "PARTIALLY_PAID"].includes(i.status) && (!paymentForm.supplierId || i.supplierId === paymentForm.supplierId)
  );
  const purchaseRequests = purchaseRequestsQuery.data ?? [];
  const purchaseReturns = purchaseReturnsQuery.data ?? [];
  const confirmedReceiptsForReturnForm = receipts.filter(
    (r) => r.status === "CONFIRMED" && (!purchaseReturnForm.supplierId || r.supplierId === purchaseReturnForm.supplierId)
  );

  return (
    <div>
      <PageHeader title="المشتريات والموردين" description="الموردين، أذون استلام البضاعة، فواتير وسدادات الموردين" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div className="max-w-xs flex-1">
              <Field label="عرض رصيد مورد">
                <Select value={balanceSupplierId} onChange={(e) => setBalanceSupplierId(e.target.value)}>
                  <option value="">اختر مورد</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
            {balanceSupplierId && (
              <p className="text-sm font-semibold text-slate-700">
                الرصيد (اللي واجبنا ليه):{" "}
                <span className={balanceQuery.data && balanceQuery.data.balance > 0 ? "text-red-600" : "text-slate-900"}>
                  {balanceQuery.isLoading ? "..." : `${fmt(balanceQuery.data?.balance ?? 0)}ج`}
                </span>
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {tab === "receipts" && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>إضافة مورد</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleSupplierSubmit} className="mb-4 flex items-end gap-3">
                  <div className="flex-1">
                    <Field label="اسم المورد">
                      <Input required value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
                    </Field>
                  </div>
                  <Button type="submit" disabled={createSupplier.isPending}>إضافة</Button>
                </form>
                <div className="flex flex-wrap gap-1.5">
                  {suppliers.map((s) => (
                    <Badge key={s.id} tone="neutral">{s.name} - {s.status}</Badge>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تسجيل إذن استلام بضاعة (PO-less)</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleReceiptSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="المورد">
                      <Select required value={receiptForm.supplierId} onChange={(e) => setReceiptForm({ ...receiptForm, supplierId: e.target.value })}>
                        <option value="">اختر مورد</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="الفرع">
                      <Select required value={receiptForm.branchId} onChange={(e) => setReceiptForm({ ...receiptForm, branchId: e.target.value })}>
                        <option value="">اختر فرع</option>
                        {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="الصنف">
                      <Select required value={receiptForm.inventoryItemId} onChange={(e) => setReceiptForm({ ...receiptForm, inventoryItemId: e.target.value })}>
                        <option value="">اختر صنف</option>
                        {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                      </Select>
                    </Field>
                    <Field label="الكمية">
                      <Input required type="number" value={receiptForm.quantity} onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })} />
                    </Field>
                    <Field label="تكلفة الوحدة">
                      <Input required type="number" value={receiptForm.unitCost} onChange={(e) => setReceiptForm({ ...receiptForm, unitCost: e.target.value })} />
                    </Field>
                  </div>
                  {receiptError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{receiptError}</p>}
                  <Button type="submit" disabled={createReceipt.isPending}>تسجيل</Button>
                </form>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>أذون الاستلام ({receipts.length})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>المورد</TH><TH>الفرع</TH><TH>البنود</TH><TH>الحالة</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {receipts.map((r) => (
                    <TR key={r.id}>
                      <TD>{supplierName(r.supplierId)}</TD>
                      <TD className="font-semibold text-slate-900">{branchName(r.branchId)}</TD>
                      <TD>{r.lines.map((l) => `${itemName(l.inventoryItemId)}: ${l.quantity}`).join("، ")}</TD>
                      <TD><Badge tone={r.status === "CONFIRMED" ? "success" : "neutral"}>{r.status === "CONFIRMED" ? "اتأكد" : "مسودة"}</Badge></TD>
                      <TD>
                        {r.status === "DRAFT" && (
                          <Button size="sm" variant="secondary" onClick={() => confirmReceipt.mutate(r.id)} disabled={confirmReceipt.isPending}>
                            تأكيد (يرحّل المخزون + قيد AP)
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {receipts.length === 0 && <EmptyState>مفيش أذون استلام لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "invoices" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>تسجيل فاتورة مورد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={handleInvoiceSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="المورد">
                    <Select required value={invoiceForm.supplierId} onChange={(e) => setInvoiceForm({ ...invoiceForm, supplierId: e.target.value, goodsReceiptId: "" })}>
                      <option value="">اختر مورد</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="الفرع">
                    <Select required value={invoiceForm.branchId} onChange={(e) => setInvoiceForm({ ...invoiceForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="إذن الاستلام (اختياري - للمطابقة)">
                    <Select value={invoiceForm.goodsReceiptId} onChange={(e) => setInvoiceForm({ ...invoiceForm, goodsReceiptId: e.target.value })}>
                      <option value="">بدون مطابقة</option>
                      {confirmedReceiptsForInvoiceForm.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.lines.map((l) => `${itemName(l.inventoryItemId)}×${l.quantity}`).join("، ")} - {branchName(r.branchId)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="رقم فاتورة المورد">
                    <Input required value={invoiceForm.supplierInvoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, supplierInvoiceNumber: e.target.value })} />
                  </Field>
                  <Field label="الصنف">
                    <Select required value={invoiceForm.inventoryItemId} onChange={(e) => setInvoiceForm({ ...invoiceForm, inventoryItemId: e.target.value })}>
                      <option value="">اختر صنف</option>
                      {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </Select>
                  </Field>
                  <Field label="الكمية المفوترة">
                    <Input required type="number" value={invoiceForm.invoicedQuantity} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoicedQuantity: e.target.value })} />
                  </Field>
                  <Field label="سعر الوحدة">
                    <Input required type="number" value={invoiceForm.unitPrice} onChange={(e) => setInvoiceForm({ ...invoiceForm, unitPrice: e.target.value })} />
                  </Field>
                </div>
                {invoiceError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{invoiceError}</p>}
                <Button type="submit" disabled={createInvoice.isPending}>{createInvoice.isPending ? "بيتسجّل..." : "تسجيل الفاتورة"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>فواتير الموردين ({invoices.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>المورد</TH><TH>رقم الفاتورة</TH><TH>الإجمالي</TH><TH>الفرق</TH><TH>الحالة</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoices.map((inv) => (
                    <TR key={inv.id}>
                      <TD className="font-semibold text-slate-900">{supplierName(inv.supplierId)}</TD>
                      <TD className="font-mono text-xs">{inv.supplierInvoiceNumber}</TD>
                      <TD>{fmt(inv.total)}ج</TD>
                      <TD className={inv.varianceAmount !== 0 ? "font-bold text-amber-600" : ""}>{fmt(inv.varianceAmount)}ج</TD>
                      <TD><Badge tone={INVOICE_STATUS_TONES[inv.status]}>{INVOICE_STATUS_LABELS[inv.status]}</Badge></TD>
                      <TD>
                        {canApproveOrCancel && ["MATCHED", "VARIANCE_PENDING"].includes(inv.status) && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => approveInvoice.mutate(inv.id)} disabled={approveInvoice.isPending}>اعتماد</Button>
                            <Input
                              placeholder="سبب الإلغاء (اختياري)"
                              className="w-40"
                              value={cancelReason[inv.id] ?? ""}
                              onChange={(e) => setCancelReason({ ...cancelReason, [inv.id]: e.target.value })}
                            />
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => cancelInvoice.mutate({ id: inv.id, reason: cancelReason[inv.id] })}
                              disabled={cancelInvoice.isPending}
                            >
                              إلغاء
                            </Button>
                          </div>
                        )}
                        {canApproveOrCancel && inv.status === "APPROVED" && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => cancelInvoice.mutate({ id: inv.id, reason: cancelReason[inv.id] })}
                            disabled={cancelInvoice.isPending}
                          >
                            إلغاء
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {invoices.length === 0 && <EmptyState>مفيش فواتير موردين لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "payments" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>تسجيل سداد لمورد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="المورد">
                    <Select required value={paymentForm.supplierId} onChange={(e) => setPaymentForm({ ...paymentForm, supplierId: e.target.value, supplierInvoiceId: "" })}>
                      <option value="">اختر مورد</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="الفرع">
                    <Select required value={paymentForm.branchId} onChange={(e) => setPaymentForm({ ...paymentForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="من خزينة">
                    <Select required value={paymentForm.treasuryId} onChange={(e) => setPaymentForm({ ...paymentForm, treasuryId: e.target.value })}>
                      <option value="">اختر خزينة</option>
                      {treasuriesQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({fmt(t.balance)}ج)</option>)}
                    </Select>
                  </Field>
                  <Field label="فاتورة مورد (اختياري)">
                    <Select value={paymentForm.supplierInvoiceId} onChange={(e) => setPaymentForm({ ...paymentForm, supplierInvoiceId: e.target.value })}>
                      <option value="">بدون ربط بفاتورة معيّنة</option>
                      {unpaidInvoicesForPaymentForm.map((inv) => (
                        <option key={inv.id} value={inv.id}>{inv.supplierInvoiceNumber} - {fmt(inv.total)}ج</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="المبلغ">
                    <Input required type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                  </Field>
                  <Field label="رقم مرجعي (اختياري)">
                    <Input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} />
                  </Field>
                </div>
                <Field label="ملاحظات (اختياري)">
                  <Textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                </Field>
                {paymentError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{paymentError}</p>}
                <Button type="submit" disabled={createPayment.isPending}>{createPayment.isPending ? "بيتسجّل..." : "تسجيل السداد"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>سدادات الموردين ({payments.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>المورد</TH><TH>الفرع</TH><TH>المبلغ</TH><TH>مرجع</TH><TH>التاريخ</TH>
                  </TR>
                </THead>
                <TBody>
                  {payments.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-semibold text-slate-900">{supplierName(p.supplierId)}</TD>
                      <TD>{branchName(p.branchId)}</TD>
                      <TD className="font-bold">{fmt(p.amount)}ج</TD>
                      <TD className="font-mono text-xs">{p.referenceNumber ?? "-"}</TD>
                      <TD>{new Date(p.paymentDate).toLocaleDateString("en-GB")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {payments.length === 0 && <EmptyState>مفيش سدادات لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "purchase-requests" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>طلب شراء جديد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={handlePurchaseRequestSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="الفرع">
                    <Select required value={purchaseRequestForm.branchId} onChange={(e) => setPurchaseRequestForm({ ...purchaseRequestForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="الصنف">
                    <Select required value={purchaseRequestForm.inventoryItemId} onChange={(e) => setPurchaseRequestForm({ ...purchaseRequestForm, inventoryItemId: e.target.value })}>
                      <option value="">اختر صنف</option>
                      {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </Select>
                  </Field>
                  <Field label="الكمية المطلوبة">
                    <Input required type="number" value={purchaseRequestForm.requestedQuantity} onChange={(e) => setPurchaseRequestForm({ ...purchaseRequestForm, requestedQuantity: e.target.value })} />
                  </Field>
                  <Field label="السبب (اختياري)">
                    <Input value={purchaseRequestForm.reason} onChange={(e) => setPurchaseRequestForm({ ...purchaseRequestForm, reason: e.target.value })} />
                  </Field>
                </div>
                {purchaseRequestError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{purchaseRequestError}</p>}
                <Button type="submit" disabled={createPurchaseRequest.isPending}>{createPurchaseRequest.isPending ? "بيتسجّل..." : "تسجيل الطلب"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>طلبات الشراء ({purchaseRequests.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>الفرع</TH><TH>البنود</TH><TH>السبب</TH><TH>الحالة</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {purchaseRequests.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-semibold text-slate-900">{branchName(r.branchId)}</TD>
                      <TD>{r.lines.map((l) => `${itemName(l.inventoryItemId)}: ${l.requestedQuantity}`).join("، ")}</TD>
                      <TD>{r.reason ?? "-"}{r.status === "REJECTED" && r.rejectionReason ? ` (سبب الرفض: ${r.rejectionReason})` : ""}</TD>
                      <TD><Badge tone={PR_STATUS_TONES[r.status]}>{PR_STATUS_LABELS[r.status]}</Badge></TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-2">
                          {r.status === "DRAFT" && (
                            <>
                              <Button size="sm" onClick={() => submitPurchaseRequest.mutate(r.id)} disabled={submitPurchaseRequest.isPending}>تقديم</Button>
                              <Button size="sm" variant="danger" onClick={() => cancelPurchaseRequest.mutate(r.id)} disabled={cancelPurchaseRequest.isPending}>إلغاء</Button>
                            </>
                          )}
                          {r.status === "SUBMITTED" && canApproveOrCancel && (
                            <>
                              <Button size="sm" onClick={() => approvePurchaseRequest.mutate(r.id)} disabled={approvePurchaseRequest.isPending}>اعتماد</Button>
                              <Input
                                placeholder="سبب الرفض"
                                className="w-32"
                                value={rejectReason[r.id] ?? ""}
                                onChange={(e) => setRejectReason({ ...rejectReason, [r.id]: e.target.value })}
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => rejectPurchaseRequest.mutate({ id: r.id, reason: rejectReason[r.id] ?? "" })}
                                disabled={rejectPurchaseRequest.isPending || !rejectReason[r.id]}
                              >
                                رفض
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => cancelPurchaseRequest.mutate(r.id)} disabled={cancelPurchaseRequest.isPending}>إلغاء</Button>
                            </>
                          )}
                          {r.status === "APPROVED" && (
                            <div className="flex flex-wrap items-center gap-2">
                              <Select
                                className="w-32"
                                value={convertForm[r.id]?.supplierId ?? ""}
                                onChange={(e) => setConvertForm({ ...convertForm, [r.id]: { supplierId: e.target.value, unitPrice: convertForm[r.id]?.unitPrice ?? "" } })}
                              >
                                <option value="">مورد</option>
                                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </Select>
                              <Input
                                placeholder="سعر الوحدة"
                                type="number"
                                className="w-24"
                                value={convertForm[r.id]?.unitPrice ?? ""}
                                onChange={(e) => setConvertForm({ ...convertForm, [r.id]: { supplierId: convertForm[r.id]?.supplierId ?? "", unitPrice: e.target.value } })}
                              />
                              <Button
                                size="sm"
                                disabled={convertToPurchaseOrder.isPending || !convertForm[r.id]?.supplierId}
                                onClick={() => convertToPurchaseOrder.mutate(r)}
                              >
                                تحويل لأمر شراء
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => cancelPurchaseRequest.mutate(r.id)} disabled={cancelPurchaseRequest.isPending}>إلغاء</Button>
                            </div>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {convertError && <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{convertError}</p>}
              {purchaseRequests.length === 0 && <EmptyState>مفيش طلبات شراء لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "purchase-returns" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>مرتجع مشتريات جديد</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={handlePurchaseReturnSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="الفرع">
                    <Select required value={purchaseReturnForm.branchId} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="المورد (اختياري)">
                    <Select value={purchaseReturnForm.supplierId} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, supplierId: e.target.value, goodsReceiptId: "" })}>
                      <option value="">بدون مورد محدد</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="إذن الاستلام (اختياري - للتتبع)">
                    <Select value={purchaseReturnForm.goodsReceiptId} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, goodsReceiptId: e.target.value })}>
                      <option value="">بدون ربط</option>
                      {confirmedReceiptsForReturnForm.map((r) => (
                        <option key={r.id} value={r.id}>{r.lines.map((l) => `${itemName(l.inventoryItemId)}×${l.quantity}`).join("، ")}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="الصنف">
                    <Select required value={purchaseReturnForm.inventoryItemId} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, inventoryItemId: e.target.value })}>
                      <option value="">اختر صنف</option>
                      {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </Select>
                  </Field>
                  <Field label="الكمية">
                    <Input required type="number" value={purchaseReturnForm.quantity} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, quantity: e.target.value })} />
                  </Field>
                  <Field label="الوحدة">
                    <Input required placeholder="كيلو/لتر/قطعة" value={purchaseReturnForm.unit} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, unit: e.target.value })} />
                  </Field>
                </div>
                <Field label="السبب">
                  <Input required placeholder="تالف / غلط / منتهي الصلاحية" value={purchaseReturnForm.reason} onChange={(e) => setPurchaseReturnForm({ ...purchaseReturnForm, reason: e.target.value })} />
                </Field>
                {purchaseReturnError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{purchaseReturnError}</p>}
                <Button type="submit" disabled={createPurchaseReturn.isPending}>{createPurchaseReturn.isPending ? "بيتسجّل..." : "تسجيل المرتجع"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>مرتجعات المشتريات ({purchaseReturns.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>الفرع</TH><TH>المورد</TH><TH>البنود</TH><TH>السبب</TH><TH>القيمة</TH><TH>الحالة</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {purchaseReturns.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-semibold text-slate-900">{branchName(r.branchId)}</TD>
                      <TD>{r.supplierId ? supplierName(r.supplierId) : "-"}</TD>
                      <TD>{r.lines.map((l) => `${itemName(l.inventoryItemId)}: ${l.quantity}`).join("، ")}</TD>
                      <TD>{r.reason}</TD>
                      <TD>{r.totalValue === null ? "غير مكتملة" : `${fmt(r.totalValue)}ج`}</TD>
                      <TD><Badge tone={RETURN_STATUS_TONES[r.status]}>{RETURN_STATUS_LABELS[r.status]}</Badge></TD>
                      <TD>
                        {r.status === "DRAFT" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => postPurchaseReturn.mutate(r.id)} disabled={postPurchaseReturn.isPending}>ترحيل</Button>
                            <Button size="sm" variant="danger" onClick={() => cancelPurchaseReturn.mutate(r.id)} disabled={cancelPurchaseReturn.isPending}>إلغاء</Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {purchaseReturns.length === 0 && <EmptyState>مفيش مرتجعات مشتريات لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
