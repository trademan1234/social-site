import mongoose from 'mongoose';

const COLORS = ['#ff6b6b', '#f7b733', '#4ecdc4', '#a29bfe', '#fd79a8', '#00b894', '#0984e3', '#e17055'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 24 },
    nameKey: { type: String, required: true, unique: true }, // minuscules : unicité insensible à la casse
    token: { type: String, required: true, index: true, select: false },
    color: { type: String, default: () => COLORS[Math.floor(Math.random() * COLORS.length)] },
    bio: { type: String, maxlength: 160, default: '' },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  return { id: this._id, name: this.name, color: this.color, bio: this.bio, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
