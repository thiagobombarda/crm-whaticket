import axios from "axios";
import crypto from "crypto";
import { Request } from "express";
import whatsappCloudConfig from "../config/whatsappCloud";

const GRAPH_TIMEOUT_MS = 10_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhatsAppCloudSession {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
}

export interface WACWebhookPayload {
  object: string;
  entry: WACWebhookEntry[];
}

export interface WACWebhookEntry {
  id: string;
  changes: WACWebhookChange[];
}

export interface WACWebhookChange {
  value: WACChangeValue;
  field: string;
}

export interface WACChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages?: WACMessage[];
  statuses?: WACStatus[];
}

export interface WACMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  video?: { id: string; mime_type: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
  document?: { id: string; mime_type: string; filename?: string };
  sticker?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number };
  reaction?: { message_id: string; emoji: string };
}

export interface WACStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const parseWhatsAppCloudSession = (
  raw: string | null | undefined
): WhatsAppCloudSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.phoneNumberId || !parsed.accessToken) return null;
    return parsed as WhatsAppCloudSession;
  } catch {
    return null;
  }
};

export const graphGet = async <T = Record<string, unknown>>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T> => {
  const res = await axios.get<T>(
    `${whatsappCloudConfig.graphBaseUrl}${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: GRAPH_TIMEOUT_MS
    }
  );
  return res.data;
};

export const graphPost = async <T = Record<string, unknown>>(
  path: string,
  token: string,
  data: object
): Promise<T> => {
  const res = await axios.post<T>(
    `${whatsappCloudConfig.graphBaseUrl}${path}`,
    data,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: GRAPH_TIMEOUT_MS
    }
  );
  return res.data;
};

export const verifyWACSignature = (req: Request): boolean => {
  if (!whatsappCloudConfig.appSecret) return true;
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  if (!signature || !req.rawBody) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", whatsappCloudConfig.appSecret)
    .update(req.rawBody)
    .digest("hex")}`;
  const exp = Buffer.from(expected);
  const act = Buffer.from(signature);
  if (exp.length !== act.length) return false;
  return crypto.timingSafeEqual(exp, act);
};

export const downloadWACMedia = async (
  mediaId: string,
  token: string
): Promise<{ data: Buffer; contentType: string } | null> => {
  try {
    const meta = await graphGet<{ url: string; mime_type: string }>(
      `/${mediaId}`,
      token
    );
    const res = await axios.get<ArrayBuffer>(meta.url, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30_000
    });
    return { data: Buffer.from(res.data), contentType: meta.mime_type };
  } catch {
    return null;
  }
};
