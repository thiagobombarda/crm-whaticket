const GRAPH_API_VERSION = "v21.0";

const instagramConfig = {
  appId: process.env.FACEBOOK_APP_ID || "",
  appSecret: process.env.FACEBOOK_APP_SECRET || "",
  webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || "whaticket_ig_verify",
  graphApiVersion: GRAPH_API_VERSION,
  graphBaseUrl: `https://graph.facebook.com/${GRAPH_API_VERSION}`
};

export default instagramConfig;
