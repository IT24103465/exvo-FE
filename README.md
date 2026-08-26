# Exvo Frontend

Exvo is an event discovery platform for finding and exploring upcoming live experiences. This repository contains the Sprint 1 frontend: a responsive React interface with a visually focused home screen, event categories, authentication flows, and a user profile experience.

## Sprint 1 Delivered

- Responsive Exvo landing and event discovery screen
- Branded navigation with responsive menu overlay
- Upcoming events cover-flow carousel with autoplay, hover pause, and manual navigation
- Horizontally scrollable categories for concerts, festivals, live sessions, DJ nights, acoustic shows, and stand-up events
- Login and account registration screens
- Password visibility controls, client-side form validation, loading states, and API error feedback
- Token and user-session persistence through `localStorage`
- Authenticated user avatar, profile panel, and logout flow
- Background video treatment, animated footer effects, mobile layout, and touch scrolling

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
- Exvo authentication API running locally on port `5000`

The frontend expects the authentication API at `http://localhost:5000/api/auth`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/register` | Create an attendee account |
| `POST` | `/login` | Authenticate an existing user |
| `GET` | `/me` | Retrieve the current authenticated profile |

Registration sends the default role `Attendee`. Successful login or registration responses should include a `token`.

## Getting Started

From the project directory:

```bash
npm install
npm run dev
```

Vite will print the local development URL, normally `http://localhost:5173`.

For the complete Sprint 1 experience, start the authentication backend before testing login, registration, profile, and logout behavior.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server with hot module replacement |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint checks |

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

## Authentication Flow

1. A visitor selects **Login** or **Create an account** from the navigation.
2. The frontend sends credentials to the authentication API.
3. On success, the API token and user response are stored in `localStorage`.
4. The home screen displays the authenticated user's initials and profile actions.
5. Logout removes the token and user data and returns the interface to its signed-out state.

For local testing, clear the `token` and `user` entries from `localStorage` to reset authentication state.

## Current Sprint 1 Boundaries

The current frontend focuses on the discovery and authentication foundation. These UI interactions are not yet connected to production services:

- Google sign-in and sign-up
- Password reset
- Terms of Service and Privacy Policy pages
- Full event listing and event detail pages
- Category filtering against live event data
- Profile editing

## Validation

```bash
npm run lint
npm run build
```

The production build is generated in `dist/` and should not be edited manually.
