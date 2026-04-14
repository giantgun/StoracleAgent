-- ============================================================
-- Invoice Attachments (2026-04-07)
-- AgentMail attachment download URLs are time-limited (expiresAt).
-- When a webhook fires, we immediately download the attachment content
-- and store it as base64 — the payment agent reads from here for OCR.
-- ============================================================

-- Stored invoice attachment content (base64)
create table if not exists invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  email_inbox_id uuid references email_inbox(id) on delete cascade,
  filename text,
  content_type text,
  file_data text,  -- base64 encoded attachment content
  size_bytes integer,
  agentmail_attachment_id text,  -- original AgentMail attachment ID
  agentmail_download_url text,   -- original download URL (for reference, expires)
  created_at timestamptz default now()
);

create index if not exists idx_invoice_attachments_org_email
  on invoice_attachments(organization_id, email_inbox_id);

-- Change email_inbox.attachments from text[] to jsonb for structured metadata
alter table email_inbox
  alter column attachments type jsonb
  using
    case
      when attachments is null then '[]'::jsonb
      else to_jsonb(attachments)
    end;
