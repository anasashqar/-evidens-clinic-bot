export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /**
   * سر الـ webhook — يُضاف كـ query param في URL الـ Z-API webhook
   * مثال URL: https://yoursite.com/trpc/webhook.zapi?secret=YOUR_SECRET
   * إذا كان فارغاً: لا يوجد تحقق (لبيئة التطوير فقط)
   */
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
};
