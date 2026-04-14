import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import { markNotificationAsRead } from "../controllers/notification.controller";

const router = express.Router();

router.patch("/:id/read", asyncHandler(checkAuthentication), asyncHandler(markNotificationAsRead));

export default router;
