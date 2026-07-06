# ForgeFlow

ForgeFlow is a manufacturing operations platform with a public website, authentication screens, pricing flow, documentation pages, and a full application workspace for production, inventory, purchasing, sales, maintenance, integrations, staff, teams, and roles.

## Live Site

The project is prepared for GitHub Pages at:

```text
https://kamsigpt.github.io/Forge-Flow-.com/
```

GitHub Pages is deployed from the Vite production build in `dist` through the workflow at `.github/workflows/deploy.yml`.

## Local Development

Install dependencies once:

```bash
npm install
```

Start the entire project locally:

```bash
npm run dev
```

Vite serves the site at:

```text
http://localhost:3000/
```

## Production Build

Create the GitHub Pages build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

```text
.
|-- index.html
|-- app.html
|-- about.html
|-- api-reference.html
|-- contact.html
|-- documentation.html
|-- help.html
|-- login.html
|-- payment.html
|-- pricing-select.html
|-- privacy.html
|-- signup.html
|-- status.html
|-- terms.html
|-- assets/
|-- css/
|-- js/
|-- supabase/
|-- vite.config.js
`-- package.json
```

## Pages Included In The Build

- Landing page
- Application workspace
- Sign up and login
- Pricing and payment
- About and contact
- Help, documentation, and API reference
- Status, privacy, and terms
