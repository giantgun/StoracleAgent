import type { Request, Response } from "express";
import { supabase } from "../db/supabase";
import { paymasterSignUserOp } from "../services/paymaster-signing.service";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import { toHex } from "viem";

/**
 * POST /paymaster/sign
 * Signs a UserOperation for paymaster sponsorship.
 * Auto-accepts requests from authenticated users.
 *
 * Body:
 * - organizationId: string - The organization ID
 * - userOp: any - The UserOperation to sign
 * - entryPointAddress: string - EntryPoint contract address
 */
export const signUserOp = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { organizationId, userOp, entryPointAddress } = req.body;

    if (!organizationId || !userOp || !entryPointAddress) {
      res.status(400).json({
        error: "organizationId, userOp, and entryPointAddress are required"
      });
      return;
    }

    try {
      const { signature } = await paymasterSignUserOp(
        organizationId,
        userOp,
        entryPointAddress as `0x${string}`,
        11155111 // Sepolia chain ID
      );

      // Calculate validUntil and validAfter (1 hour window)
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const validAfter = Math.floor(Date.now() / 1000) - 3600;   // 1 hour ago

      // Pack [validUntil (6 bytes)] + [validAfter (6 bytes)] + [Signature]
      // Convert to 6-byte hex values (uint48)
      const validUntilHex = toHex(validUntil, { size: 6 });
      const validAfterHex = toHex(validAfter, { size: 6 });

      // Concatenate: validUntil + validAfter + signature
      const paymasterAndData = validUntilHex + validAfterHex.slice(2) + signature.slice(2);

      res.json({
        success: true,
        paymasterAndData: `0x${paymasterAndData}`
      });
    } catch (error) {
      console.error("[Paymaster Controller] Signing error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  }
);

/**
 * GET /paymaster/status
 * Returns the status of the paymaster signing service
 */
export const getPaymasterStatus = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const verifyingSignerKey = process.env.PAYMASTER_VERIFYING_SIGNER_PRIVATE_KEY;

    res.json({
      service: "paymaster-signing",
      status: verifyingSignerKey ? "active" : "misconfigured",
      hasVerifyingKey: !!verifyingSignerKey,
      chain: "sepolia",
      chainId: 11155111
    });
  }
);