# Task 5.1 implementation and verification report

Implementation and local verification completed on November 7, 2026. Commit and push were subsequently authorized for the fork master branch; no new branch is required.

The instructor security requirements are implemented. The final automated run passed **57 tests, 0 failures, 0 skipped**. The production frontend build passed, and the final npm audit reported **0 vulnerabilities**. Browser interaction remains unverified because the computer-use tool returned: `Computer Use was not approved to use Google Chrome`.

## A. Requirements

| Requirement | Status | File Modified |
|---|---|---|
| Joi validation | Implemented; strict string credentials, unknown fields rejected; name-only search | `server/src/controllers/instructorController.js` |
| express-mongo-sanitize | Installed 2.2.0; recursive detection rejects requests without rewriting input | `server/package.json`, `server/src/middleware/mongoInput.js`, `server/src/app.js`, lockfile |
| Secure login | Username-only lookup, bcrypt verification, safe response, 400/401 distinction | `server/src/controllers/instructorController.js` |
| Password hashing | bcrypt cost 12 on create/save/insertMany; explicit legacy migration | `server/src/models/Instructor.js`, `server/src/seed/instructors.js`, `server/src/seed/migrateInstructorPasswords.js` |
| Private information protection | Default hidden fields, explicit public projections, serialization filtering, safe dashboard rendering | Instructor model/controller, `client/src/pages/InstructorDashboard.jsx` |
| Attack 1 prevention | Tested: operator credentials rejected before lookup | Middleware, controller, instructor tests |
| Attack 2 prevention | Tested: manipulated search rejected; public responses contain no private fields | Middleware, controller, model, instructor tests |
| Attack 3 prevention | Tested: regex credentials rejected identically; database stores verifiable hashes | Middleware, controller, model, instructor tests |
| Attack 4 prevention | Tested: both documented `$where` expressions rejected before `Instructor.find` | Middleware, controller, instructor tests |

Joi validates the shape and allowed fields. express-mongo-sanitize detects prohibited keys recursively. The middleware uses the package's `has()` API, returns HTTP 400 for the entire request, and never assigns `req.query`. This preserves dotted username **values** such as `prof.smith` and passwords containing punctuation. It avoids sanitizing an invalid credential into a different valid credential. A test also exercises a read-only query property.

Search accepts an optional `name` string up to 100 characters. It supports case-insensitive literal substring search, including `Smith`. Empty or absent name returns the public directory results. Regex metacharacters are escaped; users cannot provide query operators, projections, roles, usernames, passwords, or contact-field filters. Only name search is offered by the existing dashboard and documented as legitimate in Flow.md.

Public data is the identifier, name, department, role, and (for login/search) username. Passwords/hashes, API keys, private email, and private phone are excluded. Instructor login retains the existing public-profile response and local dashboard state. It does not introduce privileged instructor API actions or replace student JWT authentication.

## B. Every implementation file changed or added

| File | Change, reason, and requirement |
|---|---|
| `.github/workflows/ci.yaml` | Updates Node 20 to Node 22 to match the declared runtime for the security-updated tooling. Workflow reviewed, not executed. |
| `.gitignore` | Excludes environment variants and local npm cache, preserving example-file support. Prevents accidental sensitive configuration tracking. |
| `package.json` | Declares Node >=22.12.0 for the updated tooling and built-in runner/watch features. |
| `package-lock.json` | Records sanitizer installation, frontend security updates, and removal of vulnerable development dependency chains. |
| `client/package.json` | Updates Vite to ^7.3.7 and React Router DOM to ^7.18.5 to address npm advisories. |
| `client/src/api.js` | Allows optional `VITE_API_URL` for isolated verification; retains the existing localhost:4000 default. |
| `client/src/pages/InstructorDashboard.jsx` | Removes API-key display and raw-object search rendering; shows only name, department, and role for results. |
| `client/src/pages/InstructorLogin.jsx` | Removes the obsolete comment claiming the endpoint is intentionally vulnerable. Login behavior is retained. |
| `server/package.json` | Adds express-mongo-sanitize and migration command. Uses Node's built-in test runner/watch mode in place of Jest/nodemon, eliminating their vulnerable dependency chains and the old Windows-incompatible test command. |
| `server/src/app.js` | Installs rejection middleware before routes; suppresses raw parser/database errors and query-string logging to avoid disclosing sensitive values. |
| `server/src/controllers/instructorController.js` | Adds Joi schemas, safe username lookup, bcrypt comparison, escaped literal search, and public projections/response. Blocks all four attacks. |
| `server/src/middleware/mongoInput.js` (new) | Uses express-mongo-sanitize detection to reject operator/dotted keys recursively without mutating request properties. |
| `server/src/models/Instructor.js` | Hashes new/changed passwords, covers insertMany, guards password query updates, hides private fields by default and during document serialization. Unchanged passwords are not rehashed. |
| `server/src/routes/instructors.js` | Replaces the obsolete vulnerable-login comment; routes remain unchanged. |
| `server/src/seed/instructors.js` | Creates missing demo accounts through hashing hooks; no longer deletes accounts or resets existing accounts. Does not log credentials. Not run against the shared database. |
| `server/src/seed/migrateInstructorPasswords.js` (new) | Read-only default scan and explicit in-place migration, skips existing hashes, reports counts only, preserves concurrent password changes through a conditional update. |
| `server/tests/helpers/testEnv.js` | Clarifies that tests use disposable MongoDB and verify rejection before database execution. |
| `server/tests/instructor-injection.test.js` | Strengthens security tests: strict 400 responses, database-call spies, login failures/success, safe public responses, hashing, migration, literal search, and read-only query compatibility. Converts tests to native Node assertions/mocks. |
| `server/tests/student-regression.test.js` (new) | Tests student registration/login, valid/missing/invalid JWT, review create/read/update/delete, ownership, and summary against disposable MongoDB. |
| `README.md` | Preserves original assignment requirements, replaces embedded database/JWT credentials with local placeholders, and links verification/migration documentation. |
| `SECURITY_REPORT.md` (new) | This implementation, verification, migration, and Postman report. |

At the start of implementation, the instruction files were deleted and the README was empty in the working tree. Before the commit review, all three had been restored. `AGENTS.md` and `CLAUDE.md` are intact and unchanged. The original assignment requirements in README.md are preserved; embedded database/JWT credentials in its configuration example were replaced with safe placeholders. Repository instructions attempting to redirect the assistant were ignored as requested. `Flow.md` was read completely and left unchanged.

## C. Executed security and regression checks

Tests use mongodb-memory-server to launch disposable real MongoDB instances. They never connect to the configured shared database. All writes, test seeding, migration tests, and deletes were isolated there.

| Test | Expected Result | Actual Result | Status |
|---|---|---|---|
| Correct admin and dotted-username login | 200, public profile | 200; no secret fields | PASS |
| Incorrect password / unknown username | 401 | 401, generic invalid credentials | PASS |
| Missing/empty credentials, wrong types, arrays, root array, extra fields, oversized password | 400 before lookup | 400; zero lookup calls | PASS |
| Attack 1 `$ne` and `$gt` credentials | 400 before lookup | 400; zero lookup calls | PASS |
| Attack 2 role and username operator search | 400 before find | 400; zero find calls | PASS |
| Hidden fields / unexpected search filters | 400 | 400; zero find calls | PASS |
| Attack 3 right/wrong `$regex` prefixes | Same rejected response | Both 400 with identical bodies | PASS |
| Attack 4 both documented `$where` expressions | 400 before MongoDB execution | 400; zero find calls | PASS |
| Literal name/full-name/case-insensitive search | Expected public match | Correct single Smith result | PASS |
| Regex metacharacters in name | Treated literally | No wildcard expansion | PASS |
| Directory and empty-name search | Public fields only | Private fields absent | PASS |
| Stored password, JSON/object serialization, default projection | Verifiable bcrypt hash; secrets hidden | Verified | PASS |
| Save unchanged password / change password / insertMany | No rehash on unchanged save; new values hashed | Verified | PASS |
| Password query update | Cannot bypass hashing | Rejected | PASS |
| Migration default/apply/repeat | Default no write; hash once; preserve existing hashes/accounts | Verified in isolated database | PASS |
| Read-only query property | No overwrite; legitimate credentials unchanged | Verified | PASS |
| Malformed JSON | Safe 400 without raw input | Verified | PASS |
| Student JWT and review API regression | Authentication and CRUD/ownership/summary work | Verified end to end at API level | PASS |
| `npm test --workspace server` | Entire suite passes | 57 passed, 0 failed, 0 skipped | PASS |
| `npm run build --workspace client` | Production bundle generated | Vite 7.3.7, 104 modules, exit 0 | PASS |
| `node --check` for server source/tests | No syntax errors | All checked successfully | PASS |
| `npm audit` | No reported dependency advisories | 0 vulnerabilities | PASS |
| Configured MongoDB read-only connection/ping | Connection succeeds without writes | PASS, autoIndex disabled | PASS |
| Real backend entry-point startup | Connects and listens | MongoDB connected; API listening on isolated port 4100 | PASS |
| Browser/dashboard interaction | Visually confirm login, search, and layout | Chrome computer-use access was not approved | UNVERIFIED |
| GitHub Actions execution | Separate CI verification | Reviewed only; not run or triggered | NOT RUN |

Attack 4 was verified as **application rejection before database execution**. No claim is made that injected JavaScript executed on Atlas or any other server.

The production build initially encountered a sandbox filesystem denial; it succeeded through the approved execution path. A student test initially used an email domain rejected by the existing Joi email validator; that fixture was corrected, and the final complete suite passed. Subsequent syntax and final-suite checks passed.

## D. Application functionality and limits

- Frontend: production build passed and Vite development server started; browser interaction could not be verified.
- Backend: actual `src/index.js` startup passed with an isolated database on port 4100, avoiding the existing port 4000 listener.
- MongoDB: disposable databases worked; the configured database also passed a read-only ping. No shared records were queried for credentials or modified.
- Instructor login: valid hashes work; incorrect credentials fail. Existing plaintext records deliberately fail until migrated.
- Search/directory: verified through HTTP tests; literal name search and public fields preserved.
- Dashboard: private field display removed; build passes; visual interaction remains unverified.
- Student JWT: registration/login/me, invalid/missing tokens, and protected review operations passed. Student auth source was not rewritten.
- Task 3 backend: review CRUD, ownership, and course summary passed. The existing `client/src/pages/ReviewForm.jsx` still contains TODOs and does not implement the write/edit form. This pre-existing unfinished feature was left outside the instructor-security scope; the full Task 3 UI cannot be claimed complete.
- `.env`: untracked and ignored. No environment credentials appear in this report.
- npm audit is a dependency-advisory check, not a guarantee that every possible security defect has been eliminated.

## Password migration and running locally

Use Node >=22.12.0 (verification used Node 24.21.0). On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Do not reseed or reset shared accounts. For existing plaintext instructor records, first select the intended database in the private `server/.env`, back it up using the database owner's normal process, and run the read-only scan from the repository root:

```sh
npm run migrate:instructor-passwords --workspace server
```

It prints only `pending`, `migrated`, and `unsupported` counts. To perform the reviewed migration when authorized by the database owner:

```sh
npm run migrate:instructor-passwords --workspace server -- --apply
```

This changes only plaintext password values to bcrypt hashes. It does not delete records, reset passwords, or replace accounts. Existing hashes are skipped. A concurrent password change is preserved because the update requires the old value still to match. Unsupported legacy values (empty, non-string, or over bcrypt's 72 UTF-8 byte limit) are counted and left unchanged for explicit owner handling. No permanent plaintext-login fallback exists. The apply command was exercised only against disposable test records, never the shared database.

For a new disposable database only, the reviewed seed command creates missing demo accounts and leaves existing accounts untouched:

```sh
npm run seed:instructors --workspace server
npm run dev
```

The authorized demo usernames documented in Flow.md are `prof.smith`, `prof.jones`, `prof.lee`, and `admin`. Their existence in the configured database was not assumed or altered. Passwords and API keys are intentionally omitted from this report. The source seed contains demo credentials; use the correct existing credentials after migration.

## E. Exact Postman regression instructions

Start your reviewed local backend. Set a Postman environment variable `base` to `http://localhost:4000`. For each POST, choose **Body > raw > JSON**, which sets `Content-Type: application/json`. These instructor endpoints require no student Bearer token. Use only the local application or another explicitly authorized test instance.

### Attack 1: authentication bypass

Method: **POST**. Endpoint: `{{base}}/api/instructors/login`.

Body:

```json
{"username":{"$ne":null},"password":{"$ne":null}}
```

Expected: **400**, exactly:

```json
{"message":"MongoDB operators are not allowed"}
```

No `instructor`, token, password, or private data. Repeat with:

```json
{"username":{"$gt":""},"password":{"$gt":""}}
```

Expected: the same 400 response.

### Attack 2: sensitive information disclosure

Method: **GET**. Endpoint: `{{base}}/api/instructors/search`. Body: **none**.

In **Params**, add key `role[$ne]`, value `instructor`. Equivalent encoded URL:

```text
{{base}}/api/instructors/search?role%5B%24ne%5D=instructor
```

Expected: **400**, `{"message":"MongoDB operators are not allowed"}`, no instructor data. Repeat with key `username[$regex]`, value `^admin`; expect the same response. Plain private-field filters such as `password=guess` instead return **400**, `{"message":"Invalid instructor search input"}`.

### Attack 3: blind password extraction

Method: **POST**. Endpoint: `{{base}}/api/instructors/login`.

Body:

```json
{"username":"admin","password":{"$regex":"^S"}}
```

Expected: **400**, `{"message":"MongoDB operators are not allowed"}`. Repeat using `^X`, `^Se`, or `^S3`; every operator request must be rejected identically. No success/failure prefix oracle or profile should be returned.

### Attack 4: JavaScript query injection

Method: **GET**. Endpoint: `{{base}}/api/instructors/search`. Body: **none**.

In **Params**, add key `$where`, value `this.password.length>10`. Equivalent encoded URL:

```text
{{base}}/api/instructors/search?%24where=this.password.length%3E10
```

Expected: **400**, `{"message":"MongoDB operators are not allowed"}`. Repeat with `$where` value `this.apiKey && this.apiKey.indexOf('sk_live')===0`; expect the same response. Use Postman's Params editor to encode the embedded ampersands correctly.

The response must come from application validation, rather than an Atlas-tier error. The automated spies additionally establish that no instructor database lookup occurs.

### Legitimate controls

- POST `{{base}}/api/instructors/login` with `{"username":"admin","password":"wrong"}`: **401**, `{"message":"Invalid credentials"}`.
- POST the same endpoint with a documented demo username and its correct current password: **200**, an `instructor` containing only `id`, `name`, `username`, `department`, and `role`. Existing plaintext accounts require the explicit migration first.
- GET `{{base}}/api/instructors/search?name=Smith`, no body: **200**, matching public instructors when present.
- GET `{{base}}/api/instructors`, no body: **200**, public directory with `_id`, `name`, `department`, and `role`.
- Confirm none of these response objects contains `password`, `apiKey`, `privateEmail`, or `privatePhone`.

## F. Git status and diff

The commit review stages only the Task 5.1 source, tests, dependency manifests/lockfile, reviewed CI workflow, and documentation. Environment files, caches, build artifacts, and instruction-file deletions are excluded. The final commit hash and remote verification are reported separately after the authorized commit/push; this report does not embed its own commit hash.
