import { randomUUID } from "node:crypto";
import { BankNameRequiredError } from "./errors";

export interface BankProps {
  name: string;
  isActive: boolean;
  createdAt: Date;
}

// Bank - نفس مفهوم banks في الريبو القديم: كتالوج البنوك المتعامل معاها (لا أكتر) - الحساب البنكي
// الفعلي (رقم حساب/IBAN) والربط بدليل الحسابات في BankAccount
export class Bank {
  private constructor(
    public readonly id: string,
    private props: BankProps
  ) {}

  static register(input: { name: string }): Bank {
    const name = input.name.trim();
    if (!name) throw new BankNameRequiredError();
    return new Bank(randomUUID(), { name, isActive: true, createdAt: new Date() });
  }

  static reconstitute(id: string, props: BankProps): Bank {
    return new Bank(id, props);
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new BankNameRequiredError();
    this.props.name = trimmed;
  }

  activate(): void { this.props.isActive = true; }
  deactivate(): void { this.props.isActive = false; }

  get name(): string { return this.props.name; }
  get isActive(): boolean { return this.props.isActive; }
  get createdAt(): Date { return this.props.createdAt; }
}
