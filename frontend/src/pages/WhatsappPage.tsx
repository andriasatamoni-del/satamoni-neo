import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface Conversation { id: string; phone: string; customerName: string | null; lastMessageAt: string | null; createdAt: string; }
interface Message { id: string; direction: "in" | "out"; body: string; createdAt: string; }
interface MenuItem { id: string; name: string; variants: { id: string; label: string; price: number }[]; }
interface Branch { id: string; name: string; }
interface PendingOrderLine { variantId: string; itemName: string; quantity: number; unitPrice: number; }
interface PendingOrder {
  id: string; conversationId: string; customerPhone: string; customerName: string | null;
  orderType: string; branchId: string; addressDetails: string | null; lines: PendingOrderLine[];
  total: number; status: string; rejectionReason: string | null; confirmedOrderId: string | null; createdAt: string;
}

const TABS = [
  { key: "conversations", label: "المحادثات" },
  { key: "pending-orders", label: "الطلبات المعلّقة" },
];

const ORDER_TYPE_LABELS: Record<string, string> = { dinein: "صالة", takeaway: "تيك أواي", delivery: "توصيل" };
const STATUS_LABELS: Record<string, string> = { PENDING: "قيد المراجعة", CONFIRMED: "اتسجّل", REJECTED: "مرفوض" };
const CATEGORY_LABELS: Record<string, string> = { late_order: "تأخير طلب", wrong_item: "صنف غلط", quality: "جودة", other: "تانى" };

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function WhatsappPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("conversations");
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);

  const conversationsQuery = useQuery({ queryKey: ["whatsapp", "conversations"], queryFn: () => apiRequest<Conversation[]>("/whatsapp/conversations") });
  const conversationDetailQuery = useQuery({
    queryKey: ["whatsapp", "conversations", openConversationId],
    queryFn: () => apiRequest<{ conversation: Conversation; messages: Message[] }>(`/whatsapp/conversations/${openConversationId}`),
    enabled: !!openConversationId,
  });
  const menuItemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => apiRequest<MenuItem[]>("/catalog/items") });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const pendingOrdersQuery = useQuery({ queryKey: ["whatsapp", "pending-orders"], queryFn: () => apiRequest<PendingOrder[]>("/whatsapp/pending-orders") });

  const variants = (menuItemsQuery.data ?? []).flatMap((item) => item.variants.map((v) => ({ ...v, itemName: item.name })));

  const [replyBody, setReplyBody] = useState("");
  const sendReply = useMutation({
    mutationFn: () => apiRequest(`/whatsapp/conversations/${openConversationId}/reply`, { method: "POST", body: { body: replyBody } }),
    onSuccess: () => {
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", openConversationId] });
    },
  });

  const [orderForm, setOrderForm] = useState({ orderType: "delivery", branchId: "", addressDetails: "" });
  const [orderLines, setOrderLines] = useState<{ variantId: string; quantity: string }[]>([{ variantId: "", quantity: "1" }]);
  const [orderError, setOrderError] = useState<string | null>(null);
  const createPendingOrder = useMutation({
    mutationFn: () =>
      apiRequest(`/whatsapp/conversations/${openConversationId}/pending-orders`, {
        method: "POST",
        body: {
          orderType: orderForm.orderType,
          branchId: orderForm.branchId,
          addressDetails: orderForm.addressDetails || undefined,
          items: orderLines.filter((l) => l.variantId && l.quantity).map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity) })),
        },
      }),
    onSuccess: () => {
      setOrderLines([{ variantId: "", quantity: "1" }]);
      setOrderError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "pending-orders"] });
    },
    onError: (err) => setOrderError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [complaintForm, setComplaintForm] = useState({ category: "other", description: "" });
  const [complaintError, setComplaintError] = useState<string | null>(null);
  const [complaintOk, setComplaintOk] = useState(false);
  const createComplaint = useMutation({
    mutationFn: () =>
      apiRequest(`/whatsapp/conversations/${openConversationId}/complaints`, {
        method: "POST",
        body: { category: complaintForm.category, description: complaintForm.description || undefined },
      }),
    onSuccess: () => {
      setComplaintForm({ category: "other", description: "" });
      setComplaintError(null);
      setComplaintOk(true);
    },
    onError: (err) => setComplaintError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const confirmOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/whatsapp/pending-orders/${id}/confirm`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp", "pending-orders"] }),
  });
  const rejectOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/whatsapp/pending-orders/${id}/reject`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp", "pending-orders"] }),
  });

  function handleReplySubmit(e: FormEvent) {
    e.preventDefault();
    sendReply.mutate();
  }
  function handleOrderSubmit(e: FormEvent) {
    e.preventDefault();
    createPendingOrder.mutate();
  }
  function handleComplaintSubmit(e: FormEvent) {
    e.preventDefault();
    createComplaint.mutate();
  }

  const conversations = conversationsQuery.data ?? [];
  const pendingOrders = pendingOrdersQuery.data ?? [];

  return (
    <div>
      <PageHeader title="بوابة واتساب" description="مراجعة محادثات العملاء وتسجيل طلباتهم وشكاويهم يدويًا" />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "conversations" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>المحادثات ({conversations.length})</CardTitle></CardHeader>
            <CardBody className="max-h-[32rem] overflow-y-auto p-0">
              <Table>
                <TBody>
                  {conversations.map((c) => (
                    <TR key={c.id} className={openConversationId === c.id ? "bg-brand-50" : ""}>
                      <TD>
                        <button type="button" className="text-start" onClick={() => setOpenConversationId(c.id)}>
                          <div className="font-semibold text-slate-900">{c.customerName ?? c.phone}</div>
                          <div className="text-xs text-slate-400">{c.phone}</div>
                        </button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {conversations.length === 0 && <EmptyState>مفيش محادثات واتساب لسه</EmptyState>}
            </CardBody>
          </Card>

          <div className="space-y-6 lg:col-span-2">
            {!openConversationId && (
              <Card><CardBody><EmptyState>اختر محادثة من القايمة</EmptyState></CardBody></Card>
            )}
            {openConversationId && conversationDetailQuery.data && (
              <>
                <Card>
                  <CardHeader><CardTitle>{conversationDetailQuery.data.conversation.customerName ?? conversationDetailQuery.data.conversation.phone}</CardTitle></CardHeader>
                  <CardBody className="max-h-72 space-y-2 overflow-y-auto">
                    {conversationDetailQuery.data.messages.map((m) => (
                      <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === "in" ? "bg-slate-100 text-slate-800" : "mr-auto bg-brand-50 text-brand-800"}`}>
                        {m.body}
                        <div className="mt-1 text-[10px] text-slate-400">{new Date(m.createdAt).toLocaleString("en-US")}</div>
                      </div>
                    ))}
                    {conversationDetailQuery.data.messages.length === 0 && <EmptyState>مفيش رسائل لسه</EmptyState>}
                  </CardBody>
                  <CardBody className="border-t border-slate-100">
                    <form onSubmit={handleReplySubmit} className="flex gap-2">
                      <Input value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="اكتب رد..." className="flex-1" />
                      <Button type="submit" disabled={sendReply.isPending || !replyBody}>إرسال</Button>
                    </form>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader><CardTitle>تسجيل طلب من المحادثة دي</CardTitle></CardHeader>
                  <CardBody>
                    <form onSubmit={handleOrderSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field label="نوع الطلب">
                          <Select value={orderForm.orderType} onChange={(e) => setOrderForm({ ...orderForm, orderType: e.target.value })}>
                            <option value="delivery">توصيل</option>
                            <option value="takeaway">تيك أواي</option>
                            <option value="dinein">صالة</option>
                          </Select>
                        </Field>
                        <Field label="الفرع">
                          <Select required value={orderForm.branchId} onChange={(e) => setOrderForm({ ...orderForm, branchId: e.target.value })}>
                            <option value="">اختر فرع</option>
                            {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </Select>
                        </Field>
                        <Field label="العنوان (لو توصيل)">
                          <Input value={orderForm.addressDetails} onChange={(e) => setOrderForm({ ...orderForm, addressDetails: e.target.value })} />
                        </Field>
                      </div>

                      <div className="space-y-2">
                        {orderLines.map((line, i) => (
                          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Select
                              value={line.variantId}
                              onChange={(e) => setOrderLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, variantId: e.target.value } : l)))}
                            >
                              <option value="">اختر صنف</option>
                              {variants.map((v) => <option key={v.id} value={v.id}>{v.itemName} - {v.label} ({fmt(v.price)}ج)</option>)}
                            </Select>
                            <Input
                              type="number" step="any" placeholder="الكمية"
                              value={line.quantity}
                              onChange={(e) => setOrderLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantity: e.target.value } : l)))}
                            />
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setOrderLines((prev) => [...prev, { variantId: "", quantity: "1" }])}>+ صنف</Button>

                      {orderError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{orderError}</p>}
                      <Button type="submit" disabled={createPendingOrder.isPending}>تسجيل الطلب كمعلّق</Button>
                    </form>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader><CardTitle>تسجيل شكوى من المحادثة دي</CardTitle></CardHeader>
                  <CardBody>
                    <form onSubmit={handleComplaintSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="نوع الشكوى">
                          <Select value={complaintForm.category} onChange={(e) => setComplaintForm({ ...complaintForm, category: e.target.value })}>
                            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </Select>
                        </Field>
                        <Field label="التفاصيل">
                          <Input value={complaintForm.description} onChange={(e) => setComplaintForm({ ...complaintForm, description: e.target.value })} />
                        </Field>
                      </div>
                      {complaintError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{complaintError}</p>}
                      {complaintOk && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">اتسجّلت الشكوى - هتلاقيها في متابعة العملاء والشكاوى</p>}
                      <Button type="submit" disabled={createComplaint.isPending}>تسجيل الشكوى</Button>
                    </form>
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "pending-orders" && (
        <Card>
          <CardHeader><CardTitle>الطلبات المعلّقة ({pendingOrders.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR><TH>العميل</TH><TH>النوع</TH><TH>الأصناف</TH><TH>الإجمالي</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
              </THead>
              <TBody>
                {pendingOrders.map((order) => (
                  <TR key={order.id}>
                    <TD className="font-semibold text-slate-900">{order.customerName ?? order.customerPhone}</TD>
                    <TD>{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</TD>
                    <TD className="max-w-xs truncate">{order.lines.map((l) => `${l.itemName} ×${l.quantity}`).join("، ")}</TD>
                    <TD className="font-bold text-slate-900">{fmt(order.total)}ج</TD>
                    <TD><StatusBadge status={STATUS_LABELS[order.status] ?? order.status} /></TD>
                    <TD>
                      {order.status === "PENDING" && (
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => confirmOrder.mutate(order.id)} disabled={confirmOrder.isPending}>تسجيل فعليًا</Button>
                          <Button size="sm" variant="danger" onClick={() => rejectOrder.mutate(order.id)} disabled={rejectOrder.isPending}>رفض</Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {pendingOrders.length === 0 && <EmptyState>مفيش طلبات معلّقة لسه</EmptyState>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
