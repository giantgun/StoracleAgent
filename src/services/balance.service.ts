/**
 * Balance Service — On-chain USDT balance for Kernel smart accounts.
 *
 * The `wallets.usdt_balance` column is a cache. The real balance lives
 * on-chain as the USDT balance of the org's Kernel smart account address.
 *
 * This service:
 * 1. Reads USDT balance from blockchain using `balanceOf(kernelAccountAddress)`
 * 2. Updates the cached `wallets.usdt_balance` column
 * 3. Broadcasts the new balance via SSE
 */

import { createPublicClient, http, defineChain, formatUnits, type Address } from "viem";
import { supabase } from "../db/supabase";
import { sseService } from "./sse.service";

// ============================================================
// Chain & Token Configuration
// ============================================================

import { sepolia } from "../lib/chain";

const usdtTokenAddress = process.env.USDT_TOKEN_ADDRESS;
if (!usdtTokenAddress) {
  console.error("[BalanceService] USDT_TOKEN_ADDRESS is not set — on-chain balance reads will fail");
}

// Minimal ERC-20 ABI — just balanceOf
const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

// Public client for reading blockchain state
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.CHAIN_RPC_URL || ""),
});

// ============================================================
// Core Functions
// ============================================================

/**
 * Read the on-chain USDT balance for a given smart account address.
 */
export async function getOnChainUsdtBalance(accountAddress: Address): Promise<number> {
  if (!usdtTokenAddress) return 0;

  const balance = await publicClient.readContract({
    address: usdtTokenAddress as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accountAddress],
  });

  // USDT uses 6 decimals
  return Number(formatUnits(balance, 6));
}

/**
 * Get the org's Kernel smart account address from the stored approval string.
 *
 * The serialized approval string encodes the account address. When saved,
 * we also store it separately in `smart_account_address` for easy access.
 * For now, if smart_account_address is set, we use it. Otherwise we return null.
 */
async function getOrgSmartAccountAddress(orgId: string): Promise<Address | null> {
  const { data: wallet } = await supabase
    .from("wallets")
    .select("smart_account_address")
    .eq("organization_id", orgId)
    .single();

  return (wallet?.smart_account_address as Address) || null;
}

/**
 * Fetch the real on-chain USDT balance for an org's smart account.
 * Falls back to 0 if no smart account is configured.
 */
export async function fetchOrgUsdtBalance(orgId: string): Promise<number> {
  const accountAddress = await getOrgSmartAccountAddress(orgId);
  if (!accountAddress) {
    // No smart account configured yet — return cached DB balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("usdt_balance")
      .eq("organization_id", orgId)
      .single();
    return wallet?.usdt_balance ?? 0;
  }

  try {
    const onChainBalance = await getOnChainUsdtBalance(accountAddress);

    // Update the cached balance in the database
    await supabase
      .from("wallets")
      .update({ usdt_balance: onChainBalance })
      .eq("organization_id", orgId);

    return onChainBalance;
  } catch (err) {
    console.error(`[BalanceService] Failed to read on-chain balance for ${accountAddress}:`, err);
    // Fall back to cached DB balance on error
    const { data: wallet } = await supabase
      .from("wallets")
      .select("usdt_balance")
      .eq("organization_id", orgId)
      .single();
    return wallet?.usdt_balance ?? 0;
  }
}

/**
 * Refresh and broadcast the org's on-chain USDT balance.
 * Call this after any event that changes the balance (payment, purchase, etc.)
 */
export async function refreshAndBroadcastBalance(orgId: string): Promise<void> {
  const balance = await fetchOrgUsdtBalance(orgId);

  sseService.broadcastEvent(orgId, "dashboard_update", {
    type: "balance_update",
    usdt_balance: balance,
  });
}
