# Exvo Frontend

Exvo is a React application for event discovery, organizer event management,
bookings and tickets, coordinator check-in, and event analytics.

## Technology stack

- React 19 with JavaScript and JSX
- Vite 8
- Tailwind CSS 4, PostCSS, and Autoprefixer
- ESLint, Oxlint, and Prettier
- Vitest and Playwright

## Prerequisites

- Node.js 22.12 or newer on the 22.x line, or a newer compatible release.
  Vite's declared minimum is Node `^20.19.0 || >=22.12.0`; Node 18 is unsupported.
- npm
- The Exvo backend running in Docker; see the [backend README](../exvo-BE/README.md).

## Setup and run

Run these commands from `exvo-FE`, the directory containing `package.json`.
Commands below use PowerShell.

On first setup:

```powershell
Copy-Item .env.example .env.local
npm ci
```

If `.env.local` exists, edit it instead of overwriting it. For the local Docker
backend, use:

```dotenv
VITE_API_BASE_URL=http://localhost:5000
```

Start the backend using the Docker Compose instructions linked above, then start
the frontend:

```powershell
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173`. The backend gateway allows this origin and
`http://127.0.0.1:5173`. Using a different frontend port requires updating the
gateway's allowed origins. Stop the frontend with Ctrl+C; the backend containers
keep running until stopped with Docker Compose.

Vite reads environment settings at startup, so restart it after editing
`.env.local`. `VITE_*` values are public frontend configuration; never put
passwords or private tokens in them.

If API requests fail, check `http://localhost:5000/health`, the backend container
logs, and `VITE_API_BASE_URL`. The frontend can start while the backend is down,
but account, event, booking, and check-in requests require the backend services.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the production bundle in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm run lint:oxlint` | Run Oxlint |
| `npm test` | Run Vitest tests |
| `npm run test:coverage` | Run Vitest with coverage |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run format` | Format source and root configuration files with Prettier |
| `npm run format:check` | Check Prettier formatting |

## Validation

```powershell
npm run lint
npm test
npm run build
```

For browser tests, install Chromium once, then run Playwright:

```powershell
npx playwright install chromium
npm run test:e2e
```

Playwright starts its own frontend server at `http://127.0.0.1:4173`.
Tests that call real APIs require the backend and an allowed CORS origin for that
address; tests that mock API responses do not need backend access.

## Production build

Set `VITE_API_BASE_URL` to the deployed gateway URL before running `npm run build`.
Vite embeds this value at build time. Without it, the current API client reports
the backend as unavailable in production. Set the gateway URL explicitly.

```powershell
npm run build
npm run preview
```

The generated `dist/` directory is the deployable output; do not edit it manually.
Configure the deployed gateway's allowed CORS origins for the frontend hostname.
Preview uses a different port from development, so real API access also needs a
matching allowed origin.

## Project structure

```text
public/                 Static assets
src/
  assets/               Artwork, images, and video
  services/             API clients, configuration, adapters, and tests
  App.jsx               Application views and navigation
  App.css               Application styles
  index.css             Global styles and Tailwind entry point
  main.jsx              React entry point
e2e/                    Browser tests
.env.example            Public API URL template
package.json            Dependencies and scripts
vite.config.js          Vite configuration
playwright.config.js    Browser test configuration
```
