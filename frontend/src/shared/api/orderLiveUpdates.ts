import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getToken } from "./client";

export interface OrderLiveEvent {
  change: "registered" | "status" | "kitchen" | "cancelled" | "payment";
  orderId: string;
  branchId: string;
}

export interface ServerSentEvent {
  type: string;
  data: string;
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;
export const LIVE_STALE_AFTER_MS = 45_000;

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

interface StreamCallbacks {
  onOpen: () => void;
  onActivity: () => void;
  onEvent: (event: ServerSentEvent) => void;
}

async function readStream(url: string, signal: AbortSignal, callbacks: StreamCallbacks): Promise<void> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`live stream refused: ${res.status}`);
  callbacks.onOpen();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    callbacks.onActivity();
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseServerSentEvents(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(callbacks.onEvent);
  }
}

export function useOrderLiveUpdates(branchId: string | undefined, enabled = true): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!enabled) return;
    const lifetime = new AbortController();
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    const url = `${API_BASE_URL}/orders/live${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`;

    const refresh = () => {
      queryClientRef.current.invalidateQueries({ queryKey: ["orders"] });
      queryClientRef.current.invalidateQueries({ queryKey: ["kds-board"] });
    };

    const connect = () => {
      const connection = new AbortController();
      const stopConnection = () => connection.abort();
      lifetime.signal.addEventListener("abort", stopConnection);
      const watch = () => {
        clearTimeout(staleTimer);
        staleTimer = setTimeout(stopConnection, LIVE_STALE_AFTER_MS);
      };

      watch();
      readStream(url, connection.signal, {
        onOpen: () => {
          retryMs = RETRY_MIN_MS;
          setConnected(true);
          refresh();
        },
        onActivity: watch,
        onEvent: (event) => {
          if (event.type === "order") refresh();
        },
      })
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(staleTimer);
          lifetime.signal.removeEventListener("abort", stopConnection);
          if (lifetime.signal.aborted) return;
          setConnected(false);
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        });
    };

    connect();
    return () => {
      lifetime.abort();
      clearTimeout(retryTimer);
      clearTimeout(staleTimer);
      setConnected(false);
    };
  }, [branchId, enabled]);

  return { connected };
}
