import { Router } from "express";
import { getDashboardData } from "../controllers/dashboard.controller";
import { checkAuthentication } from "../controllers/auth.controller";

const router = Router();

router.get("/data", checkAuthentication, getDashboardData as any);

export default router;
