import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createNotificationService,
  getNotificationsService,
  markNotificationReadService,
} from "../services/notification.service";

export class CreateNotificationTool extends StructuredTool {
  name = "create_notification";
  description = "Send a notification to the organization about an action you've taken.";

  schema = z.object({
    title: z.string().describe("Notification title"),
    message: z.string().describe("Notification body describing what happened and why."),
  });

  private readonly organizationId: string;

  constructor(organizationId: string) {
    super();
    this.organizationId = organizationId;
  }

  async _call(input: { title: string; message: string }) {
    const result = await createNotificationService(this.organizationId, input.title, input.message);
    return JSON.stringify(result);
  }
}

export class ListNotificationsTool extends StructuredTool {
  name = "list_notifications";
  description = "Retrieve notifications for the organization (optionally only unread)";

  schema = z.object({
    unread_only: z.boolean().optional(),
  });

  private readonly organizationId: string;

  constructor(organizationId: string) {
    super();
    this.organizationId = organizationId;
  }

  async _call(input: { unread_only?: boolean }) {
    const result = await getNotificationsService(this.organizationId, !!input.unread_only);
    return JSON.stringify(result);
  }
}

export class MarkNotificationReadTool extends StructuredTool {
  name = "mark_notification_read";
  description = "Mark a notification as read";

  schema = z.object({
    id: z.string().describe("Notification ID"),
  });

  async _call(input: { id: string }) {
    await markNotificationReadService(input.id);
    return `Notification ${input.id} marked as read`;
  }
}
