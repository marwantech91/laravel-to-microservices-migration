import type {
  EventEnvelope,
  DomainEvent,
  UserRegisteredEvent,
  UserUpdatedEvent,
  ProductCreatedEvent,
  ProductUpdatedEvent,
  StockReservedEvent,
  StockReservationFailedEvent,
  StockReleasedEvent,
  OrderCreatedEvent,
  OrderConfirmedEvent,
  OrderCancelledEvent,
  OrderShippedEvent,
  PaymentProcessedEvent,
  PaymentRefundedEvent,
} from '../index';

// ---- helpers ----

function createEnvelope<T extends DomainEvent>(
  source: string,
  event: T,
  metadata?: Record<string, unknown>,
): EventEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    event,
    metadata,
  };
}

// ---- tests ----

describe('Shared Events — type contracts', () => {
  // Auth events

  it('should define a valid UserRegisteredEvent', () => {
    const event: UserRegisteredEvent = {
      type: 'user.registered',
      data: {
        userId: 'u-1',
        email: 'alice@example.com',
        name: 'Alice',
        registeredAt: new Date().toISOString(),
      },
    };

    expect(event.type).toBe('user.registered');
    expect(event.data.userId).toBe('u-1');
    expect(event.data.email).toBe('alice@example.com');
  });

  it('should define a valid UserUpdatedEvent', () => {
    const event: UserUpdatedEvent = {
      type: 'user.updated',
      data: {
        userId: 'u-1',
        changes: { name: 'Alice B.' },
      },
    };

    expect(event.type).toBe('user.updated');
    expect(event.data.changes).toHaveProperty('name');
  });

  // Product events

  it('should define a valid ProductCreatedEvent', () => {
    const event: ProductCreatedEvent = {
      type: 'product.created',
      data: { productId: 'p-1', name: 'Widget', price: 9.99, stock: 50 },
    };

    expect(event.type).toBe('product.created');
    expect(event.data.price).toBe(9.99);
  });

  it('should define a valid ProductUpdatedEvent', () => {
    const event: ProductUpdatedEvent = {
      type: 'product.updated',
      data: { productId: 'p-1', changes: { price: 12.99 } },
    };

    expect(event.type).toBe('product.updated');
  });

  it('should define a valid StockReservedEvent', () => {
    const event: StockReservedEvent = {
      type: 'stock.reserved',
      data: {
        orderId: 'o-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      },
    };

    expect(event.type).toBe('stock.reserved');
    expect(event.data.items).toHaveLength(1);
  });

  it('should define a valid StockReservationFailedEvent', () => {
    const event: StockReservationFailedEvent = {
      type: 'stock.reservation_failed',
      data: { orderId: 'o-1', reason: 'Insufficient stock' },
    };

    expect(event.type).toBe('stock.reservation_failed');
    expect(event.data.reason).toBeTruthy();
  });

  it('should define a valid StockReleasedEvent', () => {
    const event: StockReleasedEvent = {
      type: 'stock.released',
      data: {
        orderId: 'o-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      },
    };

    expect(event.type).toBe('stock.released');
  });

  // Order events

  it('should define a valid OrderCreatedEvent', () => {
    const event: OrderCreatedEvent = {
      type: 'order.created',
      data: {
        orderId: 'o-1',
        userId: 'u-1',
        items: [{ productId: 'p-1', name: 'Widget', price: 9.99, quantity: 2 }],
        total: 19.98,
        shippingAddress: { line1: '123 Main St', city: 'Anytown' },
      },
    };

    expect(event.type).toBe('order.created');
    expect(event.data.total).toBe(19.98);
    expect(event.data.items).toHaveLength(1);
  });

  it('should define a valid OrderConfirmedEvent', () => {
    const event: OrderConfirmedEvent = {
      type: 'order.confirmed',
      data: { orderId: 'o-1', userId: 'u-1', total: 19.98, paymentId: 'pay-1' },
    };

    expect(event.type).toBe('order.confirmed');
  });

  it('should define a valid OrderCancelledEvent', () => {
    const event: OrderCancelledEvent = {
      type: 'order.cancelled',
      data: { orderId: 'o-1', userId: 'u-1', reason: 'Customer requested' },
    };

    expect(event.type).toBe('order.cancelled');
    expect(event.data.reason).toBe('Customer requested');
  });

  it('should define a valid OrderShippedEvent', () => {
    const event: OrderShippedEvent = {
      type: 'order.shipped',
      data: { orderId: 'o-1', userId: 'u-1', trackingNumber: 'TRK-123', carrier: 'UPS' },
    };

    expect(event.type).toBe('order.shipped');
    expect(event.data.carrier).toBe('UPS');
  });

  // Payment events

  it('should define a valid PaymentProcessedEvent with succeeded status', () => {
    const event: PaymentProcessedEvent = {
      type: 'payment.processed',
      data: { paymentId: 'pay-1', orderId: 'o-1', amount: 19.98, status: 'succeeded' },
    };

    expect(event.type).toBe('payment.processed');
    expect(event.data.status).toBe('succeeded');
  });

  it('should define a valid PaymentProcessedEvent with failed status', () => {
    const event: PaymentProcessedEvent = {
      type: 'payment.processed',
      data: { paymentId: 'pay-2', orderId: 'o-2', amount: 50.0, status: 'failed' },
    };

    expect(event.data.status).toBe('failed');
  });

  it('should define a valid PaymentRefundedEvent', () => {
    const event: PaymentRefundedEvent = {
      type: 'payment.refunded',
      data: { paymentId: 'pay-1', orderId: 'o-1', amount: 19.98, refundId: 'ref-1' },
    };

    expect(event.type).toBe('payment.refunded');
    expect(event.data.refundId).toBe('ref-1');
  });
});

describe('EventEnvelope', () => {
  it('should wrap a domain event with id, timestamp, and source', () => {
    const event: UserRegisteredEvent = {
      type: 'user.registered',
      data: {
        userId: 'u-1',
        email: 'alice@example.com',
        name: 'Alice',
        registeredAt: '2026-01-01T00:00:00.000Z',
      },
    };

    const envelope = createEnvelope('auth-service', event);

    expect(envelope.id).toBeDefined();
    expect(typeof envelope.id).toBe('string');
    expect(envelope.timestamp).toBeDefined();
    expect(envelope.source).toBe('auth-service');
    expect(envelope.event).toEqual(event);
    expect(envelope.event.type).toBe('user.registered');
  });

  it('should include optional metadata when provided', () => {
    const event: OrderCreatedEvent = {
      type: 'order.created',
      data: {
        orderId: 'o-99',
        userId: 'u-5',
        items: [],
        total: 0,
        shippingAddress: {},
      },
    };

    const envelope = createEnvelope('order-service', event, {
      correlationId: 'corr-abc',
      retryCount: 0,
    });

    expect(envelope.metadata).toBeDefined();
    expect(envelope.metadata!.correlationId).toBe('corr-abc');
    expect(envelope.metadata!.retryCount).toBe(0);
  });

  it('should leave metadata undefined when not provided', () => {
    const event: ProductCreatedEvent = {
      type: 'product.created',
      data: { productId: 'p-1', name: 'Gadget', price: 25, stock: 100 },
    };

    const envelope = createEnvelope('product-service', event);

    expect(envelope.metadata).toBeUndefined();
  });

  it('should produce a valid ISO-8601 timestamp', () => {
    const event: PaymentProcessedEvent = {
      type: 'payment.processed',
      data: { paymentId: 'pay-1', orderId: 'o-1', amount: 10, status: 'succeeded' },
    };

    const envelope = createEnvelope('payment-service', event);
    const parsed = new Date(envelope.timestamp);

    expect(parsed.getTime()).not.toBeNaN();
  });

  it('should generate unique ids across envelopes', () => {
    const event: StockReleasedEvent = {
      type: 'stock.released',
      data: { orderId: 'o-1', items: [] },
    };

    const a = createEnvelope('product-service', event);
    const b = createEnvelope('product-service', event);

    expect(a.id).not.toBe(b.id);
  });
});

describe('DomainEvent union type coverage', () => {
  it('should accept every event type in the DomainEvent union', () => {
    const events: DomainEvent[] = [
      { type: 'user.registered', data: { userId: 'u', email: 'e', name: 'n', registeredAt: 't' } },
      { type: 'user.updated', data: { userId: 'u', changes: {} } },
      { type: 'product.created', data: { productId: 'p', name: 'n', price: 1, stock: 1 } },
      { type: 'product.updated', data: { productId: 'p', changes: {} } },
      { type: 'stock.reserved', data: { orderId: 'o', items: [] } },
      { type: 'stock.reservation_failed', data: { orderId: 'o', reason: 'r' } },
      { type: 'stock.released', data: { orderId: 'o', items: [] } },
      { type: 'order.created', data: { orderId: 'o', userId: 'u', items: [], total: 0, shippingAddress: {} } },
      { type: 'order.confirmed', data: { orderId: 'o', userId: 'u', total: 0, paymentId: 'p' } },
      { type: 'order.cancelled', data: { orderId: 'o', userId: 'u', reason: 'r' } },
      { type: 'order.shipped', data: { orderId: 'o', userId: 'u', trackingNumber: 't', carrier: 'c' } },
      { type: 'payment.processed', data: { paymentId: 'p', orderId: 'o', amount: 0, status: 'succeeded' } },
      { type: 'payment.refunded', data: { paymentId: 'p', orderId: 'o', amount: 0, refundId: 'r' } },
    ];

    expect(events).toHaveLength(13);

    // Verify each event has a unique type string
    const types = events.map(e => e.type);
    expect(new Set(types).size).toBe(13);
  });
});
