import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { publishEvent } from './events';

const app = express();
app.use(express.json());

// === MongoDB Connection ===
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auth_service';
mongoose.connect(MONGO_URI);

// === User Model ===
const userSchema = new mongoose.Schema({
  _id: { type: String, default: uuid },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  phone: String,
  role: { type: String, default: 'customer', enum: ['customer', 'admin'] },
  address: mongoose.Schema.Types.Mixed,
  preferences: mongoose.Schema.Types.Mixed,
  lastLoginAt: Date,
  refreshToken: String,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// === JWT Config ===
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

function generateTokens(user: any) {
  const accessToken = jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId: user._id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

// === Routes ===

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      phone,
    });

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Publish event for other services
    await publishEvent('user.registered', {
      userId: user._id,
      email: user.email,
      name: user.name,
      registeredAt: new Date().toISOString(),
    });

    res.status(201).json({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.post('/auth/logout', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (userId) {
    await User.findByIdAndUpdate(userId, { refreshToken: null });
  }
  res.json({ message: 'Logged out' });
});

// User management (called by gateway with X-User-Id header)
app.get('/users/me', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const user = await User.findById(userId).select('-password -refreshToken');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.patch('/users/me', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const { name, phone, address, preferences } = req.body;

  const user = await User.findByIdAndUpdate(
    userId,
    { name, phone, address, preferences },
    { new: true }
  ).select('-password -refreshToken');

  if (!user) return res.status(404).json({ error: 'User not found' });

  await publishEvent('user.updated', { userId, changes: req.body });

  res.json(user);
});

// Internal endpoint — called by other services
app.get('/internal/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -refreshToken');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.get('/health', (_req, res) => {
  res.json({ service: 'auth-service', status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`));
