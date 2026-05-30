# CLAUDE.md — BebeBills 3

Expense-sharing app for two partners. One page. Plain black and white. Simple.

---

## What It Does

Two partners share expenses. Each expense was paid by one partner, but the cost is split between both (50/50 or a custom percentage). The app tracks who paid what, calculates the running balance (who owes whom and how much), and lets them record settlements when one pays the other back.

Expenses can have one level of sub-items (e.g. "Home" → Rent, Water, Electricity). Each sub-item has its own payer and split. The parent item shows the total and the net balance contribution aggregated from all its children.

---

## What's NOT in BB3

- No recurring expenses
- No coverage periods
- No charts, no yearly/monthly summary pages
- No colors per expense, no emoji picker
- No receipt photos
- No Tailwind, no design system
- No JSON backup — CSV only

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database (local dev):** Node 24 built-in SQLite (`node:sqlite`, no install needed)
- **Database (production):** Neon serverless PostgreSQL via `DATABASE_URL` env var
- **Frontend:** React + Vite
- **Styling:** Plain CSS — black text, white background, borders only. No Tailwind.
- **Data fetching:** TanStack Query (`@tanstack/react-query`)
- **Hosting:** Vercel, auto-deploy from GitHub `main`

---

## File Structure

```
bebebills3/
├── server/
│   ├── index.js           # Local dev entry point; runs initDb() on startup
│   ├── app.js             # Express config, CORS, X-User-Id middleware, route mounts
│   ├── db.js              # Dual-mode: SQLite (local) or PostgreSQL (prod)
│   └── routes/
│       ├── auth.js
│       ├── expenses.js    # Expenses + sub-items + balance
│       ├── settings.js    # Partner names
│       ├── settlements.js
│       └── backup.js      # Export/import as CSV
├── client/
│   ├── src/
│   │   ├── App.jsx            # Auth gate + session logic
│   │   ├── Shell.jsx          # Header + footer + page slot
│   │   ├── index.css          # Plain CSS
│   │   ├── api.js             # Fetch wrapper with X-User-Id header
│   │   ├── pages/
│   │   │   └── ExpensesPage.jsx   # The only page
│   │   └── hooks/
│   │       ├── useExpenses.js
│   │       ├── useBalance.js
│   │       └── useSettlements.js
│   └── package.json
├── package.json           # Root scripts (dev, install:all)
└── vercel.json
```

---

## Database — Think of It as Excel Sheets

The database is three tables. Each table is like an Excel sheet: rows are records, columns are fields. You can add a column at any time with one line of code — it's safe to run on an existing database and all existing rows just get a null value for the new column.

**Adding a column:**
```js
try { db.exec('ALTER TABLE expenses ADD COLUMN category TEXT') } catch {}
```
Always wrap in try/catch — safe to re-run on every startup.

### Table: `users`
One row per couple account.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `username` | TEXT UNIQUE | Login name |
| `password` | TEXT | Plaintext |
| `partner_a` | TEXT | Name of Partner A |
| `partner_b` | TEXT | Name of Partner B |

### Table: `expenses`
One row per item or sub-item. Parent/child relationship is stored in the same table via `parent_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `user_id` | INTEGER FK → users.id | Scopes all data per couple |
| `parent_id` | INTEGER FK → expenses.id | NULL = top-level. Non-null = sub-item of that row. Max 1 level deep. |
| `description` | TEXT | Item name |
| `paid_by` | TEXT | Partner name who paid |
| `amount` | REAL | Required if leaf item. NULL if parent (computed from children). |
| `split_type` | TEXT | `'50/50'` or `'custom'`. Ignored if parent. |
| `split_pct_payer` | REAL | Payer's % share (0–100). Ignored if parent. Default 50. |
| `date` | TEXT | YYYY-MM-DD. Required if leaf item. |
| `created_at` | TEXT | ISO timestamp |

**Parent vs leaf rule:**
- A row is a **parent** if any other row has `parent_id = this row's id`.
- A row is a **leaf** if no other row points to it as parent.
- A standalone top-level item with no sub-items is also a leaf — it has `parent_id = NULL` and stores its own amount/split/date.
- `amount`, `split_type`, `split_pct_payer`, and `date` are only meaningful on leaf rows. On parent rows they are NULL and ignored.
- **Never allow 2 levels of nesting.** Enforce on both client and server: reject any INSERT where the given `parent_id` itself has a non-null `parent_id`.

### Table: `settlements`
One row per payment between partners.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users.id | |
| `from_name` | TEXT | Who paid |
| `to_name` | TEXT | Who received |
| `amount` | REAL | |
| `note` | TEXT | Optional |
| `date` | TEXT | YYYY-MM-DD |
| `created_at` | TEXT | |

---

## How the CSV Export Works

In Settings → Export Data, the user downloads **two CSV files zipped together** (or two separate downloads):

**expenses.csv** — raw rows from the `expenses` table:
```
id,parent_id,description,paid_by,amount,split_type,split_pct_payer,date
1,,Home,,,,, 
2,1,Rent,Noa,200,50/50,50,2026-06-01
3,1,Water,Bar,60,50/50,50,2026-06-01
4,,Groceries,Noa,85,custom,60,2026-06-05
```

**settlements.csv:**
```
id,from_name,to_name,amount,note,date
1,Noa,Bar,50,,2026-06-10
```

This is the exact database table — what you see in the CSV is what is stored. Import replaces all existing data with the CSV contents.

---

## Balance Calculation

Balance is calculated from **leaf rows only** (rows with no children). Parent rows are never directly included.

For each leaf expense:
```
other_share = amount * (1 - split_pct_payer / 100)

if paid_by == partner_a → partner_b owes += other_share
if paid_by == partner_b → partner_a owes += other_share
```

Net = partner_b_total_owes - partner_a_total_owes, then subtract all settlements.

Server returns: `{ owes_name, owes_to, amount, settled: bool }`

### Per-Row Display Values

Every row in the list (parent or leaf) shows two calculated fields:

**1. Total amount:**
- Leaf row: its own `amount`
- Parent row: sum of all children's `amount`

**2. Balance contribution** ("A owes B $X for this item"):
- Leaf row: `other_share` = `amount * (1 - split_pct_payer / 100)`, with direction based on `paid_by`
- Parent row: sum of all children's balance contributions, net direction

**Example:**
```
Item A (parent)            → Total: $210   Noa owes Bar $10
  subitem a  Noa paid $100 → Total: $100   Bar owes Noa $50
  subitem b  Bar paid $110 → Total: $110   Noa owes Bar $60

Net on Item A: Bar owes Noa $50, Noa owes Bar $60 → Noa owes Bar $10 ✓
```

---

## API Routes

### `/api/settings`
| Method | Auth | Notes |
|---|---|---|
| GET | Optional | `{ is_auth_setup, is_setup, partner_a, partner_b }` |
| POST | X-User-Id | Update `partner_a`, `partner_b` |

`is_auth_setup` = at least one user exists (used by landing page to show Sign Up vs Log In).
`is_setup` = both partner names are non-empty.

### `/api/expenses`
| Route | Method | Notes |
|---|---|---|
| `/api/expenses` | GET | Returns top-level rows only, each with `items: []` array of their sub-items |
| `/api/expenses` | POST | Create item or sub-item. Body includes `parent_id` (null or id). Server rejects if `parent_id` row itself has a parent. |
| `/api/expenses/:id` | PUT | Update a row. If it's a parent, only `description` is editable; amount/split/date are ignored. |
| `/api/expenses/:id` | DELETE | Deletes row. If top-level, cascades to delete its sub-items. |
| `/api/balance` | GET | `{ owes_name, owes_to, amount, settled }` |

### `/api/settlements`
| Route | Method | Notes |
|---|---|---|
| `/api/settlements` | GET | All settlements for user |
| `/api/settlements` | POST | `{ from_name, to_name, amount, note?, date }` |
| `/api/settlements/:id` | DELETE | |

### `/api/backup`
| Route | Method | Notes |
|---|---|---|
| `/api/backup/export` | GET | Returns zip with expenses.csv + settlements.csv |
| `/api/backup/import` | POST | Accepts the same zip/CSVs, replaces all user data |

---

## Authentication

No server sessions. Client stores `{ user_id, username }` in `sessionStorage['bebebills_session']`.

Every API request sends `X-User-Id: <id>` header. Server middleware in `app.js` extracts it into `req.userId`. **All DB queries must filter by `req.userId`.**

### Auth Endpoints (`/api/auth/`)
| Route | Method | Body | Response |
|---|---|---|---|
| `/api/auth/signup` | POST | `{ username, password, partner_a, partner_b }` | `{ ok, user_id, username, partner_a, partner_b }` |
| `/api/auth/login` | POST | `{ username, password }` | same |
| `/api/auth/change-password` | POST | `{ current_password, new_password, new_username? }` | `{ ok }` |

- Signup: 409 if username taken
- Login: 401 on wrong credentials

---

## App Entry Logic (`App.jsx`)

On load, call `GET /api/settings`. Then:

1. `is_auth_setup = false` → show **Sign Up** form (Log In dimmed)
2. `is_auth_setup = true`, no session → show **Log In** form (Sign Up dimmed)
3. Session exists → show **Shell**
4. In Shell: if `is_setup = false` → open Settings modal automatically so partners can enter their names

---

## UI Layout

```
┌──────────────────────────────────────────────────────┐
│  BebeBills3                            Hi, Noa        │  ← header, 1px bottom border
├──────────────────────────────────────────────────────┤
│                                                      │
│   EXPENSES LIST                                      │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Noa owes Bar $10.00                    [Settings]   │  ← footer, 1px top border
└──────────────────────────────────────────────────────┘
```

- **Header:** left = "BebeBills3" (bold), right = "Hi, [logged-in partner name]"
- **Footer:** left = live balance summary from `GET /api/balance` ("Noa owes Bar $10.00" or "All settled ✓"), right = "Settings" button
- **Background:** white. **Text:** black. **Borders:** 1px solid black for header/footer lines, table/list rows, inputs.
- **No colors. No shadows. No rounded corners. No gradients.**
- **Font:** system-ui, consistent size throughout.

---

## Expenses Page

### List Structure

```
Description       Paid by    Amount    Owes      Date        [edit] [delete]
────────────────────────────────────────────────────────────────────────────
▶ Home            (mixed)    $260.00   N→B $10   —           ✏  🗑
▼ Trip TLV        (mixed)    $180.00   N→B $40   —           ✏  🗑
    Restaurant    Noa        $120.00   B→N $60   Jun 3       ✏  🗑
    Grocery       Bar        $60.00    N→B $30   Jun 3       ✏  🗑
    [+ sub-item]
  Groceries       Noa        $85.00    B→N $43   Jun 5       ✏  🗑
────────────────────────────────────────────────────────────────────────────
[+ Add expense]
```

**Columns:** Description · Paid by · Amount · Owes (balance contribution) · Date · Edit · Delete

- Parent rows: "Paid by" = "(mixed)" if children have different payers, otherwise the single payer name. Date = blank.
- Sub-item rows are indented (left padding or left border line).
- ▶ = row is collapsed. ▼ = expanded. Click to toggle.
- Standalone leaf rows (no sub-items, no parent) show ▶ to allow expanding and adding sub-items.

### Edit behavior
- Editing a **leaf row**: all fields editable (description, paid_by, amount, split, date).
- Editing a **parent row**: only `description` is editable. Amount/split/date fields are hidden (they're computed).

---

## Monday.com-Style Sub-Item Interaction

1. **"+ Add expense"** at the bottom of the full list → creates a **top-level item**. Opens the expense form with `parent_id = null`.

2. **Click ▶ on any top-level row** → expands to show sub-items (indented). At the bottom of the sub-items a **"+ sub-item"** button appears. Clicking it opens the expense form with `parent_id = this row's id`.

3. Sub-items show no expand arrow — they are always leaves. No "+" on sub-item rows.

4. A top-level row with no sub-items still shows ▶ (so you can expand and add the first sub-item). Once it has sub-items, its own amount/split become irrelevant.

5. **Important:** once a top-level item gains sub-items, its own `amount`/`split` fields become null/ignored. If a user tries to add a sub-item to a row that already has its own amount stored, the server should null out the parent's amount/split on that operation (or the client should warn the user that the item will become a container).

---

## The Expense Form

One form used for both top-level items and sub-items. The only difference is whether `parent_id` is set.

**Fields:**
1. Description (text input)
2. Paid by (toggle button: [Partner A] [Partner B])
3. Amount (number input, min 0.01, step 0.01)
4. Split: [50/50] [Custom %]
   - Custom: one number input "Payer pays X%"
5. Date (date input, default today)

**When the form is for a parent row (edit only):**
- Show only Description field. All other fields are hidden with a note: "Amount and split are calculated from sub-items."

---

## Settings Modal

Opens from footer "Settings" button. Plain white box, black border.

1. **Partners:** text input for Partner A name + Partner B name. Save button.
2. **Data:** "Export CSV" (downloads zip of expenses.csv + settlements.csv) · "Import CSV" (file picker, replaces all data after confirmation prompt).
3. **Account:** username field + current password + new password + confirm. Save button.
4. **Log Out** button.

---

## `api.js`

```js
const BASE = '/api';

function getSession() {
  try { return JSON.parse(sessionStorage.getItem('bebebills_session')); } catch { return null; }
}

async function request(method, path, body) {
  const session = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.user_id) headers['X-User-Id'] = session.user_id;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  get:    (path)        => request('GET', path),
  post:   (path, body)  => request('POST', path, body),
  put:    (path, body)  => request('PUT', path, body),
  delete: (path)        => request('DELETE', path),
};
```

---

## Hooks

```js
// useExpenses.js
export function useExpenses() {
  return useQuery({ queryKey: ['expenses'], queryFn: () => api.get('/expenses') });
}
export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/expenses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    }
  });
}
// same pattern for useUpdateExpense, useDeleteExpense

// useBalance.js
export function useBalance() {
  return useQuery({
    queryKey: ['balance'],
    queryFn: () => api.get('/balance'),
    refetchInterval: 30000
  });
}

// useSettlements.js — same pattern, invalidates ['settlements'] and ['balance']
```

---

## DB Setup Pattern (`db.js`)

- If `process.env.DATABASE_URL` is set → use `pg` (PostgreSQL for Vercel/Neon)
- Otherwise → use `node:sqlite` (Node 24 built-in, zero install)
- SQLite wrapper must translate `$1`/`$2` placeholders → `?` and handle `RETURNING *` manually
- Run all `ALTER TABLE` migrations in `initDb()`, each wrapped in `try {} catch {}`

---

## Vercel Deployment

`vercel.json`:
```json
{
  "buildCommand": "npm install --prefix server && npm install --prefix client && npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- `server/api/index.js` exports the Express `app` as a serverless handler
- Set `DATABASE_URL` in Vercel → Project Settings → Environment Variables (copy from Neon dashboard)

---

## Conventions

1. **Adding a DB column:** `try { db.exec('ALTER TABLE t ADD COLUMN col TEXT') } catch {}` in `initDb()`
2. **All queries scoped by user:** always `WHERE user_id = $1`. Never return data without ownership check.
3. **Parent vs leaf:** check by querying whether any row has `parent_id = this id`. Never store computed values on parent rows.
4. **1-level max:** on INSERT, if `parent_id` is provided, verify that row's own `parent_id` is null. Reject with 400 if not.
5. **Cascade delete:** `parent_id` FK uses `ON DELETE CASCADE` — deleting a parent removes all its children.
6. **Balance uses leaves only:** never include a parent row directly in balance math.
7. **CSV export = raw table rows:** what's in the file is exactly what's in the database. No transformation.
