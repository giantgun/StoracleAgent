import express from "express";
import asyncHandler from "express-async-handler";
import { checkAuthentication } from "../controllers/auth.controller";
import {
  addSupplier,
  deleteSupplier,
  editSupplier,
} from "../controllers/suppliers.controller";

const router = express.Router();

router.post(
  "/add",
  asyncHandler(checkAuthentication),
  asyncHandler(addSupplier),
);

router.post(
  "/edit",
  asyncHandler(checkAuthentication),
  asyncHandler(editSupplier),
);

router.post(
  "/delete",
  asyncHandler(checkAuthentication),
  asyncHandler(deleteSupplier),
);

export default router;
