import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import { simulatePurchase } from "../controllers/simulate.controller";

const router = express.Router();

router.post(
  "/purchase",
  asyncHandler(checkAuthentication),
  asyncHandler(simulatePurchase),
);

export default router;
