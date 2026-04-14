import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import { signUserOp, getPaymasterStatus } from "../controllers/paymaster.controller";

const router = express.Router();

// All paymaster routes require authentication
router.use(asyncHandler(checkAuthentication));

router.post("/sign", asyncHandler(signUserOp));
router.get("/status", asyncHandler(getPaymasterStatus));

export default router;