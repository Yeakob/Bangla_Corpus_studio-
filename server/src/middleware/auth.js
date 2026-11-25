import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { HttpError } from '../utils/helpers.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Accepts `Authorization: Bearer <token>`. For GET requests it also accepts
 * `?token=` so <audio> and <img> tags can load protected media.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token && req.method === 'GET' && typeof req.query.token === 'string') token = req.query.token;
    if (!token) throw new HttpError(401, 'Not signed in');
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw new HttpError(401, 'Account not active');
    req.user = user;
    next();
  } catch (err) {
    next(err.status ? err : new HttpError(401, 'Invalid or expired session'));
  }
}

/** Admins pass every role check. */
export const allow =
  (...roles) =>
  (req, _res, next) => {
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    next(new HttpError(403, `Requires role: ${roles.join(' or ')}`));
  };
