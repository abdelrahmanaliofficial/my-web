import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const RAW_LARAVEL_API_URL = (process.env.LARAVEL_API_URL || '').trim();
const AUTO_START_LARAVEL = process.env.AUTO_START_LARAVEL === 'true';
const LARAVEL_API_URL = (RAW_LARAVEL_API_URL || 'http://127.0.0.1:8100').replace(/\/+$/, '');
let managedLaravelProcess: ChildProcess | null = null;
let backendReadySettled = false;
let backendReadyPromise: Promise<void> = Promise.resolve();
let hasLaravelTarget = false;
let lastHealthCheckAt = 0;

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (args[i].startsWith('--port=')) {
      const parsed = Number(args[i].slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  if (process.env.APP_PORT) {
    const parsed = Number(process.env.APP_PORT);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  if (process.env.PORT && process.env.PORT !== process.env.NGINX_PORT) {
    const parsed = Number(process.env.PORT);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const fallback = Number(process.env.DEFAULT_APP_PORT || 3000);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 3000;
}

function buildAllowedOrigins(): string[] {
  const candidates = [
    process.env.FRONTEND_ORIGIN,
    process.env.APP_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter((origin): origin is string => Boolean(origin && origin.trim()));

  return Array.from(new Set(candidates.map((origin) => origin.replace(/\/+$/, ''))));
}

function getForwardedHeaders(req: Request): {
  forwardedHost: string;
  forwardedProto: string;
  forwardedPort: string;
  forwardedFor: string;
} {
  const forwardedHost = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .toString()
    .split(',')[0]
    .trim();
  const forwardedProto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .toString()
    .split(',')[0]
    .trim();
  const forwardedPort = (
    req.headers['x-forwarded-port'] ||
    (forwardedProto === 'https' ? '443' : '80')
  )
    .toString()
    .split(',')[0]
    .trim();
  const forwardedFor = (req.headers['x-forwarded-for'] || req.ip || '')
    .toString()
    .trim();

  return { forwardedHost, forwardedProto, forwardedPort, forwardedFor };
}

async function isLaravelHealthy(apiBaseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureLaravelReachable(): Promise<boolean> {
  if (!backendReadySettled) {
    await backendReadyPromise;
  }

  const now = Date.now();
  if (now - lastHealthCheckAt > 10000) {
    lastHealthCheckAt = now;
    hasLaravelTarget = await isLaravelHealthy(LARAVEL_API_URL);
  }
  return hasLaravelTarget;
}

async function ensureLocalLaravelBackend(apiBaseUrl: string): Promise<void> {
  lastHealthCheckAt = Date.now();
  if (await isLaravelHealthy(apiBaseUrl)) {
    hasLaravelTarget = true;
    return;
  }

  if (!AUTO_START_LARAVEL) {
    console.warn('[Laravel Supervisor] Laravel is not responding. Start it separately or set AUTO_START_LARAVEL=true after configuring its environment. No migrations or setup commands are run automatically.');
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    console.warn('[Laravel Supervisor] LARAVEL_API_URL is invalid.');
    return;
  }

  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    console.warn('[Laravel Supervisor] Automatic Laravel startup is allowed only for a local API URL.');
    return;
  }

  const laravelDir = path.join(process.cwd(), 'laravel');
  const artisanPath = path.join(laravelDir, 'artisan');
  const vendorAutoload = path.join(laravelDir, 'vendor', 'autoload.php');
  if (!fs.existsSync(artisanPath) || !fs.existsSync(vendorAutoload)) {
    console.warn('[Laravel Supervisor] Laravel framework files or Composer dependencies are missing. Start/configure Laravel manually before using /api.');
    return;
  }

  const envPath = path.join(laravelDir, '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('[Laravel Supervisor] laravel/.env is missing. Automatic startup was skipped; copy and configure laravel/.env.example manually.');
    return;
  }

  // Deliberately do not run key:generate, migrate, storage:link, or database services here.
  // Those are explicit setup/maintenance actions and must never run implicitly on app startup.
  const port = parsed.port || '8100';
  managedLaravelProcess = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`], {
    cwd: laravelDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  managedLaravelProcess.stdout?.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[Laravel] ${line}`);
  });
  managedLaravelProcess.stderr?.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.error(`[Laravel] ${line}`);
  });
  managedLaravelProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[Laravel] Process exited with code ${code}`);
    }
    managedLaravelProcess = null;
    hasLaravelTarget = false;
  });

  for (let i = 0; i < 25; i++) {
    if (await isLaravelHealthy(apiBaseUrl)) {
      hasLaravelTarget = true;
      console.log(`[Laravel Supervisor] Laravel API ready on ${apiBaseUrl}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  console.warn(`[Laravel Supervisor] Timed out waiting for ${apiBaseUrl}/api/health`);
}

async function proxyToLaravel(req: Request, res: Response, next: NextFunction) {
  if (!(await ensureLaravelReachable())) {
    return res.status(503).json({
      success: false,
      message: 'Laravel API backend is not configured or running in this environment.',
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(req.originalUrl, LARAVEL_API_URL);
  } catch {
    return next();
  }

  const { forwardedHost, forwardedProto, forwardedPort, forwardedFor } = getForwardedHeaders(req);
  const transport = targetUrl.protocol === 'https:' ? https : http;
  const headers: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: targetUrl.host,
    'x-forwarded-host': forwardedHost,
    'x-forwarded-proto': forwardedProto,
    'x-forwarded-port': forwardedPort,
    'x-forwarded-for': forwardedFor,
  };

  delete headers['accept-encoding'];

  const proxyReq = transport.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers,
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value !== undefined && key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'ECONNREFUSED') {
      hasLaravelTarget = false;
      console.warn(`[Laravel Proxy] Upstream unavailable for ${req.method} ${req.originalUrl}`);
    } else {
      console.error(`[Laravel Proxy Error] ${req.method} ${req.originalUrl}:`, error.message);
    }
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: 'Laravel API backend is unavailable.',
      });
    }
  });

  req.pipe(proxyReq);
}

async function verifyLaravelAdminCaller(req: Request): Promise<boolean> {
  if (!(await ensureLaravelReachable())) {
    return false;
  }

  try {
    const { forwardedHost, forwardedProto, forwardedPort, forwardedFor } = getForwardedHeaders(req);
    const forwardHeaders: Record<string, string> = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Forwarded-Host': forwardedHost,
      'X-Forwarded-Proto': forwardedProto,
      'X-Forwarded-Port': forwardedPort,
      'X-Forwarded-For': forwardedFor,
    };
    if (req.headers.authorization) {
      forwardHeaders.Authorization = req.headers.authorization;
    }
    if (req.headers.cookie) {
      forwardHeaders.Cookie = req.headers.cookie;
    }
    if (typeof req.headers['x-xsrf-token'] === 'string') {
      forwardHeaders['X-XSRF-TOKEN'] = req.headers['x-xsrf-token'];
    }
    if (typeof req.headers.origin === 'string') {
      forwardHeaders.Origin = req.headers.origin;
    }
    if (typeof req.headers.referer === 'string') {
      forwardHeaders.Referer = req.headers.referer;
    }

    const meRes = await fetch(`${LARAVEL_API_URL}/api/me`, {
      method: 'GET',
      headers: forwardHeaders,
    });

    if (!meRes.ok) {
      return false;
    }

    const payload = (await meRes.json()) as {
      data?: {
        role?: string;
        roles?: string[];
        permissions?: string[];
        is_active?: boolean;
        suspended_at?: string | null;
      };
    };
    const user = payload?.data;
    if (!user || user.is_active === false || Boolean(user.suspended_at)) {
      return false;
    }

    const roleList = new Set<string>(
      [user.role, ...(Array.isArray(user.roles) ? user.roles : [])]
        .filter((r): r is string => typeof r === 'string')
        .map((r) => r.trim().toLowerCase().replace(/\s+/g, '_'))
    );

    if (roleList.has('super_admin')) {
      return true;
    }

    if (roleList.has('custom_admin')) {
      const permissions = Array.isArray(user.permissions) ? user.permissions : [];
      const requiredAny = ['view_leads', 'manage_leads', 'manage_clients', 'view_messages', 'manage_messages'];
      return requiredAny.some((perm) => permissions.includes(perm));
    }

    // Deny client and any unknown/missing role by default
    return false;
  } catch {
    return false;
  }
}

async function startServer() {
  backendReadyPromise = ensureLocalLaravelBackend(LARAVEL_API_URL)
    .catch((err) => {
      console.warn('[Laravel Supervisor] Startup check error:', err instanceof Error ? err.message : String(err));
    })
    .finally(() => {
      backendReadySettled = true;
    });

  const app = express();
  app.set('trust proxy', true);

  const PORT = resolvePort();
  const allowedOrigins = buildAllowedOrigins();

  app.use((req, res, next) => {
    const requestHost = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
          return callback(null, true);
        }
        try {
          if (requestHost && new URL(origin).host === requestHost) {
            return callback(null, true);
          }
        } catch {
          // Invalid origin URL falls through
        }
        return callback(new Error('Origin not allowed by CORS policy.'));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-XSRF-TOKEN', 'Accept'],
    })(req, res, next);
  });

  // Admin-verified Gemini draft-reply helper (does not touch business DB)
  app.post('/api/suggest-reply', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const isAdmin = await verifyLaravelAdminCaller(req);
      if (!isAdmin) {
        return res.status(401).json({ success: false, error: 'Admin authentication required.' });
      }

      const { messages } = req.body || {};
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ success: false, error: 'Messages array is required.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ success: false, error: 'GEMINI_API_KEY environment variable is required.' });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const formattedHistory = messages
        .slice(-20)
        .map((m: { sender?: string; text?: string }) => `${String(m.sender || 'user')}: ${String(m.text || '')}`)
        .join('\n');

      const prompt = `You are a helpful customer support assistant. Analyze the following conversation history and generate a polite, concise, and helpful suggested reply for the admin to send to the user.\n\nConversation:\n${formattedHistory}\n\nDraft Reply:`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return res.status(200).json({ success: true, reply: response.text });
    } catch (error) {
      console.error('Error generating reply:', error);
      return res.status(500).json({ success: false, error: 'Failed to generate reply.' });
    }
  });

  // Proxy business API, Sanctum CSRF, sitemap, and Laravel public media routes directly to Laravel + MySQL
  app.use('/api', proxyToLaravel);
  app.use('/sanctum', proxyToLaravel);
  app.use('/storage', proxyToLaravel);
  app.get('/sitemap.xml', (_req, res) => {
    const sitemapPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'sitemap.xml')
      : path.join(process.cwd(), 'public', 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
      res.type('application/xml').sendFile(sitemapPath);
      return;
    }
    res.status(404).type('text/plain').send('Sitemap is not configured. Set APP_URL and rebuild.');
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const shutdown = () => {
    if (managedLaravelProcess) {
      managedLaravelProcess.kill('SIGTERM');
      managedLaravelProcess = null;
    }
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend/Proxy server running on http://localhost:${PORT} -> Laravel API at ${LARAVEL_API_URL}`);
  });
}

startServer();
