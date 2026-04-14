/**
 * Whale Wallet Service — Used for simulated purchase flows.
 *
 * Sends USDT from a whale wallet (configured via WHALE_PRIVATE_KEY) to the
 * org's Kernel smart account to simulate revenue coming in from sales.
 */

import { supabase } from "../db/supabase";
import { createPublicClient, createWalletClient, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "../lib/chain";

const erc20Abi = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function getClients() {
  const whalePrivateKey = process.env.WHALE_PRIVATE_KEY as Hex | undefined;
  const usdtAddress = process.env.USDT_TOKEN_ADDRESS as Address | undefined;

  if (!whalePrivateKey) {
    return null;
  }
  if (!usdtAddress) {
    return null;
  }

  const whaleAccount = privateKeyToAccount(whalePrivateKey);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.CHAIN_RPC_URL || ""),
  });

  const whaleClient = createWalletClient({
    account: whaleAccount,
    chain: sepolia,
    transport: http(process.env.CHAIN_RPC_URL || ""),
  });

  return { whaleClient, publicClient, usdtAddress };
}

/**
 * Send USDT from the whale wallet to the org's smart account on Sepolia Testnet.
 * The amount is quantity_sold (i.e. $1 per unit as a minimum revenue simulation).
 * Returns the USDT amount sent and transaction hash.
 */
export async function sendUSDTFromWhale(
  organizationId: string,
  quantity: number,
): Promise<{ success: boolean; txHash?: string; amount?: number }> {
  const clients = getClients();
  if (!clients) {
    console.error("[WhaleService] WHALE_PRIVATE_KEY or USDT_TOKEN_ADDRESS not configured");
    return { success: false };
  }

  const { whaleClient, publicClient, usdtAddress } = clients;

  // Get the org's smart account address
  const { data: wallet } = await supabase
    .from("wallets")
    .select("smart_account_address")
    .eq("organization_id", organizationId)
    .single();

  if (!wallet?.smart_account_address) {
    console.error("[WhaleService] No smart account configured for org", organizationId);
    return { success: false };
  }

  const toAddress = wallet.smart_account_address as Address;
  const usdtAmount = quantity;
  const parsedAmount = parseUnits(usdtAmount.toString(), 6);

  const txHash = await whaleClient.writeContract({
    address: usdtAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [toAddress, parsedAmount],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    success: true,
    txHash,
    amount: usdtAmount,
  };
}
