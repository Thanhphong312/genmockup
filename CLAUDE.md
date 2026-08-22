# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Web app that composites a design image onto pre-configured mockup photos. Three product types (`Generation.productType`):

- **card** (`/api/generate`) — one design → N standalone `Mockup` images, each with a saved design "area" (position/size/rotation).
- **shirt** (`/api/generate/shirt`) — one design → N `ShirtVariant` images (color variants inside a `ShirtSet`), where the area is stored per *set* and shared by all its colors.
- **skin** (`/api/generate/skin`) — one design → exactly one image per selected `SkinScene`; perspective-warped under a cut-out mockup. No watermark, no per-mockup count.

All three run **synchronously** (a few dozen images per call) and share `parseGenerateRequest`; poll/inspect results via `GET /api/generations/:id`. A separate feature, **New Idea**, calls OpenAI to analyze a reference image and generate new design artwork (this one runs **async** with polling). Output PNGs keep the original mockup dimensions and are served from local storage.

Project docs are in Vietnamese: `DESIGN.md` (system design + rationale — written before shirt sets/skin/ideas, so treat as historical for those), `flow.md` (original requirements), `CARDSKIN_RESEARCH.md` (why the card-skin pipeline is shaped the way it is). Deploy: the live stack today is Windows + SQLite + Cloudflare Tunnel on `genmockup.primehorizon.studio` (`TUNNEL_SETUP.md`, `DRIVE_SETUP.md`, `scripts/windows/README.md`); `DEPLOY_NGINX.md` is the in-progress move to Ubuntu + Nginx + **MySQL** on `mockup.primehorizon.studio`.

## Monorepo layout

pnpm workspace (`pnpm-workspace.yaml`). Requires Node ≥ 20, pnpm 11.

- `apps/api` — Fastify 5 backend (`name: api`). TypeScript ESM (`"type": "module"`), run via `tsx`.
- `apps/web` — React 18 + Vite frontend (`name: web`).
- `packages/shared` — `@genmockup/shared`: shared TS interfaces + `DESIGN_RATIO = 5/7`. Consumed by both apps directly from source (`main`/`types` → `src/index.ts`, no build step).
- `PrimeHorizonMockup/` — MV3 Chrome extension (plain JS, no build). Saves ChatGPT images into the idea library and drives generate from the browser. It is a **client of the same API** — if you change auth, `/api/ideas/import`, `/api/generate*`, or the shirt-set endpoints, check `background.js` / `generate.js` too.
- `mockup/` — source images for import only (not served): `mockup/*.png` for the card seed script, `mockup/shirt/<set>/<color>.png` for the shirt-set scan.

## Commands

Run from repo root:

```bash
pnpm dev              # api + web in parallel (api: tsx watch :3000, web: vite :5173)
pnpm dev:api          # api only
pnpm dev:web          # web only
pnpm build            # build all (web: tsc -b && vite build; api: tsc → dist)
pnpm build:api
pnpm build:web

pnpm prisma:generate  # regenerate Prisma client (run after editing schema.prisma)
pnpm prisma:migrate   # create + apply a dev migration (needs CREATE DATABASE for the shadow DB)
pnpm prisma:deploy    # apply committed migrations — this is what production runs
pnpm prisma:studio    # browse the DB
pnpm seed             # import mockup/*.png as card Mockups (apps/api/scripts/seed.ts)
pnpm migrate:sqlite-to-mysql   # one-off SQLite → MySQL data copy (apps/api/scripts/)
```

`apps/api` also has `pnpm --filter api serve` (run without watch) and `start` (run built `dist/server.js`). `apps/web` has `build:watch` (`vite build --watch`) — useful when running the production-style single-origin setup while editing the frontend. `apps/api/scripts/migrate-from-mysql.ts` is a one-off legacy importer, not part of any flow.

There is **no test suite or linter** configured — only Prettier (`.prettierrc`). Don't invent test/lint commands.

### Windows / production-style run

`scripts/windows/{start,stop,status}.bat` run the **built** stack in the background: they build `apps/web/dist` if missing, start the API with `pnpm --filter api serve`, launch the `genmockup` Cloudflared tunnel, and write PIDs/logs to `logs/`. (`scripts/windows/README.md` documents them; its first-run bootstrap advice to avoid `migrate` is obsolete — the MySQL migration set is complete, see below.) When `apps/web/dist` exists, the API serves the SPA at `/` and falls back to `index.html` for non-`/api`, `/files`, `/health` routes (see `server.ts`) — so in production there is one origin, not two. In dev there are two, bridged by the Vite proxy (`/api` + `/files` → :3000), which is why the web axios client uses a relative `baseURL: '/api'`.

## Architecture & key invariants

### Compositing (`apps/api/src/services/composer.ts`)
The core image pipeline: layers stacked onto a transparent canvas sized to the mockup. Two modes, selected by `ComposeInput` flags — **do not unify them**:

- **card** (default, `designOnTop: false`, `preserveDesignRatio: false`): design → mockup → watermark. Because the mockup is drawn *over* the design, the design only shows through where the mockup PNG has **transparent alpha**; an opaque mockup hides it entirely. The design is stretched to exactly `area.width × area.height`.
- **shirt** (`designOnTop: true`, `preserveDesignRatio: true`): mockup → design → watermark, because shirt photos are opaque. The design keeps its source aspect ratio (height = `area.height`, width derived) and is re-centered on the area, so a non-5:7 design isn't distorted.

Rotation expands the layer bounds, so `placedLayer` re-centers using each layer's post-rotation metadata (`left`/`top` adjusted by half the size delta) — preserve this when touching placement math. It also **crops** any layer bigger than the mockup down to the visible window: sharp accepts negative offsets and right/bottom overflow but hard-rejects an overlay wider or taller than the base (`Image to composite must have same dimensions or smaller`). Two real paths hit that — `preserveDesignRatio` deriving `width = height × srcRatio` for a wide design, and `rotate()` inflating the bounding box. Crop rather than rescale: the editors clip the design at the mockup edge, so rescaling would make output disagree with the preview.

**Card skin uses a separate pipeline** (`services/skin.ts`) that does not go through `composer.ts` at all — see below.

### Card skin (`services/perspective.ts`, `holeDetect.ts`, `skin.ts`)
Third product type. The mockup PNG has the card face **cut out to transparent**; the design is composited *underneath* it. Everything hard — fingers occluding the card, rounded corners, the chip, edge anti-aliasing — comes free because those pixels stay in the mockup PNG. There is no mask or overlay layer to author.

The paste area is **not** an `Area`: it's 4 real corners (TL,TR,BR,BL) + 4 quadratic-Bézier control points, one per edge, stored as JSON on `SkinScene`. That describes true perspective (a trapezoid, not a rotated rectangle) plus gentle curvature. Rendering builds a 48×32 Coons-patch grid and warps each cell with its own homography.

`detectHole()` recovers all of that from the transparent region automatically, so onboarding a scene is just an upload. Three things in it are load-bearing:
- It fits edge lines on the **convex hull**, not the raw contour. Fingers cut deep notches into the hole; fitting the raw contour locks onto the finger outline (measured 85px off). The hull bridges notches with a chord that lies on the true card edge.
- It drops 14% at each end of every edge before fitting, because rounded corners would drag the fit inward. Corners come from intersecting adjacent fitted lines, which extrapolates through the rounding.
- It rejects design files: their chip cutout is also transparent and passes any area test, so the check is "all 4 image corners transparent → this is a design, not a mockup".

Two traps that will silently ruin output if the design-loading path is rewritten (both are commented in `skin.ts`):
1. Bilinear minification during warp produces moiré across the whole card. The design must be Lanczos-downscaled to roughly the paste-area size *first*.
2. sharp reorders its pipeline: `removeAlpha()` runs *after* `resize()`, so the resize still premultiplies and RGB under `alpha=0` (the chip cutout) is multiplied to 0 — a black rectangle mid-card. Strip alpha, materialize to a buffer, then resize in a second pass.

Design and paste area must share an aspect ratio (`CARD_SKIN_RATIO = 85.6/54`) — the design is stretched to fill the quad, so a mismatch silently distorts. Both `/api/generate/skin` and the editor warn past 12% deviation.

### Storage (`apps/api/src/services/storage.ts`)
Local filesystem, **not** the DB. `STORAGE_DIR` resolves relative to **repo root** (4 levels up from the service file), default `./storage`; `mockups/ watermarks/ designs/ outputs/` are created on boot, other subdirs on write. The DB stores only relative `filePath`s; absolute paths come from `resolveAbsPath`, public URLs from `buildPublicUrl` (`${PUBLIC_URL}/files/<relpath>`, served by `@fastify/static` at `/files/`). Layout:

```
mockups/                       shirtsets/<ownerId>/<setName>/<color>.<ext>
watermarks/                    ideas/source/<ownerId>/  ideas/gen/<genId>/  ideas/imported/<ownerId>/
designs/<YYYY-MM-DD>/          outputs/<generationId>/<mockupId|variantId>.png
.thumbs/                       (sha1-keyed webp cache written by /thumb)
```

`storage/` is gitignored.

### Data model (`apps/api/prisma/schema.prisma`)
**MySQL 8** (`provider = "mysql"`), database `genmockup`, charset `utf8mb4`. Migrations are committed under `prisma/migrations/`.

The schema was SQLite until Aug 2026; `apps/api/prisma/schema.prisma.sqlite.bak` is the last SQLite version, kept only so the old `storage/genmockup.db` stays readable. `flow.md` and `migrate-from-mysql.ts` predate all of this and describe an unrelated legacy MySQL/XAMPP import — ignore them.

Two MySQL-specific traps, both commented in `schema.prisma`:
- MySQL maps `String` to `VARCHAR(191)` and **truncates silently** past that. Every column that can exceed it carries `@db.Text` — the file paths, `AppSetting.value` (holds Drive token JSON), the OpenAI `prompt`/`analysis`/`sellingPoints`, `SkinScene.cornersJson`/`ctrlJson`, and the user-supplied names/titles/keywords. Real data already hit 425 / 1251 / 250 chars in those columns, so this is not theoretical. A column can only take `@db.Text` if it is *not* in an `@id`/`@unique`/`@index`.
- `utf8mb4_unicode_ci` is **case-insensitive**, unlike SQLite. Usernames now collide case-insensitively, and so does `@@unique([ownerId, name])` on `ShirtSet`.

Models: `User`, `AppSetting` (per-user KV, PK `[userId, key]`), `Mockup`, `MockupShare`, `Watermark`, `ShirtSet` / `ShirtVariant` (unique `[setId, color]`) / `ShirtSetShare`, `SkinScene` / `SkinSceneShare`, `Generation` (`productType: card|shirt|skin`, status `pending|done|error`) / `GenerationItem` (points at exactly one of `mockupId`, `variantId`, `sceneId`), `IdeaGeneration` / `IdeaImage`.

The single `20260822000000_init_mysql` migration creates all 14 tables, so `prisma migrate deploy` bootstraps a working database. This replaced the old SQLite migration set, which was incomplete — it never created `users`, `mockup_shares`, or `shirt_set_shares`, so `migrate deploy` produced a DB that crashed on boot at `ensureAdminUser()` and everyone used `db push` instead. That workaround is no longer needed.

Areas are stored as **flat columns** (`designX/Y/Width/Height/Rotation`, nullable `watermarkX/...`) on both `Mockup` and `ShirtSet`, and mapped to/from the nested `Area` shape in `services/dto.ts`. A watermark area counts as present only when x/y/width/height are all non-null. Keep DTO mapping in sync with schema changes.

### Ownership & sharing
Every content model has a nullable `ownerId`. **All queries must be scoped to the caller** — routes use `requireUserId(req)` and filter by `ownerId`, never a bare `findUnique` by id. Read/use access can be extended via `MockupShare` / `ShirtSetShare`:

```ts
where: { id, OR: [{ ownerId }, { shares: { some: { userId: ownerId } } }] }
```

Shared items are **use-only** — editing, replacing, deleting, and re-sharing require `ownerId` match. Watermarks and idea images have no sharing and are always owner-scoped. Deleting a user (`routes/users.ts`) deletes their rows *and* their files; keep that function updated when adding models with `filePath`s.

The two admin escapes from owner-scoping are deliberate and narrow:
- `GET /api/mockups|/api/shirt-sets|/api/skin-scenes|/api/watermarks?all=1` returns everyone's rows, but still stamps `shared: ownerId !== me` so the UI keeps them read-only (on `Watermark` that flag exists *only* in this mode — watermarks have no sharing). It does **not** widen the write routes — an admin still cannot edit or delete another user's item.
- Ownership transfer (`services/ownership.ts`, `POST /api/users/:id/transfer` for a whole user, `POST /api/users/transfer-items` for specific ids). Files are **not** moved — `filePath` stays valid under the old owner's directory, which is also why deleting the old user afterwards doesn't touch transferred files. Transfers drop any share row granting the *new* owner access, and rename colliding shirt sets (`@@unique([ownerId, name])`) rather than failing.

### API server (`apps/api/src/server.ts`)
Fastify with two `preHandler` layers: optional `API_KEY` header gate (skips `/health`, `/files/`, `/thumb`) → session resolution + `/api/*` guard. Routes under `routes/`: `auth`, `users`, `mockups`, `shirtSets`, `skinScenes`, `watermarks`, `generate`, `thumb`, `drive`, `settings`, `ideas`. Swagger UI at `/api/documentation` — route schemas carry Vietnamese `summary`/`tags`, so keep new routes annotated the same way.

`/api/generate` and `/api/generate/shirt` share `parseGenerateRequest`, which accepts **either** `multipart/form-data` (uploaded `designFile`, array fields JSON-encoded) **or** JSON (`designUrl`), plus `designImageId` to reuse a saved idea image. Uploaded designs are persisted to `designs/<date>/` before compositing.

`/thumb?path=<relpath>&w=<n>` is a **public, unauthenticated** resized-webp endpoint with an on-disk cache — it exists because loading full-size shirt mockups (~2.5 MB each) in grids pegged CPU and 502'd the tunnel. Use it for any new thumbnail grid. It guards against path traversal by requiring the resolved path to stay inside `STORAGE_DIR`; preserve that check.

### Auth (`apps/api/src/services/auth.ts`)
Multi-user and **always on** (`isAuthEnabled()` returns `true` unconditionally — the old "empty env disables auth" behavior is gone). Users live in the DB with bcrypt hashes and a `role` of `user` or `admin`. On boot, `bootstrapUsers()` creates the first admin from `AUTH_USERNAME`/`AUTH_PASSWORD` (defaults `admin`/`admin`), promotes the oldest user if none is admin, backfills `ownerId: null` rows to that admin, and imports any legacy Drive token.

A session is accepted from **either** the httpOnly cookie `genmockup_session` (web) **or** `Authorization: Bearer <jwt>` (the Chrome extension) — both paths must keep working. JWTs are signed with `AUTH_SECRET`; if it's unset a random secret is generated per process, so sessions die on restart. Admin-only routes use `requireAdmin`. The optional `API_KEY` is a separate, orthogonal header gate.

### New Idea / OpenAI (`services/openai.ts`, `services/settings.ts`, `routes/ideas.ts`)
`POST /api/ideas/generate` returns **202 immediately** and does the work fire-and-forget (`processIdeaGeneration`), because analysis + N image generations exceed the tunnel's timeout; the client polls `GET /api/ideas/generations/:id`. Images generate in parallel via `Promise.allSettled` — a partial failure still marks the generation `done` with a `partial:` note in `error`.

Config is **per user** in `AppSetting` (`openai_api_key`, model/quality keys), falling back to `OPENAI_API_KEY` env only when the user hasn't set one. `FEATURE_IDEAS=off|0|false|no|disabled` kills the OpenAI-calling endpoints (423) but not `/api/ideas/import`, which only stores bytes. Prompts are tuned for print-on-demand and force transparent-background, isolated artwork — the `TRANSPARENT_SUFFIX` and trademark-mode clauses are load-bearing, not decoration.

### Google Drive (`routes/drive.ts`, `services/drive.ts`)
Optional OAuth 2.0 user flow (`/api/drive/oauth/callback` is public; the user id rides through the redirect in a signed `state`). Tokens are stored **per user in `AppSetting`**, not in a global file — `secrets/drive-token.json` is only read once by `importLegacyDriveToken`. Disabled when `GOOGLE_OAUTH_*` is empty.

### Frontend (`apps/web`)
React Router pages in `src/pages/`: `Mockups`, `MockupEditor`, `ShirtSets`, `ShirtSetEditor`, `SkinScenes`, `SkinSceneEditor`, `SkinGenerate`, `Generate`, `NewIdea`, `Watermarks`, `Users` (admin), `Profile`, `Settings`, `Docs`, `Login`. Area editing uses **react-konva** (`components/AreaEditor.tsx` for mockups, `ShirtSetPositioner.tsx` for per-generation area overrides, `QuadEditor.tsx` for card-skin corner/curve handles).

`QuadEditor.tsx` duplicates the backend's Coons-patch formula to draw the overlay grid. If `services/perspective.ts` changes, change it too — otherwise the grid shows the design landing somewhere it won't. The editor's "ghép thử" button avoids that class of drift entirely by rendering through the real `composeSkin`. Server state via **TanStack Query**; API wrappers in `src/api/*` (axios `client.ts`, `withCredentials`) — one module per route file, keep them paired. Vite aliases `@` → `apps/web/src`. UI is Tailwind + shadcn-style primitives (`components/ui.tsx`, `lib/cn.ts`). UI copy is Vietnamese — match it.

## Environment

Copy `.env.example` → `.env` (repo root; loaded by `apps/api/src/env.ts`, which **must** be imported first in `server.ts` and in any script). Both `.env` and `secrets/` are gitignored. Key vars: `PORT`, `DATABASE_URL` (`mysql://user:pass@host:3306/genmockup` — URL-encode special characters in the password), `STORAGE_DIR`, `PUBLIC_URL` (used to build returned image links), `CORS_ORIGIN` (comma-separated), `API_KEY`, `AUTH_USERNAME`/`AUTH_PASSWORD`/`AUTH_SECRET`, `FEATURE_IDEAS`, `OPENAI_API_KEY` (fallback only), `GOOGLE_OAUTH_*`.

`.env.example` is stale in two places — its comment says empty `AUTH_USERNAME`/`AUTH_PASSWORD` disables auth (it doesn't; auth is always on and those only seed the first admin), and it never lists `OPENAI_API_KEY`. Trust `apps/api/src/env.ts` and `services/auth.ts` over the example file.
