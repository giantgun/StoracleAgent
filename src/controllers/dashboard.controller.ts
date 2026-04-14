import type { Request, Response } from "express";
import { supabase } from "../db/supabase";
import { buildTerminalTask } from "../services/terminal-transformer";
import { fetchOrgUsdtBalance } from "../services/balance.service";

/**
 * GET /dashboard/data
 *
 * Single-call bootstrap endpoint that returns all data needed
 * to render the dashboard on initial load. After the initial load,
 * the SSE stream takes over for real-time updates.
 */
export async function getDashboardData(req: Request, res: Response) {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const orgId = user.id;

  // Fetch all bootstrap data in parallel
  const [
    orgResult,
    itemsResult,
    suppliersResult,
    notificationsResult,
    walletResult,
    pendingTasksResult,
    inTransitResult,
    agentLogsResult,
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).single(),
    supabase.from("inventory_items").select("*").eq("organization_id", orgId),
    supabase.from("suppliers").select("*").eq("organization_id", orgId),
    supabase.from("notifications").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("wallets").select("*").eq("organization_id", orgId).single(),
    supabase.from("agent_tasks").select("id, task_type").eq("organization_id", orgId).eq("status", "pending"),
    supabase.from("inventory_events").select("*").eq("organization_id", orgId).eq("event_type", "invoice_paid").order("created_at", { ascending: false }),
    supabase.from("agent_logs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
  ]);

  // Filter pending fulfillment orders
  const inTransitOrders = (inTransitResult.data ?? []).filter(
    (e: any) => e.metadata?.fulfillment_status === "pending"
  );

  // Build recent terminal tasks from agent logs
  const recentLogs = agentLogsResult.data ?? [];
  const logsByTask = new Map<string, any[]>();
  for (const log of recentLogs) {
    if (!logsByTask.has(log.task_id)) {
      logsByTask.set(log.task_id, []);
    }
    logsByTask.get(log.task_id)!.push(log);
  }

  const recentTerminalTasks = [];
  for (const [taskId, logs] of logsByTask.entries()) {
    const task = buildTerminalTask(logs, orgResult.data?.name ?? '');
    if (task) recentTerminalTasks.push(task);
  }

  // Sort tasks by timestamp (oldest first)
  recentTerminalTasks.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const profile = {
    org_name: orgResult.data?.name ?? "",
    org_id: orgId,
    first_name: orgResult.data?.first_name ?? "",
    last_name: orgResult.data?.last_name ?? "",
    business_email: orgResult.data?.business_email ?? "",
    smart_account_address: walletResult.data?.smart_account_address ?? "",
    is_agent_active: orgResult.data?.is_agent_active ?? false,
  };

  // If a smart account is configured, read the real on-chain balance
  const walletData = walletResult.data;
  let usdtBalance = walletData?.usdt_balance ?? 0;
  if (walletData?.smart_account_address) {
    try {
      usdtBalance = await fetchOrgUsdtBalance((req as any).user?.id);
    } catch (err) {
      console.error('[Dashboard] Failed to fetch on-chain balance:', err);
    }
  }

  const balances = {
    usdt_balance: usdtBalance,
    public_session_key_address: walletData?.public_session_key_address ?? "",
    non_custodial_wallet_address: walletData?.non_custodial_wallet_address ?? "",
  };

  return res.json({
    profile,
    balances,
    inventory_items: itemsResult.data ?? [],
    suppliers: suppliersResult.data ?? [],
    notifications: notificationsResult.data ?? [],
    in_transit_orders: inTransitOrders,
    pending_tasks_count: (pendingTasksResult.data ?? []).length,
    recent_terminal_tasks: recentTerminalTasks.slice(-100), // Most recent 10 tasks
  });
}
