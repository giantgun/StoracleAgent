import { supabase } from "../db/supabase";
import dotenv from "dotenv";
import { createPublicClient, http, parseUnits, defineChain, encodeFunctionData, erc20Abi, getContract } from "viem";
import type { Hex, Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { decryptKey } from "../utility/cryptography";
import { verifySupplierOnChain } from "./supplier-verification.service";
import { refreshAndBroadcastBalance } from "./balance.service";

dotenv.config();

import { sepolia } from "../lib/chain";

const entryPoint = getEntryPoint("0.7");
const chain = sepolia;

/**
 * Pay a supplier by submitting a USDT transfer user operation through ZeroDev.
 * Uses the organization's session key + stored approval string to sign on behalf
 * of the org's Kernel smart account.
 *
 * Pulls BUNDLER_URL and CHAIN_RPC_URL from .env for easy swapping between
 * local Alto, remote bundler, or any future provider.
 */
export async function paySupplierService(
  organizationId: string,
  supplierAddress: string,
  amount: number,
  inventoryItemId: string,
  quantity: number,
) {

  const usdtTokenAddress = process.env.USDT_TOKEN_ADDRESS;
  if (!usdtTokenAddress) {
    throw new Error("USDT_TOKEN_ADDRESS is not set in environment");
  }

  // Gate 4: On-chain supplier verification via Zerodev session policy
  const verification = await verifySupplierOnChain(organizationId, supplierAddress);
  if (!verification.verified) {
    throw new Error(`Supplier verification failed: ${verification.error}`);
  }

  // We now only need the Project ID from ZeroDev dashboard
  const zerodevRpc = process.env.ZERODEV_RPC;
  if (!zerodevRpc) throw new Error("ZERODEV_RPC not set");

  const tx = await sendUSDT(
    organizationId,
    supplierAddress as Address,
    amount,
    zerodevRpc, // Passing ZeroDev RPC URL instead of Project ID
    usdtTokenAddress as Address,
  );


  await supabase.from("crypto_transactions").insert({
    type: "supplier_payment",
    blockchain_tx_hash: tx,
    organization_id: organizationId,
  });

  // Look up the invoice record for this item
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("inventory_item_id", inventoryItemId)
    .eq("status", "pending")
    .order("received_at", { ascending: false })
    .limit(1)
    .single();

  // Record invoice_paid event, increment in_transit, mark invoice paid
  await supabase.rpc("record_supplier_payment", {
    p_organization_id: organizationId,
    p_inventory_item_id: inventoryItemId,
    p_quantity: quantity,
    p_amount: amount,
    p_tx_hash: tx,
    p_supplier_id: null,
    p_invoice_id: invoice?.id ?? null,
  });

  return {
    quantity: quantity,
    amount: amount,
    tx_hash: tx,
    invoice_id: invoice?.id ?? null,
  };
}

async function sendUSDT(
  organizationId: string,
  supplierAddress: Address,
  amount: number,
  zerodevRpc: string,
  usdtTokenAddress: Address,
): Promise<string> {
  const { data: wallet } = await supabase
    .from("wallets")
    .select("encrypted_session_key, session_key_approval, public_session_key_address")
    .eq("organization_id", organizationId)
    .single();

  // if (!wallet?.session_key_approval) throw new Error("No session key found");

  const sessionKeyPrivateKey = decryptKey(wallet!.encrypted_session_key) as Hex;

  console.log("Decrypted session private key:", sessionKeyPrivateKey);

  // Use ZeroDev hosted endpoints
  const bundlerUrl = zerodevRpc;
  const paymasterUrl = zerodevRpc;

  // const apiKey = process.env.ZERODEV_API_KEY;
  // if (!apiKey) {
  //   throw new Error("ZERODEV_API_KEY is not set in environment");
  // }

  const publicClient = createPublicClient({
    transport: http(bundlerUrl),
    chain,
  });

  const sessionKeySigner = await toECDSASigner({
    signer: privateKeyToAccount(sessionKeyPrivateKey)
  })


  // const sessionKeySigner = await toECDSASigner({ signer: privateKeyToAccount(sessionKeyPrivateKey) });

  const permissionAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_V3_1,
    wallet!.session_key_approval,
    sessionKeySigner,
  );


  console.log("Using Account:", permissionAccount.address)

  // Create managed Paymaster Client
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterUrl),
  });

  // Create Kernel Client with automated Paymaster middleware
  const kernelClient = createKernelAccountClient({
    account: permissionAccount,
    chain: sepolia,
    bundlerTransport: http(bundlerUrl),
    paymaster: paymasterClient,
  });

  // const contract = getContract({
  //   address: usdtTokenAddress as `0x${string}`,
  //   abi: erc20Abi,
  //   client: {
  //     public: publicClient,
  //     wallet: kernelClient,
  //   }
  // })

  // const hash = await contract.write.transfer([supplierAddress as `0x${string}`, parseUnits(amount.toString(), 6)]);

  // The SDK now handles: encoding, gas estimation, paymaster signing, and submission
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await permissionAccount.encodeCalls([{
      to: usdtTokenAddress as `0x${string}`,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [supplierAddress, parseUnits(amount.toString(), 6)],
      }),
    }]),
  });

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  try{
    await refreshAndBroadcastBalance(organizationId);
  }
  catch(err){
    console.error("Failed to refresh balance:", err);
  }

  return receipt.receipt.transactionHash;
  // return hash;
}
