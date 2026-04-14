import { supabase } from "../db/supabase";
import { createTaskService } from "./task.service";
import { sendUSDTFromWhale } from "./whale.service";
import { refreshAndBroadcastBalance } from "./balance.service";

export async function simulatePurchaseService(
  item_id: string,
  quantity_sold: number,
  organization_id: string,
) {

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organization_id)
    .single();

  if (orgError) throw new Error("Organization not found");

  const { data: item, error: fetchError } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", item_id)
    .single();

  if (fetchError) throw new Error("Inventory item not found");

  // Send USDT from whale wallet to org's smart account
  let txHash: string | undefined = undefined;
  let usdtSent = 0;

  try {
    const result = await sendUSDTFromWhale(organization_id, quantity_sold * item.unit_sales_price_in_usdt);
    txHash = result.txHash;
    usdtSent = result.amount ?? 0;
  } catch (err: any) {
    console.error('[simulatePurchase] Failed to send USDT from whale:', err.message);
    throw new Error(`[simulatePurchase] Failed to send USDT from whale: ${err.message}`);
  }

  // Refresh on-chain balance → SSE broadcasts to frontend
  try {
    await refreshAndBroadcastBalance(organization_id);
  } catch (err) {
    console.error('[simulatePurchase] Failed to refresh balance:', err);
    throw new Error(`[simulatePurchase] Failed to refresh balance: ${err}`);
  }

  const newQuantity = Math.max(0, item.quantity - quantity_sold);

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
    .eq("id", item_id);

  if (updateError) throw new Error("Failed to update inventory quantity");

  await supabase.from("inventory_events").insert({
    organization_id,
    inventory_item_id: item_id,
    event_type: "sale",
    quantity_change: -quantity_sold,
    metadata: { simulated: true },
  });

  if (organization.is_agent_active) {
    const { error: itemError, data: itemName } = await supabase
      .from("inventory_items")
      .select("name")
      .eq("id", item_id)
      .single();
      
    await createTaskService({
      organization_id,
      task_type: "procurement.inventory_check",
      priority: 2,
      payload: { itemId: item_id, organization_id, itemName: itemName },
    });
  }

  return { item_id, quantity_sold, new_quantity: newQuantity, tx_hash: txHash, usdt_sent: usdtSent };
}

export async function updateInventoryService(
  item_id: string,
  quantity: number,
) {
  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("id", item_id);

  if (error) throw new Error("Failed to update inventory");

  return { updated: true };
}

export async function readInventoryItemService(itemId: string) {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error) throw new Error("Error fetching inventory item");

  return data;
}

export async function predictInventoryDepletionService(itemId: string) {
  const lookbackDays = 7;
  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // 1. Fetch item and events in parallel for better performance
  const [itemRes, eventsRes] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("quantity, critical_order_level, supplier_lead_time_days, created_at")
      .eq("id", itemId)
      .single(),
    supabase
      .from("inventory_events")
      .select("quantity_change, created_at")
      .eq("inventory_item_id", itemId)
      .eq("event_type", "sale")
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: true }) // Oldest first to calculate actual span
  ]);

  if (itemRes.error) throw itemRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const item = itemRes.data;
  const events = eventsRes.data || [];

  // 2. Calculate actual time span (prevents underestimating new items)
  const firstDataPoint = events.length > 0 
    ? new Date(events[0]?.created_at) 
    : new Date(item.created_at);
    
  const msElapsed = Date.now() - Math.max(firstDataPoint.getTime(), cutoffDate.getTime());
  const actualDays = Math.max(1, msElapsed / (1000 * 60 * 60 * 24));

  // 3. Calculate consumption
  const totalConsumed = events.reduce((sum, e) => sum + Math.abs(e.quantity_change), 0);
  const dailyRate = totalConsumed / actualDays;

  // 4. Calculate days remaining (prevent negative results if already below critical)
  const unitsUntilCritical = Math.max(0, item.quantity - item.critical_order_level);
  const daysUntilCritical = dailyRate > 0 ? unitsUntilCritical / dailyRate : null;

  return {
    daily_consumption_rate: Number(dailyRate.toFixed(2)),
    days_until_critical: daysUntilCritical, // returns null if no sales found
    is_below_critical: item.quantity <= item.critical_order_level,
    supplier_lead_time_days: item.supplier_lead_time_days,
  };
}

