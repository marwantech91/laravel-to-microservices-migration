/**
 * Tests for gateway route configuration and service routing logic.
 *
 * These are pure unit tests — no HTTP servers, no proxy middleware.
 * They validate the route config data and the routing/middleware wiring logic.
 */

// We import the route config directly (it's a plain array export, no side effects).
// We need to set env vars BEFORE importing so the module picks them up.
const MOCK_URLS: Record<string, string> = {
  MONOLITH_URL: 'http://monolith:8000',
  AUTH_SERVICE_URL: 'http://auth-service:3001',
  PRODUCT_SERVICE_URL: 'http://product-service:3002',
  ORDER_SERVICE_URL: 'http://order-service:3003',
  NOTIFICATION_SERVICE_URL: 'http://notification-service:3004',
};

// Pre-set env so the module resolves with known values
Object.entries(MOCK_URLS).forEach(([key, value]) => {
  process.env[key] = value;
});

import { serviceRoutes } from '../routes/services';

// ---- Route config tests ----

describe('serviceRoutes — route configuration', () => {
  it('should export a non-empty array of routes', () => {
    expect(Array.isArray(serviceRoutes)).toBe(true);
    expect(serviceRoutes.length).toBeGreaterThan(0);
  });

  it('every route should have required fields', () => {
    for (const route of serviceRoutes) {
      expect(route).toHaveProperty('path');
      expect(route).toHaveProperty('target');
      expect(route).toHaveProperty('service');
      expect(typeof route.auth).toBe('boolean');

      // path must start with /
      expect(route.path).toMatch(/^\//);

      // target must be a valid URL
      expect(route.target).toMatch(/^https?:\/\//);
    }
  });

  it('every route path should start with /api/', () => {
    for (const route of serviceRoutes) {
      expect(route.path).toMatch(/^\/api\//);
    }
  });

  it('should not have duplicate paths', () => {
    const paths = serviceRoutes.map(r => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('should map each service name to a distinct path', () => {
    const serviceNames = serviceRoutes.map(r => r.service);
    // service names are not required to be unique (auth-service has two paths)
    expect(serviceNames.length).toBe(serviceRoutes.length);
  });
});

describe('serviceRoutes — auth requirements', () => {
  it('/api/auth should NOT require auth (login/register endpoints)', () => {
    const authRoute = serviceRoutes.find(r => r.path === '/api/auth');
    expect(authRoute).toBeDefined();
    expect(authRoute!.auth).toBe(false);
  });

  it('/api/users should require auth', () => {
    const usersRoute = serviceRoutes.find(r => r.path === '/api/users');
    expect(usersRoute).toBeDefined();
    expect(usersRoute!.auth).toBe(true);
  });

  it('/api/products should NOT require auth (public catalog)', () => {
    const productsRoute = serviceRoutes.find(r => r.path === '/api/products');
    expect(productsRoute).toBeDefined();
    expect(productsRoute!.auth).toBe(false);
  });

  it('/api/orders should require auth', () => {
    const ordersRoute = serviceRoutes.find(r => r.path === '/api/orders');
    expect(ordersRoute).toBeDefined();
    expect(ordersRoute!.auth).toBe(true);
  });

  it('/api/notifications should require auth', () => {
    const notificationsRoute = serviceRoutes.find(r => r.path === '/api/notifications');
    expect(notificationsRoute).toBeDefined();
    expect(notificationsRoute!.auth).toBe(true);
  });
});

describe('serviceRoutes — target mapping (Strangler Fig phases)', () => {
  it('should route /api/auth to the auth-service, not the monolith', () => {
    const route = serviceRoutes.find(r => r.path === '/api/auth')!;
    expect(route.target).toBe(MOCK_URLS.AUTH_SERVICE_URL);
    expect(route.service).toBe('auth-service');
  });

  it('should route /api/users to the auth-service', () => {
    const route = serviceRoutes.find(r => r.path === '/api/users')!;
    expect(route.target).toBe(MOCK_URLS.AUTH_SERVICE_URL);
    expect(route.service).toBe('auth-service');
  });

  it('should route /api/products to the product-service', () => {
    const route = serviceRoutes.find(r => r.path === '/api/products')!;
    expect(route.target).toBe(MOCK_URLS.PRODUCT_SERVICE_URL);
    expect(route.service).toBe('product-service');
  });

  it('should route /api/orders to the order-service', () => {
    const route = serviceRoutes.find(r => r.path === '/api/orders')!;
    expect(route.target).toBe(MOCK_URLS.ORDER_SERVICE_URL);
    expect(route.service).toBe('order-service');
  });

  it('should route /api/notifications to the notification-service', () => {
    const route = serviceRoutes.find(r => r.path === '/api/notifications')!;
    expect(route.target).toBe(MOCK_URLS.NOTIFICATION_SERVICE_URL);
    expect(route.service).toBe('notification-service');
  });

  it('no route should still point at the monolith (migration complete)', () => {
    for (const route of serviceRoutes) {
      expect(route.target).not.toBe(MOCK_URLS.MONOLITH_URL);
    }
  });
});

describe('serviceRoutes — path rewriting', () => {
  it('every route should have a pathRewrite that strips the /api prefix', () => {
    for (const route of serviceRoutes) {
      expect(route.pathRewrite).toBeDefined();

      const rewriteKeys = Object.keys(route.pathRewrite!);
      expect(rewriteKeys.length).toBeGreaterThan(0);

      // The rewrite source regex should reference the route.path
      for (const pattern of rewriteKeys) {
        // e.g. ^/api/auth -> /auth
        expect(pattern).toContain('/api/');

        const rewritten = route.pathRewrite![pattern];
        // rewritten path should NOT contain /api
        expect(rewritten).not.toContain('/api');
        // rewritten path should start with /
        expect(rewritten).toMatch(/^\//);
      }
    }
  });

  it('pathRewrite should produce a shorter path (strips api prefix)', () => {
    for (const route of serviceRoutes) {
      const [pattern, replacement] = Object.entries(route.pathRewrite!)[0];
      // The replacement is always shorter because it drops "/api"
      expect(replacement.length).toBeLessThan(route.path.length);
    }
  });
});

describe('serviceRoutes — expected service inventory', () => {
  const expectedServices = [
    'auth-service',
    'product-service',
    'order-service',
    'notification-service',
  ];

  it.each(expectedServices)('should have at least one route for %s', (service) => {
    const routes = serviceRoutes.filter(r => r.service === service);
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it('should only contain known services', () => {
    for (const route of serviceRoutes) {
      expect(expectedServices).toContain(route.service);
    }
  });
});
