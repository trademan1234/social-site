import { Router } from 'express';
import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth); // messagerie réservée aux inscrits

const lite = (u) => ({ id: u._id, name: u.name, color: u.color });
const shape = (m, me) => ({
  id: m._id,
  text: m.text,
  fromMe: String(m.from) === String(me._id),
  read: m.read,
  createdAt: m.createdAt,
});

async function findOther(req, res) {
  const other = await User.findOne({ nameKey: String(req.params.name).toLowerCase() }, 'name color').lean();
  if (!other) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return null;
  }
  if (other._id.equals(req.user._id)) {
    res.status(400).json({ error: 'Tu ne peux pas t’écrire à toi-même 🙂' });
    return null;
  }
  return other;
}

const between = (a, b) => ({ $or: [{ from: a, to: b }, { from: b, to: a }] });

// Nombre total de messages non lus (pastille de la bulle)
router.get('/unread', async (req, res) => {
  res.json({ count: await Message.countDocuments({ to: req.user._id, read: false }) });
});

// Liste des conversations : dernier message + non-lus par interlocuteur
router.get('/conversations', async (req, res) => {
  const me = req.user._id;
  const rows = await Message.aggregate([
    { $match: { $or: [{ from: me }, { to: me }] } },
    { $sort: { _id: -1 } },
    {
      $group: {
        _id: { $cond: [{ $eq: ['$from', me] }, '$to', '$from'] },
        last: { $first: '$$ROOT' },
        unread: { $sum: { $cond: [{ $and: [{ $eq: ['$to', me] }, { $eq: ['$read', false] }] }, 1, 0] } },
      },
    },
    { $sort: { 'last._id': -1 } },
    { $limit: 50 },
  ]);
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) } }, 'name color').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  res.json(
    rows
      .filter((r) => byId.has(String(r._id)))
      .map((r) => ({ user: lite(byId.get(String(r._id))), last: shape(r.last, req.user), unread: r.unread }))
  );
});

// Messages d'une conversation. ?after=<id> : nouveaux messages (rafraîchissement) ; ?before=<id> : plus anciens.
router.get('/with/:name', async (req, res) => {
  const other = await findOther(req, res);
  if (!other) return;
  const filter = between(req.user._id, other._id);
  const { after, before } = req.query;
  let items;
  let hasMore = false;
  if (after && mongoose.isValidObjectId(after)) {
    items = await Message.find({ ...filter, _id: { $gt: after } }).sort({ _id: 1 }).limit(100).lean();
  } else {
    const limit = 40;
    if (before && mongoose.isValidObjectId(before)) filter._id = { $lt: before };
    items = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    hasMore = items.length > limit;
    items = items.slice(0, limit).reverse();
  }
  // Ouvrir la conversation marque comme lus les messages reçus
  await Message.updateMany({ from: other._id, to: req.user._id, read: false }, { $set: { read: true } });
  res.json({ user: lite(other), items: items.map((m) => shape(m, req.user)), hasMore });
});

router.post('/with/:name', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const other = await findOther(req, res);
  if (!other) return;
  const m = await Message.create({ from: req.user._id, to: other._id, text });
  res.status(201).json(shape(m.toObject(), req.user));
});

export default router;
