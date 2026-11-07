import mongoSanitize from 'express-mongo-sanitize';

export function rejectMongoOperators(req, res, next) {
  // Reject without changing credentials or assigning read-only req.query.
  if ([req.body, req.query, req.params].some(value => mongoSanitize.has(value))) {
    return res.status(400).json({ message: 'MongoDB operators are not allowed' });
  }
  next();
}
