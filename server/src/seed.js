// Creates the first admin account. Safe to re-run.
// Usage: ADMIN_EMAIL=you@uni.edu ADMIN_PASSWORD=... npm run seed
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { User } from './models/index.js';

const email = (process.env.ADMIN_EMAIL || 'admin@corpus.local').toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

await mongoose.connect(config.mongoUri);
const existing = await User.findOne({ email });
if (existing) {
  console.log(`Admin already exists: ${email}`);
} else {
  await User.create({ name: 'Admin', email, role: 'admin', passwordHash: await bcrypt.hash(password, 10) });
  console.log(`Created admin: ${email} / ${password}`);
  if (!process.env.ADMIN_PASSWORD) console.log('Change this password after first login (Users page).');
}
await mongoose.disconnect();
