import { businessDayStartUtc } from "../../../src/shared/time/business-date";

const RealDate = Date;

export class SimulatedClock {
  private anchorMs = RealDate.now();
  private anchorRealMs = RealDate.now();
  private installed = false;

  now(): number {
    return this.anchorMs + (RealDate.now() - this.anchorRealMs);
  }

  set(at: Date): void {
    this.anchorMs = at.getTime();
    this.anchorRealMs = RealDate.now();
  }

  advanceMinutes(minutes: number): void {
    this.set(new RealDate(this.now() + minutes * 60_000));
  }

  current(): Date {
    return new RealDate(this.now());
  }

  install(): void {
    if (this.installed) return;
    const clock = this;
    class ClockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(clock.now());
        else super(...(args as [string | number | Date]));
      }
      static now(): number {
        return clock.now();
      }
    }
    globalThis.Date = ClockDate as DateConstructor;
    this.installed = true;
  }

  uninstall(): void {
    globalThis.Date = RealDate;
    this.installed = false;
  }
}

export function cairoTime(businessDay: string, hour: number, minute = 0): Date {
  return new RealDate(businessDayStartUtc(businessDay).getTime() + (hour * 60 + minute) * 60_000);
}

export function addDays(businessDay: string, days: number): string {
  const [y, m, d] = businessDay.split("-").map(Number);
  const shifted = new RealDate(RealDate.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
