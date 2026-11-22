import { Router } from 'express';
import { User } from '../models/User.js';
import { Post } from '../models/Post.js';

const router = Router();

// Membres récents
router.get('/', async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(12).lean();
  res.json(users.map((u) => ({ id: u._id, name: u.name, color: u.color })));
});

// Profil + stats
router.get('/:name', async (req, res) => {
  const user = await User.findOne({ nameKey: String(req.params.name).toLowerCase() });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const [stats] = await Post.aggregate([
    { $match: { author: user._id } },
    {
      $group: {
        _id: null,
        posts: { $sum: 1 },
        photos: { $sum: { $cond: [{ $eq: ['$type', 'photo'] }, 1, 0] } },
        videos: { $sum: { $cond: [{ $eq: ['$type', 'video'] }, 1, 0] } },
        reactions: { $sum: { $size: '$reactions' } },
      },
    },
  ]);
  res.json({ user: user.toPublic(), stats: stats || { posts: 0, photos: 0, videos: 0, reactions: 0 } });
});

export default router;
