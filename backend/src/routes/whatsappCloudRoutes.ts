import { Router } from "express";
import isAuth from "../middleware/isAuth";
import WhatsAppCloudController from "../controllers/WhatsAppCloudController";

const whatsappCloudRoutes = Router();

whatsappCloudRoutes.post(
  "/whatsapp-cloud/connect",
  isAuth,
  WhatsAppCloudController.connect
);
whatsappCloudRoutes.post(
  "/whatsapp-cloud/disconnect",
  isAuth,
  WhatsAppCloudController.disconnect
);
whatsappCloudRoutes.get(
  "/whatsapp-cloud/diagnose",
  isAuth,
  WhatsAppCloudController.diagnose
);
whatsappCloudRoutes.post(
  "/whatsapp-cloud/register",
  isAuth,
  WhatsAppCloudController.register
);

export default whatsappCloudRoutes;
