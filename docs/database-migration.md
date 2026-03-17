# Database Migration Guide

## Schema Mapping

### Users (monolith → auth-service)

| Monolith (snake_case) | Auth Service (camelCase) | Notes |
|----------------------|--------------------------|-------|
| _id | _id | Preserved as string |
| name | name | |
| email | email | Lowercased |
| password | password | bcrypt hash preserved |
| phone | phone | |
| role | role | |
| address | address | |
| preferences | preferences | |
| last_login_at | lastLoginAt | |
| remember_token | — | Dropped (JWT replaces sessions) |
| email_verified_at | — | Dropped (re-verify via email) |
| created_at | createdAt | |
| updated_at | updatedAt | |

### Products (monolith → product-service)

| Monolith | Product Service | Notes |
|----------|----------------|-------|
| _id | _id | Preserved |
| compare_price | comparePrice | |
| is_active | isActive | |
| — | reservedStock | New field, defaults to 0 |
| All others | camelCase equivalent | |

### Orders (monolith → order-service)

| Monolith | Order Service | Notes |
|----------|--------------|-------|
| user_id | userId | |
| shipping_cost | shippingCost | |
| payment_method | paymentMethod | |
| payment_id | paymentId | |
| shipping_address | shippingAddress | |
| billing_address | billingAddress | |
| tracking_number | trackingNumber | |
| cancellation_reason | cancellationReason | |
| — | sagaState | New: tracks saga progress |
| — | outbox | New: outbox pattern events |
| processing (status) | confirmed | Status mapping |

## Verification Queries

After running migration scripts, verify with:

```javascript
// Count comparison
db.users.countDocuments()    // monolith
db.users.countDocuments()    // auth-service — should match

// Sample record comparison
db.users.findOne({ email: "test@example.com" })  // both DBs

// Check for orphaned references
db.orders.find({ userId: { $nin: db.users.distinct("_id") } }).count()
```

## Rollback Plan

If migration needs to be rolled back:

1. Stop microservices
2. Point gateway routes back to monolith
3. Auth-service data is authoritative — sync changes back to monolith if needed:
   ```
   ts-node scripts/sync-back-users.ts
   ```
4. Product and order data: monolith was read-only during migration, so no sync needed
