export interface BotMenuItem {
  itemId: string;
  name: string;
  category: string;
  isBest: boolean;
  variants: { id: string; label: string; price: number }[];
}

export interface BotAddon {
  variantId: string;
  name: string;
  price: number;
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

export interface BotKnowledgeReaderPort {
  activeMenu(): Promise<BotMenuItem[]>;
  activeAddons(): Promise<BotAddon[]>;
  activeCombos(): Promise<BotCombo[]>;
  branches(): Promise<BotBranch[]>;
  recentOrdersByPhone(phone: string, limit: number): Promise<BotRecentOrder[]>;
  findActiveItemsByName(name: string): Promise<BotMenuItemMatch[]>;
  findActiveAddon(name: string): Promise<BotAddon | null>;
}

export const BOT_KNOWLEDGE_READER = Symbol("BOT_KNOWLEDGE_READER");
