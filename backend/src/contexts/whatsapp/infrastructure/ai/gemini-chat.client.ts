import { Injectable, Logger } from "@nestjs/common";
import type { AiChatClientPort, AiToolDefinition, RunToolLoopInput } from "../../domain/ports/ai-chat-client.port";

const MAX_TOOL_TURNS = 6;
const REQUEST_TIMEOUT_MS = 30_000;
export const AI_FALLBACK_REPLY = "معلش، ممكن تعيد سؤالك؟ حصلت مشكلة مؤقتة عندي.";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: string } };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// Gemini بيرفض additionalProperties في تعريف الأدوات (على أي عمق) - باج حقيقي اتلقط في الريبو القديم
// (المرحلة 8.47): كل استدعاء كان بيفشل بـ"Invalid JSON payload" قبل ما الموديل يشوف رسالة العميل
export function stripAdditionalProperties(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripAdditionalProperties);
  if (schema && typeof schema === "object") {
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "additionalProperties") continue;
      rest[key] = stripAdditionalProperties(value);
    }
    return rest;
  }
  return schema;
}

function toGeminiTools(tools: AiToolDefinition[]) {
  if (tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: stripAdditionalProperties(t.parameters),
      })),
    },
  ];
}

// عميل Gemini مباشر بـfetch (من غير SDK) - نفس db/ai-client.js في الريبو القديم مع التصليحات اللي اتعملت
// فيه بعد تجارب حقيقية: role "user" (مش "function") لنتايج الأدوات (8.49)، وthinkingBudget: 0 عشان الرد
// مايتقطعش (8.50). المفتاح بيتبعت في header مش في الـURL عشان ميظهرش في أي log.
//
// GEMINI_API_KEY: مفتاح مجاني من aistudio.google.com/apikey
// GEMINI_MODEL: اسم الموديل (يتغيّر من Render مباشرة لو Google وقّفت الموديل ده)
@Injectable()
export class GeminiChatClient implements AiChatClientPort {
  private readonly logger = new Logger(GeminiChatClient.name);

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async runToolLoop(input: RunToolLoopInput): Promise<string> {
    const contents: GeminiContent[] = input.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const parts = await this.generate(input.system, contents, input.tools);
      const functionCalls = parts.filter((p) => p.functionCall);
      if (functionCalls.length === 0) {
        return parts.filter((p) => p.text).map((p) => p.text).join("\n").trim();
      }

      contents.push({ role: "model", parts });
      const responses: GeminiPart[] = [];
      for (const part of functionCalls) {
        const call = part.functionCall!;
        let result: string;
        try {
          result = await input.executeTool(call.name, call.args ?? {});
        } catch (err) {
          result = `خطأ: ${err instanceof Error ? err.message : String(err)}`;
        }
        responses.push({ functionResponse: { name: call.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }

    this.logger.warn(`tool loop hit ${MAX_TOOL_TURNS} turns without a final reply`);
    return AI_FALLBACK_REPLY;
  }

  private async generate(system: string, contents: GeminiContent[], tools: AiToolDefinition[]): Promise<GeminiPart[]> {
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: toGeminiTools(tools),
        generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: GeminiPart[] } }[];
    };
    if (!res.ok) throw new Error(data.error?.message || `Gemini API error: HTTP ${res.status}`);
    return data.candidates?.[0]?.content?.parts ?? [];
  }
}
