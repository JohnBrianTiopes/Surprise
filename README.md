# Surprise Gift — Valentine (React + Vite)

This is a shareable Valentine web app.

- You create a card.
- It generates a link.
- Anyone with the link can open it (the card data is encoded in the URL query string).

## Private links (only one person)

This project now also supports **private links** that:

- store the letter server-side (not in the URL)
- require a **username + password** to view

This requires hosting on **Vercel** with **Vercel KV** enabled.

### Deploy on Vercel

1. Import the project into Vercel.
2. In your Vercel project, add **Storage → KV** (it will configure the KV env vars automatically).
3. Add an env var:
	- `APP_AUTH_SECRET` = any long random string (keep it private)

After deploy, in the app:

- Fill in the card
- Fill in “Private link (only with login)” (username + password)
- Click “Create private link”
- Send the URL to them, and send the username/password separately

## Run locally

```bash
npm install
npm run dev
```

Note: `npm run dev` runs only the frontend. Private links require Vercel Functions + KV.

## Deploy for free (GitHub Pages)

This repo includes a GitHub Actions workflow that builds and deploys the site to GitHub Pages.

1. Create a GitHub repo and push this project.
2. Make sure your default branch is named `main`.
3. In GitHub: **Settings → Pages**
	- **Build and deployment**: select **GitHub Actions**.
4. Push to `main` and wait for the workflow **Deploy to GitHub Pages** to finish.
5. Your site will be at `https://johnbriantiopes.github.io/Surprise/`.

## Make it more searchable

- `public/sitemap.xml` is already set to `https://johnbriantiopes.github.io/Surprise/`.
- Optional: in `index.html`, replace `og:image` with an absolute image URL after you know your final domain.
