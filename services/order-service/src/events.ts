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

export async function publishEvent(type: string, data: unknown): Promise<void> {
  try {
    const ch = await getChannel();
    const envelope = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      source: 'order-service',
      event: { type, data },
    };
    ch.publish(EXCHANGE, type, Buffer.from(JSON.stringify(envelope)), { persistent: true });
  } catch (error) {
    console.error(`Failed to publish event ${type}:`, error);
  }
}

export async function subscribe(
  pattern: string,
  handler: (event: any) => Promise<void>,
  queue: string
): Promise<void> {
  const ch = await getChannel();
  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, EXCHANGE, pattern);
  ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const envelope = JSON.parse(msg.content.toString());
      await handler(envelope.event);
      ch.ack(msg);
    } catch (error) {
      console.error(`Event processing failed:`, error);
      ch.nack(msg, false, false);
    }
  });
}
