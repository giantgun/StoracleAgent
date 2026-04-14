import { supabase } from "../db/supabase";

export async function createNotificationService(
  orgId: string,
  title: string,
  message: string,
) {
  const { data, error } = await supabase
    .from("notifications")
    .insert([
      {
        organization_id: orgId,
        title: title,
        message: message,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error(`Failed to create notification: ${error.message}`);
    throw new Error(`Notification Error: ${error.message}`);
  }

  return data;
}

export async function getNotificationsService(
  orgId: string,
  unreadOnly = false,
) {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", orgId);

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { error, data } = await query;
  if (error) {
    throw new Error("Error fetching notifications");
  }
  return data;
}

export async function markNotificationReadService(id: string) {
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

export async function auditLogService(
  organizationId: string,
  taskId: string,
  agentName: string,
  actionTaken: string,
  status: string,
  thought: string,
  metadata = {},
  startedTaskAt: string,
) {
  const { error } = await supabase.from("agent_logs").insert({
    organization_id: organizationId,
    task_id: taskId,
    agent_name: agentName,
    action_taken: actionTaken,
    thought,
    status,
    metadata,
    started_task_at: startedTaskAt,
  });

  if (error) {
    throw error;
  }

  return {
    success: true,
    logged: true,
  };
}
