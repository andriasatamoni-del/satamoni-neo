import { describe, expect, it } from "vitest";
import { parseServerSentEvents } from "./orderLiveUpdates";

describe("parseServerSentEvents", () => {
  it("reads complete events and keeps a partial one for the next chunk", () => {
    const { events, rest } = parseServerSentEvents(
      'event: ready\ndata: \n\nevent: order\nid: 2\ndata: {"change":"registered","orderId":"o1","branchId":"b1"}\n\nevent: ord'
    );
    expect(events).toEqual([
      { type: "ready", data: "" },
      { type: "order", data: '{"change":"registered","orderId":"o1","branchId":"b1"}' },
    ]);
    expect(rest).toBe("event: ord");
  });

  it("joins multi-line data and handles CRLF line endings", () => {
    const { events, rest } = parseServerSentEvents("event: order\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(events).toEqual([{ type: "order", data: "a\nb" }]);
    expect(rest).toBe("");
  });

  it("returns nothing until a block is complete", () => {
    expect(parseServerSentEvents("event: order\ndata: x")).toEqual({ events: [], rest: "event: order\ndata: x" });
  });
});
