import { test, describe, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { startDb, stopDb } from './helpers/testEnv.js';


const api = request(app);
let previousSecret;
before(async () => {
  previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-test-secret-not-used-outside-tests';
  await startDb();
});
after(async () => {
  await stopDb();
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

test('student registration/login/JWT, review CRUD, ownership, and summary remain functional', async () => {
  const credentials = { name: 'Test Student', email: 'student@example.com', password: 'student-test-password' };
  const registration = await api.post('/api/auth/register').send(credentials);
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.password, undefined);
  const login = await api.post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
  assert.equal(login.status, 200);
  const token = login.body.token;
  const auth = { Authorization: `Bearer ${token}` };
  const me = await api.get('/api/auth/me').set(auth);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, credentials.email);
  assert.equal((await api.get('/api/auth/me')).status, 401);
  assert.equal((await api.get('/api/auth/me').set('Authorization', 'Bearer invalid')).status, 401);
  assert.equal((await api.post('/api/auth/login').send({ email: credentials.email, password: 'wrong' })).status, 401);
  assert.equal((await api.post('/api/reviews').send({ courseCode: 'CS101', rating: 4 })).status, 401);
  const created = await api.post('/api/reviews').set(auth).send({ courseCode: 'CS101', rating: 4, comment: 'Useful' });
  assert.equal(created.status, 201);
  const id = created.body.review._id;
  const list = await api.get('/api/reviews');
  assert.equal(list.body.reviews[0].reviewedBy.name, credentials.name);
  assert.equal((await api.get(`/api/reviews/${id}`)).status, 200);
  const second = await api.post('/api/auth/register').send({ ...credentials, email: 'other@example.com' });
  assert.equal((await api.patch(`/api/reviews/${id}`).set('Authorization', `Bearer ${second.body.token}`).send({ rating: 1 })).status, 403);
  const updated = await api.patch(`/api/reviews/${id}`).set(auth).send({ rating: 5 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.review.rating, 5);
  const summary = await api.get('/api/reviews/summary').query({ courseCode: 'cs101' });
  assert.deepEqual(summary.body, { courseCode: 'CS101', averageRating: 5, reviewCount: 1 });
  assert.equal((await api.delete(`/api/reviews/${id}`).set(auth)).status, 200);
  assert.equal((await api.get(`/api/reviews/${id}`)).status, 404);
});
