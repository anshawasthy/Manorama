# Manorama — Frontend (Client)

Static frontend for the Manorama Inventory & POS system.

## Local Development

Serve the files with any static server:

```bash
# Using npx serve
npx serve .

# Or Python
python3 -m http.server 8080
```

> **Note:** For local dev with the backend on the same machine, either set `API_BASE_URL = ''` in `config.js` (if using the backend to serve these files) or set it to `'http://localhost:3000'` (if serving frontend separately).

## Deploying to Production

### 1. Set the API URL

Edit `config.js` and set `API_BASE_URL` to your deployed backend URL:

```js
const API_BASE_URL = 'https://your-backend.onrender.com';
```

### 2. Deploy

Upload the entire `client/` folder to any static hosting:

| Platform | Command / Steps |
|----------|----------------|
| **Vercel** | `npx vercel --prod` from this directory |
| **Netlify** | Drag & drop this folder, or `npx netlify deploy --prod --dir .` |
| **GitHub Pages** | Push contents to a `gh-pages` branch |
| **Any server** | Copy all files to the web root |

### Files

| File | Purpose |
|------|---------|
| `index.html` | Main HTML |
| `app.js` | Application logic |
| `config.js` | **API URL configuration** — edit before deploying |
| `style.css` | Styles |
| `logo.png` | Logo asset |
