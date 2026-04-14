import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import { events } from "../controllers/events.controller";

const router = express.Router();

router.get("/", asyncHandler(checkAuthentication), asyncHandler(events));

export default router;
