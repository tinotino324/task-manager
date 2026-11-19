# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A task manager split into two independent npm projects, and there is no root package.json:
- `server/`: Express 5 REST API (CommonJS), MySQL via `mysql2/promise`, JWT auth.
- `client/`: React 19 + Vite SPA (ES modules), react-router-dom.

## Commands

Run each project from its own directory.

```sh
# server (port 5000 by default)
cd server && npm install && npm run dev     # node --watch index.js

# client (Vite dev server)
cd client && npm install && npm run dev
cd client && npm run build                  # production build
cd client && npm run lint                   # ESLint (flat config, eslint.config.js)
```

Neither project has a test suite or test runner yet.

Database: `server/database.sql` creates the `task_manager` DB with `users` and `tasks` tables. The config comes from `server/.env` (`PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`), and `server/.env` is committed to git.

**Schema drift:** the code reads and writes a `users.role` column (INT, 1 = admin, 2 = user), but `database.sql` does not define it. Add it (`ALTER TABLE users ADD role INT NOT NULL DEFAULT 2`) when setting up a fresh DB. Registration always creates role 2, so admins must be promoted directly in the DB.

## Server architecture

- `index.js` mounts the route groups: `/api/auth`, `/api/users`, `/api/tasks`. Each `routes/*.js` file maps endpoints to functions in the matching `controllers/*.js` file. Controllers query `db.js` (a shared pool) with parameterized SQL.
- `index-bk.js` is an older single-file version of the whole API. It is not used; edit the routes/controllers files instead.
- `middleware/auth.js`:
  - `auth` verifies the `Authorization: Bearer <jwt>` header and sets `req.user = { id, name, role }`.
  - `adminOnly` rejects anyone who isn't `ROLE_ADMIN`.
  - The file also exports the `ROLE_ADMIN` / `ROLE_USER` constants.
- Role rules are enforced inside the task controllers as well as by middleware:
  - Non-admins only see and count tasks where they are `assigned_to` or `created_by`.
  - Non-admin creates are always self-assigned.
  - Non-admin updates can only change `status`.
  - Only admins can delete tasks.
- Paginated list endpoints (`GET /api/tasks`, `GET /api/users`) share one contract:
  - Query params: `offset`, `length` (max 100), `keyword` (LIKE search across several columns), `order_by` (a key from a `sortColumns` whitelist; never interpolate raw input into ORDER BY), and `order` (`ASC`/`DESC`).
  - Response: `{ status, total_counts, listing_counts, tasks, offset, length, order }`. The rows key is `tasks` even for the users endpoint.

## Client architecture

- `main.jsx` renders `Root.jsx`, which holds the logged-in user (from `localStorage.user`).
  - With no user, it shows `Login`.
  - With a user, it routes `/` to `App.jsx` (task dashboard) and `/users` to `Users.jsx` (admin user list).
- API base URLs are hardcoded to `http://localhost:5000/api/...` in each component. There is no Vite proxy and no env variable for them.
- `api.js` `apiFetch` wraps `fetch`: it attaches the JWT from `localStorage.token`, and on a 401 it clears storage and reloads, which returns the user to the login page. Use it for every authenticated call. `Login.jsx` uses plain `fetch`.
- `DataTable.jsx` is the reusable server-side table:
  - Props: `columns`, `url`, `dataKey`, `reloadKey`.
  - It builds the paginated-list query params above, debounces requests by 300 ms, and steps back a page if the current page becomes empty.
  - To refresh it after a mutation, bump `reloadKey`.
  - Any new list endpoint must follow the same request/response contract.
