# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A task manager split into two independent npm projects, and there is no root package.json:
- `server/`: Express 5 REST API (CommonJS), MongoDB via Mongoose, JWT auth.
- `client/`: React 19 + Vite SPA (ES modules), react-router-dom.

## Commands

Run each project from its own directory.

```sh
# server (port 5000 by default)
cd server && npm install && npm run dev     # node --watch index.js
cd server && npm run seed -- <email> <password> [name]   # create (or promote) an admin

# client (Vite dev server)
cd client && npm install && npm run dev
cd client && npm run build                  # production build
cd client && npm run lint                   # ESLint (flat config, eslint.config.js)
```

Neither project has a test suite or test runner yet. `mongodb-memory-server` is a server dev dependency for running a throwaway MongoDB in tests.

Database: MongoDB (standalone, no replica set, so no transactions). `server/index.js` calls `connectDB()` from `db.js` and only listens once it is connected. The config comes from `server/.env` (`PORT`, `MONGO_URI`, `JWT_SECRET`; the `DB_*` lines are left for the MySQL `main` branch), and `server/.env` is committed to git. `server/database.sql` is the old MySQL schema, kept for reference only.

Models live in `server/models/`. `User`: name, email (unique, case-insensitive collation), password_hash, role (1 = admin, 2 = user). `Task`: title, description, status, priority, deadline (a `"YYYY-MM-DD"` string, not a Date), created_by / assigned_to (User refs). Timestamps are stored as `created_at` / `updated_at`. Registration always creates role 2, so the first admin comes from `npm run seed`.

## Server architecture

- `index.js` mounts the route groups: `/api/auth`, `/api/users`, `/api/tasks`. Each `routes/*.js` file maps endpoints to functions in the matching `controllers/*.js` file. Controllers use the Mongoose models.
- API responses never expose `_id`: controllers map documents to plain objects with `id` (a string), and tasks keep `assigned_to` / `created_by` as id strings plus `assigned_name` / `created_name`. Invalid ids in a URL return the same 404 as a missing record (`utils.js` `isId`).
- The last-admin rule (never zero admins) uses check-after-write in `userController.js` `demoteAdmin()`: remove the admin role, count admins, and undo if none are left. Keep this pattern; there are no transactions.
- `index-bk.js` is the old MySQL single-file API, kept for reference only. It no longer runs; edit the routes/controllers files instead.
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
  - Query params: `offset`, `length` (max 100), `keyword` (case-insensitive "contains" search across several fields; always build the regex with `utils.js` `containsRegex`, which escapes it), `order_by` (a key from a `sortColumns` whitelist; never sort by raw input), and `order` (`ASC`/`DESC`).
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
