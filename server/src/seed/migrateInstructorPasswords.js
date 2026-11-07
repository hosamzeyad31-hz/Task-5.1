import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { Instructor, isPasswordHash } from '../models/Instructor.js';

// Default is read-only. Conditional updates preserve concurrent password changes.
export async function migrateInstructorPasswords({ apply = false } = {}) {
  let pending = 0;
  let migrated = 0;
  let unsupported = 0;
  const cursor = Instructor.collection.find({}, { projection: { password: 1 } });
  for await (const record of cursor) {
    if (isPasswordHash(record.password)) continue;
    if (typeof record.password !== 'string' || !record.password ||
        Buffer.byteLength(record.password, 'utf8') > 72) {
      unsupported++;
      continue;
    }
    pending++;
    if (apply) {
      // Hash with the same cost as new accounts, without replacing any records.
      const password = await bcrypt.hash(record.password, 12);
      const result = await Instructor.collection.updateOne(
        { _id: record._id, password: record.password }, { $set: { password } }
      );
      migrated += result.modifiedCount;
    }
  }
  return { pending, migrated, unsupported };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config();
  try {
    if (!process.env.MONGO_URI) throw new Error('Missing configuration');
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    const result = await migrateInstructorPasswords({ apply: process.argv.includes('--apply') });
    console.log(JSON.stringify(result));
  } catch {
    console.error('Migration failed; check database access and configuration. No credentials logged.');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
