export type TaskType =
  | "procurement.inventory_check"
  | "payment.process_invoice";

export type TaskStatus = "pending" | "completed" | "failed";

export interface AgentTask {
  id: string;
  organization_id: string;
  agent_name?: string;
  task_type: TaskType;
  status: TaskStatus;
  priority: number;
  payload: any;
  result?: any;
  is_routine_task: boolean;
  scheduled_for?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface CreateTaskPayload {
  organization_id?: string;
  task_type: TaskType;
  priority: number;
  payload: any;
  is_routine_task?: boolean;
  scheduled_for?: string;
}
