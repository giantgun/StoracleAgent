/**
 * Wallet controller — manages Zerodev session key approval and policy config.
 */

import type { Request, Response } from "express";
import { supabase } from "../db/supabase";
import { verifyAllSuppliersForOrg } from "../services/supplier-verification.service";
import { refreshAndBroadcastBalance } from "../services/balance.service";

/**
 * POST /wallet/session-approval
 * Saves the Zerodev session approval string and policy config to the org's wallet record.
 *
 * Body:
 * - session_key_approval: string — serialized permission account from frontend
 * - session_key_address: string — address of the session key EOA
 * - smart_account_address: string — the Kernel smart account address
 * - policy_config?: object — supplier whitelist, spend caps, rate limits, expiry
 */
export async function saveSessionApproval(req: Request, res: Response) {
  const orgId = (req as any).user?.id;
  if (!orgId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { session_key_approval, session_key_address, smart_account_address, policy_config } = req.body;
      // !session_key_approval ||
  if (!session_key_approval || !session_key_address || !policy_config || !smart_account_address) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  const { error, } = await supabase
    .from("wallets")
    .update({
      session_key_approval,
      public_session_key_address: session_key_address,
      smart_account_address,
      policy_config,
    })
    .eq("organization_id", orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Mark all suppliers for this org as verified/unverified
  await verifyAllSuppliersForOrg(orgId);

  res.json({ success: true });
}

/**
 * GET /wallet/session-status
 * Returns the current session key status for the org.
 */
export async function getSessionStatus(_req: Request, res: Response): Promise<void> {
  const orgId = (_req as any).user?.id as string | undefined;
  if (!orgId) {
    res.status(401).json({ error: "Unauthorized" });
    return ;
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("public_session_key_address, session_key_approval, policy_config")
    .eq("organization_id", orgId)
    .single();

  const hasActiveSession = !!wallet?.session_key_approval;
  const expiry = (wallet?.policy_config as Record<string, unknown> | null)?.expiry_timestamp as
    | number
    | undefined;
  const isExpired = expiry ? Math.floor(Date.now() / 1000) > expiry : false;

  res.json({
    has_active_session: hasActiveSession && !isExpired,
    session_key_address: wallet?.public_session_key_address ?? null,
    expiry_timestamp: expiry ?? null,
    is_expired: isExpired,
  });
}

/**
 * POST /wallet/session-revoke
 * Clears the Zerodev session approval and policy config, and deactivates the agent.
 */
export async function revokeSessionApproval(req: Request, res: Response) {
  const orgId = (req as any).user?.id;
  if (!orgId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { error: walletErr } = await supabase
    .from("wallets")
    .update({
      session_key_approval: null,
      policy_config: null,
    })
    .eq("organization_id", orgId);

  if (walletErr) {
    res.status(500).json({ error: walletErr.message });
    return;
  }

  await supabase
    .from("organizations")
    .update({ is_agent_active: false })
    .eq("id", orgId);

  res.json({ success: true });
}

/**
 * GET /wallet/balance
 * Reads the on-chain USDT balance and returns it to the caller.
 */
export async function getWalletBalance(req: Request, res: Response): Promise<void> {
  const orgId = (req as any).user?.id;
  if (!orgId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const balance = await refreshAndBroadcastBalance(orgId);
    res.json({ usdt_balance: balance });
  } catch (err) {
    console.error("[wallet.controller] Balance fetch error:", err);
    res.status(500).json({ error: "Failed to fetch on-chain balance" });
  }
}
