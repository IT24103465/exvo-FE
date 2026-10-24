# Exvo Frontend

Exvo is an event discovery platform for finding and exploring upcoming live experiences. This repository contains the frontend: a responsive React interface with a visually focused home screen, event categories, authentication flows, and a user profile experience.

## Technology Stack

- React 19 with JavaScript and JSX
- Vite 8
- Tailwind CSS 3
- PostCSS and Autoprefixer
- Oxlint
- Local image and video assets

## Prerequisites

- Node.js 18 or newer
- npm
- Exvo API Gateway

## Getting Started

From the project directory:

```bash
npm install
npm run dev
```

Vite will print the local development URL, normally `http://localhost:5173`.

## Available Scripts

| Command                        | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `npm run dev`                  | Start the Vite development server with hot module replacement |
| `npm run build`                | Create a production build in `dist/`                          |
| `npm run preview`              | Preview the production build locally                          |
| `npm run lint`                 | Run Oxlint checks                                             |
| `npm run test:e2e:mock`        | Run deterministic browser UI tests with mocked API responses  |
| `npm run test:e2e:integration` | Run opt-in Playwright tests against an isolated EXVO backend  |

## Project Structure

```text
Exvo/
├── public/                 # Public static files
├── src/
│   ├── assets/             # Event artwork and background video
│   ├── services/
│   │   └── authService.js  # Authentication API requests and session storage
│   ├── App.css              # Carousel, category, profile, and footer styles
│   ├── App.jsx              # Main application and authentication views
│   ├── index.css            # Global styles and Tailwind entry point
│   └── main.jsx             # React application entry point
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

## Validation

```bash
npm run lint
npm run build
```

The production build is generated in `dist/` and should not be edited manually.

## Playwright UI and E2E testing

The Playwright suite has two deliberately separate categories:

| Category             | Command                        | Backend/API behavior                                                              | Prerequisites                                                      |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Mocked browser UI    | `npm run test:e2e:mock`        | `/api/**` is intercepted by reusable fixtures; no backend or database is required | Node.js and Chromium                                               |
| Real integration E2E | `npm run test:e2e:integration` | No API routes are mocked; requests go to the configured isolated EXVO environment | `EXVO_E2E_BASE_URL`, `VITE_API_BASE_URL`, and isolated credentials |

Install the browser once with `npx playwright install --with-deps chromium`. The default Playwright configuration starts Vite on port 4173, captures screenshots and video on failure, retains traces on failure, and writes an HTML report to `playwright-report/` plus JUnit output to `test-results/playwright.xml`.

For real integration tests, never use production credentials or production data:

```powershell
$env:EXVO_E2E_BASE_URL = "https://isolated-frontend.example.test"
$env:VITE_API_BASE_URL = "https://isolated-api.example.test"
$env:EXVO_E2E_ATTENDEE_EMAIL = "<isolated attendee email>"
$env:EXVO_E2E_ATTENDEE_PASSWORD = "<isolated attendee password>"
npm run test:e2e:integration
```

The integration suite is skipped and reported as unconfigured when those variables are absent. This repository contains no backend, database container, seed script, organizer credentials, or isolated ticket fixture, so organizer real-E2E scenarios are documented but cannot be claimed as executed here. CI runs mocked tests on every frontend build and runs real integration tests only when the corresponding GitHub Actions secrets are configured.

### Test case matrix

| Feature/workflow                            | Mocked spec                                          | Real integration                                 | Boundary/error coverage                                       |
| ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Homepage navigation and responsive controls | `e2e/homepage-auth.spec.js`                          | Not configured                                   | Navigation, form visibility, accessible controls              |
| Authentication and registration validation  | `e2e/homepage-auth.spec.js`                          | Attendee login                                   | Invalid credentials, required/minimum password constraints    |
| Event browsing, search, details             | `e2e/events-booking-tickets.spec.js`                 | Covered by backend attendee flow when configured | Search filtering, details modal                               |
| Booking and ticket persistence/read-back    | `e2e/events-booking-tickets.spec.js`                 | Backend prerequisite missing                     | Authenticated booking, ticket retrieval, download event       |
| Role-based authorization                    | `e2e/organizer-portals.spec.js`                      | Organizer fixture required                       | Attendee cannot see organizer dashboard                       |
| Scanner validation and check-in             | `e2e/organizer-portals.spec.js`                      | Organizer/ticket seed required                   | Valid, wrong-event, invalid, already-used, confirmation       |
| Analytics and reports                       | `e2e/organizer-portals.spec.js`                      | Organizer/event analytics seed required          | Report type/timeframe selection and navigation                |
| QR/download evidence                        | `e2e/events-booking-tickets.spec.js`                 | Ticket seed required                             | Download event is asserted; ticket manager renders QR/barcode |
| Loading/error states                        | Existing component tests and mocked route capability | Backend prerequisite missing                     | No unsupported backend claim                                  |

### Evidence and assessment demo

After a run, open `playwright-report/index.html` with `npx playwright show-report playwright-report`. Failure screenshots, videos, traces, and JUnit results are under `test-results/`. A reliable two-minute SE3112 demonstration is:

1. Run `npm run test:e2e:mock` and show the HTML report summary.
2. Open the homepage test and point out accessible role/label selectors and the mocked `/api/**` boundary.
3. Run the organizer portal test, show valid ticket validation, check-in confirmation, and invalid/wrong-event/duplicate assertions.
4. Show analytics/report navigation and the responsive Chromium project configuration.
5. Explain that real integration is opt-in, uses isolated credentials and a non-production backend, and is reported unverified when those prerequisites are absent.
