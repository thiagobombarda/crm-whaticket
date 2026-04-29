import "../bootstrap";
import { Job } from "bullmq";
import * as Sentry from "@sentry/node";

import { createWorker } from "../libs/queue";
import {
  handleMessage,
  MessagePayload,
  ContactPayload,
  MediaPayload,
  WhatsappContextPayload
} from "../handlers/handleWhatsappEvents";
import { logger } from "../utils/logger";

export interface InboundMessageJobData {
  messagePayload: MessagePayload;
  contactPayload: ContactPayload;
  contextPayload: WhatsappContextPayload;
  mediaPayload?: MediaPayload;
}

export const startMessageWorker = () => {
  const concurrency = parseInt(process.env.MESSAGE_WORKER_CONCURRENCY || "5", 10);

  const worker = createWorker<InboundMessageJobData>(
    "inbound-messages",
    async (job: Job<InboundMessageJobData>) => {
      const { messagePayload, contactPayload, contextPayload, mediaPayload } =
        job.data;

      logger.debug({
        info: "Processing inbound message job",
        jobId: job.id,
        messageId: messagePayload.id,
        whatsappId: contextPayload.whatsappId
      });

      await handleMessage(
        messagePayload,
        contactPayload,
        contextPayload,
        mediaPayload
      );
    },
    concurrency
  );

  logger.info({ info: "Message worker started", concurrency });

  return worker;
};
