export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

// JSON Schema بسيط لمدخلات الأداة (نفس input_schema في الريبو القديم)
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RunToolLoopInput {
  system: string;
  messages: AiChatMessage[];
  tools: AiToolDefinition[];
  // لازم ترجع نص - ده اللي بيتبعت للموديل كنتيجة الأداة
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
}

// واجهة مستقلة عن المزوّد (Gemini حاليًا، نفس اختيار الريبو القديم عشان المستوى المجاني) - البوت نفسه
// ميعرفش تفاصيل أي API
export interface AiChatClientPort {
  isConfigured(): boolean;
  // بيرجع الرد النصي النهائي بعد ما الموديل يخلّص كل استدعاءات الأدوات اللي محتاجها
  runToolLoop(input: RunToolLoopInput): Promise<string>;
}

export const AI_CHAT_CLIENT = Symbol("AI_CHAT_CLIENT");
