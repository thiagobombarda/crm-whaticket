import { Request, Response } from "express";
import axios from "axios";
import { sign, verify } from "jsonwebtoken";

import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";
import instagramConfig from "../config/instagram";
import {
  InstagramSession,
  FacebookPage,
  TOKEN_EXPIRY_SECONDS,
  emitSessionUpdate,
  getPublicBaseUrl,
  parseInstagramSession,
  subscribePageWebhooks,
  unsubscribePageWebhooks
} from "../helpers/instagram";
import { invalidatePageIndex } from "./InstagramWebhookController";

// ─── Helpers ────────────────────────────────────────────────────────────────

const buildRedirectUri = (req: Request): string =>
  `${getPublicBaseUrl()}/instagram/oauth/callback`;

const closePopupHtml = (message: string, isError = false): string => `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><title>Instagram</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f7f8fa; }
    .box { text-align: center; padding: 40px; background: #fff; border-radius: 16px;
           box-shadow: 0 4px 24px rgba(0,0,0,.1); max-width: 360px; }
    h2   { margin: 0 0 8px; color: ${isError ? "#ef4444" : "#16a34a"}; font-size: 20px; }
    p    { margin: 0; color: #6b7280; font-size: 14px; }
  </style>
  </head>
  <body>
    <div class="box">
      <h2>${isError ? "Erro" : "Conectado!"}</h2>
      <p>${message}</p>
    </div>
    <script>setTimeout(() => window.close(), ${isError ? 4000 : 2000})</script>
  </body>
  </html>`;

const exchangeCodeForLongLivedToken = async (
  code: string,
  redirectUri: string
): Promise<{ longToken: string; tokenExpiresAt: string }> => {
  const { appId, appSecret, graphBaseUrl } = instagramConfig;

  const { data: shortData } = await axios.get(`${graphBaseUrl}/oauth/access_token`, {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }
  });

  const { data: longData } = await axios.get(`${graphBaseUrl}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortData.access_token
    }
  });

  const expiresIn: number = longData.expires_in || TOKEN_EXPIRY_SECONDS;
  return {
    longToken: longData.access_token,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  };
};

const findInstagramPage = async (
  longToken: string
): Promise<FacebookPage | null> => {
  const { data } = await axios.get(`${instagramConfig.graphBaseUrl}/me/accounts`, {
    params: {
      fields: "id,name,access_token,instagram_business_account",
      access_token: longToken
    }
  });
  return (data.data as FacebookPage[]).find(p => p.instagram_business_account?.id) ?? null;
};

const saveInstagramConnection = async (
  whatsapp: Whatsapp,
  session: InstagramSession
): Promise<void> => {
  await whatsapp.update({
    status: "CONNECTED",
    session: JSON.stringify(session),
    name: whatsapp.name || session.pageName
  });
  emitSessionUpdate(whatsapp);
};

// ─── GET /instagram/oauth/url ────────────────────────────────────────────────

const getOAuthUrl = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.query;
  if (!whatsappId) return res.status(400).json({ error: "whatsappId is required" });
  if (!instagramConfig.appId) return res.status(500).json({ error: "FACEBOOK_APP_ID not configured" });

  const state = sign({ whatsappId: Number(whatsappId) }, authConfig.secret, { expiresIn: "10m" });
  const redirectUri = buildRedirectUri(req);
  const scope = [
    "instagram_basic",
    "instagram_manage_messages",
    "pages_show_list",
    "pages_messaging",
    "pages_read_engagement"
  ].join(",");

  const url =
    `https://www.facebook.com/${instagramConfig.graphApiVersion}/dialog/oauth` +
    `?client_id=${instagramConfig.appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  return res.json({ url });
};

// ─── GET /instagram/oauth/callback ──────────────────────────────────────────

const callback = async (req: Request, res: Response): Promise<void> => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) {
    res.send(closePopupHtml("Autorização cancelada pelo usuário.", true));
    return;
  }

  if (!code || !state) {
    res.send(closePopupHtml("Parâmetros inválidos.", true));
    return;
  }

  // Validate state JWT → extract whatsappId
  let whatsappId: number;
  try {
    ({ whatsappId } = verify(state, authConfig.secret) as { whatsappId: number });
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
    const redirectUri = buildRedirectUri(req);

    const { longToken, tokenExpiresAt } = await exchangeCodeForLongLivedToken(code, redirectUri);
    const page = await findInstagramPage(longToken);

    if (!page) {
      res.send(closePopupHtml(
        "Nenhuma conta Instagram Business encontrada vinculada às suas Páginas do Facebook. " +
        "Certifique-se de ter uma conta Instagram Professional vinculada a uma Página.",
        true
      ));
      return;
    }

    const session: InstagramSession = {
      pageAccessToken: page.access_token,
      instagramAccountId: page.instagram_business_account!.id,
      facebookPageId: page.id,
      pageName: page.name,
      tokenExpiresAt
    };

    await subscribePageWebhooks(session.facebookPageId, session.pageAccessToken);
    await saveInstagramConnection(whatsapp, session);

    logger.info({
      info: "Instagram: OAuth connected",
      whatsappId,
      facebookPageId: session.facebookPageId,
      instagramAccountId: session.instagramAccountId,
      pageName: session.pageName
    });

    res.send(closePopupHtml(`Conta <strong>${session.pageName}</strong> conectada com sucesso!`));
  } catch (err: any) {
    logger.error({ info: "Instagram: OAuth callback failed", whatsappId, err });
    const message =
      err?.response?.data?.error?.message ||
      "Falha ao conectar. Verifique as permissões e tente novamente.";
    res.send(closePopupHtml(message, true));
  }
};

// ─── POST /instagram/oauth/disconnect ───────────────────────────────────────

const disconnect = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.body;
  if (!whatsappId) return res.status(400).json({ error: "whatsappId is required" });

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) return res.status(404).json({ error: "Connection not found" });

  const session = parseInstagramSession(whatsapp.session);
  if (session) {
    await unsubscribePageWebhooks(session.facebookPageId, session.pageAccessToken);
    invalidatePageIndex(session.facebookPageId);
  }

  await whatsapp.update({ status: "WAITING_LOGIN", session: "" });
  emitSessionUpdate(whatsapp);

  return res.json({ ok: true });
};

export default { getOAuthUrl, callback, disconnect };
