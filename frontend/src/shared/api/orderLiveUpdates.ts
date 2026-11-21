import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getToken } from "./client";

export interface OrderLiveEvent {
  change: "registered" | "status" | "kitchen" | "cancelled";
  orderId: string;
  branchId: string;
}

export interface ServerSentEvent {
  type: string;
  data: string;
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;
export const LIVE_FALLBACK_POLL_MS = 60_000;

export function parseServerSentEvents(buffer: string): { events: ServerSentEvent[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks.flatMap((block) => {
    let type = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return data.length > 0 || type !== "message" ? [{ type, data: data.join("\n") }] : [];
  });
  return { events, rest };
}

async function readStream(url: string, signal: AbortSignal, onEvent: (event: ServerSentEvent) => void, onOpen: () => void): Promise<void> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`live stream refused: ${res.status}`);
  onOpen();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseServerSentEvents(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
}

export function useOrderLiveUpdates(branchId: string | undefined, enabled = true): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const url = `${API_BASE_URL}/orders/live${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`;

    const refresh = () => {
      queryClientRef.current.invalidateQueries({ queryKey: ["orders"] });
      queryClientRef.current.invalidateQueries({ queryKey: ["kds-board"] });
    };

    const connect = () => {
      readStream(
        url,
        controller.signal,
        (event) => {
          if (event.type === "order") refresh();
        },
        () => {
          retryMs = RETRY_MIN_MS;
          setConnected(true);
          refresh();
        }
      )
        .catch(() => undefined)
        .finally(() => {
          setConnected(false);
          if (controller.signal.aborted) return;
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        });
    };

    connect();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      setConnected(false);
    };
  }, [branchId, enabled]);

  return { connected };
}
