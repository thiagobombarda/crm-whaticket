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
  GRAPH_TIMEOUT_MS,
  emitSessionUpdate,
  getPublicBaseUrl,
  subscribePageWebhooks,
  graphGet
} from "../helpers/instagram";
import { disconnectInstagramConnection } from "../helpers/instagramSessionRegistry";
import { closePopupHtml } from "../views/instagramOAuthPopup";

// ─── Helpers ────────────────────────────────────────────────────────────────

const buildRedirectUri = (): string =>
  `${getPublicBaseUrl()}/instagram/oauth/callback`;

const OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_messaging",
  "pages_read_engagement"
].join(",");

const exchangeCodeForLongLivedToken = async (
  code: string,
  redirectUri: string
): Promise<{ longToken: string; tokenExpiresAt: string }> => {
  const { appId, appSecret, graphBaseUrl } = instagramConfig;

  const { data: shortData } = await axios.get<{ access_token: string }>(
    `${graphBaseUrl}/oauth/access_token`,
    {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code
      },
      timeout: GRAPH_TIMEOUT_MS
    }
  );

  const { data: longData } = await axios.get<{
    access_token: string;
    expires_in?: number;
  }>(`${graphBaseUrl}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortData.access_token
    },
    timeout: GRAPH_TIMEOUT_MS
  });

  const expiresIn = longData.expires_in || TOKEN_EXPIRY_SECONDS;
  return {
    longToken: longData.access_token,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  };
};

const findInstagramPage = async (
  longToken: string
): Promise<FacebookPage | null> => {
  const result = await graphGet<{ data: FacebookPage[] }>(
    "/me/accounts",
    longToken,
    { fields: "id,name,access_token,instagram_business_account" }
  );
  const pages = Array.isArray(result.data) ? result.data : [];
  return pages.find(p => p.instagram_business_account?.id) ?? null;
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
  if (!whatsappId)
    return res.status(400).json({ error: "whatsappId is required" });
  if (!instagramConfig.appId)
    return res.status(500).json({ error: "FACEBOOK_APP_ID not configured" });

  const state = sign({ whatsappId: Number(whatsappId) }, authConfig.secret, {
    expiresIn: "10m"
  });
  const redirectUri = buildRedirectUri();

  const oauthUrl = new URL(
    `https://www.facebook.com/${instagramConfig.graphApiVersion}/dialog/oauth`
  );
  oauthUrl.searchParams.set("client_id", instagramConfig.appId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("scope", OAUTH_SCOPES);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);

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

    const { longToken, tokenExpiresAt } = await exchangeCodeForLongLivedToken(
      code,
      redirectUri
    );
    const page = await findInstagramPage(longToken);

    if (!page) {
      res.send(
        closePopupHtml(
          "Nenhuma conta Instagram Business encontrada vinculada às suas Páginas do Facebook. " +
            "Certifique-se de ter uma conta Instagram Professional vinculada a uma Página.",
          true
        )
      );
      return;
    }

    const session: InstagramSession = {
      pageAccessToken: page.access_token,
      instagramAccountId: page.instagram_business_account!.id,
      facebookPageId: page.id,
      pageName: page.name,
      tokenExpiresAt
    };

    await subscribePageWebhooks(
      session.facebookPageId,
      session.pageAccessToken
    );
    await saveInstagramConnection(whatsapp, session);

    logger.info({
      info: "Instagram: OAuth connected",
      whatsappId,
      facebookPageId: session.facebookPageId,
      instagramAccountId: session.instagramAccountId,
      pageName: session.pageName
    });

    res.send(
      closePopupHtml(
        `Conta <strong>${session.pageName}</strong> conectada com sucesso!`
      )
    );
  } catch (err) {
    logger.error({ info: "Instagram: OAuth callback failed", whatsappId, err });
    const message = axios.isAxiosError(err)
      ? (err.response?.data?.error?.message as string | undefined) ||
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

export default { getOAuthUrl, callback, disconnect };
