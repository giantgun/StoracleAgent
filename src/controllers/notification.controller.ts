/**
 * Notification controller — manage notification read state.
 */

import type { Request, Response } from "express";
import { supabase } from "../db/supabase";

/**
 * PATCH /notifications/:id/read
 * Marks a notification as read for the authenticated user's organization.
 */
export async function markNotificationAsRead(req: Request, res: Response): Promise<void> {
  const orgId = (req as any).user?.id;
  if (!orgId) {
    res.status(401).json({ error: "Unauthorized" });
    return
  }

  const { id } = req.params;

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return
  }

  res.json({ success: true });
  return 
}
