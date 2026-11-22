import { Router } from 'express';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const NAME_RE = /^[\p{L}\p{N}_ .-]{2,24}$/u;

function cleanName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  return NAME_RE.test(name) ? name : null;
}

// Inscription : seulement un nom (choix volontaire : sécurité minimale, pas d'email ni de mot de passe)
router.post('/register', async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Nom invalide (2 à 24 caractères, lettres/chiffres).' });
  const nameKey = name.toLowerCase();
  if (await User.exists({ nameKey })) {
    return res.status(409).json({ error: 'Ce nom est déjà pris. Connecte-toi ou choisis-en un autre.' });
  }
  const token = crypto.randomUUID();
  const user = await User.create({ name, nameKey, token });
  res.status(201).json({ token, user: user.toPublic() });
});

// Connexion par nom (pas de mot de passe)
router.post('/login', async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Nom invalide.' });
  const user = await User.findOne({ nameKey: name.toLowerCase() }).select('+token');
  if (!user) return res.status(404).json({ error: 'Aucun compte avec ce nom. Inscris-toi !' });
  res.json({ token: user.token, user: user.toPublic() });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

router.patch('/me', requireAuth, async (req, res) => {
  if (typeof req.body?.bio === 'string') req.user.bio = req.body.bio.slice(0, 160);
  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

export default router;
