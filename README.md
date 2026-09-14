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

If the project later adds environment variables, create a local `.env.local` file from the provided example file and update the values for your environment.

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
    globals.css
    layout.tsx
    page.tsx
```

## Troubleshooting

- If dependencies fail to install, confirm that Node.js 20 or newer is installed.
- If port `3000` is already in use, stop the other process or run Next.js on another port.
- If build fails after changing UI code, run `npm run lint` and fix reported issues before building again.
