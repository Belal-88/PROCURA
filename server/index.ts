import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config';
import { authRouter } from './routes/auth';
import { requestsRouter } from './routes/requests';
import { suppliersRouter } from './routes/suppliers';
import { quotationsRouter } from './routes/quotations';
import { auditLogsRouter } from './routes/auditLogs';

const app = express();

// Permissive CORS configuration for local development & production preview
app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  })
);

// Body parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static file serving for quotation PDFs with iframe-friendly headers
app.use(
  '/uploads',
  (req, res, next) => {
    // Remove X-Frame-Options and Content-Security-Policy restrictions so <iframe src={offer.fileUrl}> renders cleanly
    res.removeHeader('X-Frame-Options');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(CONFIG.UPLOADS_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
      }
    }
  })
);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get(`${CONFIG.API_PREFIX}/health`, (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', api: 'PROCURA v1', timestamp: new Date().toISOString() });
});

// REST API Routers
app.use(`${CONFIG.API_PREFIX}/auth`, authRouter);
app.use(`${CONFIG.API_PREFIX}/requests`, requestsRouter);
app.use(`${CONFIG.API_PREFIX}/suppliers`, suppliersRouter);
app.use(`${CONFIG.API_PREFIX}/quotations`, quotationsRouter);
app.use(`${CONFIG.API_PREFIX}/audit-logs`, auditLogsRouter);

// Serve compiled frontend from dist/ so any device can access the full app from a single URL
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/health')
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 handler for unmatched API routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `API endpoint '${req.method} ${req.url}' was not found.` });
});

// Centralized error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[PROCURA Backend Error]:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected internal server error occurred.';
  res.status(status).json({ message, error: message });
});

// Start listening
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 PROCURA Backend Server running on port ${CONFIG.PORT}`);
  console.log(`   Base API URL: http://localhost:${CONFIG.PORT}${CONFIG.API_PREFIX}`);
  console.log(`   Uploads Directory: ${CONFIG.UPLOADS_DIR}`);
  console.log(`   Gemini Model: ${CONFIG.GEMINI_MODEL}`);
  console.log(`=======================================================`);
});

export default app;
