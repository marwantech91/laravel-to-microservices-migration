import amqp from 'amqplib';
import { v4 as uuid } from 'uuid';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const EXCHANGE = 'domain_events';
let channel: amqp.Channel | null = null;

async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel;
  const connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  connection.on('close', () => { channel = null; });
  return channel;
}

export interface DomainEvent {
  id: string;
  timestamp: string;
  source: string;
  event: { type: string; data: unknown };
}

export async function publishEvent(type: string, data: unknown): Promise<void> {
  try {
    const ch = await getChannel();
    const envelope: DomainEvent = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      source: 'payment-service',
      event: { type, data },
    };
    ch.publish(EXCHANGE, type, Buffer.from(JSON.stringify(envelope)), { persistent: true });
  } catch (error) {
    console.error(`Failed to publish event ${type}:`, error);
  }
}
