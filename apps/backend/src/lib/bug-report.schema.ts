import { z } from "zod";

export const bugReportSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  screenshot: z.string().max(5_000_000).optional(),
  device: z.object({
    screen: z.string().max(100),
    viewport: z.string().max(100),
    pixelRatio: z.number().finite().min(0).max(20),
    userAgent: z.string().max(1000),
    platform: z.string().max(200),
    language: z.string().max(100),
    timezone: z.string().max(100),
    url: z.string().url().max(2000),
  }),
});

export type BugReport = z.infer<typeof bugReportSchema>;
