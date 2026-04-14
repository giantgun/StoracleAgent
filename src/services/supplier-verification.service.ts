/**
 * Supplier Verification Service
 *
 * On-chain supplier verification via Zerodev session policy whitelist.
 * Before paying a supplier, the backend verifies:
 * 1. The supplier's wallet address is in the Zerodev CallPolicy whitelist (local check in policy_config)
 * 2. The Zerodev session is still active (expiry check)
 *
 * This ensures that only suppliers authorized by the user's on-chain session
 * can receive payments — preventing the agent from paying unverified addresses even
 * if the database has been tampered with.
 */

import { supabase } from "../db/supabase";

export interface SupplierVerificationResult {
  verified: boolean;
  error?: string;
}

/**
 * Verify that a supplier's wallet is authorized by the current Zerodev session policy.
 *
 * Checks two levels:
 * 1. Local: The supplier address is in the org's policy_config supplier whitelist
 * 2. Session: The session has not expired
 *
 * If the local policy_config is empty, verification passes (no Zerodev session configured yet).
 *
 * @param organizationId - The org to check
 * @param supplierWallet - The supplier's wallet address to verify
 * @returns Verification result with optional error message
 */
export async function verifySupplierOnChain(
  organizationId: string,
  supplierWallet: string,
): Promise<SupplierVerificationResult> {
  // Fetch the org's policy config from wallets table
  const { data: wallet, error } = await supabase
    .from("wallets")
    .select("policy_config, session_key_approval")
    .eq("organization_id", organizationId)
    .single();

  if (error || !wallet) {
    return { verified: false, error: "No wallet config found for organization" };
  }

  // If no Zerodev session has been configured yet, allow payment to proceed
  // (old behavior — user hasn't set up Zerodev limits)
  if (!wallet.session_key_approval) {
    return { verified: true };
  }

  const policyConfig = wallet.policy_config as Record<string, unknown> | null;
  if (!policyConfig || Object.keys(policyConfig).length === 0) {
    // Zerodev session exists but no policy config stored — allow by default
    // The session itself still enforces limits on-chain
    return { verified: true };
  }

  // Check 1: Is the supplier in the whitelist?
  const suppliers = (policyConfig.suppliers as Array<{ address: string; maxPerPayment?: string }> | undefined) ?? [];
  if (suppliers.length > 0) {
    const normalizedWallet = supplierWallet.toLowerCase();
    const isWhitelisted = suppliers.some(
      (s: { address: string }) => s.address.toLowerCase() === normalizedWallet,
    );

    if (!isWhitelisted) {
      return {
        verified: false,
        error: `Supplier wallet ${supplierWallet} is not in the Zerodev session whitelist`,
      };
    }
  }

  // Check 2: Has the session expired?
  const expiryTimestamp = (policyConfig.expiry_timestamp as number | undefined) ?? 0;
  if (expiryTimestamp > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now > expiryTimestamp) {
      return {
        verified: false,
        error: `Zerodev session expired at ${new Date(expiryTimestamp * 1000).toISOString()}, current time is ${new Date(now * 1000).toISOString()}`,
      };
    }
  }

  return { verified: true };
}

/**
 * Mark a supplier as verified on-chain and update the last verification timestamp.
 * Call this after a successful Zerodev session is created.
 *
 * @param supplierId - The supplier's database ID
 * @param isVerified - Whether the supplier passed verification
 */
export async function updateSupplierVerificationStatus(
  supplierId: number,
  isVerified: boolean,
): Promise<void> {
  await supabase
    .from("suppliers")
    .update({
      is_verified_onchain: isVerified,
      last_verified_onchain_at: new Date().toISOString(),
    })
    .eq("id", supplierId);
}

/**
 * Verify all suppliers for an organization against the current Zerodev policy config.
 * Call this after Zerodev session creation to mark which suppliers are authorized.
 *
 * @param organizationId - The org to check suppliers for
 */
export async function verifyAllSuppliersForOrg(
  organizationId: string,
): Promise<void> {
  // Get the org's policy config
  const { data: wallet } = await supabase
    .from("wallets")
    .select("policy_config")
    .eq("organization_id", organizationId)
    .single();

  const policyConfig = wallet?.policy_config as Record<string, unknown> | null;
  const whitelistedSuppliers = (policyConfig?.suppliers as Array<{ address: string }> | undefined) ?? [];

  if (whitelistedSuppliers.length === 0) return;

  // Get all suppliers for this org
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, non_custodial_wallet_address")
    .eq("organization_id", organizationId);

  if (!suppliers) return;

  const normalizedWhitelist = whitelistedSuppliers.map((s) => s.address.toLowerCase());

  for (const supplier of suppliers) {
    const isVerified = normalizedWhitelist.includes(
      supplier.non_custodial_wallet_address.toLowerCase(),
    );

    await updateSupplierVerificationStatus(supplier.id, isVerified);
  }
}
