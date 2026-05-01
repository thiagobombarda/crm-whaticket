import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";

export const emitWhatsappSessionUpdate = (whatsapp: Whatsapp): void => {
  getIO().to("notification").emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });
};
