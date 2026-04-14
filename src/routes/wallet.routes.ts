import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import { saveSessionApproval, getSessionStatus, getWalletBalance, revokeSessionApproval } from "../controllers/wallet.controller";

const router = express.Router();

router.post("/session-approval", asyncHandler(checkAuthentication), asyncHandler(saveSessionApproval));
router.post("/session-revoke", asyncHandler(checkAuthentication), asyncHandler(revokeSessionApproval));
router.get("/status", asyncHandler(checkAuthentication), asyncHandler(getSessionStatus));
router.get("/balance", asyncHandler(checkAuthentication), asyncHandler(getWalletBalance));

export default router;
