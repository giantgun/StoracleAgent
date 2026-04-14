import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import {
  addItem,
  confirmFulfillment,
  deleteItem,
  editItem,
} from "../controllers/inventory.controller";

const router = express.Router();

router.post("/add", asyncHandler(checkAuthentication), asyncHandler(addItem));
router.post("/edit", asyncHandler(checkAuthentication), asyncHandler(editItem));
router.post("/delete", asyncHandler(checkAuthentication), asyncHandler(deleteItem));
router.post("/transit", asyncHandler(checkAuthentication), asyncHandler(confirmFulfillment));

export default router;
