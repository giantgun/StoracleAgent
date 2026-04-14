import type { NextFunction, Request, Response } from "express";
import { createAuthClient } from "../db/supabase";
import { AgentMailClient } from "agentmail";
import type { CustomRequest } from "../../custom";

const mailClient = new AgentMailClient({
  apiKey: process.env.AGENT_MAIL_API_KEY,
});

export async function signup(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const {
      businessName,
      businessEmail,
      walletAddress,
      signedMessage,
      message,
      firstName,
      lastName,
    } = req.body;
    const supabase = createAuthClient(req, res);

    // 2. SUPABASE AUTH
    const { data, error: authError } = await supabase.auth.signInWithWeb3({
      chain: "ethereum",
      message: message,
      signature: signedMessage,
    });

    if (authError) {
      console.error("Supabase Auth Error:", authError);
      return res.status(401).json({ error: "Sign Up failed" });
    }

    // 3. PRECHECK: reject if the user already has a completed org record
    const { data: existingOrg } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", data.user?.id)
      .not("name", "is", null)
      .maybeSingle();

    if (existingOrg) {
      return res.status(409).json({ error: "An account already exists. Please sign in instead." });
    }

    // 2. MAIL CLIENT (INBOX)
    const agentEmail =
      businessName.toLowerCase().replace(/\s+/g, "") + Math.random().toString(36).substring(2, 7);
    const newInbox = await mailClient.inboxes.create({
      username: agentEmail,
      displayName: businessName,
    });

    // 4. DATABASE - ORGANIZATION
    const { data: orgData, error: dbError } = await supabase
      .from("organizations")
      .update({
        name: businessName,
        business_email: businessEmail,
        agent_inbox_id: newInbox.inboxId,
        first_name: firstName,
        last_name: lastName,
      })
      .eq("id", data.user?.id)
      .select("*")

    if (dbError) {
      console.error("Org DB Error:", dbError);
      return res
        .status(500)
        .json({ error: "Database failed to create organization" });
    }

    // 5. DATABASE - WALLET
    const { error: walletErr } = await supabase.from("wallets").insert({
      non_custodial_wallet_address: walletAddress,
      organization_id: data.user?.id,
    });

    if (walletErr) {
      console.error("Wallet DB Error:", walletErr);
      return res.status(500).json({ error: "Database failed to link wallet" });
    }

    // SUCCESS
    return res.status(200).json({ ...data });
  } catch (globalErr) {
    console.error("Uncaught Signup Crash:", globalErr);
    return res
      .status(500)
      .json({ error: "Critical server error during signup" });
  }
}

export async function signin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> {
  const { message, signedMessage } = req.body;
  const supabase = createAuthClient(req, res);
  
  const { data, error: authError } = await supabase.auth.signInWithWeb3({
    chain: "ethereum",
    message: message,
    signature: signedMessage,
  });

  if (authError) {
    console.error("Supabase Auth Error:", authError);
    return res.status(401).json({ error: "Authentication failed" });
  }

  // Verify the user has a completed org record (the trigger creates an empty one with null fields)
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", data.user?.id)
    .not("name", "is", null)
    .maybeSingle();

  if (orgError) {
    console.warn("Signin rejected — no account found for user:", data.user?.id);
    console.log(orgError, org)
    return res.status(403).json({ error: "No account found. Please sign up first." });
  }

  return res.status(200).json({ ...data });
}

export async function signout(
  _: Request,
  res: Response,
  next: NextFunction,
): Promise<any> {
  const supabase = createAuthClient(_, res);
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Error signing out user:", error);
    return res.status(500).json({ error: "Error signing out user" });
  }

  res.status(200).json({ message: "User signed out successfully" });
}

export async function checkAuthentication(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> {
  const authHeader = req.headers.authorization;
  const token = authHeader
    ? authHeader.split(" ")[1]
    : req.cookies["access_token"];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const supabase = createAuthClient(req, res);

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.clearCookie("access_token", { path: "/", httpOnly: true });
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.clearCookie("access_token", { path: "/", httpOnly: true });
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

export async function checkAuthenticationForEvents(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> {
  const token = req.cookies['access-token'] || req.query.access_token;


  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const supabase = createAuthClient(req, res);

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.clearCookie("access_token", { path: "/", httpOnly: true });
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.clearCookie("access_token", { path: "/", httpOnly: true });
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

export async function updateOrg(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const { businessName, businessEmail, firstName, lastName } = req.body;
    const user = req.user;
    const supabase = createAuthClient(req, res);

    // 4. DATABASE - ORGANIZATION
    const { data: orgData, error: dbError } = await supabase
      .from("organizations")
      .update({
        name: businessName,
        business_email: businessEmail,
        first_name: firstName,
        last_name: lastName,
      })
      .eq("id", user?.id)
      .select("*")
      .single();

    if (dbError) {
      console.error("Org DB Error:", dbError);
      return res
        .status(500)
        .json({ error: "Database failed to update organization" });
    }

    // SUCCESS
    return res.status(200).json({ ...orgData });
  } catch (globalErr) {
    console.error("Uncaught Crash:", globalErr);
    return res.status(500).json({ error: "Critical server error" });
  }
}

export async function orgData(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const user = req.user;
    const supabase = createAuthClient(req, res);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // 4. DATABASE - ORGANIZATION
    const { data: orgData, error: dbError } = await supabase
      .from("organizations")
      .select(
        `
      *,
      notifications (*),
      inventory_items (*),
      suppliers (*),
      agent_logs (*),
      wallets (
        id,
        organization_id,
        public_session_key_address,
        non_custodial_wallet_address,
        usdt_balance,
        created_at
      )
    `,
      )
      .eq("id", user.id)
      .gte("agent_logs.created_at", oneHourAgo)
      .single();

    if (dbError) {
      console.error("Org DB Error:", dbError);
      return res
        .status(500)
        .json({ error: "Database failed to update organization" });
    }

    return res.status(200).json({ ...orgData });
  } catch (globalErr) {
    console.error("Uncaught Crash:", globalErr);
    return res.status(500).json({ error: "Critical server error" });
  }
}
