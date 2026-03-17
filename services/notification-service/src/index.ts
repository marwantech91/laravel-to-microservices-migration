import express from 'express';
import mongoose from 'mongoose';
import { v4 as uuid } from 'uuid';
import { subscribe } from './events';

const app = express();
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/notification_service';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

mongoose.connect(MONGO_URI);

// === Notification Model ===
const notificationSchema = new mongoose.Schema({
  _id: { type: String, default: uuid },
  userId: { type: String, required: true },
  type: String,
  channel: { type: String, enum: ['in_app', 'email', 'sms', 'push'] },
  title: String,
  body: String,
  data: mongoose.Schema.Types.Mixed,
  readAt: Date,
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

// === Event Consumers ===
// This service is primarily event-driven — it reacts to domain events.

async function setupEventConsumers() {
  // User registered → send welcome email
  await subscribe('user.registered', async (event) => {
    const { userId, name, email } = event.data;

    await Notification.create({
      userId,
      type: 'welcome',
      channel: 'in_app',
      title: 'Welcome!',
      body: `Welcome to our platform, ${name}!`,
      data: { email },
    });

    // In production: send email via SendGrid/SES
    console.log(`[EMAIL] Welcome email sent to ${email}`);
  }, 'notifications.user.registered');

  // Order confirmed → notify user
  await subscribe('order.confirmed', async (event) => {
    const { orderId, userId, total } = event.data;

    await Notification.create({
      userId,
      type: 'order_confirmed',
      channel: 'in_app',
      title: 'Order Confirmed',
      body: `Your order #${orderId.substring(0, 8)} has been confirmed. Total: $${total}`,
      data: { orderId, total },
    });

    // Fetch user email from auth service
    try {
      const userRes = await fetch(`${AUTH_SERVICE_URL}/internal/users/${userId}`);
      if (userRes.ok) {
        const user = await userRes.json();
        console.log(`[EMAIL] Order confirmation sent to ${user.email}`);
      }
    } catch (err) {
      console.error('Failed to fetch user for email notification:', err);
    }
  }, 'notifications.order.confirmed');

  // Order cancelled → notify user
  await subscribe('order.cancelled', async (event) => {
    const { orderId, userId, reason } = event.data;

    await Notification.create({
      userId,
      type: 'order_cancelled',
      channel: 'in_app',
      title: 'Order Cancelled',
      body: `Your order #${orderId.substring(0, 8)} has been cancelled. Reason: ${reason}`,
      data: { orderId, reason },
    });
  }, 'notifications.order.cancelled');

  // Order shipped → notify via SMS and in-app
  await subscribe('order.shipped', async (event) => {
    const { orderId, userId, trackingNumber, carrier } = event.data;

    await Notification.create({
      userId,
      type: 'order_shipped',
      channel: 'in_app',
      title: 'Order Shipped',
      body: `Your order has shipped! Tracking: ${trackingNumber} via ${carrier}`,
      data: { orderId, trackingNumber, carrier },
    });

    // In production: send SMS via Twilio
    console.log(`[SMS] Shipping notification for order ${orderId}`);
  }, 'notifications.order.shipped');

  // Payment refunded → notify user
  await subscribe('payment.refunded', async (event) => {
    const { orderId, amount } = event.data;

    // Look up order to get userId
    console.log(`[EMAIL] Refund confirmation of $${amount} for order ${orderId}`);
  }, 'notifications.payment.refunded');
}

// === REST API (for reading notifications) ===

app.get('/notifications', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.per_page as string) || 20;

  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const unreadCount = await Notification.countDocuments({ userId, readAt: null });

  res.json({ data: notifications, unreadCount });
});

app.patch('/notifications/:id/read', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId },
    { readAt: new Date() },
    { new: true }
  );
  if (!notification) return res.status(404).json({ error: 'Not found' });
  res.json(notification);
});

app.post('/notifications/read-all', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  await Notification.updateMany({ userId, readAt: null }, { readAt: new Date() });
  res.json({ message: 'All notifications marked as read' });
});

app.get('/health', (_req, res) => {
  res.json({ service: 'notification-service', status: 'ok' });
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, async () => {
  console.log(`Notification service running on port ${PORT}`);
  await setupEventConsumers();
  console.log('Event consumers initialized');
});
