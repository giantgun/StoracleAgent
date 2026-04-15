import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import authRouter from "./routes/auth.routes";
import suppliersRouter from "./routes/supplier.routes";
import eventRouter from "./routes/events.routes";
import inventoryRouter from "./routes/inventory.routes";
import simulateRouter from "./routes/simulate.routes";
import webhookRouter from "./routes/webhook.routes";
import dashboardRouter from "./routes/dashboard.routes";
import walletRouter from "./routes/wallet.routes";
import notificationRouter from "./routes/notification.routes";
import paymasterRouter from "./routes/paymaster.routes";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin: process.env.FRONTEND_URL || "https://storacle-frontend.vercel.app",
  optionsSuccessStatus: 200,
  credentials: true,
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors(corsOptions));
app.use(cookieParser());

app.use(/\/auth*/, authRouter);
app.use(/\/suppliers*/, suppliersRouter);
app.use(/\/events*/, eventRouter);
app.use(/\/items*/, inventoryRouter);
app.use(/\/simulate*/, simulateRouter);
app.use(/\/webhooks*/, webhookRouter);
app.use(/\/dashboard*/, dashboardRouter);
app.use(/\/wallet*/, walletRouter);
app.use(/\/notifications*/, notificationRouter);
app.use(/\/paymaster*/, paymasterRouter);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
  });
});

export default app;
