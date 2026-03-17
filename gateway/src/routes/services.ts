/**
 * Service routing configuration.
 *
 * During migration, flip routes from monolith to microservices one by one.
 * This is the central control point for the Strangler Fig pattern.
 */

interface ServiceRoute {
  path: string;
  target: string;
  service: string;
  auth: boolean;
  pathRewrite?: Record<string, string>;
}

const MONOLITH_URL = process.env.MONOLITH_URL || 'http://monolith:8000';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3003';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3004';

export const serviceRoutes: ServiceRoute[] = [
  // ==========================================
  // Phase 2: Auth routes → auth-service
  // ==========================================
  {
    path: '/api/auth',
    target: AUTH_SERVICE_URL,       // ← was MONOLITH_URL
    service: 'auth-service',
    auth: false,
    pathRewrite: { '^/api/auth': '/auth' },
  },
  {
    path: '/api/users',
    target: AUTH_SERVICE_URL,       // ← was MONOLITH_URL
    service: 'auth-service',
    auth: true,
    pathRewrite: { '^/api/users': '/users' },
  },

  // ==========================================
  // Phase 3: Product routes → product-service
  // ==========================================
  {
    path: '/api/products',
    target: PRODUCT_SERVICE_URL,    // ← was MONOLITH_URL
    service: 'product-service',
    auth: false,                    // public read, service handles admin checks
    pathRewrite: { '^/api/products': '/products' },
  },

  // ==========================================
  // Phase 4: Order routes → order-service
  // ==========================================
  {
    path: '/api/orders',
    target: ORDER_SERVICE_URL,      // ← was MONOLITH_URL
    service: 'order-service',
    auth: true,
    pathRewrite: { '^/api/orders': '/orders' },
  },

  // ==========================================
  // Phase 5: Notification routes → notification-service
  // ==========================================
  {
    path: '/api/notifications',
    target: NOTIFICATION_SERVICE_URL, // ← was MONOLITH_URL
    service: 'notification-service',
    auth: true,
    pathRewrite: { '^/api/notifications': '/notifications' },
  },
];
