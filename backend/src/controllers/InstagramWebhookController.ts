import crypto from "crypto";
import { Request, Response } from "express";
import axios from "axios";
import Whatsapp from "../models/Whatsapp";
import { handleMessage } from "../handlers/handleWhatsappEvents";
import { logger } from "../utils/logger";
import instagramConfig from "../config/instagram";
import {
  InstagramSession,
  MetaWebhookPayload,
  MetaMessagingEvent,
  MetaAttachment,
  fromIgsid,
  parseInstagramSession
} from "../helpers/instagram";
import type { ContactPayload, MediaPayload } from "../handlers/handleWhatsappEvents";
import type { ProviderMessage } from "../providers/WhatsApp/types";

// ─── Page-index cache: facebookPageId → whatsappId ──────────────────────────

const pageIndex = new Map<string, number>();

const invalidatePageIndex = (facebookPageId: string): void => {
  pageIndex.delete(facebookPageId);
};

const resolveWhatsappId = async (facebookPageId: string): Promise<number | null> => {
  const cached = pageIndex.get(facebookPageId);
  if (cached) return cached;

  const connections = await Whatsapp.findAll({
    where: { channel: "instagram", status: "CONNECTED" }
  });

  for (const conn of connections) {
    const session = parseInstagramSession(conn.session);
    if (session?.facebookPageId === facebookPageId) {
      pageIndex.set(facebookPageId, conn.id);
      return conn.id;
    }
  }

  return null;
};

// ─── GET /instagram/webhook — Meta verification ──────────────────────────────

const verify = (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === instagramConfig.webhookVerifyToken) {
    logger.info({ info: "Instagram: webhook verified" });
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};

// ─── POST /instagram/webhook — Incoming messages ─────────────────────────────

const receive = (req: Request, res: Response): void => {
  if (!verifySignature(req)) {
    res.sendStatus(403);
    return;
  }

  // Respond immediately — Meta requires < 20s
  res.sendStatus(200);

  processWebhookPayload(req.body as MetaWebhookPayload).catch(err => {
    logger.error({ info: "Instagram: webhook processing error", err });
  });
};

// ─── Signature verification ──────────────────────────────────────────────────

const verifySignature = (req: Request): boolean => {
  if (!instagramConfig.appSecret) {
    // Development mode: skip verification when secret is not configured
    return true;
  }

  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  if (!signature) return false; // Reject unsigned requests in production

  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", instagramConfig.appSecret)
    .update(rawBody)
    .digest("hex")}`;

  return signature === expected;
};

// ─── Attachment helpers ───────────────────────────────────────────────────────

const mapAttachmentType = (type: string): ProviderMessage["type"] => {
  const map: Record<string, ProviderMessage["type"]> = {
    image: "image",
    video: "video",
    audio: "audio",
    file: "document"
  };
  return map[type] ?? "document";
};

const downloadMediaAttachment = async (
  attachment: MetaAttachment,
  messageId: string
): Promise<MediaPayload | undefined> => {
  const url = attachment.payload?.url;
  if (!url) return undefined;

  try {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    const contentType: string = res.headers["content-type"] || "image/jpeg";
    const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
    return {
      filename: `instagram_${messageId}.${ext}`,
      mimetype: contentType,
      data: Buffer.from(res.data).toString("base64")
    };
  } catch (err) {
    logger.warn({ info: "Instagram: media download failed", err });
    return undefined;
  }
};

const fetchContactProfile = async (
  igsid: string,
  pageAccessToken: string
): Promise<{ name: string; profilePicUrl?: string }> => {
  const fallback = { name: fromIgsid(igsid) };
  try {
    const res = await axios.get(`${instagramConfig.graphBaseUrl}/${igsid}`, {
      params: { fields: "name,profile_pic", access_token: pageAccessToken }
    });
    return { name: res.data.name || fallback.name, profilePicUrl: res.data.profile_pic };
  } catch {
    return fallback;
  }
};

const buildProviderMessage = (
  event: MetaMessagingEvent,
  loggedIgsid: string
): ProviderMessage => {
  const msg = event.message!;
  const attachment = msg.attachments?.[0];
  const hasMedia = !!attachment;

  return {
    id: msg.mid,
    body: msg.text || "",
    fromMe: event.sender.id === loggedIgsid,
    hasMedia,
    type: hasMedia ? mapAttachmentType(attachment!.type) : "chat",
    timestamp: Math.floor(event.timestamp / 1000),
    from: fromIgsid(event.sender.id),
    to: fromIgsid(event.recipient.id),
    ack: event.sender.id === loggedIgsid ? 2 : 0
  };
};

// ─── Webhook payload processing ───────────────────────────────────────────────

const processMessagingEvent = async (
  event: MetaMessagingEvent,
  whatsappId: number,
  session: InstagramSession
): Promise<void> => {
  if (!event.message || event.message.is_echo) return;

  const providerMsg = buildProviderMessage(event, session.instagramAccountId);
  const igsidToFetch = providerMsg.fromMe ? event.recipient.id : event.sender.id;
  const { name, profilePicUrl } = await fetchContactProfile(
    igsidToFetch,
    session.pageAccessToken
  );

  const contactPayload: ContactPayload = {
    name,
    number: fromIgsid(igsidToFetch),
    profilePicUrl,
    isGroup: false
  };

  const attachment = event.message.attachments?.[0];
  const mediaPayload = attachment
    ? await downloadMediaAttachment(attachment, event.message.mid)
    : undefined;

  await handleMessage(
    providerMsg,
    contactPayload,
    { whatsappId, unreadMessages: providerMsg.fromMe ? 0 : 1, channel: "instagram" },
    mediaPayload
  );
};

const processWebhookPayload = async (payload: MetaWebhookPayload): Promise<void> => {
  if (payload.object !== "instagram") return;

  for (const entry of payload.entry) {
    const whatsappId = await resolveWhatsappId(entry.id);
    if (!whatsappId) {
      logger.warn({ info: "Instagram webhook: no connection for page", pageId: entry.id });
      continue;
    }

    const whatsapp = await Whatsapp.findByPk(whatsappId);
    const session = parseInstagramSession(whatsapp?.session);
    if (!session) continue;

    for (const event of entry.messaging) {
      await processMessagingEvent(event, whatsappId, session).catch(err => {
        logger.error({ info: "Instagram: error processing webhook event", err });
      });
    }
  }
};

export { invalidatePageIndex };
export default { verify, receive };
