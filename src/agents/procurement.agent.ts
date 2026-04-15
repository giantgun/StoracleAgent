import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentTask } from "../types/task.types";
import { ReadInventoryItemTool, PredictDepletionTool } from "../tools/inventory.tool";
import { SendInvoiceRequestTool } from "../tools/email.tool";
import { CreateTaskTool } from "../tools/task.tool";
import { CreateNotificationTool } from "../tools/notification.tool";
import { wrapTool } from "../tasks/tool.logger";
import { supabase } from "../db/supabase";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";

`2. Check if item quantity is less than 50% of capacity: quantity < (capacity * 0.5).
   - If NOT: respond with "inventory item above 50% of capacity, no action needed" and stop calling tools.`

export async function handleProcurementTask(task: AgentTask) {
  if (task.task_type !== "procurement.inventory_check") return;

  const organizationId = task.organization_id;
  const itemId: string = task.payload.itemId;
  const startedAt = new Date().toISOString();
  const taskId = task.id;

  // Log task started
  await supabase.from("agent_logs").insert({
    organization_id: organizationId,
    task_id: taskId,
    agent_name: "procurement",
    action_taken: "procurement.inventory_check",
    status: "started",
    thought: "Beginning procurement inventory check",
    metadata: { itemId },
    started_task_at: startedAt,
  });

  try {
    const rawTools = [
      new ReadInventoryItemTool(itemId),
      new PredictDepletionTool(itemId),
      new SendInvoiceRequestTool(itemId),
      new CreateTaskTool(organizationId),
      new CreateNotificationTool(organizationId),
    ];

    const tools = rawTools.map(t =>
      wrapTool(t, { organizationId, taskId, agentName: "procurement", startedTaskAt: startedAt, metadata: task.payload }),
    );

    // const model = new ChatGoogleGenerativeAI({
    //   model: "gemini-3.1-flash-lite-preview",
    //   apiKey: process.env.GOOGLE_API_KEY,
    //   temperature: 0,
    // });

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

    const result = await agent.invoke({
      messages: [
        new SystemMessage(`You are a procurement agent. You monitor inventory levels and decide whether to request supplier invoices.

Inventory item fields:
- quantity: current stock
- inventory_capacity: max stock
- critical_order_level: minimum safe stock level
- minimum_bulk_quantity: minimum units to order
- supplier_lead_time_days: days the supplier takes to deliver

Rules:
1. Call read_inventory_item to get the current item state.
2. If exceeded: call predict_depletion to get daily_consumption_rate, days_until_critical, supplier_lead_time_days.
3. Decision logic:
   - If days_until_critical <= (supplier_lead_time_days + 2) and minimum_bulk_quantity < (capacity - quantity): call send_invoice_request with the item quantity = capacity - quantity (from the inventory data). Then call create_notification summarising what was done.
   - If days_until_critical <= (supplier_lead_time_days + 2) and minimum_bulk_quantity > (capacity - quantity): respond with "Inventory Critical but minimum order quantity not met" and call create_notification saying that inventory is critical but minimum order quantity not met.
   - Otherwise: respond with "inventory item below 50% of capacity but not critical, check again later" and stop calling tools.
4. When you do request an invoice: always call create_notification after, describing the action.
5. Don't crate a notification if no action is needed. Just respond with the appropriate message and end.

constraints:
- make sure to call send_invoice request if the item is predicted to reach critical levels within the supplier lead time + 2 days, and the minimum bulk quantity can be ordered to replenish stock.
- inventory is critical if it's predicted to reach the critical order level within the supplier lead time + 2 days even if the inventory quantity is not less than critical order level yet. This is to account for supplier lead times and ensure we have stock before hitting critical levels.`
        ),
        new HumanMessage("Check the inventory item now and follow the rules."),
      ]
    });

    // Log task ended
    await supabase.from("agent_logs").insert({
      organization_id: organizationId,
      task_id: taskId,
      agent_name: "procurement",
      action_taken: "procurement.inventory_check",
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
      agent_name: "procurement",
      action_taken: "procurement.inventory_check",
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

