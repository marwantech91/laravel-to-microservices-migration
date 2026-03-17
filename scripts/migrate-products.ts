/**
 * Migrate products collection from monolith to product-service.
 * Adds reservedStock field (new in microservice architecture).
 */

import { MongoClient } from 'mongodb';

const MONOLITH_URI = process.env.MONOLITH_MONGO_URI || 'mongodb://localhost:27017/monolith_app';
const PRODUCT_SERVICE_URI = process.env.PRODUCT_SERVICE_MONGO_URI || 'mongodb://localhost:27017/product_service';
const BATCH_SIZE = 500;

async function migrateProducts() {
  const monolithClient = new MongoClient(MONOLITH_URI);
  const productClient = new MongoClient(PRODUCT_SERVICE_URI);

  try {
    await monolithClient.connect();
    await productClient.connect();

    const sourceCollection = monolithClient.db().collection('products');
    const targetCollection = productClient.db().collection('products');

    await targetCollection.createIndex({ sku: 1 }, { unique: true });
    await targetCollection.createIndex({ category: 1, isActive: 1 });
    await targetCollection.createIndex({ name: 'text', description: 'text' });

    const totalCount = await sourceCollection.countDocuments();
    console.log(`Found ${totalCount} products to migrate`);

    let migrated = 0;
    const cursor = sourceCollection.find().batchSize(BATCH_SIZE);
    const batch: any[] = [];

    for await (const product of cursor) {
      const transformed = {
        _id: product._id.toString(),
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        comparePrice: product.compare_price || null,
        sku: product.sku,
        stock: product.stock || 0,
        reservedStock: 0, // New field for microservice
        category: product.category,
        tags: product.tags || [],
        images: product.images || [],
        attributes: product.attributes || {},
        isActive: product.is_active ?? true,
        weight: product.weight || null,
        dimensions: product.dimensions || null,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
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
        console.log(`Migrated ${migrated}/${totalCount} products`);
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
  } finally {
    await monolithClient.close();
    await productClient.close();
  }
}

migrateProducts().catch(console.error);
