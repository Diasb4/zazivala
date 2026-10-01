import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webhookHandler from '../api/webhook.js';
import setupHandler from '../api/setup.js';
import healthHandler from '../api/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Helper to adapt http.IncomingMessage to Vercel-like request
  const vercelReq = req as any;
  vercelReq.query = Object.fromEntries(url.searchParams.entries());

  // Helper to adapt http.ServerResponse to Vercel-like response
  const vercelRes = res as any;
  vercelRes.status = (code: number) => {
    res.statusCode = code;
    return vercelRes;
  };
  vercelRes.json = (data: any) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data, null, 2));
    return vercelRes;
  };
  vercelRes.send = (body: any) => {
    res.end(body);
    return vercelRes;
  };

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Bot-Api-Secret-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Parse JSON body for POST requests
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    try {
      vercelReq.body = body ? JSON.parse(body) : {};
    } catch {
      vercelReq.body = {};
    }
  }

  try {
    if (pathname === '/api/webhook') {
      await webhookHandler(vercelReq, vercelRes);
      return;
    }

    if (pathname === '/api/setup') {
      await setupHandler(vercelReq, vercelRes);
      return;
    }

    if (pathname === '/api/health') {
      await healthHandler(vercelReq, vercelRes);
      return;
    }

    // Serve static files from public/
    let filePath = path.join(
      projectRoot,
      'public',
      pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
    );

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  } catch (err: any) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\nZazyvala Bot dev server running at: http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`Setup endpoint:   http://localhost:${PORT}/api/setup`);
  console.log(`Health endpoint:  http://localhost:${PORT}/api/health\n`);
});
