import axios from "axios";
import Whatsapp from "../../../models/Whatsapp";
import { logger } from "../../../utils/logger";
import instagramConfig from "../../../config/instagram";
import {
  InstagramSession,
  META_ERROR_INVALID_TOKEN,
  META_ERROR_SESSION_EXPIRED,
  TOKEN_EXPIRY_SECONDS,
  TOKEN_REFRESH_THRESHOLD_MS,
  emitSessionUpdate,
  getPublicBaseUrl,
  parseInstagramSession,
  toIgsid,
  fromIgsid,
  unsubscribePageWebhooks
} from "../../../helpers/instagram";
import type { WhatsappProvider } from "../whatsappProvider";
import type {
  ProviderMessage,
  ProviderContact,
  ProviderMediaInput,
  SendMessageOptions,
  SendMediaOptions
} from "../types";

// ─── In-memory session cache ─────────────────────────────────────────────────

const sessions = new Map<number, InstagramSession>();

// ─── Utilities ───────────────────────────────────────────────────────────────

const resolveAttachmentType = (mimetype: string): string => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "file";
};

const extractMessageId = (result: Record<string, unknown>): string =>
  (result.message_id as string) || String(Date.now());

// ─── Graph API wrappers ──────────────────────────────────────────────────────

const graphPost = async (
  path: string,
  token: string,
  data: object
): Promise<Record<string, unknown>> => {
  const res = await axios.post(
    `${instagramConfig.graphBaseUrl}${path}`,
    data,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

const graphGet = async (
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<Record<string, unknown>> => {
  const res = await axios.get(`${instagramConfig.graphBaseUrl}${path}`, {
    params: { access_token: token, ...params }
  });
  return res.data;
};

// ─── Provider implementation ────────────────────────────────────────────────

const init = async (whatsapp: Whatsapp): Promise<void> => {
  const session = parseInstagramSession(whatsapp.session);

  if (!session) {
    await whatsapp.update({ status: "WAITING_LOGIN" });
    emitSessionUpdate(whatsapp);
    return;
  }

  try {
    await graphGet("/me", session.pageAccessToken, { fields: "id,name" });
    sessions.set(whatsapp.id, session);
    await whatsapp.update({ status: "CONNECTED" });
    emitSessionUpdate(whatsapp);
    logger.info({ info: "Instagram: session restored", whatsappId: whatsapp.id, page: session.pageName });
  } catch (err: any) {
    const errCode: number | undefined = err?.response?.data?.error?.code;
    logger.warn({ info: "Instagram: token validation failed", whatsappId: whatsapp.id, errCode });

    const status = errCode === META_ERROR_INVALID_TOKEN || errCode === META_ERROR_SESSION_EXPIRED ? "WAITING_LOGIN" : "DISCONNECTED";
    const update = status === "WAITING_LOGIN"
      ? { status, session: "" }
      : { status };
    await whatsapp.update(update);
    emitSessionUpdate(whatsapp);
  }
};

const removeSession = (whatsappId: number): void => {
  sessions.delete(whatsappId);
};

const logout = async (sessionId: number): Promise<void> => {
  const session = sessions.get(sessionId);
  removeSession(sessionId);

  if (session) {
    await unsubscribePageWebhooks(session.facebookPageId, session.pageAccessToken);
  }

  const whatsapp = await Whatsapp.findByPk(sessionId);
  if (whatsapp) {
    await whatsapp.update({ status: "WAITING_LOGIN", session: "" });
    emitSessionUpdate(whatsapp);
  }
};

const sendMessage = async (
  sessionId: number,
  to: string,
  body: string,
  _options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Instagram session not found");

  const result = await graphPost(
    `/${s.instagramAccountId}/messages`,
    s.pageAccessToken,
    { recipient: { id: toIgsid(to) }, message: { text: body } }
  );

  return {
    id: extractMessageId(result),
    body,
    fromMe: true,
    hasMedia: false,
    type: "chat",
    timestamp: Math.floor(Date.now() / 1000),
    from: fromIgsid(s.instagramAccountId),
    to,
    ack: 2
  };
};

const sendMedia = async (
  sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Instagram session not found");

  const attachmentType = resolveAttachmentType(media.mimetype);
  const mediaUrl = media.path
    ? `${getPublicBaseUrl()}/public/${media.path.split(/[\\/]/).pop()}`
    : null;

  const result = await (mediaUrl
    ? graphPost(`/${s.instagramAccountId}/messages`, s.pageAccessToken, {
        recipient: { id: toIgsid(to) },
        message: { attachment: { type: attachmentType, payload: { url: mediaUrl, is_reusable: false } } }
      })
    : graphPost(`/${s.instagramAccountId}/messages`, s.pageAccessToken, {
        recipient: { id: toIgsid(to) },
        message: { text: options?.caption || media.filename }
      })
  );

  return {
    id: extractMessageId(result),
    body: options?.caption || media.filename,
    fromMe: true,
    hasMedia: true,
    type: attachmentType as ProviderMessage["type"],
    timestamp: Math.floor(Date.now() / 1000),
    from: fromIgsid(s.instagramAccountId),
    to,
    ack: 2
  };
};

const getProfilePicUrl = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const s = sessions.get(sessionId);
  if (!s) return "";
  try {
    const data = await graphGet(`/${toIgsid(number)}`, s.pageAccessToken, { fields: "profile_pic" });
    return (data.profile_pic as string) || "";
  } catch {
    return "";
  }
};

/** Instagram Messaging API does not support message deletion. */
const deleteMessage = async (): Promise<void> => {};

/** Instagram contact IDs are passed through as-is (IGSID prefixed with "ig_"). */
const checkNumber = async (_sessionId: number, number: string): Promise<string> => number;

/** Instagram Messaging API does not provide contact lists. */
const getContacts = async (): Promise<ProviderContact[]> => [];

/** Instagram Messaging API does not support marking messages as read via business account. */
const sendSeen = async (): Promise<void> => {};

/** Instagram Messaging API does not support fetching historical messages. */
const fetchChatMessages = async (): Promise<ProviderMessage[]> => [];

// ─── Token refresh (called from server.ts daily job) ─────────────────────────

const refreshOneToken = async (conn: Whatsapp): Promise<void> => {
  const session = parseInstagramSession(conn.session);
  if (!session?.tokenExpiresAt) return;

  const expiresAt = new Date(session.tokenExpiresAt).getTime();
  if (expiresAt - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) return;

  try {
    const res = await axios.get(`${instagramConfig.graphBaseUrl}/oauth/access_token`, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: instagramConfig.appId,
        client_secret: instagramConfig.appSecret,
        fb_exchange_token: session.pageAccessToken
      }
    });

    const newExpiry = new Date(
      Date.now() + ((res.data.expires_in as number) || TOKEN_EXPIRY_SECONDS) * 1000
    ).toISOString();

    const updated: InstagramSession = {
      ...session,
      pageAccessToken: res.data.access_token as string,
      tokenExpiresAt: newExpiry
    };

    await conn.update({ session: JSON.stringify(updated) });
    sessions.set(conn.id, updated);
    logger.info({ info: "Instagram: token refreshed", whatsappId: conn.id, page: session.pageName });
  } catch (err) {
    logger.error({ info: "Instagram: token refresh failed", whatsappId: conn.id, err });
  }
};

export const refreshInstagramTokens = async (): Promise<void> => {
  const connections = await Whatsapp.findAll({
    where: { channel: "instagram", status: "CONNECTED" }
  });
  await Promise.all(connections.map(refreshOneToken));
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const InstagramProvider: WhatsappProvider = {
  init,
  removeSession,
  logout,
  sendMessage,
  sendMedia,
  deleteMessage,
  checkNumber,
  getProfilePicUrl,
  getContacts,
  sendSeen,
  fetchChatMessages
};
