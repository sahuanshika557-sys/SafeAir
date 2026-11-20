import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleAqiRequest,
  handleChatRequest,
  handleGeocodeRequest,
  handlePlanRequest,
} from './src/server/apiHandlers.ts';
import { extractSafeErrorDiagnostics } from './src/utils/errorDiagnostics.ts';

const PORT = 3000;

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  app.all('/api/geocode', (req: Request, res: Response): void => {
    void handleGeocodeRequest(req, res);
  });

  app.all('/api/aqi', (req: Request, res: Response): void => {
    void handleAqiRequest(req, res);
  });

  app.all('/api/plan', (req: Request, res: Response): void => {
    void handlePlanRequest(req, res);
  });

  app.all('/api/chat', (req: Request, res: Response): void => {
    void handleChatRequest(req, res);
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.get('*', async (req: Request, res: Response, next) => {
      try {
        const html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.warn(`SafeAir Saathi server listening on port ${PORT}`);
  });
}

startServer().catch((err: unknown) => {
  console.error('Server failed to start:', extractSafeErrorDiagnostics(err));
  process.exit(1);
});
