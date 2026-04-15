import { AgentMailClient } from "agentmail";
import dotenv from "dotenv";
import { supabase } from "../db/supabase";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { OpenRouter } from '@openrouter/sdk';
import { base } from "viem/chains";
import { ChatOpenRouter } from "@langchain/openrouter";
import { extractText, getDocumentProxy } from "unpdf";
import { string } from "zod/v4";

dotenv.config();

const mailClient = new AgentMailClient({
  apiKey: process.env.AGENT_MAIL_API_KEY,
});

async function parsePdf(attachmentId: string) {
  // Invoke the Edge Function via the Supabase client
  const { data, error } = await supabase.functions.invoke('pdf-parse', {
    body: { attachmentId: attachmentId },
  });

  if (error) {
    console.error("Edge Function Error:", error);
    throw new Error(`Failed to process invoice via Edge Function: ${error.message}`);
  }

  return data.extractedText;
}

export async function readInvoiceService(attachmentId: string): Promise<{
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number | null;
  supplier_address: string | null;
  due_date: string | null;
}> {
  const { data, error } = await supabase
    .from("invoice_attachments")
    .select("file_data, content_type, filename")
    .eq("id", attachmentId)
    .single();

  if (error || !data) throw new Error(`Invoice attachment not found: ${attachmentId}`);

  const base64Content = data.file_data;
  let extractedText = [] as string | string[];

  // --- NEW: Convert Base64 PDF to Text ---
  if (data.content_type === "application/pdf") {
    const text = await parsePdf(attachmentId);
    extractedText = text;
  } else {
    extractedText = Buffer.from(base64Content, 'base64').toString('utf-8');
  }

  console.log("Extracted text from invoice:", JSON.stringify(extractedText, null, 2));

  // const model = new ChatOpenRouter({
  //   model: "openrouter/elephant-alpha",
  //   apiKey: process.env.OPENROUTER_API_KEY,
  // });

  const model = new ChatOpenAI({
    modelName: "openrouter/elephant-alpha",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

  const result = await model.invoke([
    new SystemMessage(
      `You are an invoice parser. Extract details from the provided text.
      the product_name is the name of the item being invoiced, quantity is how many units, unit_price is the cost per unit, total_amount is the total cost, supplier_address is the blockcchain address of the supplier, and due_date is when payment is due it can also be expressed as expiry date.
      Return ONLY valid JSON in this format: 
      { "product_name": string, "quantity": number, "unit_price": number, "total_amount": number, "supplier_address": string, "due_date": string | null }. 
      If a field is missing, return null. Do not include conversational text or markdown blocks.`
    ),
    new HumanMessage(`Here is the raw text extracted from the invoice: \n\n ${JSON.stringify(extractedText, null, 2)}`),
  ]);

  console.log("Raw model result content:", result.content);

  const rawContent = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  // Clean potential markdown and parse
  const cleaned = rawContent.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export async function sendInvoiceRequestService(
  itemId: string,
  quantity: number,
) {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, organization_id, unit_name, expected_purchase_price_in_usdt, supplier_id")
    .eq("id", itemId)
    .single();

  if (error) throw new Error("Error fetching inventory item");

  const { data: supplierData, error: supplierError } = await supabase
    .from("suppliers")
    .select("email, name")
    .eq("id", data.supplier_id)
    .single();

  if (supplierError) throw new Error("Error fetching supplier");

  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("agent_inbox_id, name, business_email")
    .eq("id", data.organization_id)
    .single();

  if (orgError) throw new Error("Error fetching organization data");

  const { agent_inbox_id, name: orgName, business_email } = orgData;
  const { email: supplier_email } = supplierData;
  const { name: itemName, unit_name, expected_purchase_price_in_usdt } = data;

  // Generate email content with Gemini
  // const model = new ChatGoogleGenerativeAI({
  //   model: "gemini-3.1-flash-lite-preview",
  //   apiKey: process.env.GOOGLE_API_KEY,
  // });

  const model = new ChatOpenAI({
    modelName: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

  const result = await model.invoke([
    new SystemMessage(
      `You are an AI assistant that writes professional procurement emails to suppliers requesting invoices for inventory items. You work for ${orgName}.
Write a professional email to the supplier requesting an invoice for ${quantity} ${unit_name}(s) of ${itemName}.
The email should be polite and concise. Sign with the company name ${orgName}.
Return ONLY valid JSON: {"subject": "string", "body": "string"}`
    ),
    new HumanMessage(`Write an email to ${supplierData.name} requesting an invoice for ${quantity} ${unit_name}(s) of ${itemName}. Sign with the company name ${orgName}. Return ONLY valid JSON with "subject" and "body" fields.`),
  ]);

  const content = typeof result.content === "string"
    ? result.content
    : result.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const { subject, body } = JSON.parse(cleaned);

  await sendEmail(agent_inbox_id, supplier_email, subject, body, business_email);

  await supabase.from("inventory_events").insert({
    organization_id: data.organization_id,
    inventory_item_id: itemId,
    event_type: "invoice_requested",
    quantity_change: quantity,
    metadata: { supplier_email, expected_price_per_unit: expected_purchase_price_in_usdt },
  });

  return { sent: true, to: supplier_email, quantity, item: itemName };
}

export async function sendInvoicePaidService(
  itemId: string,
  quantity: number,
  attachmentId: string,
  txHash: string,
) {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, organization_id, unit_name, expected_purchase_price_in_usdt, supplier_id")
    .eq("id", itemId)
    .single();

  if (error) throw new Error("Error fetching inventory item");

  const { data: supplierData, error: supplierError } = await supabase
    .from("suppliers")
    .select("email, name")
    .eq("id", data.supplier_id)
    .single();

  if (supplierError) throw new Error("Error fetching supplier");

  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("agent_inbox_id, name, business_email")
    .eq("id", data.organization_id)
    .single();

  if (orgError) throw new Error("Error fetching organization data");

  const { agent_inbox_id, name: orgName, business_email } = orgData;
  const { name: itemName, unit_name, expected_purchase_price_in_usdt } = data;

  // Generate email content with Gemini
  // const model = new ChatGoogleGenerativeAI({
  //   model: "gemini-3.1-flash-lite-preview",
  //   apiKey: process.env.GOOGLE_API_KEY,
  // });

  const model = new ChatOpenAI({
    modelName: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

  const result = await model.invoke([
    new SystemMessage(
      `You are an AI assistant that writes professional procurement emails to suppliers requesting invoices for inventory items. You work for ${orgName}.
Write a professional email to the supplier saying the invoice for ${quantity} ${unit_name}(s) of ${itemName} has been paid and this is the sepolia tx hash: ${txHash}.
The email should be polite and concise. Sign with the company name ${orgName}, and that you've attached said invoice.
Return ONLY valid JSON: {"subject": "string", "body": "string"}`
    ),
    new HumanMessage(`Write an email to ${supplierData.name} notifying them that the invoice for ${quantity} ${unit_name}(s) of ${itemName} has been paid. Sign with the company name ${orgName}. Return ONLY valid JSON with "subject" and "body" fields.`),
  ]);

  const content = typeof result.content === "string"
    ? result.content
    : result.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const { subject, body } = JSON.parse(cleaned);

  await sendEmail(agent_inbox_id, supplierData.email, subject, body, business_email, attachmentId);

  await supabase.from("inventory_events").insert({
    organization_id: data.organization_id,
    inventory_item_id: itemId,
    event_type: "invoice_requested",
    quantity_change: quantity,
    metadata: { supplier_name: supplierData.name, expected_price_per_unit: expected_purchase_price_in_usdt },
  });

  return { sent: true, to: supplierData.email, quantity, item: itemName, supplierName: supplierData.name };
}

async function sendEmail(
  inboxId: string,
  to: string,
  subject: string,
  body: string,
  cc: string,
  attachmentId?: string,
): Promise<string> {
  try {
    let base64Content
    if (attachmentId) {
      const { data, error } = await supabase
        .from("invoice_attachments")
        .select("file_data, content_type, filename")
        .eq("id", attachmentId)
        .single();

      if (error || !data) throw new Error(`Invoice attachment not found: ${attachmentId}`);

      const mimeType = data.content_type || "application/octet-stream";
      base64Content = data.file_data;
    }
    await mailClient.inboxes.messages.send(inboxId, {
      to,
      subject,
      text: body,
      cc,
      attachments: base64Content
    });
    return `Email sent successfully from ${inboxId} to ${to}`;
  } catch (error: any) {
    return `Failed to send email from ${inboxId} to ${to}: ${error.message}`;
  }
}
