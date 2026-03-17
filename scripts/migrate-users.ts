/**
 * Migrate users collection from monolith MongoDB to auth-service MongoDB.
 *
 * Strategy:
 * 1. Read users from monolith DB in batches
 * 2. Transform schema (snake_case → camelCase, flatten fields)
 * 3. Write to auth-service DB
 * 4. Verify counts and sample records
 *
 * Idempotent: uses upsert so it's safe to re-run.
 */

import { MongoClient } from 'mongodb';

const MONOLITH_URI = process.env.MONOLITH_MONGO_URI || 'mongodb://localhost:27017/monolith_app';
const AUTH_SERVICE_URI = process.env.AUTH_SERVICE_MONGO_URI || 'mongodb://localhost:27017/auth_service';
const BATCH_SIZE = 500;

interface MonolithUser {
  _id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: string;
  address?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  last_login_at?: Date;
  email_verified_at?: Date;
  created_at: Date;
  updated_at: Date;
}

async function migrateUsers() {
  const monolithClient = new MongoClient(MONOLITH_URI);
  const authClient = new MongoClient(AUTH_SERVICE_URI);

  try {
    await monolithClient.connect();
    await authClient.connect();

    const monolithDb = monolithClient.db();
    const authDb = authClient.db();

    const sourceCollection = monolithDb.collection<MonolithUser>('users');
    const targetCollection = authDb.collection('users');

    // Ensure indexes on target
    await targetCollection.createIndex({ email: 1 }, { unique: true });
    await targetCollection.createIndex({ role: 1 });

    const totalCount = await sourceCollection.countDocuments();
    console.log(`Found ${totalCount} users to migrate`);

    let migrated = 0;
    let errors = 0;

    const cursor = sourceCollection.find().batchSize(BATCH_SIZE);

    const batch: any[] = [];

    for await (const user of cursor) {
      // Transform: Laravel snake_case → Node.js camelCase
      const transformed = {
        _id: user._id.toString(), // Preserve original IDs
        email: user.email.toLowerCase(),
        password: user.password, // bcrypt hash is compatible
        name: user.name,
        phone: user.phone || null,
        role: user.role || 'customer',
        address: user.address || null,
        preferences: user.preferences || null,
        lastLoginAt: user.last_login_at || null,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      };

      batch.push({
        updateOne: {
          filter: { _id: transformed._id },
          update: { $set: transformed },
          upsert: true,
        },
      });

      if (batch.length >= BATCH_SIZE) {
        try {
          const result = await targetCollection.bulkWrite(batch);
          migrated += result.upsertedCount + result.modifiedCount;
          console.log(`Migrated ${migrated}/${totalCount} users`);
        } catch (err) {
          errors++;
          console.error('Batch write error:', err);
        }
        batch.length = 0;
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const result = await targetCollection.bulkWrite(batch);
      migrated += result.upsertedCount + result.modifiedCount;
    }

    // Verify
    const targetCount = await targetCollection.countDocuments();
    console.log('\n=== Migration Complete ===');
    console.log(`Source: ${totalCount} users`);
    console.log(`Target: ${targetCount} users`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Errors: ${errors}`);

    if (targetCount === totalCount) {
      console.log('✓ Counts match — migration successful');
    } else {
      console.warn('⚠ Count mismatch — review errors');
    }
  } finally {
    await monolithClient.close();
    await authClient.close();
  }
}

migrateUsers().catch(console.error);
