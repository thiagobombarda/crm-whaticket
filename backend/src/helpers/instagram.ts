import axios from "axios";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import instagramConfig from "../config/instagram";

// ─── Shared types ────────────────────────────────────────────────────────────

export interface InstagramSession {
  pageAccessToken: string;
  instagramAccountId: string;
  facebookPageId: string;
  pageName: string;
  tokenExpiresAt?: string;
}

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string;
  time: number;
  messaging: MetaMessagingEvent[];
}

export interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: MetaMessage;
  read?: { watermark: number };
  delivery?: { watermark: number };
}

export interface MetaMessage {
  mid: string;
  text?: string;
  attachments?: MetaAttachment[];
  is_echo?: boolean;
}

export interface MetaAttachment {
  type: string;
  payload: { url?: string };
}

export interface GraphApiSendResponse {
  message_id?: string;
  recipient_id?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const IG_PREFIX = "ig_";
export const TOKEN_EXPIRY_SECONDS = 5184000; // 60 days
export const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const TOKEN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

// Meta Graph API error codes that indicate an invalid/expired token
export const META_ERROR_INVALID_TOKEN = 190;
export const META_ERROR_SESSION_EXPIRED = 102;

export const GRAPH_TIMEOUT_MS = 10_000;

const IG_PREFIX_REGEX = /^ig_/;

// ─── Shared helpers ──────────────────────────────────────────────────────────

export const toIgsid = (prefixedId: string): string =>
  prefixedId.replace(IG_PREFIX_REGEX, "");

export const fromIgsid = (rawId: string): string => `${IG_PREFIX}${rawId}`;

export const parseInstagramSession = (
  raw: string | null | undefined
): InstagramSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.pageAccessToken || !parsed.instagramAccountId) return null;
    return parsed as InstagramSession;
  } catch {
    return null;
  }
};

export const emitSessionUpdate = (whatsapp: Whatsapp): void => {
  const io = getIO();
  io.to("notification").emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });
};

export const getPublicBaseUrl = (): string => {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  const proxyPortRaw = process.env.PROXY_PORT;
  if (proxyPortRaw) {
    const parsed = parseInt(proxyPortRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
      return `${backendUrl}:${parsed}`;
    }
  }
  return backendUrl;
};

// ─── Graph API wrappers ──────────────────────────────────────────────────────

export const graphGet = async <T = Record<string, unknown>>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T> => {
  const res = await axios.get<T>(`${instagramConfig.graphBaseUrl}${path}`, {
    params: { access_token: token, ...params },
    timeout: GRAPH_TIMEOUT_MS
  });
  return res.data;
};

export const graphPost = async <T = Record<string, unknown>>(
  path: string,
  token: string,
  data: object
): Promise<T> => {
  const res = await axios.post<T>(
    `${instagramConfig.graphBaseUrl}${path}`,
    data,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: GRAPH_TIMEOUT_MS
    }
  );
  return res.data;
};

export const isInvalidTokenError = (err: unknown): boolean => {
  if (!axios.isAxiosError(err)) return false;
  const code: number | undefined = err.response?.data?.error?.code;
  return (
    code === META_ERROR_INVALID_TOKEN || code === META_ERROR_SESSION_EXPIRED
  );
};

// ─── Page webhook subscription helpers ──────────────────────────────────────

export const subscribePageWebhooks = async (
  pageId: string,
  pageAccessToken: string
): Promise<void> => {
  try {
    await axios.post(
      `${instagramConfig.graphBaseUrl}/${pageId}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: "messages,messaging_postbacks,message_reads",
          access_token: pageAccessToken
        },
        timeout: GRAPH_TIMEOUT_MS
      }
    );
  } catch (err) {
    logger.warn({
      info: "Instagram: webhook subscription failed (non-fatal)",
      pageId,
      err: axios.isAxiosError(err) ? err.response?.data : err
    });
  }
};

export const unsubscribePageWebhooks = async (
  pageId: string,
  pageAccessToken: string
): Promise<void> => {
  try {
    await axios.delete(
      `${instagramConfig.graphBaseUrl}/${pageId}/subscribed_apps`,
      {
        params: { access_token: pageAccessToken },
        timeout: GRAPH_TIMEOUT_MS
      }
    );
  } catch (err) {
    logger.warn({
      info: "Instagram: webhook unsubscription failed (non-fatal)",
      pageId,
      err: axios.isAxiosError(err) ? err.response?.data : err
    });
  }
};
