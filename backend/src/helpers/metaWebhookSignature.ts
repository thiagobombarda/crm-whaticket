import { Request } from "express";
import crypto from "crypto";

export const verifyMetaSignature = (req: Request, appSecret: string): boolean => {
  if (!appSecret) return true;

  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !signature.startsWith("sha256=")) return false;

  const raw = req.rawBody;
  if (!raw) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(raw)
    .digest("hex")}`;

  const exp = Buffer.from(expected);
  const act = Buffer.from(signature);
  if (exp.length !== act.length) return false;
  return crypto.timingSafeEqual(exp, act);
};
