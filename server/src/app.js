import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import reviewRoutes from './routes/reviews.js';
import userRoutes from './routes/users.js';
import instructorRoutes from './routes/instructors.js';
import { rejectMongoOperators } from './middleware/mongoInput.js';

const app = express();

morgan.token('path', req => req.path);
app.use(morgan(':method :path :status :response-time ms'));
app.use(cors({ origin: 'http://localhost:5175', credentials: false }));
app.use(express.json());
app.use(rejectMongoOperators);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/users', userRoutes);
app.use('/api/instructors', instructorRoutes);

// Not found
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  // Parser/database errors can contain input or private document values.
  res.status(status).json({ message: status === 400 ? 'Invalid request' : 'Server Error' });
});

export default app;
