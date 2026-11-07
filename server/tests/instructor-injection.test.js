import { test, describe, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { Instructor } from '../src/models/Instructor.js';
import { rejectMongoOperators } from '../src/middleware/mongoInput.js';
import { migrateInstructorPasswords } from '../src/seed/migrateInstructorPasswords.js';
import { startDb, stopDb, seed, SECRET_FIELDS, ADMIN_PASSWORD } from './helpers/testEnv.js';

const api = request(app);
before(async () => { await startDb(); await seed(); });
after(stopDb);
afterEach(() => mock.restoreAll());

function expectPublic(profile) {
  for (const field of SECRET_FIELDS) assert.equal(Object.hasOwn(profile, field), false);
}

describe('Instructor credentials and public profiles', () => {
  test('valid admin login returns the public profile only', async () => {
    const res = await api.post('/api/instructors/login').send({ username: 'admin', password: ADMIN_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.instructor.username, 'admin');
    assert.equal(res.body.instructor.role, 'superadmin');
    expectPublic(res.body.instructor);
  });
  test('dotted username remains valid', async () => {
    const res = await api.post('/api/instructors/login').send({ username: 'prof.smith', password: 'password123' });
    assert.equal(res.status, 200);
    expectPublic(res.body.instructor);
  });
  ['wrong', 'missing-user'].forEach((kind, index) => test('invalid credentials fail case ' + index, async () => {
    const res = await api.post('/api/instructors/login').send({
      username: kind === 'missing-user' ? 'unknown' : 'admin', password: 'wrong'
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { message: 'Invalid credentials' });
  }));
  [
    {}, [], { username: 'admin' }, { password: 'wrong' },
    { username: {}, password: 'wrong' }, { username: [], password: 'wrong' },
    { username: 'admin', password: [] }, { username: 'admin', password: {} },
    { username: 42, password: 'wrong' }, { username: 'admin', password: 42 },
    { username: 'admin', password: 'wrong', extra: true },
    { username: '', password: 'wrong' }, { username: 'admin', password: '' },
    { username: 'admin', password: 'a'.repeat(73) },
    { username: { $ne: null }, password: { $ne: null } },
    { username: { $gt: '' }, password: { $gt: '' } },
    { username: 'admin', password: { $regex: '^S' } },
    { username: { $where: 'true' }, password: 'wrong' },
    { username: 'admin', password: 'wrong', nested: [{ $ne: null }] }
  ].forEach((body, index) => test('malformed credentials are rejected before lookup case ' + index, async () => {
    const lookup = mock.method(Instructor, 'findOne');
    const res = await api.post('/api/instructors/login').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.instructor, undefined);
    assert.equal(lookup.mock.callCount(), 0);
  }));
  test('no password-prefix oracle', async () => {
    const responses = [];
    for (const prefix of ['^S', '^X']) {
      const res = await api.post('/api/instructors/login').send({ username: 'admin', password: { $regex: prefix } });
      assert.equal(res.status, 400);
      responses.push(res.body);
    }
    assert.deepEqual(responses[0], responses[1]);
  });
  test('malformed JSON fails safely', async () => {
    const res = await api.post('/api/instructors/login').set('Content-Type', 'application/json').send('{');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: 'Invalid request' });
  });
});

describe('Search, directory, and operator rejection', () => {
  test('sanitization supports a read-only query property without changing input', () => {
    const query = { name: 'Smith' };
    const req = { body: { username: 'prof.smith', password: 'literal$ne.value' }, params: {} };
    Object.defineProperty(req, 'query', { get: () => query });
    let continued = false;
    rejectMongoOperators(req, {}, () => { continued = true; });
    assert.equal(continued, true);
    assert.deepEqual(req.query, { name: 'Smith' });
    assert.equal(req.body.password, 'literal$ne.value');
  });
  [
    { 'role[$ne]': 'instructor' }, { 'username[$regex]': '^admin' },
    { $where: 'this.password.length>10' },
    { $where: "this.apiKey && this.apiKey.indexOf('sk_live')===0" },
    { 'name[$gt]': '' }, { 'name[$regex]': '.*' },
    { password: 'guess' }, { apiKey: 'guess' }, { privateEmail: 'guess' },
    { role: 'superadmin' }, { username: 'admin' }, { unexpected: 'x' },
    { 'name[]': 'Smith' }, { 'name.value': 'Smith' },
    { name: ['Smith', 'Jones'] }, { 'name[$where]': 'true' }
  ].forEach((query, index) => test('rejects filters before database execution case ' + index, async () => {
    const lookup = mock.method(Instructor, 'find');
    const res = await api.get('/api/instructors/search').query(query);
    assert.equal(res.status, 400);
    assert.equal(res.body.instructors, undefined);
    assert.equal(lookup.mock.callCount(), 0);
  }));
  ['Smith', 'smith', 'Prof. Alice Smith'].forEach((name, index) => test('literal name search works case ' + index, async () => {
    const res = await api.get('/api/instructors/search').query({ name });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.instructors[0].name, 'Prof. Alice Smith');
    expectPublic(res.body.instructors[0]);
  }));
  ['.*', '^', '$where', '(a+)+$'].forEach((name, index) => test('regex syntax is literal data case ' + index, async () => {
    const res = await api.get('/api/instructors/search').query({ name });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);
  }));
  ['/api/instructors', '/api/instructors/search', '/api/instructors/search?name='].forEach((url, index) => test('public endpoint exposes no secrets case ' + index, async () => {
    const res = await api.get(url);
    assert.equal(res.status, 200);
    assert.equal(res.body.instructors.length, 4);
    res.body.instructors.forEach(expectPublic);
  }));
});

describe('Password storage and migration', () => {
  test('database contains a verifiable hash; defaults and serialization hide secrets', async () => {
    const admin = await Instructor.findOne({ username: 'admin' }).select('+password +apiKey +privateEmail +privatePhone');
    assert.equal(await bcrypt.compare(ADMIN_PASSWORD, admin.password), true);
    expectPublic(admin.toJSON());
    expectPublic(admin.toObject());
    expectPublic((await Instructor.findOne({ username: 'admin' }).lean()));
    const original = admin.password;
    await admin.save();
    assert.equal((await Instructor.findById(admin._id).select('+password')).password, original);
  });
  test('password changes hash once, including insertMany', async () => {
    const [doc] = await Instructor.insertMany([{ name: 'Test', username: 'test-hashing', password: 'original' }]);
    assert.equal(await doc.comparePassword('original'), true);
    doc.password = 'changed';
    await doc.save();
    assert.equal(await doc.comparePassword('changed'), true);
    assert.equal(await doc.comparePassword('original'), false);
    await doc.deleteOne();
  });
  test('query password updates cannot skip save hashing', async () => {
    await assert.rejects(Instructor.updateOne({ username: 'admin' }, { $set: { password: 'plaintext' } }), /Use document.save()/);
  });
  test('migration is read-only by default, preserves accounts and hashes, and is repeatable', async () => {
    // Raw collection access deliberately simulates a legacy database record.
    const { insertedId } = await Instructor.collection.insertOne({ name: 'Legacy', username: 'legacy', password: 'legacy-password', role: 'instructor' });
    const before = await Instructor.findOne({ username: 'admin' }).select('+password');
    assert.deepEqual(await migrateInstructorPasswords(), { pending: 1, migrated: 0, unsupported: 0 });
    assert.equal((await Instructor.collection.findOne({ _id: insertedId })).password, 'legacy-password');
    const denied = await api.post('/api/instructors/login').send({ username: 'legacy', password: 'legacy-password' });
    assert.equal(denied.status, 401);
    assert.deepEqual(await migrateInstructorPasswords({ apply: true }), { pending: 1, migrated: 1, unsupported: 0 });
    const accepted = await api.post('/api/instructors/login').send({ username: 'legacy', password: 'legacy-password' });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await migrateInstructorPasswords({ apply: true }), { pending: 0, migrated: 0, unsupported: 0 });
    assert.equal((await Instructor.findById(before._id).select('+password')).password, before.password);
    await Instructor.collection.deleteOne({ _id: insertedId });
  });
});
