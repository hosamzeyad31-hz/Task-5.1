import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const isPasswordHash = value => typeof value === 'string' &&
  /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);

async function hashPassword(password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must contain between 1 and 72 UTF-8 bytes');
  }
  return bcrypt.hash(password, 12);
}

const instructorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, select: false },
  department: String,
  role: { type: String, default: 'instructor' },
  apiKey: { type: String, select: false },
  privateEmail: { type: String, select: false },
  privatePhone: { type: String, select: false }
}, { timestamps: true });

instructorSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await hashPassword(this.password);
});

// insertMany does not execute save middleware.
instructorSchema.pre('insertMany', async function (next, docs) {
  try {
    for (const doc of docs) doc.password = await hashPassword(doc.password);
    next();
  } catch (err) { next(err); }
});

// Password changes must use save() so hashing cannot be bypassed.
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace']) {
  instructorSchema.pre(operation, function () {
    const update = this.getUpdate();
    if (Array.isArray(update) || Object.entries(update || {}).some(([key, value]) =>
      key === 'password' || (key.startsWith('$') && value &&
        Object.keys(value).some(field => field === 'password' || field.startsWith('password.')))
    )) throw new Error('Use document.save() to change an instructor password');
  });
}

instructorSchema.methods.comparePassword = async function (candidate) {
  return isPasswordHash(this.password) && bcrypt.compare(candidate, this.password);
};

function removeSecrets(doc, result) {
  for (const field of ['password', 'apiKey', 'privateEmail', 'privatePhone']) delete result[field];
  return result;
}
instructorSchema.set('toJSON', { transform: removeSecrets });
instructorSchema.set('toObject', { transform: removeSecrets });

export const Instructor = mongoose.model('Instructor', instructorSchema);
