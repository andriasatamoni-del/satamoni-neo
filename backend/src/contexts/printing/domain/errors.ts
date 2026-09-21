import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class PrinterNameRequiredError extends DomainError {
  constructor() {
    super("لازم اسم الطابعة");
  }
}

export class UnknownPrinterTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع طابعة غير معروف: ${value}`);
  }
}

export class UnknownConnectionTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع اتصال غير معروف: ${value}`);
  }
}

export class MissingOsPrinterNameError extends DomainError {
  constructor() {
    super("طابعة USB لازم لها اسم بالظبط زي ما هو مسجّل في نظام التشغيل (Windows)");
  }
}

export class MissingIpAddressError extends DomainError {
  constructor() {
    super("طابعة الشبكة (LAN) لازم لها عنوان IP");
  }
}

export class PrinterNotFoundError extends DomainError {
  constructor() {
    super("الطابعة مش موجودة");
  }
}

export class PrinterDisabledError extends DomainError {
  constructor() {
    super("الطابعة دي معطّلة - فعّلها الأول");
  }
}

export class KitchenStationNameRequiredError extends DomainError {
  constructor() {
    super("لازم اسم المحطة");
  }
}

export class KitchenStationNotFoundError extends DomainError {
  constructor() {
    super("المحطة مش موجودة");
  }
}

export class DuplicateKitchenStationNameError extends DomainError {
  constructor() {
    super("فيه محطة بنفس الاسم في الفرع ده بالفعل");
  }
}

export class PrinterBranchMismatchError extends DomainError {
  constructor() {
    super("الطابعة المختارة مش تابعة لنفس الفرع");
  }
}

export class PrintJobNotFoundError extends DomainError {
  constructor() {
    super("أمر الطباعة مش موجود");
  }
}

export class PrintJobNotPendingError extends DomainError {
  constructor() {
    super("أمر الطباعة ده مش PENDING (اتحجز أو اتطبع بالفعل)");
  }
}

export class PrintJobNotPrintingError extends DomainError {
  constructor() {
    super("أمر الطباعة ده مش PRINTING دلوقتي");
  }
}

export class PrintJobNotFailedError extends DomainError {
  constructor() {
    super("أمر الطباعة ده مش FAILED");
  }
}
