import { Router } from "express";
import isAuth from "../middleware/isAuth";
import InstagramOAuthController from "../controllers/InstagramOAuthController";

const instagramRoutes = Router();

// OAuth — requires user authentication
instagramRoutes.get("/instagram/oauth/url", isAuth, InstagramOAuthController.getOAuthUrl);
instagramRoutes.get("/instagram/oauth/callback", InstagramOAuthController.callback);
instagramRoutes.post("/instagram/oauth/disconnect", isAuth, InstagramOAuthController.disconnect);

export default instagramRoutes;
