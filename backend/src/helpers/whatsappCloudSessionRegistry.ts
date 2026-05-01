import Whatsapp from "../models/Whatsapp";
import {
  WhatsAppCloudSession,
  parseWhatsAppCloudSession
} from "./whatsappCloud";
import { MetaSessionRegistry } from "./metaSessionRegistry";
import { emitWhatsappSessionUpdate } from "./emitWhatsappSessionUpdate";

// ─── Registry ────────────────────────────────────────────────────────────────

export const whatsappCloudSessionRegistry =
  new MetaSessionRegistry<WhatsAppCloudSession>(
    s => s.phoneNumberId,
    async () => {
      const conns = await Whatsapp.findAll({
        where: { channel: "whatsapp_cloud", status: ["CONNECTED", "DISCONNECTED"] }
      });
      return conns
        .map(c => ({ id: c.id, session: parseWhatsAppCloudSession(c.session) }))
        .filter(
          (r): r is { id: number; session: WhatsAppCloudSession } =>
            r.session !== null
        );
    }
  );

export const resolveWhatsappIdByPhoneNumberId = (phoneNumberId: string) =>
  whatsappCloudSessionRegistry.resolveBySecondaryKey(phoneNumberId);

// ─── Disconnect helper ────────────────────────────────────────────────────────

export const disconnectWhatsAppCloudConnection = async (
  whatsapp: Whatsapp
): Promise<void> => {
  whatsappCloudSessionRegistry.remove(whatsapp.id);
  await whatsapp.update({ status: "WAITING_LOGIN", session: "" });
  emitWhatsappSessionUpdate(whatsapp);
};
