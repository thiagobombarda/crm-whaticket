import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";
import {
  graphGet,
  parseWhatsAppCloudSession,
  WhatsAppCloudSession
} from "../helpers/whatsappCloud";
import {
  whatsappCloudSessionRegistry,
  disconnectWhatsAppCloudConnection
} from "../helpers/whatsappCloudSessionRegistry";
import { getIO } from "../libs/socket";

// ─── POST /whatsapp-cloud/connect ────────────────────────────────────────────

const connect = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId, phoneNumberId, wabaId, accessToken } = req.body;

  if (!whatsappId || !phoneNumberId || !wabaId || !accessToken) {
    return res.status(400).json({ error: "whatsappId, phoneNumberId, wabaId e accessToken são obrigatórios" });
  }

  const whatsapp = await Whatsapp.findByPk(Number(whatsappId));
  if (!whatsapp || whatsapp.channel !== "whatsapp_cloud") {
    return res.status(404).json({ error: "Conexão não encontrada" });
  }

  let displayPhoneNumber: string | undefined;
  let verifiedName: string | undefined;

  try {
    const data = await graphGet<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
    }>(`/${phoneNumberId}`, accessToken, {
      fields: "id,display_phone_number,verified_name"
    });
    displayPhoneNumber = data.display_phone_number;
    verifiedName = data.verified_name;
  } catch (err) {
    logger.warn({ info: "WhatsApp Cloud: connect validation failed", whatsappId, err });
    return res.status(400).json({ error: "Token inválido ou Phone Number ID incorreto. Verifique as credenciais." });
  }

  const session: WhatsAppCloudSession = {
    phoneNumberId,
    wabaId,
    accessToken,
    displayPhoneNumber,
    verifiedName
  };

  await whatsapp.update({
    status: "CONNECTED",
    session: JSON.stringify(session),
    name: whatsapp.name || verifiedName || displayPhoneNumber || phoneNumberId
  });

  whatsappCloudSessionRegistry.load(whatsapp.id, session);

  const io = getIO();
  io.to("notification").emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });

  logger.info({
    info: "WhatsApp Cloud: connected",
    whatsappId,
    phoneNumberId,
    displayPhoneNumber
  });

  return res.json({ ok: true, displayPhoneNumber, verifiedName });
};

// ─── POST /whatsapp-cloud/disconnect ─────────────────────────────────────────

const disconnect = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.body;
  if (!whatsappId) {
    return res.status(400).json({ error: "whatsappId é obrigatório" });
  }

  const whatsapp = await Whatsapp.findByPk(Number(whatsappId));
  if (!whatsapp || whatsapp.channel !== "whatsapp_cloud") {
    return res.status(404).json({ error: "Conexão não encontrada" });
  }

  await disconnectWhatsAppCloudConnection(whatsapp);
  return res.json({ ok: true });
};

// ─── GET /whatsapp-cloud/diagnose ─────────────────────────────────────────────

const diagnose = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.query;
  if (!whatsappId) {
    return res.status(400).json({ error: "whatsappId é obrigatório" });
  }

  const whatsapp = await Whatsapp.findByPk(Number(whatsappId));
  if (!whatsapp || whatsapp.channel !== "whatsapp_cloud") {
    return res.status(404).json({ error: "Conexão não encontrada" });
  }

  const session = parseWhatsAppCloudSession(whatsapp.session);
  if (!session) {
    return res.status(400).json({ error: "Nenhuma sessão configurada" });
  }

  const result = await graphGet<{
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  }>(`/${session.phoneNumberId}`, session.accessToken, {
    fields: "id,display_phone_number,verified_name,quality_rating"
  }).then(data => ({ ok: true, ...data })).catch(err => ({
    ok: false,
    error: err?.response?.data?.error?.message || err.message
  }));

  return res.json({ phoneNumberId: session.phoneNumberId, wabaId: session.wabaId, ...result });
};

export default { connect, disconnect, diagnose };
