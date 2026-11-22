import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { Post, Comment, REACTIONS } from '../models/Post.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { saveFile, removeFile } from '../storage.js';

const router = Router();
const IMAGE_MIME = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/;
const VIDEO_MIME = /^video\/(mp4|webm|quicktime|ogg)$/;
const VIDEO_EXT = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/ogg': '.ogv' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    IMAGE_MIME.test(file.mimetype) || VIDEO_MIME.test(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Format non supporté (images ou vidéos mp4/webm/mov).'), { status: 400 })),
});

const isId = (id) => mongoose.isValidObjectId(id);

/** Shape a post for the client: reaction counts + current user's reaction, no raw arrays. */
function serialize(post, authorsById, me) {
  const counts = {};
  let mine = null;
  for (const r of post.reactions || []) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (me && String(r.user) === String(me._id)) mine = r.type;
  }
  const a = authorsById.get(String(post.author));
  return {
    id: post._id,
    type: post.type,
    media: post.media,
    caption: post.caption,
    createdAt: post.createdAt,
    commentCount: post.commentCount,
    reactions: counts,
    reactionTotal: (post.reactions || []).length,
    myReaction: mine,
    author: a ? { id: a._id, name: a.name, color: a.color } : { name: 'Inconnu', color: '#888' },
  };
}

async function authorsMap(posts) {
  const ids = [...new Set(posts.map((p) => String(p.author)))];
  const users = await User.find({ _id: { $in: ids } }, 'name color').lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

// Fil d'actualité paginé par curseur (visible par tous)
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 30);
  const filter = {};
  if (req.query.type === 'photo' || req.query.type === 'video') filter.type = req.query.type;
  if (req.query.author) {
    const u = await User.findOne({ nameKey: String(req.query.author).toLowerCase() }, '_id').lean();
    if (!u) return res.json({ items: [], next: null });
    filter.author = u._id;
  }
  if (req.query.before && isId(req.query.before)) filter._id = { $lt: req.query.before };

  const posts = await Post.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = posts.length > limit;
  const page = posts.slice(0, limit);
  const authors = await authorsMap(page);
  res.json({ items: page.map((p) => serialize(p, authors, req.user)), next: hasMore ? page.at(-1)._id : null });
});

// Publier une photo ou une vidéo
router.post('/', requireAuth, upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ajoute une photo ou une vidéo.' });
  const caption = String(req.body.caption || '').slice(0, 500);
  const base = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  let type, media;

  if (IMAGE_MIME.test(req.file.mimetype)) {
    // Optimisation : conversion WebP, redimensionnement, rotation EXIF, + miniature légère pour le fil
    type = 'photo';
    let full, thumb;
    try {
      const img = sharp(req.file.buffer).rotate();
      full = await img.clone()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      thumb = await img.clone().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    } catch {
      return res.status(400).json({ error: 'Image illisible.' });
    }
    await Promise.all([
      saveFile(`${base}.webp`, full.data, 'image/webp'),
      saveFile(`${base}-sm.webp`, thumb, 'image/webp'),
    ]);
    media = {
      url: `/uploads/${base}.webp`,
      thumb: `/uploads/${base}-sm.webp`,
      width: full.info.width,
      height: full.info.height,
      mime: 'image/webp',
    };
  } else {
    type = 'video';
    const file = `${base}${VIDEO_EXT[req.file.mimetype] || '.mp4'}`;
    await saveFile(file, req.file.buffer, req.file.mimetype);
    const w = Number(req.body.width) || undefined;
    const h = Number(req.body.height) || undefined;
    media = { url: `/uploads/${file}`, mime: req.file.mimetype, width: w, height: h };
  }

  const post = await Post.create({ author: req.user._id, type, media, caption });
  res.status(201).json(serialize(post.toObject(), new Map([[String(req.user._id), req.user]]), req.user));
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Introuvable' });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Introuvable' });
  if (!post.author.equals(req.user._id)) return res.status(403).json({ error: "Ce n'est pas ta publication." });
  await Promise.all([post.deleteOne(), Comment.deleteMany({ post: post._id })]);
  for (const u of [post.media?.url, post.media?.thumb].filter(Boolean)) {
    removeFile(u);
  }
  res.status(204).end();
});

// Réagir (re-cliquer la même réaction l'enlève)
router.post('/:id/react', requireAuth, async (req, res) => {
  const type = req.body?.type ?? null;
  if (type !== null && !REACTIONS.includes(type)) return res.status(400).json({ error: 'Réaction invalide' });
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Introuvable' });
  const post = await Post.findById(req.params.id, 'reactions');
  if (!post) return res.status(404).json({ error: 'Introuvable' });
  const idx = post.reactions.findIndex((r) => r.user.equals(req.user._id));
  const current = idx >= 0 ? post.reactions[idx].type : null;
  if (idx >= 0) post.reactions.splice(idx, 1);
  if (type && type !== current) post.reactions.push({ user: req.user._id, type });
  await post.save();
  const s = serialize(post.toObject(), new Map(), req.user);
  res.json({ reactions: s.reactions, reactionTotal: s.reactionTotal, myReaction: s.myReaction });
});

router.get('/:id/comments', async (req, res) => {
  if (!isId(req.params.id)) return res.json([]);
  const comments = await Comment.find({ post: req.params.id })
    .sort({ _id: 1 })
    .limit(200)
    .populate('author', 'name color')
    .lean();
  res.json(
    comments.map((c) => ({
      id: c._id,
      text: c.text,
      createdAt: c.createdAt,
      author: c.author ? { id: c.author._id, name: c.author.name, color: c.author.color } : { name: 'Inconnu', color: '#888' },
    }))
  );
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Commentaire vide' });
  if (!isId(req.params.id) || !(await Post.exists({ _id: req.params.id }))) {
    return res.status(404).json({ error: 'Introuvable' });
  }
  const c = await Comment.create({ post: req.params.id, author: req.user._id, text });
  await Post.updateOne({ _id: req.params.id }, { $inc: { commentCount: 1 } });
  res.status(201).json({
    id: c._id,
    text: c.text,
    createdAt: c.createdAt,
    author: { id: req.user._id, name: req.user.name, color: req.user.color },
  });
});

export default router;
