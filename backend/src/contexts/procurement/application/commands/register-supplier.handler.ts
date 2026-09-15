import { Inject, Injectable } from "@nestjs/common";
import { Supplier } from "../../domain/supplier.aggregate";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";

export interface RegisterSupplierCommand {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
}

@Injectable()
export class RegisterSupplierHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort) {}

  async execute(command: RegisterSupplierCommand): Promise<Supplier> {
    const supplier = Supplier.register(command);
    await this.suppliers.save(supplier);
    return supplier;
  }
}
