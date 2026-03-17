/**
 * Shared event contracts between microservices.
 * All services import from this package to ensure type safety.
 */

// === Auth Events ===

export interface UserRegisteredEvent {
  type: 'user.registered';
  data: {
    userId: string;
    email: string;
    name: string;
    registeredAt: string;
  };
}

export interface UserUpdatedEvent {
  type: 'user.updated';
  data: {
    userId: string;
    changes: Record<string, unknown>;
  };
}

// === Product Events ===

export interface ProductCreatedEvent {
  type: 'product.created';
  data: {
    productId: string;
    name: string;
    price: number;
    stock: number;
  };
}

export interface ProductUpdatedEvent {
  type: 'product.updated';
  data: {
    productId: string;
    changes: Record<string, unknown>;
  };
}

export interface StockReservedEvent {
  type: 'stock.reserved';
  data: {
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
}

export interface StockReservationFailedEvent {
  type: 'stock.reservation_failed';
  data: {
    orderId: string;
    reason: string;
  };
}

export interface StockReleasedEvent {
  type: 'stock.released';
  data: {
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
}

// === Order Events ===

export interface OrderCreatedEvent {
  type: 'order.created';
  data: {
    orderId: string;
    userId: string;
    items: Array<{
      productId: string;
      name: string;
      price: number;
      quantity: number;
    }>;
    total: number;
    shippingAddress: Record<string, string>;
  };
}

export interface OrderConfirmedEvent {
  type: 'order.confirmed';
  data: {
    orderId: string;
    userId: string;
    total: number;
    paymentId: string;
  };
}

export interface OrderCancelledEvent {
  type: 'order.cancelled';
  data: {
    orderId: string;
    userId: string;
    reason: string;
  };
}

export interface OrderShippedEvent {
  type: 'order.shipped';
  data: {
    orderId: string;
    userId: string;
    trackingNumber: string;
    carrier: string;
  };
}

// === Payment Events ===

export interface PaymentProcessedEvent {
  type: 'payment.processed';
  data: {
    paymentId: string;
    orderId: string;
    amount: number;
    status: 'succeeded' | 'failed';
  };
}

export interface PaymentRefundedEvent {
  type: 'payment.refunded';
  data: {
    paymentId: string;
    orderId: string;
    amount: number;
    refundId: string;
  };
}

// === Union Type ===

export type DomainEvent =
  | UserRegisteredEvent
  | UserUpdatedEvent
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | StockReservedEvent
  | StockReservationFailedEvent
  | StockReleasedEvent
  | OrderCreatedEvent
  | OrderConfirmedEvent
  | OrderCancelledEvent
  | OrderShippedEvent
  | PaymentProcessedEvent
  | PaymentRefundedEvent;

// === Event Envelope ===

export interface EventEnvelope<T extends DomainEvent = DomainEvent> {
  id: string;
  timestamp: string;
  source: string;
  event: T;
  metadata?: Record<string, unknown>;
}
