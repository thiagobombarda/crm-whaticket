import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";
import { getProvider } from "../providers/WhatsApp";
import { buildChatId } from "./buildChatId";

const SetTicketMessagesAsRead = async (ticket: Ticket): Promise<void> => {
  await Message.update(
    { read: true },
    {
      where: {
        ticketId: ticket.id,
        read: false
      }
    }
  );

  await ticket.update({ unreadMessages: 0 });

  try {
    if (ticket.whatsappId) {
      const whatsapp = ticket.whatsapp || await Whatsapp.findByPk(ticket.whatsappId);
      const channel = whatsapp?.channel || "whatsapp";
      await getProvider(channel).sendSeen(
        ticket.whatsappId,
        buildChatId(channel, ticket.contact.number, ticket.isGroup)
      );
    }
  } catch (err) {
    logger.warn(
      `Could not mark messages as read. Maybe whatsapp session disconnected? Err: ${err}`
    );
  }

  const io = getIO();
  io.to(ticket.status).to("notification").emit("ticket", {
    action: "updateUnread",
    ticketId: ticket.id
  });
};

export default SetTicketMessagesAsRead;
