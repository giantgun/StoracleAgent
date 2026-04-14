import type { NextFunction, Request, Response } from "express";
import { createAuthClient } from "../db/supabase";
import { supabase } from "../db/supabase";
import dotenv from "dotenv";

declare const fetch: any;
dotenv.config();

export async function addItem(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const {
      name,
      unit_name,
      unit_sales_price_in_usdt,
      quantity,
      inventory_capacity,
      critical_order_level,
      minimum_bulk_quantity,
      expected_purchase_price_in_usdt,
      supplier_lead_time_days,
      supplier_id,
    } = req.body;

    const supabase = createAuthClient(req, res);
    const user = req.user;

    // 4. DATABASE - ORGANIZATION
    const { data: itemData, error: suppError } = await supabase
      .from("inventory_items")
      .insert({
        organization_id: user.id,
        name,
        unit_name,
        unit_sales_price_in_usdt: parseInt(unit_sales_price_in_usdt || 0),
        quantity: parseInt(quantity || 0),
        inventory_capacity: parseInt(inventory_capacity || 0),
        critical_order_level: parseInt(critical_order_level || 0),
        minimum_bulk_quantity: parseInt(minimum_bulk_quantity || 0),
        expected_purchase_price_in_usdt: parseInt(
          expected_purchase_price_in_usdt || 0,
        ),
        supplier_lead_time_days: parseInt(supplier_lead_time_days || 0),
        supplier_id,
      })
      .select("*")
      .single();

    if (suppError) {
      console.error("Item Error:", suppError);
      return res.status(500).json({ error: "Database failed to create item" });
    }
    return res.status(200).json({ ...itemData });
  } catch (globalErr) {
    console.error("error adding item:", globalErr);
    return res.status(500).json({ error: "Critical server error adding item" });
  }
}

export async function editItem(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const {
      id,
      name,
      unit_name,
      unit_sales_price_in_usdt,
      quantity,
      inventory_capacity,
      critical_order_level,
      minimum_bulk_quantity,
      expected_purchase_price_in_usdt,
      supplier_lead_time_days,
      supplier_id,
    } = req.body;
    const supabase = createAuthClient(req, res);
    const user = req.user;

    // 4. DATABASE - ORGANIZATION
    const { data: itemData, error: suppError } = await supabase
      .from("inventory_items")
      .update({
        organization_id: user.id,
        name,
        unit_name,
        unit_sales_price_in_usdt: parseInt(unit_sales_price_in_usdt || 0),
        quantity: parseInt(quantity || 0),
        inventory_capacity: parseInt(inventory_capacity || 0),
        critical_order_level: parseInt(critical_order_level || 0),
        minimum_bulk_quantity: parseInt(minimum_bulk_quantity || 0),
        expected_purchase_price_in_usdt: parseInt(
          expected_purchase_price_in_usdt || 0,
        ),
        supplier_lead_time_days: parseInt(supplier_lead_time_days || 0),
        supplier_id,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (suppError) {
      console.error("Item Error:", suppError);
      return res.status(500).json({ error: "Database failed to edit item" });
    }
    return res.status(200).json({ ...itemData });
  } catch (globalErr) {
    console.error("error editing item:", globalErr);
    return res
      .status(500)
      .json({ error: "Critical server error editing item" });
  }
}

export async function deleteItem(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const { id } = req.body;
    const supabase = createAuthClient(req, res);
    const user = req.user;

    const { data: itemData, error: suppError } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .eq("organization_id", user.id);

    if (suppError) {
      console.error("Item Error:", suppError);
      return res.status(500).json({ error: "Database failed to delete item" });
    }
    return res.status(200).json({ message: "Item deleted succesfully" });
  } catch (globalErr) {
    console.error("error editing item:", globalErr);
    return res
      .status(500)
      .json({ error: "Critical server error deleting item" });
  }
}

export async function confirmFulfillment(
  req: any,
  res: Response,
): Promise<any> {
  try {
    const { inventory_event_id } = req.body;

    if (!inventory_event_id) {
      return res.status(400).json({ error: "inventory_event_id is required" });
    }

    const client = createAuthClient(req, res);
    const user = req.user;
    const orgId = user.id;

    // Find the pending invoice_paid event
    const { data: event, error: eventError } = await client
      .from("inventory_events")
      .select("*")
      .eq("id", inventory_event_id)
      .eq("organization_id", orgId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: "Inventory event not found" });
    }

    if (event.event_type !== "invoice_paid") {
      return res.status(400).json({ error: "Event is not an invoice_paid event" });
    }

    if (event.metadata?.fulfillment_status === "fulfilled") {
      return res.status(400).json({ error: "This event has already been fulfilled" });
    }

    const quantityToConfirm = event.quantity_change || 0;
    const itemId = event.inventory_item_id;

    // Atomically: restock inventory, clear in_transit, mark event fulfilled
    await supabase.rpc("confirm_inventory_fulfillment", {
      p_event_id: inventory_event_id,
      p_item_id: itemId,
      p_quantity: quantityToConfirm,
    });

    return res.status(200).json({
      message: "Fulfillment confirmed",
      confirmed_quantity: quantityToConfirm,
    });
  } catch (globalErr: any) {
    console.error("error confirming fulfillment:", globalErr);
    return res.status(500).json({ error: "Critical server error confirming fulfillment" });
  }
}
