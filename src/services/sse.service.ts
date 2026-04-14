import { type Response } from "express";

export type EventType =
  | 'inventory_event'
  | 'notification'
  | 'agent_task'
  | 'agent_log'
  | 'task_event'
  | 'dashboard_update';

export interface SSEEventEnvelope {
  type: EventType | 'ping' | 'ready';
  timestamp: string;
  data: unknown;
  org_id: string;
}

interface SSEClient {
  id: number;
  orgId: string;
  userId: string;
  res: Response;
}

let nextClientId = 0;

class SSEService {
  private clients: SSEClient[] = [];

  addClient(userId: string, orgId: string, res: Response): number {
    const id = ++nextClientId;
    this.clients.push({ id, orgId, userId, res });
    return id;
  }

  removeClient(id: number): void {
    this.clients = this.clients.filter(c => c.id !== id);
  }

  broadcastEvent(orgId: string, type: EventType, data: unknown): void {
    const envelope: SSEEventEnvelope = {
      type,
      timestamp: new Date().toISOString(),
      data,
      org_id: orgId,
    };
    const payload = `data: ${JSON.stringify(envelope)}\n\n`;
    const targetClients = this.clients.filter(c => c.orgId === orgId);
    for (const client of targetClients) {
      this.writeToClient(client.res, payload);
    }
  }

  private writeToClient(res: Response, payload: string): void {
    try {
      res.write(payload);
    } catch {
      // Client disconnected, will be cleaned up
    }
  }

  getConnectedClientCount(): number {
    return this.clients.length;
  }
}

export const sseService = new SSEService();
