# Backend Coding Rules

## Express 5 + TypeScript Patterns

### Route File Template
Every route file MUST follow this exact structure:
```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import * as controller from '../controllers/[entity].controller.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Define routes
router.get('/', requireRole('teacher', 'superuser'), controller.getAll);
router.post('/', requireRole('teacher'), controller.create);

export default router;
```

### Controller Pattern
```typescript
import type { Request, Response } from 'express';
import pool from '../config/db.js';
import { z } from 'zod';

// Define Zod schema at the top of each controller
const createSchema = z.object({
  field: z.string().min(1),
});

export const create = async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  // ... use pool.execute() with parameterized queries
};
```

### SQL Safety Rules
- ALWAYS use `pool.execute('SELECT * FROM USERS WHERE id = ?', [id])` — never string concatenation.
- ALWAYS destructure as `const [rows] = await pool.execute(...)` — the result is `[rows, fields]`.
- Cast rows to the correct type: `const [rows] = await pool.execute(...) as [StudentRow[], FieldPacket[]]`.
- For INSERT: `const [result] = await pool.execute(...) as [ResultSetHeader, FieldPacket[]]`.

### Module Import Extensions
Because `tsconfig.json` uses `"module": "NodeNext"`, ALL local imports MUST include `.js` extension:
```typescript
// ✅ CORRECT
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

// ❌ WRONG — will fail at runtime
import pool from '../config/db';
import { authenticate } from '../middleware/auth';
```

### Error Handling
- Wrap all async controller functions in try/catch.
- Return consistent error shapes: `{ error: string }` for simple errors, `{ error: object }` for validation errors.
- Use HTTP status codes correctly: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Internal Server Error).

### JWT & Auth
- `authenticate` middleware extracts token from `Authorization: Bearer <token>` header.
- It attaches `req.user = { id: number, email: string, role: 'teacher' | 'superuser' | 'admin' }`.
- `requireRole(...roles)` is a factory that returns middleware checking `req.user.role`.
- Token payload: `{ id, email, role }`, signed with `process.env.JWT_SECRET`, expires in `process.env.JWT_EXPIRES_IN` (default: '24h').

### Environment Variables (backend `.env`)
```
PORT=3000
DB_HOST=<aiven-host>
DB_PORT=<aiven-port>
DB_USER=<aiven-user>
DB_PASSWORD=<aiven-password>
DB_NAME=<aiven-db-name>
JWT_SECRET=<random-secret>
JWT_EXPIRES_IN=24h
```
