import express from 'express';
import mongoose from 'mongoose';
import { v4 as uuid } from 'uuid';
import { publishEvent, subscribe } from './events';

const app = express();
app.use(express.json());

// === MongoDB Connection ===
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/product_service';
mongoose.connect(MONGO_URI);

// === Product Model ===
const productSchema = new mongoose.Schema({
  _id: { type: String, default: uuid },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  comparePrice: Number,
  sku: { type: String, required: true, unique: true },
  stock: { type: Number, default: 0 },
  reservedStock: { type: Number, default: 0 }, // Stock reserved by pending orders
  category: String,
  tags: [String],
  images: [String],
  attributes: mongoose.Schema.Types.Mixed,
  isActive: { type: Boolean, default: true },
  weight: Number,
  dimensions: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model('Product', productSchema);

// === Routes ===

app.get('/products', async (req, res) => {
  try {
    const { category, search, in_stock, page = '1', per_page = '20' } = req.query;
    const filter: any = { isActive: true };

    if (category) filter.category = category;
    if (in_stock === 'true') filter.stock = { $gt: 0 };
    if (search) filter.$text = { $search: search as string };

    const skip = (parseInt(page as string) - 1) * parseInt(per_page as string);
    const limit = parseInt(per_page as string);

    const [products, total] = await Promise.all([
      Product.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Product.countDocuments(filter),
    ]);

    res.json({
      data: products,
      total,
      page: parseInt(page as string),
      lastPage: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/products/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/products', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const product = await Product.create({
      ...req.body,
      slug: req.body.name.toLowerCase().replace(/\s+/g, '-'),
    });

    await publishEvent('product.created', {
      productId: product._id,
      name: product.name,
      price: product.price,
      stock: product.stock,
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/products/:id', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  await publishEvent('product.updated', {
    productId: product._id,
    changes: req.body,
  });

  res.json(product);
});

app.delete('/products/:id', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product deleted' });
});

// === Internal: Stock reservation (called by order saga) ===

app.post('/internal/stock/reserve', async (req, res) => {
  const { orderId, items } = req.body;

  try {
    // Check availability for all items first
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ error: `Product ${item.productId} not found` });
      }
      const available = product.stock - product.reservedStock;
      if (available < item.quantity) {
        return res.status(422).json({ error: `Insufficient stock for ${product.name}` });
      }
    }

    // Reserve stock atomically
    for (const item of items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { reservedStock: item.quantity },
      });
    }

    await publishEvent('stock.reserved', { orderId, items });
    res.json({ reserved: true });
  } catch (error) {
    console.error('Stock reservation error:', error);
    res.status(500).json({ error: 'Stock reservation failed' });
  }
});

app.post('/internal/stock/release', async (req, res) => {
  const { orderId, items } = req.body;

  for (const item of items) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { reservedStock: -item.quantity },
    });
  }

  await publishEvent('stock.released', { orderId, items });
  res.json({ released: true });
});

app.post('/internal/stock/confirm', async (req, res) => {
  const { items } = req.body;

  for (const item of items) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stock: -item.quantity, reservedStock: -item.quantity },
    });
  }

  res.json({ confirmed: true });
});

app.get('/health', (_req, res) => {
  res.json({ service: 'product-service', status: 'ok' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Product service running on port ${PORT}`));
