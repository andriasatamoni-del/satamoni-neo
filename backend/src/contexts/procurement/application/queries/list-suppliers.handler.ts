import { Inject, Injectable } from "@nestjs/common";
import { Supplier } from "../../domain/supplier.aggregate";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";

@Injectable()
export class ListSuppliersHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort) {}

  async execute(): Promise<Supplier[]> {
    return this.suppliers.list();
  }
}
