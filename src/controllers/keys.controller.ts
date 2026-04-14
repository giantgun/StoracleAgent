import type { NextFunction, Response } from "express";
import { createAuthClient } from "../db/supabase";
import dotenv from "dotenv";
import { encryptKey } from "../utility/cryptography";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toRemoteSigner, RemoteSignerMode } from "@zerodev/remote-signer"
import { toECDSASigner } from "@zerodev/permissions/signers";

declare const fetch: any;
dotenv.config();

/**
 * GET /keys/session-key/address
 * Returns a session key's public address for this organization.
 * If the key already exists in the wallets table, returns the stored one (idempotent).
 * Otherwise generates a new EOA keypair, encrypts the private key, stores it,
 * and returns the public address for the frontend to approve.
 */
export async function getSessionKeyPublicAddress(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const user = req.user;
    const supabase = createAuthClient(req, res);

    // Check if a session key already exists for this org
    const { data: existingWallet, error: fetchError } = await supabase
      .from("wallets")
      .select("public_session_key_address, session_key_approval")
      .eq("organization_id", user?.id)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Fetch Error:", fetchError);
    }

    // If a session key exists, return it
    if (existingWallet?.public_session_key_address) {
      return res.status(200).json({
        public_session_key_address: existingWallet.public_session_key_address,
        session_key_approval: existingWallet.session_key_approval,
        source: "db",
      });
    }

    const sessionPrivateKey = generatePrivateKey()

    const sessionKeySigner = await toECDSASigner({
      signer: privateKeyToAccount(sessionPrivateKey),
    })

    const public_session_key_address = sessionKeySigner.account.address;

    // Store in wallets table
    const { error: dbError } = await supabase.from("wallets").update({
      public_session_key_address,
      encrypted_session_key: encryptKey(sessionPrivateKey),
    }).eq("organization_id", user?.id);

    if (dbError) {
      console.error("Org DB Error:", dbError);
      return res.status(500).json({ error: "Database failed to create session key" });
    }

    return res.status(200).json({
      public_session_key_address,
      session_key_approval: null,
      source: "generated",
    });
  } catch (globalErr) {
    console.error("Uncaught Crash:", globalErr);
    return res.status(500).json({ error: "Critical server error" });
  }
}

/**
 * POST /keys/session-key/approval
 * Receives the serialized permission string (approval) from the frontend
 * after the user has approved the session key on their Kernel account.
 */
export async function setSessionKeyApproval(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const user = req.user;
    const { session_key_approval, session_key_address } = req.body;

    if (!session_key_approval || !session_key_address) {
      return res.status(400).json({ error: "approval string and session address are required" });
    }

    const supabase = createAuthClient(req, res);

    const { error: dbError } = await supabase
      .from("wallets")
      .update({ session_key_approval: session_key_approval, public_session_key_address: session_key_address })
      .eq("organization_id", user?.id);

    if (dbError) {
      console.error("Approval DB Error:", dbError);
      return res.status(500).json({ error: "Failed to save session key approval" });
    }

    return res.status(200).json({ success: true });
  } catch (globalErr) {
    console.error("Uncaught Crash:", globalErr);
    return res.status(500).json({ error: "Critical server error" });
  }
}

export async function toggleAgentActiveForOrg(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  const { isAgentActive } = req.body;
  const user = req.user;
  const supabase = createAuthClient(req, res);

  const { error } = await supabase
    .from("organizations")
    .update({ is_agent_active: isAgentActive })
    .eq("id", user.id);

  if (error) {
    console.error("Toggle agent error:", error);
    return res.status(500).json({ error: "Failed to update agent status" });
  }

  return res.status(200).json({});
}
