import amqp from 'amqplib';

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

export async function subscribe(
  pattern: string,
  handler: (event: any) => Promise<void>,
  queue: string
): Promise<void> {
  const ch = await getChannel();

  // Set up dead letter exchange for failed messages
  await ch.assertExchange(`${EXCHANGE}.dlx`, 'topic', { durable: true });
  await ch.assertQueue(`${queue}.dlq`, { durable: true });
  await ch.bindQueue(`${queue}.dlq`, `${EXCHANGE}.dlx`, pattern);

  await ch.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': `${EXCHANGE}.dlx`,
      'x-dead-letter-routing-key': pattern,
    },
  });

  await ch.bindQueue(queue, EXCHANGE, pattern);
  ch.prefetch(1);

  ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const envelope = JSON.parse(msg.content.toString());
      await handler(envelope.event);
      ch.ack(msg);
    } catch (error) {
      console.error(`Failed to process event from ${queue}:`, error);
      // Reject and send to DLQ (no requeue)
      ch.nack(msg, false, false);
    }
  });

  console.log(`Subscribed to ${pattern} on queue ${queue}`);
}
