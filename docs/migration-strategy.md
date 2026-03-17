# Migration Strategy

## Overview

We follow the **Strangler Fig Pattern** to incrementally migrate from the Laravel monolith to microservices. At no point does the system go fully offline — both monolith and microservices run in parallel during migration.

## Phase 1: API Gateway & Infrastructure (Week 1-2)

**Goal**: Deploy gateway + message broker alongside monolith.

1. Deploy API Gateway (Express) that proxies all traffic to monolith
2. Deploy RabbitMQ cluster
3. Deploy Redis for gateway-level caching and rate limiting
4. Update DNS/load balancer to point to gateway
5. Verify all existing API contracts work through the gateway

**Rollback**: Point DNS back to monolith directly.

## Phase 2: Auth Service Extraction (Week 3-4)

**Goal**: Extract user management and authentication into a standalone service.

1. Create auth-service with JWT-based authentication
2. Run `scripts/migrate-users.ts` to copy users collection to auth-service DB
3. Set up dual-write: monolith writes to both old and new user stores
4. Update gateway to route `/api/auth/*` and `/api/users/*` to auth-service
5. Run parallel reads (shadow traffic) for 1 week to verify consistency
6. Cut over reads to auth-service
7. Remove dual-write, auth-service is now source of truth

**Data Migration**:
- users collection → auth-service MongoDB
- Password hashes preserved (bcrypt compatible)
- User IDs preserved as string UUIDs

## Phase 3: Product Service Extraction (Week 5-6)

**Goal**: Extract product catalog and inventory management.

1. Create product-service
2. Migrate products collection with `scripts/migrate-products.ts`
3. Publish `product.updated` events to RabbitMQ on product changes
4. Update gateway routing for `/api/products/*`
5. Monolith order module now calls product-service via HTTP for stock checks

**Key Decision**: Products are read-heavy, so we add Redis caching at the service level.

## Phase 4: Order Service Extraction (Week 7-9)

**Goal**: Extract order processing with saga pattern for distributed transactions.

1. Create order-service with state machine (pending → confirmed → shipped → delivered)
2. Implement Order Saga: coordinates auth-service, product-service, and payment-service
3. Migrate orders collection with `scripts/migrate-orders.ts`
4. Set up Outbox pattern for reliable event publishing
5. Update gateway routing

**Saga Flow**:
```
CreateOrder → ReserveStock → ProcessPayment → ConfirmOrder
                  ↓ fail          ↓ fail
             ReleaseStock    RefundPayment → CancelOrder
```

## Phase 5: Notification & Payment Services (Week 10-11)

**Goal**: Extract remaining bounded contexts.

1. Payment service wraps Stripe SDK, publishes payment events
2. Notification service consumes events and sends emails/SMS/push
3. No data migration needed — these services start fresh

## Phase 6: Monolith Decommission (Week 12)

1. Verify all traffic routes to microservices (zero traffic to monolith)
2. Keep monolith in read-only mode for 2 weeks as safety net
3. Archive monolith codebase
4. Drop monolith MongoDB database after backup

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data inconsistency during dual-write | Reconciliation scripts run hourly |
| Service unavailability | Circuit breakers in gateway, fallback to monolith |
| Event loss | RabbitMQ persistent queues + dead letter exchanges |
| Performance regression | Shadow traffic comparison before each cutover |
| Team unfamiliarity | Each phase has a 1-week buffer for issues |
