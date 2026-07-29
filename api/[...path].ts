// Vercel serverless entrypoint — this file's name (a catch-all dynamic route)
// means Vercel routes every request under /api/* here. It reuses the exact
// same Express app as the traditional server (server.ts's createApp()), just
// without ever calling app.listen() — Vercel's own runtime owns the HTTP
// layer and invokes this exported function directly per request.
//
// createApp()/bootstrapAdmin() only re-run on a genuine cold start: the
// cached handler below is reused for every request that hits an already-warm
// function instance.
import type { IncomingMessage, ServerResponse } from "http";
import serverless from "serverless-http";
import { createApp, bootstrapAdmin } from "../server.ts";

let cachedHandler: ReturnType<typeof serverless> | null = null;

async function getHandler() {
  if (!cachedHandler) {
    const app = await createApp();
    await bootstrapAdmin();
    cachedHandler = serverless(app);
  }
  return cachedHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const h = await getHandler();
  return h(req, res);
}
