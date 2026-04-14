import type { Request, Response } from "express";
import { supabase } from "../db/supabase";
import { createTaskService } from "../services/task.service";
import { AgentMailClient } from "agentmail";

const mailClient = new AgentMailClient({
  apiKey: process.env.AGENT_MAIL_API_KEY,
});

/**
 * Download an attachment from AgentMail and return base64 content.
 * AgentMail download URLs are time-limited (expiresAt), so we fetch
 * them immediately when the webhook fires and store the content.
 */
async function downloadAttachment(
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<{ base64: string; contentType: string } | null> {
  try {
    // Get the download URL from AgentMail API
    const response = await mailClient.inboxes.messages.getAttachment(
      inboxId,
      messageId,
      attachmentId
    );

    const downloadUrl = (response as any).downloadUrl;
    if (!downloadUrl) {
      console.error("No downloadUrl in attachment response");
      return null;
    }

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      console.error(`Failed to download attachment: ${res.status} ${res.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      base64: buffer.toString("base64"),
      contentType: res.headers.get("content-type") || "application/octet-stream",
    };
  } catch (err) {
    console.error("downloadAttachment error:", err);
    return null;
  }
}

export async function handleMailWebhook(req: Request, res: Response): Promise<any> {
  try {
    const event = req.body;

    // Acknowledge immediately so AgentMail doesn't retry
    res.status(200).json({ received: true });

    if (event.event_type !== "message.received") return;

    const message = event.message;
    if (!message) return;

    const inboxId: string = message.inbox_id ?? message.inboxId;
    const messageId: string = message.message_id ?? message.messageId;
    const sender: string = message.from;
    const subject: string = message.subject ?? "";
    const body: string = message.text ?? message.html ?? "";

    // Look up organization by inbox ID
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("agent_inbox_id", inboxId)
      .single();

    if (orgError || !org) {
      console.error("Webhook: no org found for inbox", inboxId);
      return;
    }

    const organization_id = org.id;

    // Build structured attachment metadata
    const rawAttachments = message.attachments ?? [];
    const attachmentMeta = rawAttachments.map((a: any) => ({
      attachmentId: a.attachment_id ?? a.attachmentId,
      filename: a.filename,
      contentType: a.content_type ?? a.contentType,
      size: a.size,
    }));

    // Persist email to inbox table
    const { data: emailRow, error: emailErr } = await supabase
      .from("email_inbox")
      .insert({
        organization_id,
        agent_inbox_id: inboxId,
        sender,
        subject,
        body,
        attachments: attachmentMeta,
      })
      .select()
      .single();

    if (emailErr) {
      console.error("Failed to persist email:", emailErr);
      return;
    }

    const emailInboxId = emailRow.id as string;

    // Download each attachment and store as base64
    const downloadedIds: string[] = [];
    for (const att of attachmentMeta) {
      const attachmentId = att.attachmentId;
      if (!attachmentId) continue;

      const downloaded = await downloadAttachment(inboxId, messageId, attachmentId);
      if (!downloaded) continue;

      const { data, error } = await supabase
        .from("invoice_attachments")
        .insert({
          organization_id,
          email_inbox_id: emailInboxId,
          filename: att.filename ?? null,
          content_type: downloaded.contentType,
          file_data: downloaded.base64,
          agentmail_attachment_id: attachmentId,
          agentmail_download_url: null,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to store attachment:", error);
        continue;
      }

      downloadedIds.push(data.id);
    }

    // If we have attachments, create task referencing the first downloadable one
    if (downloadedIds.length > 0) {
      await createTaskService({
        organization_id,
        task_type: "payment.process_invoice",
        priority: 1,
        payload: {
          organization_id,
          attachment_id: downloadedIds[0],
          sender,
          subject,
        },
      });
    }
  } catch (err: any) {
    console.error("handleMailWebhook error:", err);
  }
}
