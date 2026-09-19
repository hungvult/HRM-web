# HRM Web

Web application for the HRM system, built with Next.js, React, TypeScript, Tailwind CSS, and ESLint.

## Requirements

- Node.js 20 or newer
- npm
- Git

## Setup

Clone the repository and move into the web folder:

```bash
git clone https://github.com/hungvult/HRM-web.git
cd HRM-web
```

Install dependencies:

```bash
npm install
```

Create a local `.env.local` file and point the web app to the backend test API:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
```

Replace the value with the staging/test API URL when the backend is deployed.

## Run Locally

Start the development server:

```bash
npm run dev
```

Open the app at:

```text
http://localhost:3000
```

## Build

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Lint

Run ESLint:

```bash
npm run lint
```

## Project Structure

```text
src/
  app/
    accounts/
      page.tsx
    globals.css
    layout.tsx
    page.tsx
  lib/
    accounts.ts
    api.ts
    auth.ts
```

## Troubleshooting

- If dependencies fail to install, confirm that Node.js 20 or newer is installed.
- If port `3000` is already in use, stop the other process or run Next.js on another port.
- If build fails after changing UI code, run `npm run lint` and fix reported issues before building again.
