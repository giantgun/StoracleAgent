import type { NextFunction, Request, Response } from "express";
import { createAuthClient } from "../db/supabase";
import dotenv from "dotenv";

declare const fetch: any;
dotenv.config();

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function validateEthAddress(addr: string): string | null {
  if (!addr || !ETH_ADDRESS_RE.test(addr)) {
    return "Wallet address must be a valid 42-character hex address (0x...)";
  }
  return null;
}

export async function addSupplier(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const { supplierEmail, supplierWallet, supplierName } = req.body;
    const supabase = createAuthClient(req, res);
    const user = req.user;

    const addressError = validateEthAddress(supplierWallet);
    if (addressError) {
      return res.status(400).json({ error: addressError });
    }

    // 4. DATABASE - ORGANIZATION
    const { data: supplierData, error: suppError } = await supabase
      .from("suppliers")
      .insert({
        organization_id: user.id,
        name: supplierName,
        email: supplierEmail,
        non_custodial_wallet_address: supplierWallet,
      })
      .select("*")
      .single();

    if (suppError) {
      console.error("Supplier Error:", suppError);
      return res
        .status(500)
        .json({ error: "Database failed to create supplier" });
    }
    return res.status(200).json({ ...supplierData });
  } catch (globalErr) {
    console.error("error adding supplier:", globalErr);
    return res
      .status(500)
      .json({ error: "Critical server error adding supplier" });
  }
}

export async function editSupplier(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const { supplierEmail, supplierWallet, supplierName, supplierId } =
      req.body;
    const supabase = createAuthClient(req, res);
    const user = req.user;

    if (supplierWallet) {
      const addressError = validateEthAddress(supplierWallet);
      if (addressError) {
        return res.status(400).json({ error: addressError });
      }
    }

    // 4. DATABASE - ORGANIZATION
    const { data: supplierData, error: suppError } = await supabase
      .from("suppliers")
      .update({
        name: supplierName,
        email: supplierEmail,
        non_custodial_wallet_address: supplierWallet,
      })
      .eq("id", supplierId)
      .select("*")
      .single();

    if (suppError) {
      console.error("Supplier Error:", suppError);
      return res
        .status(500)
        .json({ error: "Database failed to edit supplier" });
    }
    return res.status(200).json({ ...supplierData });
  } catch (globalErr) {
    console.error("error editing supplier:", globalErr);
    return res
      .status(500)
      .json({ error: "Critical server error editing supplier" });
  }
}

export async function deleteSupplier(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const { supplierId } = req.body;
    const supabase = createAuthClient(req, res);
    const user = req.user;

    const { data, error } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("supplier_id", supplierId)
      .eq("organization_id", user.id)
      .limit(1);

    if (error) {
      return res.status(500).json({ error: "Failed to check supplier dependencies" });
    }

    if (data && data.length > 0) {
      return res
        .status(400)
        .json({ error: "Remove the supplier from inventory items before deleting" });
    }

    const { data: supplierData, error: suppError } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", supplierId)
      .eq("organization_id", user.id);

    if (suppError) {
      console.error("Supplier Error:", suppError);
      return res
        .status(500)
        .json({ error: "Database failed to delete supplier" });
    }
    return res.status(200).json({ message: "Supplier deleted succesfully" });
  } catch (globalErr) {
    console.error("error editing supplier:", globalErr);
    return res
      .status(500)
      .json({ error: "Critical server error deleting supplier" });
  }
}
