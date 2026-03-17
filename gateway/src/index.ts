import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { circuitBreaker } from './middleware/circuitBreaker';
import { serviceRoutes } from './routes/services';

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;

// === Global Middleware ===
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

// === Health Check ===
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gateway: true, timestamp: new Date().toISOString() });
});

// === Rate Limiting ===
app.use(rateLimiter);

// === Service Routes ===
// During migration, routes can point to either the monolith or a microservice.
// This is the core of the Strangler Fig pattern.

for (const route of serviceRoutes) {
  const middlewares: express.RequestHandler[] = [];

  // Add auth middleware for protected routes
  if (route.auth) {
    middlewares.push(authMiddleware);
  }

  // Add circuit breaker
  middlewares.push(circuitBreaker(route.service));

  // Proxy to target service
  app.use(
    route.path,
    ...middlewares,
    createProxyMiddleware({
      target: route.target,
      changeOrigin: true,
      pathRewrite: route.pathRewrite,
      on: {
        proxyReq: (proxyReq, req: any) => {
          // Forward user context from auth middleware
          if (req.user) {
            proxyReq.setHeader('X-User-Id', req.user.userId);
            proxyReq.setHeader('X-User-Role', req.user.role || 'customer');
          }
          proxyReq.setHeader('X-Request-Id', req.headers['x-request-id'] || crypto.randomUUID());
        },
        error: (err, _req, res: any) => {
          console.error(`Proxy error: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).json({ error: 'Service unavailable' });
          }
        },
      },
    })
  );
}

// === 404 Handler ===
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// === Error Handler ===
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Gateway error:', err);
  res.status(500).json({ error: 'Internal gateway error' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log('Service routing:');
  serviceRoutes.forEach(r => {
    console.log(`  ${r.path} -> ${r.target} (${r.service})`);
  });
});

export default app;
