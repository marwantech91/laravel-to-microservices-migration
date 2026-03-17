/**
 * Migrate orders collection from monolith to order-service.
 * Adds saga tracking fields and transforms status values.
 */

import { MongoClient } from 'mongodb';

const MONOLITH_URI = process.env.MONOLITH_MONGO_URI || 'mongodb://localhost:27017/monolith_app';
const ORDER_SERVICE_URI = process.env.ORDER_SERVICE_MONGO_URI || 'mongodb://localhost:27017/order_service';
const BATCH_SIZE = 500;

// Map monolith statuses to microservice statuses
const STATUS_MAP: Record<string, string> = {
  pending: 'pending',
  confirmed: 'confirmed',
  processing: 'confirmed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

async function migrateOrders() {
  const monolithClient = new MongoClient(MONOLITH_URI);
  const orderClient = new MongoClient(ORDER_SERVICE_URI);

  try {
    await monolithClient.connect();
    await orderClient.connect();

    const sourceCollection = monolithClient.db().collection('orders');
    const targetCollection = orderClient.db().collection('orders');

    await targetCollection.createIndex({ userId: 1, createdAt: -1 });
    await targetCollection.createIndex({ status: 1 });

    const totalCount = await sourceCollection.countDocuments();
    console.log(`Found ${totalCount} orders to migrate`);

    let migrated = 0;
    const cursor = sourceCollection.find().batchSize(BATCH_SIZE);
    const batch: any[] = [];

    for await (const order of cursor) {
      const status = STATUS_MAP[order.status] || order.status;
      const isCompleted = ['confirmed', 'shipped', 'delivered'].includes(status);

      const transformed = {
        _id: order._id.toString(),
        userId: order.user_id.toString(),
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        shippingCost: order.shipping_cost,
        total: order.total,
        status,
        paymentMethod: order.payment_method,
        paymentId: order.payment_id || null,
        shippingAddress: order.shipping_address,
        billingAddress: order.billing_address || order.shipping_address,
        notes: order.notes || null,
        trackingNumber: order.tracking_number || null,
        cancellationReason: order.cancellation_reason || null,
        // Retroactively set saga state for historical orders
        sagaState: {
          stockReserved: isCompleted,
          paymentProcessed: isCompleted && !!order.payment_id,
        },
        outbox: [],
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      };

      batch.push({
        updateOne: {
          filter: { _id: transformed._id },
          update: { $set: transformed },
          upsert: true,
        },
      });

      if (batch.length >= BATCH_SIZE) {
        const result = await targetCollection.bulkWrite(batch);
        migrated += result.upsertedCount + result.modifiedCount;
        console.log(`Migrated ${migrated}/${totalCount} orders`);
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      const result = await targetCollection.bulkWrite(batch);
      migrated += result.upsertedCount + result.modifiedCount;
    }

    const targetCount = await targetCollection.countDocuments();
    console.log('\n=== Migration Complete ===');
    console.log(`Source: ${totalCount} | Target: ${targetCount} | Migrated: ${migrated}`);

    // Print status distribution
    const statusDistribution = await targetCollection.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    console.log('\nStatus distribution:');
    statusDistribution.forEach((s: any) => console.log(`  ${s._id}: ${s.count}`));
  } finally {
    await monolithClient.close();
    await orderClient.close();
  }
}

migrateOrders().catch(console.error);
