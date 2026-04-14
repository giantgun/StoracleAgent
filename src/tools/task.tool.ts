import { createTaskService } from "../services/task.service";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { TaskType } from "../types/task.types";

export const TOOL_CALL_OPTIONS = ["create_task"] as const;

export class CreateTaskTool extends StructuredTool {
  name = "create_task";
  description = "Create a new scheduled task. Use this to schedule the next inventory check or payment processing.";

  schema = z.object({
    task_type: z.enum(["procurement.inventory_check", "payment.process_invoice"] as const),
    priority: z.number().describe("The priority of the task (1=highest)"),
    payload: z.record(z.unknown()).optional().describe("Optional payload for the task"),
    scheduled_for: z.string().optional().describe("ISO date to schedule the task for"),
  });

  private organizationId: string;

  constructor(organizationId: string) {
    super();
    this.organizationId = organizationId;
  }

  async _call(input: { task_type: TaskType; priority: number; payload?: Record<string, unknown>; scheduled_for?: string }) {
    await createTaskService({
      organization_id: this.organizationId,
      task_type: input.task_type,
      priority: input.priority,
      payload: input.payload ?? {},
      scheduled_for: input.scheduled_for,
    });
    return `Task ${input.task_type} created successfully.`;
  }
}
