import express from "express";
import asyncHandler from "express-async-handler";
import {
  signup,
  signout,
  signin,
  checkAuthentication,
  updateOrg,
  orgData,
} from "../controllers/auth.controller";
import {
  getSessionKeyPublicAddress,
  setSessionKeyApproval,
  toggleAgentActiveForOrg,
} from "../controllers/keys.controller";

const router = express.Router();

router.post("/signup", asyncHandler(signup));

router.post("/signin", asyncHandler(signin));

router.post(
  "/org/update",
  asyncHandler(checkAuthentication),
  asyncHandler(updateOrg),
);

router.get("/org/", asyncHandler(checkAuthentication), asyncHandler(orgData));

router.post(
  "/org/agent",
  asyncHandler(checkAuthentication),
  asyncHandler(toggleAgentActiveForOrg),
);

router.get(
  "/session-address",
  asyncHandler(checkAuthentication),
  asyncHandler(getSessionKeyPublicAddress),
);

router.post(
  "/session-approval",
  asyncHandler(checkAuthentication),
  asyncHandler(setSessionKeyApproval),
);

router.get("/signout", asyncHandler(signout));

export default router;
