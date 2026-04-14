import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "../db/supabase";

/**
 * Wraps a langchain tool so that every call is logged to agent_logs
 * before (status='tool_started') and after (status='tool_completed' or 'tool_failed').
 */
export function wrapTool(
  tool: StructuredTool,
  opts: {
    organizationId: string;
    taskId: string;
    agentName: string;
    startedTaskAt: string;
    metadata: any;
  },
): StructuredTool {
  return new WrappedTool(tool, opts);
}

class WrappedTool extends StructuredTool {
  name: string;
  description: string;
  schema: any;

  private readonly inner: StructuredTool;
  private readonly organizationId: string;
  private readonly taskId: string;
  private readonly agentName: string;
  private readonly startedTaskAt: string;

  constructor(
    inner: StructuredTool,
    opts: { organizationId: string; taskId: string; agentName: string; startedTaskAt: string },
  ) {
    super();
    this.name = inner.name;
    this.description = inner.description;
    this.schema = inner.schema;
    this.inner = inner;
    this.organizationId = opts.organizationId;
    this.taskId = opts.taskId;
    this.agentName = opts.agentName;
    this.startedTaskAt = opts.startedTaskAt;
  }

  async _call(arg: any) {
    const argStr = typeof arg === "string" ? arg : JSON.stringify(arg);

    // Log before tool execution
    await supabase.from("agent_logs").insert({
      organization_id: this.organizationId,
      task_id: this.taskId,
      agent_name: this.agentName,
      action_taken: this.name,
      status: "tool_started",
      thought: `Calling tool: ${this.name}`,
      metadata: { tool_input: argStr, ...this.metadata },
      started_task_at: this.startedTaskAt,
    });

    try {
      const result = await this.inner.call(arg);

      // Log after successful tool execution
      await supabase.from("agent_logs").insert({
        organization_id: this.organizationId,
        task_id: this.taskId,
        agent_name: this.agentName,
        action_taken: this.name,
        status: "tool_completed",
        thought: `Tool ${this.name} completed successfully`,
        metadata: { tool_input: argStr, tool_output: result },
        started_task_at: this.startedTaskAt,
      });

      return result;
    } catch (err: any) {
      // Log tool failure
      await supabase.from("agent_logs").insert({
        organization_id: this.organizationId,
        task_id: this.taskId,
        agent_name: this.agentName,
        action_taken: this.name,
        status: "tool_failed",
        thought: `Tool ${this.name} failed: ${err.message}`,
        metadata: { tool_input: argStr, error: err.message },
        started_task_at: this.startedTaskAt,
      });

      throw err;
    }
  }
}
