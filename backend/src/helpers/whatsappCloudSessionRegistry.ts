import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import {
  WhatsAppCloudSession,
  parseWhatsAppCloudSession
} from "./whatsappCloud";

// ─── Registry ────────────────────────────────────────────────────────────────

class WhatsAppCloudSessionRegistry {
  private sessionsByWhatsappId = new Map<number, WhatsAppCloudSession>();
  private whatsappIdByPhoneNumberId = new Map<string, number>();

  load(whatsappId: number, session: WhatsAppCloudSession): void {
    this.sessionsByWhatsappId.set(whatsappId, session);
    this.whatsappIdByPhoneNumberId.set(session.phoneNumberId, whatsappId);
  }

  remove(whatsappId: number): void {
    const session = this.sessionsByWhatsappId.get(whatsappId);
    if (session) {
      this.whatsappIdByPhoneNumberId.delete(session.phoneNumberId);
    }
    this.sessionsByWhatsappId.delete(whatsappId);
  }

  getByWhatsappId(whatsappId: number): WhatsAppCloudSession | undefined {
    return this.sessionsByWhatsappId.get(whatsappId);
  }

  async resolveWhatsappIdByPhoneNumberId(
    phoneNumberId: string
  ): Promise<number | null> {
    const cached = this.whatsappIdByPhoneNumberId.get(phoneNumberId);
    if (cached !== undefined) return cached;

    const connections = await Whatsapp.findAll({
      where: { channel: "whatsapp_cloud", status: "CONNECTED" }
    });

    for (const conn of connections) {
      const session = parseWhatsAppCloudSession(conn.session);
      if (session) this.load(conn.id, session);
    }

    return this.whatsappIdByPhoneNumberId.get(phoneNumberId) ?? null;
  }
}

export const whatsappCloudSessionRegistry =
  new WhatsAppCloudSessionRegistry();

// ─── Disconnect helper ────────────────────────────────────────────────────────

export const disconnectWhatsAppCloudConnection = async (
  whatsapp: Whatsapp
): Promise<void> => {
  whatsappCloudSessionRegistry.remove(whatsapp.id);
  await whatsapp.update({ status: "WAITING_LOGIN", session: "" });
  const io = getIO();
  io.to("notification").emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });
};
