import type { Request, Response } from "express";
import { simulatePurchaseService } from "../services/inventory.service";

export async function simulatePurchase(req: any, res: Response): Promise<any> {
  try {
    const { item_id, quantity_sold } = req.body;

    if (!item_id || !quantity_sold || quantity_sold <= 0) {
      return res.status(400).json({ error: "item_id and a positive quantity_sold are required" });
    }

    const organization_id = req.user?.id;
    if (!organization_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await simulatePurchaseService(item_id, quantity_sold, organization_id);

    return res.status(200).json({
      message: "Purchase simulated successfully",
      ...result,
    });
  } catch (err: any) {
    console.error("simulatePurchase error:", err);
    return res.status(500).json({ error: err.message });
  }
}
