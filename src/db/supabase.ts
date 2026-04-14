import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { CookieOptions, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";

export const createAuthClient = (req: Request, res: Response) => {
  return createServerClient(supabaseUrl, supabaseSecretKey, {
    cookies: {
      get(name: string) {
        const cookies = parseCookieHeader(req.headers.cookie ?? "");
        return cookies.find((cookie) => cookie.name === name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        res.appendHeader(
          "Set-Cookie",
          serializeCookieHeader(name, value, options),
        );
      },
      remove(name: string, options: CookieOptions) {
        res.appendHeader(
          "Set-Cookie",
          serializeCookieHeader(name, "", options),
        );
      },
    },
  });
};

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
