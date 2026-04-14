# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

Storacle server is the backend of a procurement automation system built with Express + Supabase. It works in conjunction with the frontend dashboard and public ERC-4337 bundler services to provide ERC-4337 account abstraction with Zerodev Kernel accounts, session keys, and AI-powered inventory management. See the [Integration Guide](../INTEGRATION.md) for complete system architecture.

## Core Procurement Flow

1. `POST /simulate/purchase` — decrements inventory, logs `sale` event, creates `procurement.inventory_check` task if item has `is_agent_active=true`
2. Procurement agent checks usage/depletion (7-day rolling avg) → if days_until_critical <= lead_time + 2, sends invoice request email to supplier
3. `POST /webhooks/mail` — AgentMail webhook. On `message.received` with attachments, creates `payment.process_invoice` task
4. Payment agent OCRs invoice → validates supplier via Zerodev policy → pays supplier (USDT via ERC-4337 UserOperation) if due soon, or schedules payment task for later
5. After payment: `record_supplier_payment()` RPC creates `invoice_paid` event in `inventory_events` with `metadata.fulfillment_status = 'pending'`, increments `in_transit_quantity`, marks invoice `paid`
6. `POST /items/transit` — user confirms fulfillment → `confirm_inventory_fulfillment()` RPC decrements `in_transit_quantity`, increments `quantity`, marks event fulfilled, creates `restock` event

## Architecture

```
src/
├── app.ts              — Express app, routes, CORS, error handler
├── server.ts           — HTTP server + ngrok tunnel + AgentMail webhook registration
├── agents/
│   ├── procurement.agent.ts   — Inventory monitoring via LangChain + Gemini
│   └── payment.agent.ts       — Invoice processing via LangChain + Gemini
├── controllers/               — Express request handlers
│   ├── auth.controller.ts     — Supabase Web3 auth, signup, signin, org management
│   ├── inventory.controller.ts — CRUD for inventory items
│   ├── suppliers.controller.ts — CRUD for suppliers
│   ├── simulate.controller.ts  — POST /simulate/purchase
│   ├── webhook.controller.ts   — POST /webhooks/mail
│   ├── events.controller.ts    — SSE event streaming
│   ├── keys.controller.ts      — Session key derivation (RSA-2048) and Zerodev integration
│   └── wallet.controller.ts    — Session approval and wallet management
├── services/
│   ├── inventory.service.ts    — Purchase simulation, inventory CRUD, depletion prediction
│   ├── email.service.ts        — Invoice extraction (Gemini), email sending (AgentMail)
│   ├── payment.service.ts      — USDT transfer via ERC-4337 (UserOperation submission)
│   ├── supplier-verification.service.ts — Gate 4: Zerodev policy validation
│   ├── task.service.ts         — Create tasks in agent_tasks table
│   └── notification.service.ts — Notifications + audit logging
├── tools/                       — LangChain StructuredTool definitions
│   ├── email.tool.ts           — read_invoice, send_invoice_request
│   ├── inventory.tool.ts       — update_inventory, read_inventory_item, predict_depletion
│   ├── payment.tool.ts         — pay_supplier (now uses ERC-4337)
│   ├── task.tool.ts            — create_task
│   └── notification.tool.ts    — create_notification, list_notifications, mark_notification_read
├── tasks/
│   ├── task.executor.ts  — Routes task types to agent handlers
│   └── task.queue.ts     — getNextTask, completeTask, failTask (uses claim_next_task RPC)
├── workers/
│   └── task.worker.ts    — Polls DB for tasks every 2s, executes them
├── db/
│   ├── supabase.ts       — Supabase client (service + auth)
│   └── init_tables.sql   — Full schema: 11 tables + functions + triggers
├── utility/
│   └── cryptography.ts   — RSA-2048 encrypt/decrypt session keys
└── routes/               — Express routers (1 router per controller)
```

## Pricing Fields

- `unit_sales_price_in_usdt` — selling price per unit (used by the dashboard, not by agents)
- `expected_purchase_price_in_usdt` — maximum acceptable purchase price per unit
- **Before paying**, the payment agent compares the invoice's `unit_price` (from OCR) with the item's `expected_purchase_price_in_usdt`. If the invoice price is higher, the agent does NOT pay and creates a notification instead.

## Supplier Wallet Validation

Both `POST /suppliers/add` and `POST /suppliers/edit` in `suppliers.controller.ts` require `supplierWallet` to match `^0x[0-9a-fA-F]{40}$`. Invalid addresses → 400 with a clear error. This prevents invalid wallet addresses from breaking Zerodev policy encoding on the frontend.

## Key Details

### Session Keys & Wallet
- A single `SESSION_KEY_SEED` from `.env` is shared across all orgs (EOA wallet)
- All orgs use the same wallet address; stored per-org in `wallets` table for future per-org key support
- `encryptKey()`/`decryptKey()` in `src/utility/cryptography.ts` use `master_public_key.pem` / `master_private_key.pem`
- Ethers.js EOA wallet for USDT transfers on Ethereum (same chain as before)
- USDT transfers use ERC-20 `transfer()` function

### Fulfillment Flow
- After payment succeeds, `record_supplier_payment()` SQL function creates an `invoice_paid` event in `inventory_events` with `metadata.fulfillment_status = 'pending'` and increments `in_transit_quantity` on the item
- `POST /items/transit` with `inventory_event_id` → `confirm_inventory_fulfillment()` SQL function: marks event fulfilled, moves quantity from `in_transit_quantity` to `quantity`, creates a `restock` event
- The frontend shows unfulfilled orders as the list of events where `event_type = 'invoice_paid'` and `metadata.fulfillment_status = 'pending'`

### AI Agents
- LangChain.js (v0.3+) with `@langchain/google-genai` (Gemini 2.5 Flash for agents, 2.0 Flash for OCR)
- Agents use `@langchain/langgraph` `createReactAgent` pattern
- Tools are LangChain `StructuredTool` classes with Zod schemas
- Invoice OCR: Gemini extracts fields from invoice URLs (no separate OCR library needed)
- Email generation: Gemini generates JSON with subject + body

### Task System
- Two task types: `procurement.inventory_check` and `payment.process_invoice`
- Worker polls `claim_next_task()` Postgres function, which atomically selects one pending task per org (priority + FIFO)
- Routine tasks (`is_routine_task=true`) auto-reschedule on completion or failure
- Scheduled tasks are skipped until `scheduled_for <= now()`

### Database
- All tables are in `src/db/init_tables.sql` (includes functions and triggers)
- Supabase `handle_new_org` trigger auto-creates `organizations` row on `auth.users` insert
- `claim_next_task()` uses `FOR UPDATE SKIP LOCKED` for safe concurrent workers

## Commands

```bash
bun install           # Install dependencies
bun run src/server.ts # Start HTTP server + task webhook registration
bun run src/workers/task.worker.ts  # Run the task worker (separate process)
bun run index.ts      # Entry point if configured (from README)
```

## TypeScript Config

Bundler module resolution, ESNext target, strict mode, no emit (Bun-style). Config in `tsconfig.json`.
Bun runs TypeScript natively — no tsc build step needed.

## Real-Time SSE Architecture (2026-04-04+)

The server broadcasts all meaningful state changes to frontend clients via Server-Sent Events.

### SSE Pipeline

```
Supabase postgres_changes → event-listener.service.ts → terminal-transformer.ts
                                                       → sse.service.ts → connected clients
```

- **`src/services/sse.service.ts`** — Singleton SSE client registry. Clients register with org_id, receive typed broadcasts.
- **`src/services/event-listener.service.ts`** — Subscribes to Supabase realtime on `inventory_events`, `notifications`, `agent_logs`, `agent_tasks`, `inventory_items`. Dispatches to sseService.
- **`src/services/terminal-transformer.ts`** — Builds rich terminal entries from agent_logs for the AI terminal display. Groups logs by task_id, parses tool_input/tool_output into human-readable timelines, extracts AI reasoning from thought fields.
- **`src/controllers/events.controller.ts`** — SSE endpoint. Authenticates client, registers with SSEService, streams events.
- **`src/controllers/dashboard.controller.ts`** — `GET /dashboard/data` bootstrap endpoint for initial page load.

### SSE Event Types

| Type | Source Table | Frontend Use |
|------|-------------|--------------|
| `inventory_event` | inventory_events INSERT | Update inventory state, event timeline |
| `notification` | notifications INSERT | Toast + notification list |
| `agent_task` | agent_logs grouped by task_id | Terminal display with tool timelines |
| `agent_log` | agent_logs INSERT (streaming) | Real-time terminal log append |
| `task_event` | agent_tasks UPDATE | Pending task indicators |
| `dashboard_update` | inventory_items UPDATE | Balance/incremental snapshot updates |

### Terminal Terminal Display

Each agent task is transformed into a `TerminalTask`:
```
Header: [agent] Task description for ITEM-001
├─ read_inventory_item → 15 of 100 units (15% capacity)
├─ predict_depletion → 2.1/day, critical in 3 days
├─ send_invoice_request → emailed supplier@acme.com for 200 units
└─ create_notification → "Invoice requested from Acme Corp"

[AI] "PART-A-001 is critically low. I've requested an invoice..."
```

See `next_steps.md` for current work status.

## On-Chain Supplier Verification (2026-04-04+)

Before paying a supplier, the backend verifies that the supplier's wallet address is authorized by the Zerodev session policy that was configured on the frontend. This is **Gate 4** in the payment flow — after inventory checks, price validation, and before the actual USDT transfer.

### Verification Flow

```
paySupplierService() → verifySupplierOnChain(orgId, supplierAddress)
                        ├─ Check 1: supplier in local policy_config whitelist
                        ├─ Check 2: Zerodev session not expired
                        └─ PASS: proceed to sendUSDT() or FAIL: throw + notification
```

### Key Files

- `services/supplier-verification.service.ts` — `verifySupplierOnChain()`, `verifyAllSuppliersForOrg()`, `updateSupplierVerificationStatus()`
- `controllers/wallet.controller.ts` — `saveSessionApproval()` stores Zerodev approval string + policy_config
- `routes/wallet.routes.ts` — `POST /wallet/session-approval`, `POST /wallet/session-revoke`, `GET /wallet/status`

### Policy Config Format

Stored in `wallets.policy_config` JSONB:
```json
{
  "suppliers": ["0x...", "0x..."],
  "max_per_payment": { "0x...": 5000 },
  "daily_total_cap": 25000,
  "daily_tx_cap": 10,
  "expiry_timestamp": 1746489600
}
```

### Database Columns

- `wallets.policy_config` JSONB — mirrors on-chain Zerodev policy for fast local verification
- `suppliers.is_verified_onchain` BOOLEAN — whether this supplier is in the current session's whitelist
- `suppliers.last_verified_onchain_at` TIMESTAMPTZ — last verification timestamp

## Simulate Purchase Flow (2026-04-08+)

`POST /simulate/purchase` decrements inventory, logs a `sale` event, and triggers the procurement agent if the item is agent-active. It also sends USDT from a whale wallet to the org's smart account to simulate revenue coming in.

### Whale Wallet (`src/services/whale.service.ts`)

- Configured via `WHALE_PRIVATE_KEY` in `.env`
- Lazy-init: returns `{ success: false }` if the key or `USDT_TOKEN_ADDRESS` is not set (doesn't crash startup)
- Sends USDT to `wallets.smart_account_address` — amount = `quantity_sold` ($1 per unit)
- Uses viem wallet client to call `transfer(address,uint256)` on the USDT contract
- After transfer, calls `refreshAndBroadcastBalance()` which reads the on-chain balance and broadcasts via SSE

```
POST /simulate/purchase { item_id, quantity_sold }
  → simulatePurchaseService():
     1. Decrement inventory quantity, log sale event
     2. Create procurement task if is_agent_active=true
     3. sendUSDTFromWhale() — transfer USDT from whale → org smart account
     4. refreshAndBroadcastBalance() — SSE broadcasts updated on-chain balance
  → Frontend receives balance + inventory updates via SSE (no manual refresh needed)
```

### Key Files

- `services/whale.service.ts` — USDT transfer from whale wallet to org smart account
- `services/inventory.service.ts` `simulatePurchaseService()` — orchestrates simulation + whale transfer + balance refresh
- `services/balance.service.ts` `refreshAndBroadcastBalance()` — reads on-chain balance, updates DB cache, SSE broadcast

## Environment Variables

Required:
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — Database + Auth
- `GOOGLE_API_KEY` — Gemini 2.5 Flash (agents) + 2.0 Flash (OCR)
- `AGENT_MAIL_API_KEY` — Email webhook processing
- `MASTER_SESSION_PRIVATE_KEY` — Shared session key private key (hex, 0x prefixed)
- `CHAIN_RPC_URL` — Sepolia Testnet RPC URL
- `USDT_TOKEN_ADDRESS` — ERC-20 USDT contract address on Sepolia Testnet
- `BUNDLER_URL` — Public ERC-4337 bundler URL
- `SERVER_PORT` — Express port (default 3000)
- `NGROK_AUTHTOKEN` — Ngrok tunnel for `/webhooks/mail` public webhook access

Optional:
- `NODE_ENV` — Production vs development (controls error stack exposure)
- `WHALE_PRIVATE_KEY` — Private key of whale wallet for simulated USDT revenue transfers (if not set, simulation still runs but no on-chain transfer)

Dead variables: none — all unused env vars and dead code removed as of 2026-04-06

## Important Note

**UPDATE THIS FILE WHEN MAKING LARGE CHANGES.** When you make significant architectural changes, add new patterns, change conventions, or introduce new concepts, update this CLAUDE.md file so future sessions have accurate context.
