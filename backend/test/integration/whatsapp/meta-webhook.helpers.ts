import { createHmac } from "node:crypto";

export function signMeta(body: string): string {
  return `sha256=${createHmac("sha256", process.env.META_APP_SECRET as string).update(body).digest("hex")}`;
}

export function whatsappPayload(input: { from: string; text: string; id: string; name?: string }): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-test",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: input.name ? [{ wa_id: input.from, profile: { name: input.name } }] : [],
              messages: [{ from: input.from, id: input.id, timestamp: "1790000000", type: "text", text: { body: input.text } }],
            },
          },
        ],
      },
    ],
  });
}

export function socialPayload(input: { object: "page" | "instagram"; senderId: string; text: string; mid: string }): string {
  return JSON.stringify({
    object: input.object,
    entry: [{ id: "page-test", messaging: [{ sender: { id: input.senderId }, recipient: { id: "page-test" }, message: { mid: input.mid, text: input.text } }] }],
  });
}
