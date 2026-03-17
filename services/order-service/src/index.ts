import express from 'express';
import mongoose from 'mongoose';
import { v4 as uuid } from 'uuid';
import { publishEvent, subscribe } from './events';

const app = express();
app.use(express.json());

// === MongoDB Connection ===
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/order_service';
mongoose.connect(MONGO_URI);

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005';

// === Order Model with State Machine ===
const orderSchema = new mongoose.Schema({
  _id: { type: String, default: uuid },
  userId: { type: String, required: true },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    total: Number,
  }],
  subtotal: Number,
  tax: Number,
  shippingCost: Number,
  total: Number,
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'stock_reserved', 'payment_processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'],
  },
  paymentMethod: String,
  paymentId: String,
  shippingAddress: mongoose.Schema.Types.Mixed,
  billingAddress: mongoose.Schema.Types.Mixed,
  notes: String,
  trackingNumber: String,
  cancellationReason: String,
  // Saga tracking
  sagaState: {
    stockReserved: { type: Boolean, default: false },
    paymentProcessed: { type: Boolean, default: false },
  },
  // Outbox pattern: events to be published
  outbox: [{
    eventType: String,
    data: mongoose.Schema.Types.Mixed,
    published: { type: Boolean, default: false },
  }],
}, { timestamps: true });

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

const Order = mongoose.model('Order', orderSchema);

// === Routes ===

app.get('/orders', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.per_page as string) || 20;

  const [orders, total] = await Promise.all([
    Order.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments({ userId }),
  ]);

  res.json({ data: orders, total, page, lastPage: Math.ceil(total / limit) });
});

app.get('/orders/:id', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const order = await Order.findOne({ _id: req.params.id, userId });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/**
 * Create order — initiates the Order Saga.
 *
 * Saga flow:
 * 1. Create order (pending)
 * 2. Reserve stock (product-service)
 * 3. Process payment (payment-service)
 * 4. Confirm order
 *
 * Compensation:
 * - If payment fails → release stock → cancel order
 * - If stock reservation fails → cancel order
 */
app.post('/orders', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const { items, paymentMethod, shippingAddress, notes } = req.body;

  try {
    // Calculate totals
    let subtotal = 0;
    const orderItems = items.map((item: any) => {
      const total = item.price * item.quantity;
      subtotal += total;
      return { ...item, total };
    });

    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const shippingCost = subtotal > 100 ? 0 : 9.99;
    const total = subtotal + tax + shippingCost;

    // Step 1: Create order in pending state
    const order = await Order.create({
      userId,
      items: orderItems,
      subtotal,
      tax,
      shippingCost,
      total,
      status: 'pending',
      paymentMethod,
      shippingAddress,
      billingAddress: shippingAddress,
      notes,
    });

    // Step 2: Request stock reservation (async via event)
    await publishEvent('order.created', {
      orderId: order._id,
      userId,
      items: orderItems.map((i: any) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      })),
      total,
      shippingAddress,
    });

    // Also call product service synchronously for immediate feedback
    const stockResponse = await fetch(`${PRODUCT_SERVICE_URL}/internal/stock/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order._id,
        items: orderItems.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      }),
    });

    if (!stockResponse.ok) {
      order.status = 'cancelled';
      order.cancellationReason = 'Insufficient stock';
      await order.save();
      return res.status(422).json({ error: 'Insufficient stock' });
    }

    // Update saga state
    order.status = 'stock_reserved';
    order.sagaState.stockReserved = true;
    await order.save();

    // Step 3: Process payment
    const paymentResponse = await fetch(`${PAYMENT_SERVICE_URL}/internal/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order._id,
        amount: total,
        paymentMethod,
        description: `Order ${order._id}`,
      }),
    });

    if (!paymentResponse.ok) {
      // Compensation: release stock
      await fetch(`${PRODUCT_SERVICE_URL}/internal/stock/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order._id,
          items: orderItems.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });

      order.status = 'cancelled';
      order.cancellationReason = 'Payment failed';
      order.sagaState.stockReserved = false;
      await order.save();

      return res.status(402).json({ error: 'Payment failed' });
    }

    const paymentData = await paymentResponse.json();

    // Step 4: Confirm order
    // Confirm stock deduction
    await fetch(`${PRODUCT_SERVICE_URL}/internal/stock/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: orderItems.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      }),
    });

    order.status = 'confirmed';
    order.paymentId = paymentData.paymentId;
    order.sagaState.paymentProcessed = true;
    await order.save();

    await publishEvent('order.confirmed', {
      orderId: order._id,
      userId,
      total,
      paymentId: paymentData.paymentId,
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Order creation failed' });
  }
});

app.post('/orders/:id/cancel', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const order = await Order.findOne({ _id: req.params.id, userId });

  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!['pending', 'stock_reserved', 'confirmed'].includes(order.status)) {
    return res.status(422).json({ error: 'Order cannot be cancelled' });
  }

  // Compensation: release stock if reserved
  if (order.sagaState.stockReserved) {
    await fetch(`${PRODUCT_SERVICE_URL}/internal/stock/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order._id,
        items: order.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      }),
    });
  }

  // Compensation: refund payment if processed
  if (order.sagaState.paymentProcessed && order.paymentId) {
    await fetch(`${PAYMENT_SERVICE_URL}/internal/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: order.paymentId,
        amount: order.total,
        orderId: order._id,
      }),
    });
  }

  order.status = 'cancelled';
  order.cancellationReason = req.body.reason || 'Customer requested';
  await order.save();

  await publishEvent('order.cancelled', {
    orderId: order._id,
    userId,
    reason: order.cancellationReason,
  });

  res.json(order);
});

app.get('/health', (_req, res) => {
  res.json({ service: 'order-service', status: 'ok' });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`Order service running on port ${PORT}`));
