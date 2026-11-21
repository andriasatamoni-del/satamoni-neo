import { Controller, Header, MessageEvent, Query, Sse, UseGuards } from "@nestjs/common";
import { Observable, interval, map, merge, of, takeUntil, timer } from "rxjs";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { PERMISSION } from "../../identity-access/domain/permission";
import { BranchScopeGuard, BranchScoped } from "../../../shared/authorization/branch-scope";
import { OrderLiveFeed } from "../application/services/order-live-feed.service";

export const LIVE_HEARTBEAT_MS = 20_000;
export const LIVE_SESSION_MS = 15 * 60_000;

@Controller("orders")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@BranchScoped()
export class OrdersLiveController {
  constructor(private readonly feed: OrderLiveFeed) {}

  @Sse("live")
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("X-Accel-Buffering", "no")
  @RequirePermission(PERMISSION.ORDERS_VIEW, PERMISSION.ORDERS_CREATE, PERMISSION.KITCHEN_VIEW)
  live(@Query("branchId") branchId?: string): Observable<MessageEvent> {
    const changes = this.feed.forBranch(branchId || undefined).pipe(map((event): MessageEvent => ({ type: "order", data: event })));
    const heartbeats = interval(LIVE_HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "ping", data: "" })));
    const ready = of<MessageEvent>({ type: "ready", data: "" });
    return merge(ready, changes, heartbeats).pipe(takeUntil(timer(LIVE_SESSION_MS)));
  }
}
