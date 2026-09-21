import { randomUUID } from "node:crypto";
import { PrinterNameRequiredError, UnknownPrinterTypeError, UnknownConnectionTypeError, MissingOsPrinterNameError, MissingIpAddressError } from "./errors";

export const PRINTER_TYPES = ["CASHIER", "KITCHEN", "DELIVERY", "REPORT"] as const;
export type PrinterType = (typeof PRINTER_TYPES)[number];

export const CONNECTION_TYPES = ["USB", "LAN"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export interface PrinterProps {
  branchId: string;
  name: string;
  printerType: PrinterType;
  connectionType: ConnectionType;
  // USB دلوقتي (osPrinterName = اسم الطابعة بالظبط زي ما ظاهر في نظام التشغيل، ده اللي وكيل الطباعة
  // المحلي هيستهدفه) - LAN جاهزة معماريًا (ipAddress/port) لحد ما تتفعّل فعليًا لاحقًا من غير تغيير في الشكل
  osPrinterName: string | null;
  ipAddress: string | null;
  port: number | null;
  paperWidthMm: number;
  isEnabled: boolean;
  // لو محطة/نوع طباعة مالوش توجيه صريح، تقدر تستخدم الطابعة دي كافتراضي لنوعها في الفرع - زر يدوي، مش
  // تلقائي بمجرد إنشاء طابعة جديدة (عشان متبقاش أكتر من طابعة "افتراضية" لنفس النوع في نفس الفرع بالغلط)
  isDefaultForType: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Printer - نفس مفهوم printers في الريبو القديم بالظبط. الطباعة الفعلية بتحصل عند وكيل محلي منفصل خارج
// النظام ده (زي الاتصال الحقيقي بـMeta/Talabat في WhatsApp/Production - مؤجّل لحد ما تتوفر بيئة تشغيل
// حقيقية) - الأجريجيت هنا مسؤول بس عن شكل/قواعد الطابعة نفسها والتوجيه، مش الاتصال بالهاردوير
export class Printer {
  private constructor(
    public readonly id: string,
    private props: PrinterProps
  ) {}

  static register(input: {
    branchId: string;
    name: string;
    printerType: string;
    connectionType?: string;
    osPrinterName?: string | null;
    ipAddress?: string | null;
    port?: number | null;
    paperWidthMm?: number;
  }): Printer {
    const name = input.name.trim();
    if (!name) throw new PrinterNameRequiredError();
    if (!PRINTER_TYPES.includes(input.printerType as PrinterType)) throw new UnknownPrinterTypeError(input.printerType);
    const connectionType = (input.connectionType ?? "USB") as ConnectionType;
    if (!CONNECTION_TYPES.includes(connectionType)) throw new UnknownConnectionTypeError(connectionType);
    if (connectionType === "USB" && !input.osPrinterName) throw new MissingOsPrinterNameError();
    if (connectionType === "LAN" && !input.ipAddress) throw new MissingIpAddressError();

    const now = new Date();
    return new Printer(randomUUID(), {
      branchId: input.branchId,
      name,
      printerType: input.printerType as PrinterType,
      connectionType,
      osPrinterName: input.osPrinterName ?? null,
      ipAddress: input.ipAddress ?? null,
      port: input.port ?? (connectionType === "LAN" ? 9100 : null),
      paperWidthMm: input.paperWidthMm ?? 80,
      isEnabled: true,
      isDefaultForType: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: PrinterProps): Printer {
    return new Printer(id, props);
  }

  update(input: {
    name?: string;
    printerType?: string;
    connectionType?: string;
    osPrinterName?: string | null;
    ipAddress?: string | null;
    port?: number | null;
    paperWidthMm?: number;
    isEnabled?: boolean;
    isDefaultForType?: boolean;
  }): void {
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new PrinterNameRequiredError();
      this.props.name = trimmed;
    }
    if (input.printerType !== undefined) {
      if (!PRINTER_TYPES.includes(input.printerType as PrinterType)) throw new UnknownPrinterTypeError(input.printerType);
      this.props.printerType = input.printerType as PrinterType;
    }
    if (input.connectionType !== undefined) {
      if (!CONNECTION_TYPES.includes(input.connectionType as ConnectionType)) throw new UnknownConnectionTypeError(input.connectionType);
      this.props.connectionType = input.connectionType as ConnectionType;
    }
    if (input.osPrinterName !== undefined) this.props.osPrinterName = input.osPrinterName;
    if (input.ipAddress !== undefined) this.props.ipAddress = input.ipAddress;
    if (input.port !== undefined) this.props.port = input.port;
    if (input.paperWidthMm !== undefined) this.props.paperWidthMm = input.paperWidthMm;
    if (input.isEnabled !== undefined) this.props.isEnabled = input.isEnabled;
    if (input.isDefaultForType !== undefined) this.props.isDefaultForType = input.isDefaultForType;

    if (this.props.connectionType === "USB" && !this.props.osPrinterName) throw new MissingOsPrinterNameError();
    if (this.props.connectionType === "LAN" && !this.props.ipAddress) throw new MissingIpAddressError();
    this.props.updatedAt = new Date();
  }

  clearDefaultForType(): void {
    this.props.isDefaultForType = false;
  }

  get branchId(): string { return this.props.branchId; }
  get name(): string { return this.props.name; }
  get printerType(): PrinterType { return this.props.printerType; }
  get connectionType(): ConnectionType { return this.props.connectionType; }
  get osPrinterName(): string | null { return this.props.osPrinterName; }
  get ipAddress(): string | null { return this.props.ipAddress; }
  get port(): number | null { return this.props.port; }
  get paperWidthMm(): number { return this.props.paperWidthMm; }
  get isEnabled(): boolean { return this.props.isEnabled; }
  get isDefaultForType(): boolean { return this.props.isDefaultForType; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
