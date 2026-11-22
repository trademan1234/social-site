import { User } from '../models/User.js';

/** Ajoute req.user si un jeton valide est présent (ne bloque jamais). */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = await User.findOne({ token });
    } catch {
      /* ignore */
    }
  }
  next();
}

/** Seuls les inscrits peuvent interagir. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inscris-toi pour interagir 🙂' });
  next();
}
