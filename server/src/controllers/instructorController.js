import Joi from 'joi';
import { Instructor } from '../models/Instructor.js';

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().custom((value, helpers) =>
    Buffer.byteLength(value, 'utf8') <= 72 ? value : helpers.error('any.invalid')
  ).required()
}).required();
const searchSchema = Joi.object({ name: Joi.string().max(100).allow('') }).required();
const publicFields = 'name username department role';

export async function loginInstructor(req, res, next) {
  try {
    const { value, error } = loginSchema.validate(req.body, { convert: false });
    if (error) return res.status(400).json({ message: 'Invalid instructor login input' });
    const instructor = await Instructor.findOne({ username: value.username })
      .select(`${publicFields} +password`);
    if (!instructor || !await instructor.comparePassword(value.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    return res.json({ instructor: {
      id: instructor._id.toString(), name: instructor.name,
      username: instructor.username, department: instructor.department, role: instructor.role
    } });
  } catch (err) { next(err); }
}

export async function getDirectory(req, res, next) {
  try {
    const instructors = await Instructor.find().select('name department role')
      .sort({ name: 1 }).lean();
    res.json({ instructors });
  } catch (err) { next(err); }
}

export async function searchInstructors(req, res, next) {
  try {
    // Only the dashboard's name search is supported, never arbitrary filters.
    const { value, error } = searchSchema.validate(req.query, { convert: false });
    if (error) return res.status(400).json({ message: 'Invalid instructor search input' });
    const filter = {};
    if (value.name) {
      const literalName = value.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: literalName, $options: 'i' };
    }
    const instructors = await Instructor.find(filter).select(publicFields)
      .sort({ name: 1 }).lean();
    res.json({ count: instructors.length, instructors });
  } catch (err) { next(err); }
}
