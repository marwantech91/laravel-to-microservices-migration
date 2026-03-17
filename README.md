# Laravel Monolith to Microservices Migration

![Laravel](https://img.shields.io/badge/Laravel-10-FF2D20?style=flat-square&logo=laravel)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?style=flat-square&logo=mongodb)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.12-FF6600?style=flat-square&logo=rabbitmq)

A complete, production-grade reference for migrating a Laravel + MongoDB monolith into a microservices ecosystem. Includes the original monolith, target microservices, API gateway, event-driven communication, data migration scripts, and deployment infrastructure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         BEFORE (Monolith)                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Laravel Application                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │  │
│  │  │  Auth    │ │ Products │ │  Orders  │ │Notifications│  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │  │
│  │                    Single MongoDB                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

                              ⬇️ Migration

┌─────────────────────────────────────────────────────────────────┐
│                      AFTER (Microservices)                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     API Gateway                          │    │
│  └──────┬──────────┬──────────┬──────────┬─────────────────┘    │
│         │          │          │          │                       │
│  ┌──────▼──┐ ┌─────▼───┐ ┌───▼────┐ ┌──▼──────────┐           │
│  │  Auth   │ │ Product │ │ Order  │ │Notification │           │
│  │ Service │ │ Service │ │Service │ │  Service    │           │
│  │  :3001  │ │  :3002  │ │ :3003  │ │   :3004     │           │
│  └────┬────┘ └────┬────┘ └───┬────┘ └──────┬──────┘           │
│       │           │          │              │                   │
│  ┌────▼────┐ ┌────▼────┐ ┌──▼─────┐        │                   │
│  │MongoDB  │ │MongoDB  │ │MongoDB │        │                   │
│  │ users   │ │products │ │orders  │        │                   │
│  └─────────┘ └─────────┘ └────────┘        │                   │
│                                             │                   │
│  ┌──────────────────────────────────────────▼───────────────┐   │
│  │                    RabbitMQ (Event Bus)                    │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
├── monolith/                    # Original Laravel + MongoDB app
│   ├── app/
│   │   ├── Models/              # Eloquent MongoDB models
│   │   ├── Http/Controllers/    # API controllers
│   │   └── Services/            # Business logic layer
│   ├── routes/api.php           # API routes
│   └── config/database.php      # MongoDB connection config
│
├── gateway/                     # API Gateway (Express + http-proxy)
│   └── src/
│       ├── index.ts             # Gateway entry point
│       ├── middleware/           # Auth, rate limiting, logging
│       └── routes/              # Service routing config
│
├── services/
│   ├── auth-service/            # JWT auth + user management
│   ├── product-service/         # Product catalog + inventory
│   ├── order-service/           # Order processing + state machine
│   ├── payment-service/         # Payment processing (Stripe)
│   └── notification-service/    # Email, SMS, push notifications
│
├── shared/events/               # Event contracts between services
├── scripts/                     # Data migration scripts
├── docs/                        # Architecture & migration docs
├── docker-compose.yml           # Full microservices stack
└── docker-compose.monolith.yml  # Monolith stack
```

## Migration Strategy

This project follows the **Strangler Fig Pattern**:

1. **Phase 1**: Deploy API Gateway alongside monolith, route all traffic through gateway
2. **Phase 2**: Extract Auth Service — migrate users collection, update gateway routing
3. **Phase 3**: Extract Product Service — migrate products, set up event bus
4. **Phase 4**: Extract Order Service — migrate orders, wire up saga pattern
5. **Phase 5**: Extract Notification Service — connect to event consumers
6. **Phase 6**: Decommission monolith

See [docs/migration-strategy.md](docs/migration-strategy.md) for the detailed playbook.

## Quick Start

### Run the monolith (before migration)
```bash
docker-compose -f docker-compose.monolith.yml up -d
# API available at http://localhost:8000/api
```

### Run the microservices (after migration)
```bash
docker-compose up -d
# Gateway at http://localhost:3000
# RabbitMQ Management at http://localhost:15672
```

### Run data migrations
```bash
cd scripts
npm install
npm run migrate:users
npm run migrate:products
npm run migrate:orders
```

## Key Patterns Implemented

- **Strangler Fig** — incremental migration with gateway routing
- **Database per Service** — each service owns its data store
- **Event-Driven Communication** — RabbitMQ for async messaging
- **Saga Pattern** — distributed transaction for order processing
- **API Gateway** — single entry point with auth, rate limiting, circuit breaker
- **CQRS** — separate read/write models in order service
- **Outbox Pattern** — reliable event publishing from order service

## License

MIT
