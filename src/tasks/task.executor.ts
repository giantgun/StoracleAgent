import { handleProcurementTask } from "../agents/procurement.agent";
import { handlePaymentTask } from "../agents/payment.agent";
import type { AgentTask } from "../types/task.types";

export async function executeTask(task: AgentTask) {
  switch (task.task_type) {
    case "procurement.inventory_check":
      return handleProcurementTask(task);

    case "payment.process_invoice":
      return handlePaymentTask(task);

    default:
      throw new Error(`Unknown task type: ${task.task_type}`);
  }
}
