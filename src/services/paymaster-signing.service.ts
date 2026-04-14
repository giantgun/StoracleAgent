import { supabase } from "../db/supabase";
import dotenv from "dotenv";
import { createPublicClient, http, parseUnits, defineChain } from "viem";
import type { Hex, Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  createKernelAccountClient,
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
 * Paymaster signing service for sponsored transactions.
 * Auto-accepts sponsorship requests from authenticated users.
 * Signs UserOperation hashes using the verifying signer's private key.
 */
export async function paymasterSignUserOp(
  organizationId: string,
  userOp: any, // UserOperation structure
  entryPointAddress: Address,
  chainId: number
): Promise<{ signature: Hex }> {
  // Verify the organization exists and is authenticated
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .single();

  if (orgError || !org) {
    throw new Error("Organization not found or not authenticated");
  }

  // Get the verifying signer private key from environment
  const verifyingSignerPrivateKey = process.env.PAYMASTER_VERIFYING_SIGNER_PRIVATE_KEY;
  if (!verifyingSignerPrivateKey) {
    throw new Error("PAYMASTER_VERIFYING_SIGNER_PRIVATE_KEY is not set in environment");
  }

  // Create the verifying signer account
  const verifyingSigner = privateKeyToAccount(verifyingSignerPrivateKey as Hex);

  // Import required libraries for signing
  const { ethers } = await import("ethers");
  const { Signature } = await import("@ethersproject/bytes");
  const { keccak256, defaultAbiCoder } = await import("@ethersproject/solidity");
  const { recoverAddress } = await import("@ethersproject/signing-key");

  // Calculate the hash to sign (based on ERC-4337 specification)
  // This follows the same pattern as in VerifyingPaymaster.sol
  const sender = userOp.sender;
  const nonce = userOp.nonce;
  const initCode = userOp.initCode || "0x";
  const callData = userOp.callData;
  const accountGasLimits = userOp.accountGasLimits || "0x";
  const preVerificationGas = userOp.preVerificationGas || "0x";
  const gasFees = userOp.gasFees || "0x";

  // Convert values to appropriate types if needed
  const senderAddr = typeof sender === "string" ? sender as Address : sender;
  const nonceBigInt = typeof nonce === "string" ? BigInt(nonce) : nonce;
  const initCodeHex = typeof initCode === "string" ? initCode : "0x";
  const callDataHex = typeof callData === "string" ? callData : "0x";
  const accountGasLimitsHex = typeof accountGasLimits === "string" ? accountGasLimits : "0x";
  const preVerificationGasBigInt = typeof preVerificationGas === "string" ? BigInt(preVerificationGas) : preVerificationGas;
  const gasFeesHex = typeof gasFees === "string" ? gasFees : "0x";

  // Calculate the hash (same as VerifyingPaymaster.getHash)
  const hash = keccak256(
    defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "address",
        "uint48",
        "uint48"
      ],
      [
        senderAddr,
        nonceBigInt,
        keccak256(initCodeHex),
        keccak256(callDataHex),
        accountGasLimitsHex,
        preVerificationGasBigInt,
        gasFeesHex,
        BigInt(chainId),
        entryPointAddress,
        BigInt(Math.floor(Date.now() / 1000) + 3600), // validUntil: 1 hour from now
        BigInt(Math.floor(Date.now() / 1000) - 3600)   // validAfter: 1 hour ago
      ]
    )
  );

  // Sign the hash with the verifying signer's private key
  const signature = await verifyingSigner.signMessage({ data: hash });

  return { signature };
}

/**
 * Alternative simpler signing method using viem directly
 */
export async function paymasterSignUserOpViem(
  organizationId: string,
  userOp: any,
  entryPointAddress: Address
): Promise<{ signature: Hex }> {
  // Verify authentication
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .single();

  if (orgError || !org) {
    throw new Error("Organization not found or not authenticated");
  }

  // Get verifying signer
  const verifyingSignerPrivateKey = process.env.PAYMASTER_VERIFYING_SIGNER_PRIVATE_KEY;
  if (!verifyingSignerPrivateKey) {
    throw new Error("PAYMASTER_VERIFYING_SIGNER_PRIVATE_KEY is not set in environment");
  }

  const verifyingSigner = privateKeyToAccount(verifyingSignerPrivateKey as Hex);

  // Create hash using viem utilities
  const { getUserOperationHash } = await import("viem/account-abstraction");

  // For now, we'll use a simplified approach - in practice this should match
  // what the VerifyingPaymaster contract expects to validate
  const hash = await getUserOperationHash({
    ...userOp,
    entryPoint: entryPointAddress,
    // We'll set a dummy paymasterAndData for hash calculation
    // The actual paymasterAndData will be filled in by the frontend with our signature
    paymasterAndData: "0x" // placeholder
  }, entryPointAddress);

  // Sign the hash
  const signature = await verifyingSigner.signMessage({ data: hash });

  return { signature };
}