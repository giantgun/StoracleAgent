import http from "http";
import app from "./app";
import dotenv from "dotenv";
import ngrok from "@ngrok/ngrok";
import { AgentMailClient } from "agentmail";
import { initializeRealtimeListener } from "./services/event-listener.service";

dotenv.config();

// Initialize Supabase realtime listener for SSE broadcasting
initializeRealtimeListener();

const mailClient = new AgentMailClient({
  apiKey: process.env.AGENT_MAIL_API_KEY,
});

const port = process.env.SERVER_PORT || 3000;
app.set("port", port);

const server = http.createServer(app);

server.listen(port, async () => {
  console.log(`Server running on http://localhost:${port}`);

  // Start the task worker alongside the server
  Bun.spawn(["bun", "src/workers/task.worker.ts"], {
    stdio: ["ignore", "inherit", "inherit"],
    onExit(proc: any, exitCode: any, signalCode: any, error: any) {
      console.log(`Task worker exited with code ${exitCode}`);
    },
  });
  console.log("Task worker started alongside server");

  // Register AgentMail webhook via ngrok tunnel
  if (process.env.NGROK_AUTHTOKEN && process.env.NODE_ENV !== "production") {
     await ngrok.authtoken(process.env.NGROK_AUTHTOKEN)
    try {
      const listener = await ngrok.connect({
        addr: Number(port),
        authtoken: process.env.NGROK_AUTHTOKEN,
      });

      const webhookUrl = `${listener.url()}/webhooks/mail`;
      console.log(`Ngrok tunnel active: ${listener.url()}`);

      await mailClient.webhooks.create({
        url: webhookUrl,
        eventTypes: ["message.received"],
      });

      console.log(`AgentMail webhook registered: ${webhookUrl}`);
    } catch (err) {
      console.error("Ngrok/webhook setup failed:", err);
    }
  } else {
    console.warn(
      "NGROK_AUTHTOKEN not set — AgentMail webhook not registered. " +
      "Set NGROK_AUTHTOKEN in .env or configure a public webhook URL manually.",
    );
  }
});
