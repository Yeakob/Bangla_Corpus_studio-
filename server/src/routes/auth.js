import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { ROLES } from '../config.js';
import { requireAuth, allow, signToken } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/helpers.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password');
    }
    res.json({ token: signToken(user), user: user.toSafe() });
  })
);

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafe() }));

// ---------- User management (admin only) ----------
export const usersRouter = Router();
usersRouter.use(requireAuth, allow('admin'));

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users.map((u) => u.toSafe()));
  })
);

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        role: z.enum(ROLES),
      })
      .parse(req.body);
    const user = await User.create({
      name: body.name,
      email: body.email,
      role: body.role,
      passwordHash: await bcrypt.hash(body.password, 10),
    });
    res.status(201).json(user.toSafe());
  })
);

usersRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        role: z.enum(ROLES).optional(),
        active: z.boolean().optional(),
        password: z.string().min(8).optional(),
      })
      .parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    if (String(user._id) === String(req.user._id) && (body.active === false || (body.role && body.role !== 'admin'))) {
      throw new HttpError(400, 'You cannot deactivate or demote yourself');
    }
    if (body.name) user.name = body.name;
    if (body.role) user.role = body.role;
    if (body.active !== undefined) user.active = body.active;
    if (body.password) user.passwordHash = await bcrypt.hash(body.password, 10);
    await user.save();
    res.json(user.toSafe());
  })
);
