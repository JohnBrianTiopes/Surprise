# Surprise Gift — Valentine (React + Vite)

This is a shareable Valentine web app.

- You create a card.
- It generates a link.
- Anyone with the link can open it (the card data is encoded in the URL query string).

## Run locally

```bash
npm install
npm run dev
```

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
