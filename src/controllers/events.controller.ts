import { type Response } from "express";
import { sseService } from "../services/sse.service";

/**
 * GET /events
 *
 * SSE endpoint. Authenticates the client via the checkAuthentication
 * middleware (which reads the access_token cookie or Authorization header).
 * Registers the connection with SSEService and streams events until disconnect.
 */
export async function events(req: any, res: Response) {
  const user = req.user;
  if (!user?.id) {
    res.status(401).end();
    return;
  }

  const userId = user.id;
  // In this app, the user/org id from auth IS the org_id
  const orgId = user.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const clientId = sseService.addClient(userId, orgId, res);

  // Send welcome event so the client knows the connection is ready
  const welcome = `data: ${JSON.stringify({
    type: "ready",
    timestamp: new Date().toISOString(),
    data: { message: "connected" },
    org_id: orgId,
  })}\n\n`;
  res.write(welcome);

  // Periodic heartbeat to prevent network-level timeout
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({
      type: "ping",
      timestamp: new Date().toISOString(),
      data: {},
      org_id: orgId,
    })}\n\n`);
  }, 25000);

  res.on("close", () => {
    clearInterval(heartbeat);
    sseService.removeClient(clientId);
  });
}
