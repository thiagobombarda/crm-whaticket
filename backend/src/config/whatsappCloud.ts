export default {
  graphBaseUrl:
    process.env.WA_CLOUD_GRAPH_URL || "https://graph.facebook.com/v19.0",
  webhookVerifyToken:
    process.env.WA_CLOUD_WEBHOOK_VERIFY_TOKEN || "whaticket_wac_verify",
  appSecret: process.env.WA_CLOUD_APP_SECRET || ""
};
