import type { SSEEventEnvelope, EventType } from "./sse.service";

/**
 * Transforms agent_logs rows into rich terminal entries.
 *
 * Each agent task execution creates multiple agent_logs:
 * - 1x task start (status='started')
 * - Nx tool_started + Nx tool_completed pairs
 * - 1x task end (status='completed' or 'failed')
 *
 * This transformer builds a TerminalTask that groups all logs by task_id,
 * extracts tool inputs/outputs into human-readable summaries, and includes
 * the AI's final reasoning from the completion entry's thought field.
 */

export interface TerminalTimelineEntry {
  tool: string;
  input_brief: string;
  output_brief: string | null;
  status: 'success' | 'failed' | 'running';
}

export interface TerminalTask {
  task_header: string;
  agent_name: string;
  entries: TerminalTimelineEntry[];
  reasoning: string | null;
  status: 'running' | 'completed' | 'failed';
  timestamp: string;
  task_id: string;
}

export type LogType = 'info' | 'ai' | 'success' | 'error' | 'warning';

/**
 * Maps tool input JSON to a human-readable input summary.
 */
export function summarizeToolInput(toolName: string, metadata: any): string {
  try {
    const input = typeof metadata.tool_input === 'string'
      ? JSON.parse(metadata.tool_input)
      : metadata.tool_input;
    if (!input || typeof input !== 'object') return '';

    switch (toolName) {
      case 'read_inventory_item':
        return `fetching inventory details:`;

      case 'predict_depletion':
        return 'analyzing consumption rate:';

      case 'send_invoice_request':
        return `emailing supplier for ${input.quantity ?? '?'} units`;

      case 'read_invoice':
        return `OCR-ing invoice attachment`;

      case 'pay_supplier':
        return `paying ${input.amount ?? '?'} USDT to ${input.supplier_name ?? 'supplier'}`;
      
      case 'send_invoice_paid':
        return `notifying ${input.supplier_name ?? 'supplier'} via ${input.supplier_email ?? 'email'}`;

      case 'create_notification':
        return `notifying "${input.title ?? input.message?.slice(0, 50) ?? ''}"`;

      case 'create_task':
        return `scheduling task: ${input.task_type ?? '?'}`;

      default:
        return '';
    }
  } catch {
    return '';
  }
}

/**
 * Maps tool output JSON to a human-readable output summary.
 */
export function summarizeToolOutput(toolName: string, metadata: any): string | null {
  try {
    const output = typeof metadata.tool_output === 'string'
      ? JSON.parse(metadata.tool_output)
      : metadata.tool_output;
    const input = typeof metadata.tool_input === 'string'
      ? JSON.parse(metadata.tool_input)
      : metadata.tool_input;
    if (!output || typeof output !== 'object') return null;

    switch (toolName) {
      case 'read_inventory_item': {
        const qty = output.quantity ?? '?';
        const cap = output.inventory_capacity ?? '?';
        const pct = cap > 0 ? Math.round((qty / cap) * 100) : '?';
        return `${qty} units left of ${cap} (${pct}% capacity)`;
      }

      case 'predict_depletion': {
        const rate = Math.round(output.daily_consumption_rate) ?? '?';
        const days = Math.round(output.days_until_critical) ?? '?';
        const lead = output.supplier_lead_time_days ?? '?';
        return `${rate} units per day, critical in ${days} day(s), supplier lead time of ${lead} day(s)`;
      }

      case 'send_invoice_request': {
        const email = output.email_sent_to ?? output.supplier_email ?? 'supplier';
        const qty = output.quantity ?? '?';
        return `emailed ${email} for ${qty} units`;
      }

      case 'read_invoice': {
        const product = output.product_name ?? '?';
        const qty = output.quantity ?? '?';
        const price = output.unit_price ?? '?';
        const total = output.total_amount ?? '?';
        const due = output.due_date ?? 'no due date';
        return `${qty} ${product} units at $${price}/unit = $${total}, due: ${due}`;
      }

      case 'pay_supplier': {
        const tx = output.tx_hash ? ` (tx: ${output.tx_hash})` : '';
        return `sent ${output.amount ?? '?'} USDT${tx}`;
      }

      case 'send_invoice_paid': {
        const email = `${output.to ?? 'supplier email'}`;
        const name = output.supplierName ?? 'supplier';
        const qty = output.quantity ?? '?';
        return `notified ${name} (${email}) of payment for ${qty} units`;
      }

      case 'create_notification': {
        return `${output.title ?? 'organization updated'}`;
      }

      case 'create_task': {
        return `scheduled: ${output.task_type ?? 'new task'}`;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Builds a human-readable task header from agent name and action.
 */
function buildTaskHeader(agentName: string, actionTaken: string, metadata: any, orgName: string): string {
  // console.log('Building task header with metadata:', metadata); // Debug log to inspect metadata structure
  const itemCtx = parseItemContext(metadata);
  const ctx = itemCtx ? ` for ${metadata.itemName?.name ?? orgName ?? '?'}` : '';

  switch (actionTaken) {
    case 'procurement.inventory_check':
      return `[procurement] Inventory check${ctx}`;
    case 'payment.process_invoice':
      return `[payment] Processing invoice${ctx}`;
    default:
      return `[${agentName}] ${actionTaken}${ctx}`;
  }
}

/**
 * Extracts an item identifier from various metadata shapes.
 */
function parseItemContext(metadata: any): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata?.itemName?.name ?? metadata.itemId ?? metadata.product_name ?? null;
}

/**
 * Determines the log display type for a given status.
 */
function statusToLogType(status: string): LogType {
  switch (status) {
    case 'started':
    case 'tool_started':
      return 'info';
    case 'completed':
    case 'tool_completed':
      return 'success';
    case 'failed':
    case 'tool_failed':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Transforms a single completed agent_log entry into a streaming terminal log.
 * Used when agent_logs INSERT events come in real-time from Supabase.
 */
export function transformSingleAgentLog(log: any, orgName: string): {
  text: string;
  type: LogType;
  tool_name?: string;
  task_id?: string;
  action_taken?: string;
  metadata?: any;
} {
  const { action_taken, status, thought, metadata, agent_name, task_id } = log;

  // Task completion — show the full summary + AI reasoning
  if (status === 'completed' || status === 'failed') {
    const header = buildTaskHeader(agent_name, action_taken, metadata, orgName);
    const type: LogType = status === 'completed' ? 'success' : 'error';
    if (status === 'completed' && thought && thought !== 'Calling tool: ' && thought !== 'Beginning procurement inventory check' && thought !== 'Beginning invoice processing') {
      return {
        text: `\u00bb ${thought}`,
        type,
        tool_name: 'reasoning',
        task_id,
        action_taken,
        metadata,
      };
    }
    return {
      text: `${status === 'completed' ? '[OK]' : '[ERROR]'} ${header}`,
      type,
      tool_name: 'task_complete',
      task_id,
      action_taken,
      metadata,
    };
  }

  // Task started — show header
  if (status === 'started') {
    const header = buildTaskHeader(agent_name, action_taken, metadata, orgName);
    return {
      text: `${header}`,
      type: 'info',
      tool_name: 'task_start',
      task_id,
      action_taken,
      metadata,
    };
  }

  // Tool call completed or started
  if (status === 'tool_completed' || status === 'tool_failed') {
    const type: LogType = status === 'tool_completed' ? 'success' : 'error';
    const inputSummary = summarizeToolInput(action_taken, metadata);
    const outputSummary = summarizeToolOutput(action_taken, metadata);

    if (status === 'tool_completed' && outputSummary) {
      return {
        text: `  \u251c ${action_taken} \u2192 ${outputSummary}`,
        type,
        tool_name: action_taken,
        task_id,
        action_taken,
        metadata,
      };
    }

    if (status === 'tool_failed') {
      const errMsg = metadata?.error ?? 'unknown error';
      return {
        text: `  \u251c [FAIL] ${action_taken}: ${errMsg}`,
        type: 'error',
        tool_name: action_taken,
        task_id,
        action_taken,
        metadata,
      };
    }

    // tool started (shouldn't happen but handle gracefully)
    return {
      text: `  \u251c ${action_taken} ${inputSummary}`,
      type: 'info',
      tool_name: action_taken,
      task_id,
      action_taken,
      metadata,
    };
  }

  return {
    text: `[${agent_name}] ${thought ?? ''}`,
    type: 'info',
    task_id,
    action_taken,
    metadata,
  };
}

/**
 * Builds a complete TerminalTask from an array of agent_logs for a single task_id.
 * Used for fetching recent task history on dashboard load.
 */
export function buildTerminalTask(logs: any[], orgName: string): TerminalTask | null {
  if (logs.length === 0) return null;

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const firstLog = sortedLogs[0];
  const agentName = firstLog.agent_name ?? 'unknown';
  const actionTaken = firstLog.action_taken ?? '';
  const taskId = firstLog.task_id ?? '';
  const timestamp = firstLog.created_at ?? new Date().toISOString();

  const entries: TerminalTimelineEntry[] = [];
  let reasoning: string | null = null;
  let status: 'running' | 'completed' | 'failed' = 'running';

  for (const log of sortedLogs) {
    const { status: logStatus, thought, metadata, action_taken: logAction } = log;

    if (logStatus === 'tool_completed' || logStatus === 'tool_failed') {
      entries.push({
        tool: logAction,
        input_brief: summarizeToolInput(logAction, metadata),
        output_brief: summarizeToolOutput(logAction, metadata),
        status: logStatus === 'tool_completed' ? 'success' : 'failed',
      });
    }

    if (logStatus === 'completed') {
      status = 'completed';
      if (thought && thought !== 'Beginning procurement inventory check' && thought !== 'Beginning invoice processing') {
        reasoning = thought;
      }
    }

    if (logStatus === 'failed') {
      status = 'failed';
      reasoning = thought ?? log.metadata?.error ?? 'Task failed';
    }
  }

  return {
    task_header: buildTaskHeader(agentName, actionTaken, firstLog.metadata, orgName),
    agent_name: agentName,
    entries,
    reasoning,
    status,
    timestamp,
    task_id: taskId,
  };
}
