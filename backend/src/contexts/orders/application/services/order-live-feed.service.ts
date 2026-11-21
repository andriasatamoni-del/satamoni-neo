import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Observable, Subject, filter } from "rxjs";

export const ORDER_LIVE_CHANGES = ["registered", "status", "kitchen", "cancelled"] as const;
export type OrderLiveChange = (typeof ORDER_LIVE_CHANGES)[number];

export interface OrderLiveEvent {
  change: OrderLiveChange;
  orderId: string;
  branchId: string;
}

@Injectable()
export class OrderLiveFeed implements OnModuleDestroy {
  private readonly events = new Subject<OrderLiveEvent>();

  publish(event: OrderLiveEvent): void {
    this.events.next(event);
  }

  forBranch(branchId: string | undefined): Observable<OrderLiveEvent> {
    return branchId ? this.events.pipe(filter((e) => e.branchId === branchId)) : this.events.asObservable();
  }

  onModuleDestroy(): void {
    this.events.complete();
  }
}
