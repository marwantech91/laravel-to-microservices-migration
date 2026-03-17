# Architecture Decision Records

## ADR-001: API Gateway Pattern

**Context**: Clients currently connect directly to the Laravel monolith. During migration, traffic needs to be split between monolith and new services.

**Decision**: Use an Express-based API gateway as the single entry point.

**Rationale**:
- Route-level traffic splitting between monolith and microservices
- Centralized auth token validation
- Rate limiting and circuit breaking at the edge
- Request/response logging for debugging during migration
- Custom gateway gives us full control vs managed solutions

## ADR-002: MongoDB Per Service

**Context**: The monolith uses a single MongoDB instance with collections for users, products, orders, notifications.

**Decision**: Each microservice gets its own MongoDB database.

**Rationale**:
- Services can evolve schemas independently
- No cross-service collection joins (we didn't have any)
- Independent scaling of data stores
- Clear ownership boundaries

**Trade-off**: Cross-service queries now require API calls or event-based denormalization.

## ADR-003: Event-Driven Communication via RabbitMQ

**Context**: Services need to communicate state changes asynchronously.

**Decision**: Use RabbitMQ with topic exchanges for event-driven communication.

**Rationale**:
- Mature, battle-tested message broker
- Topic exchanges allow flexible routing patterns
- Dead letter queues for failed message handling
- Management UI for observability
- Lower operational complexity than Kafka for our scale

**Events**: Defined as shared contracts in `shared/events/`.

## ADR-004: Saga Pattern for Order Processing

**Context**: Creating an order involves multiple services (auth, product, payment). We need distributed transaction support.

**Decision**: Implement choreography-based saga with compensating transactions.

**Rationale**:
- No central orchestrator needed (simpler to maintain)
- Each service publishes events that trigger the next step
- Compensating actions (refund, release stock) handle failures
- Outbox pattern ensures events are published reliably

## ADR-005: Authentication Strategy

**Context**: The monolith uses Laravel Sanctum with session-based tokens stored in MongoDB.

**Decision**: Migrate to JWT with RS256 signing. Auth service issues tokens, gateway validates them.

**Rationale**:
- Stateless authentication — no session store needed
- Gateway can validate tokens without calling auth service on every request
- RS256 allows public key distribution for token validation
- Refresh token rotation for security
