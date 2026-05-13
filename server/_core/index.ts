import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routes/routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ─── Webhook Z-API (Multi-tenant) ──────────────────────────────────────────
  app.post("/api/webhook", async (req, res) => {
    // يجب دائماً الرد بـ 200 فوراً حتى لا يُعيد Z-API الإرسال
    res.status(200).send("OK");

    try {
      const { extractMessageFromWebhook } = await import("../services/zapi.service");
      const { handleIncomingMessage } = await import("../services/bot.engine");

      const payload = req.body;
      const extracted = extractMessageFromWebhook(payload);

      if (!extracted) return; // رسالة مُرسَلة منّا أو غير صالحة

      console.log(`[Webhook] رسالة واردة | instance: ${extracted.instanceId} | من: ${extracted.phone}`);

      // المعالجة في الخلفية
      handleIncomingMessage(extracted.instanceId, extracted.phone, extracted.message)
        .catch(err => console.error("[Bot Error]", err));

    } catch (error) {
      console.error("[Webhook Error]:", error);
    }
  });
  // ───────────────────────────────────────────────────────────────────────────

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);