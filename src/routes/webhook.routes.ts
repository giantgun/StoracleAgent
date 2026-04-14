import express from "express";
import { handleMailWebhook, keepAliveWebhook } from "../controllers/webhook.controller";
import asyncHandler from "express-async-handler";

const router = express.Router();

// AgentMail posts all email events here
router.post("/mail", handleMailWebhook);

router.get("/", asyncHandler(keepAliveWebhook));

export default router;
