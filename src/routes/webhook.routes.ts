import express from "express";
import { handleMailWebhook } from "../controllers/webhook.controller";

const router = express.Router();

// AgentMail posts all email events here
router.post("/mail", handleMailWebhook);

export default router;
