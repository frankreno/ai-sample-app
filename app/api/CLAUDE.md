# API Routes — Conventions

All routes live under `app/api/` using the Next.js 16 App Router file convention.

## Response Helpers

Always use `ok()` and `err()` from `@/lib/api` — never construct `NextResponse.json()` directly.

```typescript
import { ok, err } from "@/lib/api";

return ok(data);          // { success: true, data, error: null } — 200
return ok(data, 201);     // same shape — 201
return err("msg");        // { success: false, data: null, error: "msg" } — 400
return err("msg", 404);   // same shape — 404
```

## Route Handler Signatures

Next.js 16 passes `params` as a Promise. Always await it:

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

For routes without dynamic segments, only `req: NextRequest` is needed.

## Database Access

Import the singleton: `import { db } from "@/lib/db";`

Always use parameterized queries:

```typescript
db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(id);         // single row
db.prepare("SELECT * FROM deficiencies WHERE project_id = ?").all(pid); // multiple rows
db.prepare("INSERT INTO deficiencies (...) VALUES (...)").run(...vals);  // write
```

## Enum Validation

Import enum arrays from `@/lib/api` and validate with `.includes()`:

```typescript
import { CATEGORIES, SEVERITIES, STATUSES } from "@/lib/api";

if (!SEVERITIES.includes(severity as never))
  return err(`severity must be one of: ${SEVERITIES.join(", ")}`);
```

## Mutation Pattern

After INSERT or UPDATE, re-SELECT and return the full row:

```typescript
db.prepare("UPDATE deficiencies SET ...").run(...values);
const updated = db.prepare("SELECT * FROM deficiencies WHERE id = ?").get(id);
return ok(updated);
```

## Pagination

List endpoints accept `page` (default 1) and `limit` (default 50, max 200):

```typescript
const page = parseInt(searchParams.get("page") ?? "1", 10);
const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
const offset = (page - 1) * limit;
```

Return shape: `{ items: [...], total: number, page, limit }`.
