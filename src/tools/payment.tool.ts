import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { paySupplierService } from "../services/payment.service";

export class PaySupplierTool extends StructuredTool {
  name = "pay_supplier";
  description = "Pay a supplier invoice in USDT. Use the supplier address, total amount, inventory item ID, and quantity from the parsed invoice data.";

  schema = z.object({
    supplierAddress: z.string().describe("The USDT wallet address of the supplier (from the invoice)"),
    amount: z.number().describe("The total amount to pay in USDT (from the invoice)"),
    inventoryItemId: z.string().describe("The ID of the matching inventory item"),
    quantity: z.number().describe("The quantity of items being ordered (from the invoice)"),
  });

  private readonly organizationId: string;

  constructor(organizationId: string) {
    super();
    this.organizationId = organizationId;
  }

  async _call(input: { supplierAddress: string; amount: number; inventoryItemId: string; quantity: number }) {
    const result = await paySupplierService(this.organizationId, input.supplierAddress, input.amount, input.inventoryItemId, input.quantity);
    return JSON.stringify(result);
  }
}
