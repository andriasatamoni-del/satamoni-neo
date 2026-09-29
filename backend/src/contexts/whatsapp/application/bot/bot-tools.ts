import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AiToolDefinition } from "../../domain/ports/ai-chat-client.port";
import { BOT_KNOWLEDGE_READER, type BotKnowledgeReaderPort } from "../../domain/ports/bot-knowledge-reader.port";
import {
  WHATSAPP_PENDING_ORDER_REPOSITORY,
  type WhatsappPendingOrderRepositoryPort,
} from "../../domain/ports/whatsapp-pending-order-repository.port";
import { OUTBOUND_MESSENGER, type OutboundMessengerPort } from "../../domain/ports/outbound-messenger.port";
import { WhatsappPendingOrder, type PendingOrderLineInput } from "../../domain/whatsapp-pending-order.aggregate";
import type { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import { RegisterComplaintFromConversationHandler } from "../commands/register-complaint-from-conversation.handler";

export interface BotToolContext {
  conversation: WhatsappConversation;
}

const ORDER_STATUS_AR: Record<string, string> = {
  preparing: "تحت التحضير",
  out_for_delivery: "في الطريق",
  completed: "اتسلم/خلص",
  cancelled: "اتلغى",
};
const COMPLAINT_CATEGORIES = ["late_order", "wrong_item", "quality", "other"];

export const BOT_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: "get_menu",
    description: "هات المنيو النشط الحالي (الأقسام، الأصناف، الأحجام والأسعار، والإضافات). استخدمها قبل أي رد عن أصناف/أسعار.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_offers",
    description: "هات العروض/الكومبوهات النشطة حاليًا بأسعارها.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_business_info",
    description: "هات بيانات الفروع (الاسم، العنوان، رقم التليفون، مواعيد الشغل).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "lookup_recent_orders",
    description: "هات آخر 5 طلبات لنفس العميل اللي بيكلم دلوقتي مع حالتها الحالية.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "save_draft_order",
    description:
      "سجّل/حدّث مسودة الأوردر الحالي. استخدمها كل ما تعرف تفصيلة جديدة (أصناف، نوع الطلب، فرع، عنوان، اسم). بترجع ملخص بالسعر الصحيح من المنيو الحقيقي، أو توضح أي صنف/فرع مش واضح.",
    parameters: {
      type: "object",
      properties: {
        orderType: { type: "string", enum: ["delivery", "takeaway"], description: "توصيل أو استلام من الفرع" },
        items: {
          type: "array",
          description: "قايمة الأصناف كاملة لحد دلوقتي (مش الجديد بس)",
          items: {
            type: "object",
            properties: {
              itemName: { type: "string" },
              variantLabel: { type: "string", description: "الحجم - ممكن تسيبه فاضي لو الصنف له حجم واحد" },
              quantity: { type: "integer", minimum: 1 },
              modifierNames: { type: "array", items: { type: "string" } },
            },
            required: ["itemName", "quantity"],
          },
        },
        customerName: { type: "string" },
        branchName: { type: "string", description: "اسم الفرع اللي هيجهّز الطلب" },
        addressDetails: { type: "string", description: "عنوان التوصيل بالتفصيل (منطقة/شارع/عمارة/دور/شقة/علامة مميزة)" },
      },
    },
  },
  {
    name: "submit_pending_order",
    description: "ابعت مسودة الأوردر الحالية للفريق للمراجعة والتأكيد. بس بعد ما العميل يأكد صراحة.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "log_complaint",
    description: "سجّل شكوى العميل فورًا عشان فريق حقيقي يتابعها.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: COMPLAINT_CATEGORIES },
        description: { type: "string" },
        orderReference: { type: "string", description: "رقم الطلب لو العميل ذكره" },
      },
      required: ["category", "description"],
    },
  },
];

function money(n: number): string {
  return `${n.toFixed(2)} ج.م`;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// الأدوات اللي البوت بيستخدمها - نفس services/whatsapp-bot/tools.js في الريبو القديم. كل أداة بترجع نص
// عشان الموديل يصيغ منه رد طبيعي. مفيش أداة بتسجّل أوردر حقيقي أو بتلمس مخزون/محاسبة - أقصى حاجة مسودة
// بتروح لطاقم المراجعة (confirm بتاعهم هو اللي بيسجّل الأوردر فعلًا).
@Injectable()
export class WhatsappBotTools {
  private readonly logger = new Logger(WhatsappBotTools.name);

  constructor(
    @Inject(BOT_KNOWLEDGE_READER) private readonly knowledge: BotKnowledgeReaderPort,
    @Inject(WHATSAPP_PENDING_ORDER_REPOSITORY) private readonly pendingOrders: WhatsappPendingOrderRepositoryPort,
    @Inject(OUTBOUND_MESSENGER) private readonly outbound: OutboundMessengerPort,
    private readonly registerComplaint: RegisterComplaintFromConversationHandler
  ) {}

  async execute(name: string, args: Record<string, unknown>, ctx: BotToolContext): Promise<string> {
    switch (name) {
      case "get_menu": return this.getMenu();
      case "get_offers": return this.getOffers();
      case "get_business_info": return this.getBusinessInfo();
      case "lookup_recent_orders": return this.lookupRecentOrders(ctx);
      case "save_draft_order": return this.saveDraftOrder(args, ctx);
      case "submit_pending_order": return this.submitPendingOrder(ctx);
      case "log_complaint": return this.logComplaint(args, ctx);
      default: return `أداة غير معروفة: ${name}`;
    }
  }

  private async getMenu(): Promise<string> {
    const items = await this.knowledge.activeMenu();
    if (items.length === 0) return "المنيو فاضي حاليًا - مفيش أصناف نشطة.";
    const byCategory = new Map<string, string[]>();
    for (const item of items) {
      const variants = item.variants.map((v) => `${v.label}: ${money(v.price)}`).join("، ");
      let line = `- ${item.name}${item.isBest ? " ⭐" : ""}: ${variants}`;
      if (item.modifiers.length > 0) {
        line += `\n  إضافات: ${item.modifiers.map((m) => `${m.name} (${m.priceDelta >= 0 ? "+" : ""}${money(m.priceDelta)})`).join("، ")}`;
      }
      byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), line]);
    }
    return [...byCategory].map(([cat, lines]) => `## ${cat}\n${lines.join("\n")}`).join("\n\n");
  }

  private async getOffers(): Promise<string> {
    const combos = await this.knowledge.activeCombos();
    if (combos.length === 0) return "مفيش عروض نشطة حاليًا.";
    return combos
      .map((c) => `- ${c.name}: ${money(c.price)} (${c.items.map((i) => `${i.quantity}× ${i.itemName} ${i.variantLabel}`).join(" + ")})`)
      .join("\n");
  }

  private async getBusinessInfo(): Promise<string> {
    const branches = await this.knowledge.branches();
    if (branches.length === 0) return "مفيش بيانات فروع مسجلة.";
    return branches
      .map((b) => `- ${b.name}: ${b.address ?? "بدون عنوان مسجل"} - تليفون: ${b.phone ?? "-"} - المواعيد: ${b.hours ?? "غير محددة"}`)
      .join("\n");
  }

  private async lookupRecentOrders(ctx: BotToolContext): Promise<string> {
    const orders = await this.knowledge.recentOrdersByPhone(ctx.conversation.phone, 5);
    if (orders.length === 0) return "مفيش طلبات سابقة مسجلة على الرقم ده.";
    return orders
      .map((o) => {
        const type = o.orderType === "delivery" ? "توصيل" : o.orderType === "takeaway" ? "استلام" : "صالة";
        const when = o.createdAt.toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
        return `- طلب ${o.id.slice(0, 8)} (${type}): ${ORDER_STATUS_AR[o.status] ?? o.status} - ${money(o.total)} - ${when}`;
      })
      .join("\n");
  }

  private async resolveLine(raw: Record<string, unknown>): Promise<PendingOrderLineInput | string> {
    const itemName = asString(raw.itemName);
    if (!itemName) return "في صنف من غير اسم - اسأل العميل عايز ايه بالظبط.";
    const matches = await this.knowledge.findActiveItemsByName(itemName);
    if (matches.length === 0) return `مفيش صنف اسمه "${itemName}" في المنيو الحالي.`;
    if (matches.length > 1) return `فيه أكتر من صنف قريب من "${itemName}": ${matches.map((m) => m.name).join("، ")} - حدد أنهي واحد بالظبط.`;
    const item = matches[0];
    if (item.variants.length === 0) return `الصنف "${item.name}" مالوش أي حجم متاح حاليًا.`;

    const variantLabel = asString(raw.variantLabel);
    let variant = item.variants.length === 1 ? item.variants[0] : undefined;
    if (!variant && variantLabel) {
      const wanted = variantLabel.toLowerCase();
      variant =
        item.variants.find((v) => v.label.toLowerCase() === wanted) ??
        item.variants.find((v) => v.label.toLowerCase().includes(wanted) || wanted.includes(v.label.toLowerCase()));
    }
    if (!variant) return `الصنف "${item.name}" أحجامه: ${item.variants.map((v) => v.label).join("، ")} - أنهي حجم؟`;

    const modifierNames = Array.isArray(raw.modifierNames) ? raw.modifierNames.filter((m): m is string => typeof m === "string") : [];
    const modifiers = [];
    for (const modifierName of modifierNames) {
      const modifier = await this.knowledge.findActiveModifier(item.itemId, variant.id, modifierName);
      if (!modifier) return `مفيش إضافة اسمها "${modifierName}" للصنف "${item.name}".`;
      modifiers.push(modifier);
    }

    const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
    const displayName = `${item.name} (${variant.label})${modifiers.length ? ` + ${modifiers.map((m) => m.name).join("، ")}` : ""}`;
    return {
      variantId: variant.id,
      itemName: displayName,
      quantity,
      unitPrice: variant.price + modifiers.reduce((sum, m) => sum + m.priceDelta, 0),
      modifierIds: modifiers.map((m) => m.id),
    };
  }

  private async saveDraftOrder(args: Record<string, unknown>, ctx: BotToolContext): Promise<string> {
    const { conversation } = ctx;
    let lines: PendingOrderLineInput[] | undefined;
    if (Array.isArray(args.items)) {
      lines = [];
      for (const raw of args.items) {
        const resolved = await this.resolveLine((raw ?? {}) as Record<string, unknown>);
        if (typeof resolved === "string") return resolved;
        lines.push(resolved);
      }
    }

    const branches = await this.knowledge.branches();
    let branchId: string | undefined;
    const branchName = asString(args.branchName);
    if (branchName) {
      const wanted = branchName.toLowerCase();
      const match = branches.find((b) => b.name.toLowerCase() === wanted) ?? branches.find((b) => b.name.toLowerCase().includes(wanted));
      if (!match) return `مفيش فرع اسمه "${branchName}" - الفروع المتاحة: ${branches.map((b) => b.name).join("، ") || "مفيش"}.`;
      branchId = match.id;
    }

    let draft = await this.pendingOrders.findDraftByConversation(conversation.id);
    if (!draft) {
      draft = WhatsappPendingOrder.startDraft({
        conversationId: conversation.id,
        customerPhone: conversation.phone,
        customerName: conversation.customerName,
      });
    }
    // فرع واحد بس = مفيش داعي نسأل العميل
    if (!branchId && !draft.branchId && branches.length === 1) branchId = branches[0].id;

    const orderType = args.orderType === "takeaway" || args.orderType === "delivery" ? args.orderType : undefined;
    draft.updateDraft({
      orderType,
      branchId,
      customerName: asString(args.customerName),
      addressDetails: asString(args.addressDetails),
      lines,
    });
    await this.pendingOrders.save(draft);

    if (draft.lines.length === 0) return "لسه مفيش أصناف في الأوردر - اسأل العميل عايز ياخد ايه.";
    const summary = draft.lines.map((l) => `${l.quantity}× ${l.itemName} = ${money(l.quantity * l.unitPrice)}`).join("\n");
    const missing = draft.missingForSubmission();
    const branch = branches.find((b) => b.id === draft!.branchId);
    return (
      `ملخص الأوردر لحد دلوقتي (${draft.orderType === "delivery" ? "توصيل" : "استلام من الفرع"}${branch ? ` - فرع ${branch.name}` : ""}):\n` +
      `${summary}\nالإجمالي (من غير رسوم التوصيل): ${money(draft.total)}` +
      (missing.length ? `\n\nناقص لسه: ${missing.join("، ")}` : "\n\nكل حاجة كاملة - اسأل العميل يأكد عشان تبعت الأوردر (submit_pending_order).")
    );
  }

  private async submitPendingOrder(ctx: BotToolContext): Promise<string> {
    const draft = await this.pendingOrders.findDraftByConversation(ctx.conversation.id);
    if (!draft) return "مفيش مسودة أوردر حالية - اجمع الأصناف الأول بـsave_draft_order.";
    const missing = draft.missingForSubmission();
    if (missing.length > 0) return `لسه ناقص: ${missing.join("، ")} - اسأل العميل يكملهم الأول.`;

    draft.submit();
    await this.pendingOrders.save(draft);
    await this.notifyStaff(`📥 أوردر جديد من ${ctx.conversation.channel} محتاج مراجعة - ${draft.customerName} - ${money(draft.total)} - افتح شاشة "واتساب".`);
    return `تمام، الأوردر اتبعت للفريق للمراجعة والتأكيد (رقم مرجعي ${draft.id.slice(0, 8)}) - هيتأكد خلال شوية.`;
  }

  private async logComplaint(args: Record<string, unknown>, ctx: BotToolContext): Promise<string> {
    const category = typeof args.category === "string" && COMPLAINT_CATEGORIES.includes(args.category) ? args.category : "other";
    const description = asString(args.description) ?? "شكوى من غير تفاصيل";
    const orderReference = asString(args.orderReference);
    const complaint = await this.registerComplaint.execute({
      conversationId: ctx.conversation.id,
      category,
      description: orderReference ? `${description} (طلب: ${orderReference})` : description,
    });
    await this.notifyStaff(`⚠️ شكوى جديدة من ${ctx.conversation.channel}${orderReference ? ` - طلب ${orderReference}` : ""} - ${description}`);
    return `اتسجلت الشكوى (رقم ${complaint.id.slice(0, 8)}) - حد من الفريق هيتابع معاك.`;
  }

  // تنبيه اختياري لرقم واتساب المسؤول - فشله ميأثرش على رد العميل
  private async notifyStaff(text: string): Promise<void> {
    const to = process.env.WHATSAPP_STAFF_NOTIFY_NUMBER;
    if (!to) return;
    const result = await this.outbound.send({ channel: "whatsapp", to, text });
    if (!result.sent && result.reason === "failed") this.logger.warn(`staff notify failed: ${result.error}`);
  }
}
