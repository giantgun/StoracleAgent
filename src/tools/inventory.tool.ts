import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  updateInventoryService,
  readInventoryItemService,
  predictInventoryDepletionService,
} from "../services/inventory.service";

export class ReadInventoryItemTool extends StructuredTool {
  name = "read_inventory_item";
  description = "Read the full details of the inventory item being monitored.";

  schema = z.object({});

  private readonly itemId: string;

  constructor(itemId: string) {
    super();
    this.itemId = itemId;
  }

  async _call() {
    const result = await readInventoryItemService(this.itemId);
    return JSON.stringify(result);
  }
}

export class PredictDepletionTool extends StructuredTool {
  name = "predict_depletion";
  description = "Predict the daily consumption rate and days until inventory reaches the critical order level. Returns supplier lead time in days.";

  schema = z.object({});

  private readonly itemId: string;

  constructor(itemId: string) {
    super();
    this.itemId = itemId;
  }

  async _call() {
    const result = await predictInventoryDepletionService(this.itemId);
    return JSON.stringify(result);
  }
}

export class UpdateInventoryTool extends StructuredTool {
  name = "update_inventory";
  description = "Update the inventory quantity for a specific item.";

  schema = z.object({
    quantity: z.number().describe("The new quantity for the inventory item"),
  });

  private readonly itemId: string;

  constructor(itemId: string) {
    super();
    this.itemId = itemId;
  }

  async _call(input: { quantity: number }) {
    const result = await updateInventoryService(this.itemId, input.quantity);
    return JSON.stringify(result);
  }
}
