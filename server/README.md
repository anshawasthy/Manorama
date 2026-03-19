# Manorama — Backend (Server)

Node.js API server for the Manorama Inventory & POS system.

## Local Development

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000` by default.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ALLOWED_ORIGINS` | `*` (all) | Comma-separated frontend URLs for CORS |
| `GOOGLE_SHEET_ID` | — | Google Sheets ID for sync (optional) |

## Deploying to Production

### 1. Configure environment

Set these environment variables on your hosting platform:

```bash
PORT=3000
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

### 2. Deploy

| Platform | Steps |
|----------|-------|
| **Render** | Connect repo → Root Directory: `server` → Build: `npm install` → Start: `npm start` |
| **Railway** | Connect repo → Root Directory: `server` → auto-detects Node.js |
| **VPS** | `npm install && npm start` (use PM2 for process management) |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all products |
| GET | `/api/products/:id` | Get single product |
| POST | `/api/products` | Create product (multipart form) |
| PUT | `/api/products/:id` | Update product (multipart form) |
| DELETE | `/api/products/:id` | Delete product |
| POST | `/api/bills` | Generate a bill |
| GET | `/api/bills` | List all bills |
| GET | `/api/bills/:id` | Get single bill |
| GET | `/api/dashboard` | Dashboard stats |
| GET | `/api/sales` | Sales history |
| GET | `/api/events` | SSE live updates |

### Data Storage

- **Database:** `db.json` (JSON file — for production, consider migrating to MongoDB or PostgreSQL)
- **Uploads:** `uploads/` directory for product images
