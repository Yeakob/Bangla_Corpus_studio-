import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { createApp } from './app.js';
import { User } from './models/index.js';

await fs.mkdir(path.join(config.uploadDir, 'tmp'), { recursive: true });
await mongoose.connect(config.mongoUri);
console.log(`[db] connected to ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);

// First start: create the admin account so the app can be used right away.
if ((await User.countDocuments()) === 0) {
  const email = (process.env.ADMIN_EMAIL || 'admin@corpus.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  await User.create({ name: 'Admin', email, role: 'admin', passwordHash: await bcrypt.hash(password, 10) });
  console.log(`[setup] created first admin: ${email} (change the password after logging in)`);
}

createApp().listen(config.port, () => {
  console.log(`[api] Corpus Studio on http://localhost:${config.port}`);
  console.log(`[api] uploads in ${config.uploadDir}`);
});
