import mongoose from 'mongoose';

export const REACTIONS = ['like', 'love', 'haha', 'wow', 'fire', 'sad'];

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['photo', 'video'], required: true },
    media: {
      url: String,
      thumb: String, // photos : miniature webp légère pour le fil
      width: Number,
      height: Number,
      mime: String,
    },
    caption: { type: String, maxlength: 500, default: '' },
    reactions: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, enum: REACTIONS },
      },
    ],
    commentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

postSchema.index({ type: 1, _id: -1 });
postSchema.index({ author: 1, _id: -1 });

export const Post = mongoose.model('Post', postSchema);

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export const Comment = mongoose.model('Comment', commentSchema);
