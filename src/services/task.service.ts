import { supabase } from "../db/supabase";

export async function createTaskService(task: any) {
  await supabase.from("agent_tasks").insert(task);
}
