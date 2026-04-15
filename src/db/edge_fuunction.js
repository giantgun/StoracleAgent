// supabase/functions/process-invoice/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { attachmentId } = await req.json();

    // 1) Supabase Admin (Edge Functions env vars are available automatically)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2) Fetch the file
    const { data, error } = await supabase
      .from("invoice_attachments")
      .select("file_data, content_type")
      .eq("id", attachmentId)
      .single();

    if (error || !data) throw new Error("Attachment not found");

    // 3) Basic PDF text extraction
    const pdfBytes = Uint8Array.from(
      atob(data.file_data),
      (c) => c.charCodeAt(0)
    );

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const extractedText = pages.map((p) => p.toString()).join("\n");

    // 4) Return extracted text (LLM call can happen here later)
    return new Response(JSON.stringify({ extractedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});