import { Request, Response } from "express";
import axios from "axios";
import { sign, verify } from "jsonwebtoken";

import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";
import instagramConfig from "../config/instagram";
import {
  InstagramSession,
  TOKEN_EXPIRY_SECONDS,
  emitSessionUpdate,
  getPublicBaseUrl,
  exchangeCodeForShortLivedToken,
  exchangeShortForLongLivedToken,
  getAuthenticatedUserInfo,
  subscribeInstagramWebhooks,
  graphGet
} from "../helpers/instagram";
import { disconnectInstagramConnection } from "../helpers/instagramSessionRegistry";
import { closePopupHtml } from "../views/instagramOAuthPopup";

// ─── Helpers ────────────────────────────────────────────────────────────────

const buildRedirectUri = (): string =>
  `${getPublicBaseUrl()}/instagram/oauth/callback`;

const OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights"
].join(",");

const saveInstagramConnection = async (
  whatsapp: Whatsapp,
  session: InstagramSession
): Promise<void> => {
  await whatsapp.update({
    status: "CONNECTED",
    session: JSON.stringify(session),
    name: whatsapp.name || session.username
  });
  emitSessionUpdate(whatsapp);
};

// ─── GET /instagram/oauth/url ────────────────────────────────────────────────

const getOAuthUrl = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.query;
  if (!whatsappId)
    return res.status(400).json({ error: "whatsappId is required" });
  if (!instagramConfig.appId)
    return res.status(500).json({ error: "IG_APP_ID not configured" });

  const state = sign({ whatsappId: Number(whatsappId) }, authConfig.secret, {
    expiresIn: "10m"
  });
  const redirectUri = buildRedirectUri();

  const oauthUrl = new URL(instagramConfig.authorizeUrl);
  oauthUrl.searchParams.set("client_id", instagramConfig.appId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("scope", OAUTH_SCOPES);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("force_reauth", "true");

  return res.json({ url: oauthUrl.toString() });
};

// ─── GET /instagram/oauth/callback ──────────────────────────────────────────

const callback = async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state =
    typeof req.query.state === "string" ? req.query.state : undefined;
  const oauthError =
    typeof req.query.error === "string" ? req.query.error : undefined;

  if (oauthError) {
    res.send(closePopupHtml("Autorização cancelada pelo usuário.", true));
    return;
  }

  if (!code || !state) {
    res.send(closePopupHtml("Parâmetros inválidos.", true));
    return;
  }

  let whatsappId: number;
  try {
    ({ whatsappId } = verify(state, authConfig.secret) as {
      whatsappId: number;
    });
  } catch {
    res.send(closePopupHtml("Link expirado. Tente novamente.", true));
    return;
  }

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp || whatsapp.channel !== "instagram") {
    res.send(closePopupHtml("Conexão não encontrada.", true));
    return;
  }

  try {
    const redirectUri = buildRedirectUri();

    const shortLived = await exchangeCodeForShortLivedToken(code, redirectUri);
    const longLived = await exchangeShortForLongLivedToken(
      shortLived.access_token
    );
    const userInfo = await getAuthenticatedUserInfo(longLived.access_token);

    const tokenExpiresAt = new Date(
      Date.now() + (longLived.expires_in || TOKEN_EXPIRY_SECONDS) * 1000
    ).toISOString();

    const session: InstagramSession = {
      accessToken: longLived.access_token,
      instagramAccountId: userInfo.user_id,
      username: userInfo.username,
      name: userInfo.name,
      tokenExpiresAt
    };

    await subscribeInstagramWebhooks(session.accessToken);
    await saveInstagramConnection(whatsapp, session);

    logger.info({
      info: "Instagram: OAuth connected",
      whatsappId,
      instagramAccountId: session.instagramAccountId,
      username: session.username
    });

    res.send(
      closePopupHtml(
        `Conta <strong>@${session.username}</strong> conectada com sucesso!`
      )
    );
  } catch (err) {
    logger.error({ info: "Instagram: OAuth callback failed", whatsappId, err });
    const message = axios.isAxiosError(err)
      ? (err.response?.data?.error_message as string | undefined) ||
        (err.response?.data?.error?.message as string | undefined) ||
        "Falha ao conectar. Verifique as permissões e tente novamente."
      : "Falha ao conectar. Verifique as permissões e tente novamente.";
    res.send(closePopupHtml(message, true));
  }
};

// ─── POST /instagram/oauth/disconnect ───────────────────────────────────────

const disconnect = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.body;
  if (!whatsappId)
    return res.status(400).json({ error: "whatsappId is required" });

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) return res.status(404).json({ error: "Connection not found" });

  await disconnectInstagramConnection(whatsapp);

  return res.json({ ok: true });
};

// ─── GET /instagram/oauth/diagnose ──────────────────────────────────────────

const diagnose = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.query;
  if (!whatsappId)
    return res.status(400).json({ error: "whatsappId is required" });

  const whatsapp = await Whatsapp.findByPk(Number(whatsappId));
  if (!whatsapp || whatsapp.channel !== "instagram")
    return res.status(404).json({ error: "Connection not found" });

  const session = (() => {
    try {
      const p = JSON.parse(whatsapp.session || "{}");
      if (!p.accessToken || !p.instagramAccountId) return null;
      return p as InstagramSession;
    } catch {
      return null;
    }
  })();

  if (!session)
    return res.status(400).json({ error: "No valid session stored" });

  const [meData, subscribedData] = await Promise.allSettled([
    graphGet<{
      user_id?: string;
      username?: string;
      name?: string;
      account_type?: string;
    }>("/me", session.accessToken, {
      fields: "user_id,username,name,account_type"
    }),
    graphGet<{ data?: unknown[] }>("/me/subscribed_apps", session.accessToken)
  ]);

  return res.json({
    tokenValid: meData.status === "fulfilled",
    username: meData.status === "fulfilled" ? meData.value.username : null,
    instagramAccountId: session.instagramAccountId,
    tokenExpiresAt: session.tokenExpiresAt || null,
    accountType:
      meData.status === "fulfilled" ? (meData.value.account_type ?? null) : null,
    subscribedApps:
      subscribedData.status === "fulfilled"
        ? (subscribedData.value.data ?? [])
        : null,
    tokenError:
      meData.status === "rejected"
        ? (meData.reason as Error).message
        : undefined,
    subscribeError:
      subscribedData.status === "rejected"
        ? (subscribedData.reason as Error).message
        : undefined
  });
};

// ─── POST /instagram/oauth/resubscribe ──────────────────────────────────────

const resubscribe = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.body;
  if (!whatsappId)
    return res.status(400).json({ error: "whatsappId is required" });

  const whatsapp = await Whatsapp.findByPk(Number(whatsappId));
  if (!whatsapp || whatsapp.channel !== "instagram")
    return res.status(404).json({ error: "Connection not found" });

  const session = (() => {
    try {
      const p = JSON.parse(whatsapp.session || "{}");
      if (!p.accessToken) return null;
      return p as InstagramSession;
    } catch {
      return null;
    }
  })();

  if (!session)
    return res.status(400).json({ error: "No valid session stored" });

  await subscribeInstagramWebhooks(session.accessToken);
  logger.info({
    info: "Instagram: webhook re-subscribed",
    whatsappId: Number(whatsappId)
  });
  return res.json({ ok: true });
};

export default { getOAuthUrl, callback, disconnect, diagnose, resubscribe };
