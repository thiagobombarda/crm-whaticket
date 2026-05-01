import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { getProvider, ProviderMessage } from "../../providers/WhatsApp";
import { logger } from "../../utils/logger";
import { checkOutboundRateLimit } from "../../helpers/rateLimiter";
import { buildChatId } from "../../helpers/buildChatId";

import formatBody from "../../helpers/Mustache";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
}

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg
}: Request): Promise<ProviderMessage> => {
  if (!ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_WHATSAPP");
  }

  const whatsapp =
    ticket.whatsapp || (await Whatsapp.findByPk(ticket.whatsappId));
  const channel = whatsapp?.channel || "whatsapp";
  const chatId = buildChatId(channel, ticket.contact.number, ticket.isGroup);

  await checkOutboundRateLimit(ticket.whatsappId);

  try {
    const sentMessage = await getProvider(channel).sendMessage(
      ticket.whatsappId,
      chatId,
      formatBody(body, ticket.contact),
      {
        quotedMessageId: quotedMsg?.id,
        quotedMessageFromMe: quotedMsg?.fromMe,
        linkPreview: false
      }
    );

    await ticket.update({ lastMessage: body });
    return sentMessage;
  } catch (err) {
    logger.error({ info: "Error sending WhatsApp message", err, chatId });
    if (err instanceof AppError) throw err;
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
