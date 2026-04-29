import Whatsapp from "../models/Whatsapp";
import {
  InstagramSession,
  parseInstagramSession,
  unsubscribePageWebhooks,
  emitSessionUpdate
} from "./instagram";

// ─── Registry ────────────────────────────────────────────────────────────────

class InstagramSessionRegistry {
  private sessionsByWhatsappId = new Map<number, InstagramSession>();
  private whatsappIdByPageId = new Map<string, number>();

  load(whatsappId: number, session: InstagramSession): void {
    this.sessionsByWhatsappId.set(whatsappId, session);
    this.whatsappIdByPageId.set(session.facebookPageId, whatsappId);
  }

  remove(whatsappId: number): void {
    const session = this.sessionsByWhatsappId.get(whatsappId);
    if (session) {
      this.whatsappIdByPageId.delete(session.facebookPageId);
    }
    this.sessionsByWhatsappId.delete(whatsappId);
  }

  getByWhatsappId(whatsappId: number): InstagramSession | undefined {
    return this.sessionsByWhatsappId.get(whatsappId);
  }

  async resolveWhatsappIdByPage(
    facebookPageId: string
  ): Promise<number | null> {
    const cached = this.whatsappIdByPageId.get(facebookPageId);
    if (cached !== undefined) return cached;

    const connections = await Whatsapp.findAll({
      where: { channel: "instagram", status: "CONNECTED" }
    });

    for (const conn of connections) {
      const session = parseInstagramSession(conn.session);
      if (session) {
        this.load(conn.id, session);
      }
    }

    return this.whatsappIdByPageId.get(facebookPageId) ?? null;
  }
}

export const instagramSessionRegistry = new InstagramSessionRegistry();

// ─── Disconnect helper (unsubscribe + cleanup + DB update + socket emit) ─────

export const disconnectInstagramConnection = async (
  whatsapp: Whatsapp
): Promise<void> => {
  const session = parseInstagramSession(whatsapp.session);
  if (session) {
    await unsubscribePageWebhooks(
      session.facebookPageId,
      session.pageAccessToken
    );
  }
  instagramSessionRegistry.remove(whatsapp.id);
  await whatsapp.update({ status: "WAITING_LOGIN", session: "" });
  emitSessionUpdate(whatsapp);
};
