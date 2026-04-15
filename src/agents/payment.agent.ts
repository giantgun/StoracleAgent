import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentTask } from "../types/task.types";
import { ReadInvoiceTool } from "../tools/email.tool";
import { PaySupplierTool } from "../tools/payment.tool";
import { CreateTaskTool } from "../tools/task.tool";
import { CreateNotificationTool } from "../tools/notification.tool";
import { ReadInventoryItemTool, PredictDepletionTool } from "../tools/inventory.tool";
import { wrapTool } from "../tasks/tool.logger";
import { supabase } from "../db/supabase";
import { createAgent } from "langchain";
import { SendInvoicePaidTool } from "../tools/email.tool";
import { ChatOpenAI } from "@langchain/openai";

export async function handlePaymentTask(task: AgentTask) {
  if (task.task_type !== "payment.process_invoice") return;

  const organizationId = task.organization_id;
  const startedAt = new Date().toISOString();
  const taskId = task.id;
  const attachmentId: string = task.payload.attachment_id;

  // Log task started
  await supabase.from("agent_logs").insert({
    organization_id: organizationId,
    task_id: taskId,
    agent_name: "payment",
    action_taken: "payment.process_invoice",
    status: "started",
    thought: "Beginning invoice processing",
    metadata: { attachment_id: attachmentId },
    started_task_at: startedAt,
  });

  try {
    // Look up inventory items linked to this org
    const { data: items, error: invError } = await supabase
      .from("inventory_items")
      .select("id, name, is_agent_active, supplier_id")
      .eq("organization_id", organizationId)
    // .eq("is_agent_active", true);

    const inventoryTools = (items ?? []).map(item => [
      new ReadInventoryItemTool(item.id),
      new SendInvoicePaidTool(item.id, attachmentId), // quantity will be filled in by the agent based on invoice parsing
      new PredictDepletionTool(item.id),
    ]).flat();

    const rawTools = [
      new ReadInvoiceTool(attachmentId),
      new PaySupplierTool(organizationId),
      new CreateTaskTool(organizationId),
      new CreateNotificationTool(organizationId),
      ...inventoryTools,
    ];

    const tools = rawTools.map(t =>
      wrapTool(t, { organizationId, taskId, agentName: "payment", startedTaskAt: startedAt, metadata: task.payload }),
    );

    const model = new ChatOpenAI({
      modelName: "openrouter/elephant-alpha",
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
    });


    const agent = createAgent({
      model,
      tools
    });

    const inventoryInstructions = items && items.length > 0
      ? `\nInventory Verification: You have access to read_inventory_item and predict_depletion tools for each active inventory item. Before paying, find the inventory item that matches the invoice's product_name, then check its current quantity and depletion status by calling the respective tools.
Decision logic:
   - If days_until_critical <= (supplier_lead_time_days + 2) and minimum_bulk_quantity < (capacity - quantity): call pay_supplier because the inventory will be critical soon. Then call create_notification summarising what was done with tx hash.
   - If days_until_critical <= (supplier_lead_time_days + 2) and minimum_bulk_quantity > (capacity - quantity): do NOT pay — call create_notification explaining the issue, then stop.
   - else, do NOT pay — call create_notification explaining that inventory is sufficient, then stop.`
      : `\nInventory Verification: No active inventory items found for this org. Do NOT pay — call create_notification and stop.`;

    const priceValidationInstructions = `\nPrice Validation: After finding the matching inventory item, compare the invoice's unit_price with the item's expected_purchase_price_in_usdt. If the invoice unit_price exceeds expected_purchase_price_in_usdt, do NOT pay — call create_notification explaining that the invoice price per unit exceeds the expected price per unit, then stop.`;

    const result = await agent.invoke({
      messages: [
        new SystemMessage(`You are a payment agent. You process supplier invoices by deciding whether to pay immediately or schedule for later.

Rules:
1. Call read_invoice to parse the invoice and extract: product_name, quantity, unit_price, total_amount, supplier_address, due_date.
2. Today's date: ${new Date().toISOString().split("T")[0]}.
3.${inventoryInstructions}
${priceValidationInstructions}
4. If inventory is confirmed low AND the invoice price is acceptable, proceed with payment decision:
   - If due_date is null OR due_date <= today + 1 day: call pay_supplier with the supplier_address, total_amount, and the matching inventoryItemId and quantity from the parsed invoice.
   - If due_date > today + 1 day: schedule a new payment task for one day before the due_date using create_task. Do NOT pay now.
5. Always call create_notification after your decision with a description of what action you took.
6. If you decide to pay, call send_invoice_paid to notify the supplier.

Constraints:
- Payment is always in USDT.
- Never pay if supplier_address is null or invalid.
- Never pay without verifying inventory levels first.
- Never pay if the invoice unit_price exceeds the item's expected_purchase_price_in_usdt.
- If inventory is not considered going to be critical by predict_depletion within the supplier lead time + 2 day buffer, reject the invoice — do not pay, do not schedule.
- If invoice data is missing critical fields, call create_notification explaining the issue and stop.
- If you schedule a payment for later, include the reason in the notification and the scheduled date.
- If you pay, include the tx hash in the notification.
- When calling pay_supplier, always include quantity.
- If you pay call send_invoice_paid to notify the supplier that payment has been made, and include the quantity.
- If you pay make sure include the complete tx_hash in the notification and email to supplier, not just a truncated version.
- Consider In transit stock orders on inventory item before ever paying

IMPORTANT: NEVER RETURN A RESULT UNTIL YOU HAVE CALLED RELEVANT TOOLS AND MADE A DECISION BASED ON THE ABOVE RULES. ALWAYS CALL THE TOOLS IN THE CORRECT ORDER AND FOLLOW THE DECISION LOGIC PRECISELY. IF YOU ARE UNSURE, CALL THE TOOLS TO GET THE INFORMATION NEEDED TO MAKE AN INFORMED DECISION.`
        ),
        new HumanMessage("call tools based on the rules."),
      ]
    });

    // Log task ended
    await supabase.from("agent_logs").insert({
      organization_id: organizationId,
      task_id: taskId,
      agent_name: "payment",
      action_taken: "payment.process_invoice",
      status: "completed",
      thought: getLastAiMessage(result),
      metadata: {},
      started_task_at: startedAt,
    });

    return getLastAiMessage(result);
  } catch (err: any) {
    // Log task failed
    await supabase.from("agent_logs").insert({
      organization_id: organizationId,
      task_id: taskId,
      agent_name: "payment",
      action_taken: "payment.process_invoice",
      status: "failed",
      thought: err.message,
      metadata: { error: err.message },
      started_task_at: startedAt,
    });

    throw err;
  }
}

function getLastAiMessage(result: any): string {
  // result is the state object { messages: [...] }
  const messages = result.messages;
  if (!messages || messages.length === 0) return "No response generated";

  const lastMessage = messages[messages.length - 1];
  const content = lastMessage.content;

  if (typeof content === "string") return content;

  // Handle complex content types (like tool calls or multi-part)
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  }

  return "";
}
