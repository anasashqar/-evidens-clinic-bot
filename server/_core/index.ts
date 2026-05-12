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

  // --- تمت إضافة نقطة استقبال واتساب (Webhook) هنا ---
  // app.post("/api/webhook", async (req, res) => {
  //   try {
  //     const payload = req.body;

  //     // نتأكد أن الرسالة من مريض (وليست من البوت نفسه أو من مجموعة)
  //     if (!payload.fromMe && !payload.isGroup) {
  //       const phone = payload.phone;
  //       // استخراج نص الرسالة حسب هيكلية Z-API
  //       const textMessage = payload.text?.message || payload.text || "";

  //       if (phone && typeof textMessage === "string" && textMessage.trim().length > 0) {
  //         console.log(`[WhatsApp] رسالة جديدة من ${phone}: ${textMessage}`);
          
  //         // تمرير الرسالة إلى البوت ليعالجها بالذكاء الاصطناعي (في الخلفية)
  //         handleIncomingMessage(phone, textMessage, false).catch(err => {
  //           console.error("[Bot Error] خطأ أثناء معالجة الرسالة:", err);
  //         });
  //       }
  //     }

  //     // يجب دائماً الرد بـ 200 لكي لا يقوم Z-API بإعادة الإرسال
  //     res.status(200).send("OK");
  //   } catch (error) {
  //     console.error("[Webhook Error]:", error);
  //     res.status(500).send("Error");
  //   }
  // });
  // ----------------------------------------------------

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