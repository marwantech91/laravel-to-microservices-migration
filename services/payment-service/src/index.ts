import express from 'express';
import { v4 as uuid } from 'uuid';
import { publishEvent } from './events';

const app = express();
app.use(express.json());

// In production, this would use Stripe SDK
// Simplified for migration reference

interface Payment {
  id: string;
  orderId: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  paymentMethod: string;
  stripePaymentIntentId?: string;
  createdAt: string;
}

const payments = new Map<string, Payment>();

// === Internal endpoints (called by order-service saga) ===

app.post('/internal/charge', async (req, res) => {
  const { orderId, amount, paymentMethod, description } = req.body;

  try {
    // In production: Stripe.paymentIntents.create(...)
    const paymentId = `pay_${uuid().replace(/-/g, '').substring(0, 24)}`;

    const payment: Payment = {
      id: paymentId,
      orderId,
      amount,
      status: 'succeeded',
      paymentMethod,
      createdAt: new Date().toISOString(),
    };

    payments.set(paymentId, payment);

    await publishEvent('payment.processed', {
      paymentId,
      orderId,
      amount,
      status: 'succeeded',
    });

    res.json({ paymentId, status: 'succeeded', amount });
  } catch (error) {
    console.error('Charge error:', error);

    await publishEvent('payment.processed', {
      paymentId: null,
      orderId,
      amount,
      status: 'failed',
    });

    res.status(402).json({ error: 'Payment failed' });
  }
});

app.post('/internal/refund', async (req, res) => {
  const { paymentId, amount, orderId } = req.body;

  const payment = payments.get(paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  // In production: Stripe.refunds.create(...)
  const refundId = `ref_${uuid().replace(/-/g, '').substring(0, 24)}`;
  payment.status = 'refunded';

  await publishEvent('payment.refunded', {
    paymentId,
    orderId,
    amount,
    refundId,
  });

  res.json({ refundId, status: 'refunded', amount });
});

app.get('/internal/payments/:id', async (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

app.get('/health', (_req, res) => {
  res.json({ service: 'payment-service', status: 'ok' });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Payment service running on port ${PORT}`));
