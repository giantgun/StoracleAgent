// fred.d.ts

import { Request } from "express";

declare module "node-fred" {
  export default class Fred {
    constructor(apiKey: string);
    series: {
      observations(
        seriesId: string,
        params?: {
          units?:
            | "lin"
            | "chg"
            | "ch1"
            | "pch"
            | "pc1"
            | "pca"
            | "cch"
            | "cca"
            | "log";
          file_type?: "json" | "xml";
          sort_order?: "asc" | "desc";
          limit?: number;
          [key: string]: any;
        },
      ): Promise<any>;
    };
  }
}

// src/types/express/index.d.ts

export interface CustomRequest extends Request {
  token?: string;
  user?: any;
}
