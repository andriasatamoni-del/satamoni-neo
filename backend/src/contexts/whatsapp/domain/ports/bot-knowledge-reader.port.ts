export interface BotMenuItem {
  itemId: string;
  name: string;
  category: string;
  isBest: boolean;
  variants: { id: string; label: string; price: number }[];
  modifiers: { id: string; name: string; priceDelta: number }[];
}

export interface BotCombo {
  name: string;
  price: number;
  items: { itemName: string; variantLabel: string; quantity: number }[];
}

export interface BotBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
}

export interface BotRecentOrder {
  id: string;
  orderType: string;
  status: string;
  total: number;
  createdAt: Date;
}

export interface BotMenuItemMatch {
  itemId: string;
  name: string;
  variants: { id: string; label: string; price: number }[];
}

// قراءة بس - كل معلومة البوت بيقولها للعميل لازم تيجي من هنا (مفيش أسعار أو أصناف من دماغ الموديل)
export interface BotKnowledgeReaderPort {
  activeMenu(): Promise<BotMenuItem[]>;
  activeCombos(): Promise<BotCombo[]>;
  branches(): Promise<BotBranch[]>;
  recentOrdersByPhone(phone: string, limit: number): Promise<BotRecentOrder[]>;
  // مطابقة تامة الأول (من غير اعتبار حالة الحروف) وبعدين احتواء جزئي - أقصى 5 نتايج
  findActiveItemsByName(name: string): Promise<BotMenuItemMatch[]>;
  // سعر الإضافة للحجم ده بالظبط (لو ليها سعر مخصوص للحجم) أو سعرها العام
  findActiveModifier(itemId: string, variantId: string, name: string): Promise<{ id: string; name: string; priceDelta: number } | null>;
}

export const BOT_KNOWLEDGE_READER = Symbol("BOT_KNOWLEDGE_READER");
