import { supabase } from "../db/supabase";
import { createTaskService } from "../services/task.service";
import type { AgentTask, TaskType } from "../types/task.types";

export async function getNextTask(): Promise<AgentTask | null> {
  const { data, error } = await supabase.rpc("claim_next_task");

  if (error) {
    console.error("getNextTask RPC error:", error);
    throw error;
  }

  if (!data) return null;

  const task = Array.isArray(data) ? data[0] : data;

  return task ?? null;
}

export async function completeTask(id: string, result: any, task: AgentTask) {
  await supabase
    .from("agent_tasks")
    .update({
      status: "completed",
      result,
      completed_at: new Date(),
    })
    .eq("id", id);

  if (task.is_routine_task) {
    await createTaskService({
      task_type: task.task_type,
      priority: task.priority,
      payload: task.payload,
      is_routine_task: true,
    });
  }
}

export async function failTask(id: string, error: string, task: AgentTask) {
  await supabase
    .from("agent_tasks")
    .update({
      status: "failed",
      result: { error },
    })
    .eq("id", id);

  if (task.is_routine_task) {
    await createTaskService({
      task_type: task.task_type,
      priority: task.priority,
      payload: task.payload,
      is_routine_task: true,
    });
  }
}
