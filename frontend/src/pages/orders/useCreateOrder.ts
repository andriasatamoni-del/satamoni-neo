import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { enqueueOrder } from "../../shared/offline/db";
import { buildOrderPayload, cartSummary, type OrderDraft } from "./orderDraft";
import type { CartLine } from "./posTypes";

interface CreateOrderInput { branchId: string; draft: OrderDraft; lines: CartLine[]; }

export function useCreateOrder(onCreated: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ branchId, draft, lines }: CreateOrderInput) => {
      const payload = buildOrderPayload(branchId, draft, lines);
      const queueLocally = async () => {
        await enqueueOrder({ clientRequestId: payload.clientRequestId, payload, summary: cartSummary(lines), createdAt: Date.now() });
        return { queued: true as const };
      };

      if (!navigator.onLine) return queueLocally();
      try {
        await apiRequest("/orders", { method: "POST", body: payload });
        return { queued: false as const };
      } catch (err) {
        if (err instanceof ApiError) throw err;
        return queueLocally();
      }
    },
    onSuccess: (result) => {
      onCreated();
      if (!result.queued) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
      }
    },
  });
}
