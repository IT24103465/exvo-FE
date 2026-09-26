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

| Command           | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `npm run dev`     | Start the Vite development server with hot module replacement |
| `npm run build`   | Create a production build in `dist/`                          |
| `npm run preview` | Preview the production build locally                          |
| `npm run lint`    | Run Oxlint checks                                             |

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
