import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { readInvoiceService, sendInvoicePaidService, sendInvoiceRequestService } from "../services/email.service";

export class ReadInvoiceTool extends StructuredTool {
  name = "read_invoice";
  description = "OCR an invoice attachment stored in the invoice_attachments table. Extract product_name, quantity, unit_price, total_amount, supplier_address, due_date.";

  schema = z.object({});

  private readonly attachmentId: string;

  constructor(attachmentId: string) {
    super();
    this.attachmentId = attachmentId;
  }

  async _call() {
    const result = await readInvoiceService(this.attachmentId);
    return JSON.stringify(result);
  }
}

export class SendInvoiceRequestTool extends StructuredTool {
  name = "send_invoice_request";
  description = "Send an email to the supplier requesting an invoice for the monitored inventory item. Provide the quantity to order.";

  schema = z.object({
    quantity: z.number().describe("The quantity of items to order. Use minimum_bulk_quantity from the inventory item data."),
  });

  private readonly itemId: string;

  constructor(itemId: string) {
    super();
    this.itemId = itemId;
  }

  async _call(input: { quantity: number }) {
    const result = await sendInvoiceRequestService(this.itemId, input.quantity);
    return JSON.stringify(result);
  }
}

export class SendInvoicePaidTool extends StructuredTool {
  name = "send_invoice_paid";
  description = "Send an email to the supplier notifying them that the invoice for the monitored inventory item has been paid.";

  schema = z.object({
    quantity: z.number().describe("The quantity of items to order. Use minimum_bulk_quantity from the inventory item data."),
    tx_hash: z.string().describe("The transaction hash of the payment on the blockchain."),
  });

  private readonly itemId: string;
  private readonly attachmentId: string;

  constructor(itemId: string, attachmentId: string) {
    super();
    this.itemId = itemId;
    this.attachmentId = attachmentId;
  }

  async _call(input: { quantity: number; tx_hash: string }) {
    const result = await sendInvoicePaidService(this.itemId, input.quantity, this.attachmentId, input.tx_hash);
    return JSON.stringify(result);
  }
}
