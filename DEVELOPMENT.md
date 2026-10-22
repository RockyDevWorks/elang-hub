# ELANG Hub — Development Guide

## Prerequisites

- **Node.js:** v26 or later
- **npm:** v12 or later
- **Git:** For version control

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/RockyDevWorks/elang-hub.git
cd elang-hub
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run development server

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the next available port).

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot module replacement |
| `npm run build` | Build production-ready application for Cloudflare Pages |
| `npm run preview` | Preview production build locally |
| `npm run check` | Run TypeScript and Svelte type checking |
| `npm run check:watch` | Run type checking in watch mode |
| `npm run lint` | Run ESLint and Prettier checks |
| `npm run format` | Auto-format code with Prettier |

## Project Structure

```
elang-hub/
├── .github/
│   ├── workflows/        # CI/CD workflows
│   └── ISSUE_TEMPLATE/   # GitHub issue templates
├── docs/                 # Documentation
│   ├── decisions/        # Architecture Decision Records (ADRs)
│   ├── scope-v0.1.0.md
│   ├── sdk-compatibility-policy.md
│   └── elang-sdk-version.md
├── src/
│   ├── lib/              # Shared components and utilities
│   ├── routes/           # SvelteKit routes (file-based routing)
│   │   ├── +layout.svelte
│   │   └── +page.svelte
│   ├── app.css           # Global styles (Tailwind directives)
│   └── app.html          # HTML shell
├── static/               # Static assets (favicon, images, etc.)
├── package.json
├── svelte.config.js      # SvelteKit configuration
├── vite.config.ts        # Vite configuration
├── tailwind.config.js    # Tailwind CSS configuration
├── tsconfig.json         # TypeScript configuration
└── README.md
```

## Architecture

### Frontend

- **Framework:** SvelteKit 2.x
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Components:** shadcn-svelte (to be added)
- **Icons:** @lucide/svelte
- **Deployment:** Cloudflare Pages

### Backend (Separate Service)

- **Platform:** Fly.io
- **Function:** ELANG package validation via `elang` CLI
- **API:** RESTful HTTP endpoints

See [Architecture Decision Record 0001](./docs/decisions/0001-architecture-and-deployment.md) for detailed rationale.

## Development Workflow

### Branch Strategy

- `main` — Production-ready code
- `feat/*` — Feature branches
- `release/*` — Release preparation branches

### Before Committing

1. **Type check:** `npm run check`
2. **Lint:** `npm run lint`
3. **Format:** `npm run format`
4. **Build:** `npm run build`

All checks must pass before pushing to remote.

### CI/CD

GitHub Actions runs on every push and pull request:
- Type checking (`npm run check`)
- Linting (`npm run lint`)
- Build (`npm run build`)

## Adding Features

### 1. Create a new route

SvelteKit uses file-based routing. Add a new file in `src/routes/`:

```
src/routes/about/+page.svelte  → /about
src/routes/validate/+page.svelte  → /validate
```

### 2. Create a reusable component

Place shared components in `src/lib/components/`:

```typescript
// src/lib/components/Button.svelte
<script lang="ts">
  let { onclick, children } = $props();
</script>

<button {onclick} class="px-4 py-2 bg-blue-600 text-white rounded">
  {@render children()}
</button>
```

### 3. Add API routes (server-side)

Create `+server.ts` files for API endpoints:

```typescript
// src/routes/api/validate/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  // Handle validation request
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

## Styling

### Tailwind CSS

Use Tailwind utility classes directly in components:

```svelte
<div class="flex items-center justify-center min-h-screen bg-gray-50">
  <h1 class="text-3xl font-bold text-gray-900">Hello, ELANG!</h1>
</div>
```

### Custom Styles

For component-specific styles, use `<style>` blocks:

```svelte
<style>
  .custom-class {
    /* Custom CSS */
  }
</style>
```

## Testing

**Status:** Test infrastructure to be added in Phase H05 (Hardening & Release)

Planned:
- Unit tests (Vitest)
- Integration tests
- Browser tests (Playwright)

## Deployment

### Cloudflare Pages (Frontend)

1. Build: `npm run build`
2. Deploy: Cloudflare Pages automatically deploys from GitHub on push to `main`

Configuration:
- Build command: `npm run build`
- Build output directory: `.svelte-kit/output`
- Adapter: `@sveltejs/adapter-cloudflare`

### Fly.io (Validation Backend)

**Status:** Backend implementation pending (Phase H01: Upload)

## Troubleshooting

### Build Errors

**Issue:** `Module not found` errors

**Solution:** Run `npm install` to ensure all dependencies are installed

---

**Issue:** Type errors in Svelte files

**Solution:** Run `npm run check` for detailed type diagnostics

### Development Server Issues

**Issue:** Port already in use

**Solution:** Vite will automatically use the next available port

---

**Issue:** Hot module replacement not working

**Solution:** Hard refresh (Ctrl+Shift+R) or restart dev server

## Resources

- [SvelteKit Documentation](https://svelte.dev/docs/kit)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages)

## Getting Help

- GitHub Issues: https://github.com/RockyDevWorks/elang-hub/issues
- ELANG Hub Discussions: (to be set up)
- ELANG Specification: https://github.com/RockyDevWorks/elang-rs
