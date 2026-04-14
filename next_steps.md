# Server — Next Steps

**Status:** Phase 1 (SSE Pipeline) COMPLETE. Phase 2 (Zerodev Supplier Verification) COMPLETE. Phase 3 (Invoice Attachment Pipeline) IN PROGRESS.

## Phase 3: Invoice Attachment Pipeline (2026-04-07)

### Problem
AgentMail webhook delivers attachments as ephemeral URLs/IDs (`message.attachments[].url` or `.download_url`). The webhook stores these in `email_inbox.attachments[]`, passes the first one as `invoice_url` in the task payload. The `ReadInvoiceTool` sends that URL to Gemini 2.0 Flash for OCR, but Gemini can't fetch it — it's ephemeral and/or behind AgentMail auth.

### Root Cause
- `webhook.controller.ts` stores attachment URL directly as `task.payload.invoice_url` (line 57)
- Never creates a row in `invoices` table
- Attachment URLs are not publicly fetchable
- AI agent has no reliable way to access invoice content

### Solution
Download attachments at webhook time using AgentMail SDK, store base64 content in Postgres `invoice_attachments` table. Payment agent reads base64 from DB and sends it inline to Gemini (no URL needed — Gemini 2.0 Flash accepts base64 inline).

### Step-by-step

#### Step 1: Create `invoice_attachments` table + alter `invoices` table
- **File:** `src/db/invoice_attachment_migration.sql`
- Create `invoice_attachments` table with columns: `id`, `organization_id`, `email_inbox_id`, `filename`, `content_type`, `file_data` (text, base64), `created_at`
- Add `attachment_id` column to `invoices` table
- Add migration block at end of `init_tables.sql`

#### Step 2: Update webhook handler to download attachments
- **File:** `src/controllers/webhook.controller.ts`
- When `message.received` fires with attachments:
  - For each attachment, call AgentMail download API: `AGENT_MAIL_API_KEY` → `https://api.agentmail.io/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}/download`
  - Store base64 in `invoice_attachments` table
  - Create a row in `invoices` table with `attachment_id` reference
  - Create task with `attachment_id` in payload instead of `invoice_url`

#### Step 3: Update `ReadInvoiceTool` + `readInvoiceService` to accept base64
- **Files:** `src/tools/email.tool.ts`, `src/services/email.service.ts`
- Change from accepting `invoiceUrl: string` to accepting `attachmentId: string`
- Query `invoice_attachments` table for `file_data`, decode base64, send to Gemini as inline content
- Remove `HumanMessage("Invoice URL: ...")` — replace with Gemini-compatible base64 payload

#### Step 4: Update payment agent
- **File:** `src/agents/payment.agent.ts`
- Read `attachment_id` from `task.payload` instead of `invoice_url`
- Pass `attachment_id` to `ReadInvoiceTool`

#### Step 5: Update `email_inbox` to store `message_id`
- **File:** `src/controllers/webhook.controller.ts`
- When persisting to `email_inbox`, also store `message_id` (from `event.data.message.id` or similar) so the download API call can use it

### Files to create/modify
| Action | File | What |
|--------|------|------|
| Create | `src/db/invoice_attachment_migration.sql` | New table + migration helper |
| Modify | `src/db/init_tables.sql` | Append migration to ALTER TABLE statements |
| Modify | `src/controllers/webhook.controller.ts` | Download attachments, create DB rows |
| Modify | `src/services/email.service.ts` | `readInvoiceService` accepts attachment ID |
| Modify | `src/tools/email.tool.ts` | Schema and constructor change |
| Modify | `src/agents/payment.agent.ts` | Read `attachment_id` instead of `invoice_url` |
| Modify | `src/db/supabase.types.ts` | Regenerate types (or add manually) |

### Remaining Work from Previous Phases

- Verify `notifications` and `markNotificationAsRead` endpoints exist on server
- `DashboardContent` `useCallback` wrapper — should be `useMemo` or have correct deps
- `checkAuthentication` middleware needs to populate `req.user` before dashboard controller runs
