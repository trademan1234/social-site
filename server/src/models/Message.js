import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Fil d'une conversation (dans les deux sens) et compteur de non-lus
messageSchema.index({ from: 1, to: 1, _id: -1 });
messageSchema.index({ to: 1, read: 1 });

export const Message = mongoose.model('Message', messageSchema);
