import { supabase } from "../db/supabase";
import { sseService } from "./sse.service";
import { transformSingleAgentLog } from "./terminal-transformer";

/**
 * Initializes Supabase realtime subscriptions and dispatches to SSE service.
 * Called once at server startup from server.ts.
 *
 * Subscribes to:
 * - INSERT on inventory_events → 'inventory_event'
 * - INSERT on notifications → 'notification'
 * - INSERT on agent_logs → 'agent_log' + 'agent_task'
 * - UPDATE on agent_tasks → 'task_event'
 * - UPDATE on inventory_items → 'dashboard_update'
 */

let initialized = false;

export function initializeRealtimeListener(): void {
  if (initialized) return;
  initialized = true;

  console.log('[SSE] Initializing realtime event listener...');

  supabase
    .channel('server-realtime-events')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_events' },
      handleInventoryEvent
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      handleNotification
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_logs' },
      handleAgentLog
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_tasks' },
      handleTaskUpdate
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_items' },
      handleInventoryItemUpdate
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[SSE] Realtime listener subscribed');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[SSE] Realtime listener channel error, retrying...');
        // Supabase will auto-retry
      }
    });
}

function handleInventoryEvent(payload: any): void {
  const newData = payload.new || payload.record;
  if (!newData) return;
  const orgId = newData.organization_id;
  if (!orgId) return;

  sseService.broadcastEvent(orgId, 'inventory_event', {
    id: newData.id,
    event_type: newData.event_type,
    item_id: newData.inventory_item_id,
    quantity_change: newData.quantity_change,
    price_per_unit: newData.price_per_unit,
    metadata: newData.metadata,
    created_at: newData.created_at,
  });
}

function handleNotification(payload: any): void {
  const newData = payload.new || payload.record;
  if (!newData) return;
  const orgId = newData.organization_id;
  if (!orgId) return;

  // Skip task-created notifications (these are internal)
  if (newData.title?.startsWith('[Task]')) return;

  sseService.broadcastEvent(orgId, 'notification', {
    id: newData.id,
    title: newData.title,
    message: newData.message,
    type: newData.type,
    created_at: newData.created_at,
  });
}

function handleAgentLog(payload: any): void {
  const newData = payload.new || payload.record;
  if (!newData) return;
  const orgId = newData.organization_id;
  if (!orgId) return;

  const terminalLog = transformSingleAgentLog(newData, newData.name ?? ''); // Pass org name for better context in logs

  // Broadcast as individual agent_log for real-time streaming
  sseService.broadcastEvent(orgId, 'agent_log', {
    id: newData.id,
    task_id: newData.task_id,
    agent_name: newData.agent_name,
    status: newData.status,
    action_taken: newData.action_taken,
    text: terminalLog.text,
    type: terminalLog.type ?? 'info',
    tool_name: terminalLog.tool_name,
    created_at: newData.created_at,
  });

  // For task completion, also broadcast as agent_task with the full picture
  if (newData.status === 'completed' || newData.status === 'failed') {
    sseService.broadcastEvent(orgId, 'agent_task', {
      task_id: newData.task_id,
      agent_name: newData.agent_name,
      action_taken: newData.action_taken,
      status: newData.status,
      reasoning: newData.status === 'completed' ? newData.thought : (newData.metadata?.error ?? null),
      timestamp: newData.created_at,
      type: terminalLog.type ?? (newData.status === 'completed' ? 'success' : 'error'),
    });
  }
}

function handleTaskUpdate(payload: any): void {
  const newData = payload.new || payload.record;
  const oldData = payload.old;
  if (!newData) return;
  const orgId = newData.organization_id;
  if (!orgId) return;

  // Only broadcast on status changes
  if (!oldData || newData.status !== oldData.status) {
    sseService.broadcastEvent(orgId, 'task_event', {
      task_id: newData.id,
      task_type: newData.task_type,
      status: newData.status,
      priority: newData.priority,
      completed_at: newData.completed_at,
      created_at: newData.created_at,
    });
  }
}

function handleInventoryItemUpdate(payload: any): void {
  const newData = payload.new || payload.record;
  if (!newData) return;
  const orgId = newData.organization_id;
  if (!orgId) return;

  sseService.broadcastEvent(orgId, 'dashboard_update', {
    type: 'inventory_snapshot',
    item_id: newData.id,
    name: newData.name,
    quantity: newData.quantity,
    in_transit_quantity: newData.in_transit_quantity,
    capacity: newData.inventory_capacity,
    updated_at: newData.updated_at,
  });
}
