const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------- Middleware ---------------
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

const cors = require("cors");

app.use(cors({
  origin: "*", // allow all (fix now)
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --------------- Simple JSON DB ---------------
const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return { products: [], bills: [], sales: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  broadcastSSE({ type: 'db-update' });
  syncToGoogleSheets(data);
}

// --------------- SSE (Server-Sent Events) ---------------
let sseClients = [];

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

function broadcastSSE(data) {
  sseClients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));
}

// --------------- Multer for image uploads ---------------
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// --------------- Helpers ---------------
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

function safeDeleteImage(imagePath) {
  if (!imagePath) return;
  const resolved = path.resolve(__dirname, imagePath);
  if (!resolved.startsWith(UPLOADS_DIR)) {
    console.warn('Blocked path traversal attempt:', imagePath);
    return;
  }
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
}

// =============== PRODUCTS API ===============

// GET all products
app.get('/api/products', (req, res) => {
  const db = readDB();
  res.json(db.products);
});

// GET single product
app.get('/api/products/:id', (req, res) => {
  const db = readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// POST create product
app.post('/api/products', upload.single('image'), (req, res) => {
  const db = readDB();
  const { name, costPrice, sellingPrice, quantity } = req.body;

  if (!name || costPrice == null || sellingPrice == null || quantity == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const parsedCost = parseFloat(costPrice);
  const parsedSelling = parseFloat(sellingPrice);
  const parsedQty = parseInt(quantity, 10);

  if (isNaN(parsedCost) || isNaN(parsedSelling) || isNaN(parsedQty) || parsedCost < 0 || parsedSelling < 0 || parsedQty < 0) {
    return res.status(400).json({ error: 'Invalid numeric values' });
  }

  const product = {
    id: uuidv4(),
    name: sanitize(name),
    costPrice: parsedCost,
    sellingPrice: parsedSelling,
    quantity: parsedQty,
    image: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: new Date().toISOString(),
  };

  db.products.push(product);
  writeDB(db);
  res.status(201).json(product);
});

// PUT update product
app.put('/api/products/:id', upload.single('image'), (req, res) => {
  const db = readDB();
  const idx = db.products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const { name, costPrice, sellingPrice, quantity } = req.body;
  const product = db.products[idx];

  if (name !== undefined) product.name = sanitize(name);
  if (costPrice !== undefined) {
    const v = parseFloat(costPrice);
    if (!isNaN(v) && v >= 0) product.costPrice = v;
  }
  if (sellingPrice !== undefined) {
    const v = parseFloat(sellingPrice);
    if (!isNaN(v) && v >= 0) product.sellingPrice = v;
  }
  if (quantity !== undefined) {
    const v = parseInt(quantity, 10);
    if (!isNaN(v) && v >= 0) product.quantity = v;
  }
  if (req.file) {
    // Remove old image safely
    safeDeleteImage(product.image);
    product.image = `/uploads/${req.file.filename}`;
  }
  product.updatedAt = new Date().toISOString();

  db.products[idx] = product;
  writeDB(db);
  res.json(product);
});

// DELETE product
app.delete('/api/products/:id', (req, res) => {
  const db = readDB();
  const idx = db.products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const product = db.products[idx];
  safeDeleteImage(product.image);

  db.products.splice(idx, 1);
  writeDB(db);
  res.json({ message: 'Product deleted' });
});

// =============== BILLING API ===============

app.post('/api/bills', (req, res) => {
  const db = readDB();
  const { items, customerName, paymentMethod } = req.body;
  // items: [{ productId, quantity }]

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items in the bill' });
  }

  let totalAmount = 0;
  let totalProfit = 0;
  const billItems = [];

  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId);
    if (!product) {
      return res.status(400).json({ error: `Product not found: ${item.productId}` });
    }
    if (product.quantity < item.quantity) {
      return res.status(400).json({
        error: `Insufficient stock for "${product.name}". Available: ${product.quantity}`,
      });
    }

    const itemTotal = product.sellingPrice * item.quantity;
    const itemProfit = (product.sellingPrice - product.costPrice) * item.quantity;
    totalAmount += itemTotal;
    totalProfit += itemProfit;

    // Deduct inventory
    product.quantity -= item.quantity;

    billItems.push({
      productId: product.id,
      productName: product.name,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      quantity: item.quantity,
      total: itemTotal,
      profit: itemProfit,
    });
  }

  const bill = {
    id: uuidv4(),
    customerName: sanitize(customerName) || 'Walk-in Customer',
    paymentMethod: paymentMethod || 'Cash',
    items: billItems,
    totalAmount,
    totalProfit,
    createdAt: new Date().toISOString(),
  };

  db.bills.push(bill);

  // Record as a sale
  const sale = {
    id: bill.id,
    billId: bill.id,
    customerName: bill.customerName,
    paymentMethod: bill.paymentMethod,
    totalAmount,
    totalProfit,
    itemCount: billItems.reduce((s, i) => s + i.quantity, 0),
    createdAt: bill.createdAt,
  };
  db.sales.push(sale);

  writeDB(db);
  res.status(201).json(bill);
});

// GET all bills
app.get('/api/bills', (req, res) => {
  const db = readDB();
  // Sort newest first
  const bills = [...db.bills].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(bills);
});

// GET single bill
app.get('/api/bills/:id', (req, res) => {
  const db = readDB();
  const bill = db.bills.find(b => b.id === req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

// =============== SALES / DASHBOARD API ===============

app.get('/api/sales', (req, res) => {
  const db = readDB();
  const sales = [...db.sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sales);
});

app.get('/api/dashboard', (req, res) => {
  const db = readDB();

  const totalRevenue = db.sales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalProfit = db.sales.reduce((s, sale) => s + sale.totalProfit, 0);
  const totalProducts = db.products.length;
  const totalInventoryValue = db.products.reduce(
    (s, p) => s + p.costPrice * p.quantity, 0
  );
  const totalItems = db.products.reduce((s, p) => s + p.quantity, 0);
  const lowStockProducts = db.products.filter(p => p.quantity <= 5);
  const totalBills = db.bills.length;

  // Today's stats
  const today = new Date().toISOString().slice(0, 10);
  const todaysSales = db.sales.filter(s => s.createdAt.slice(0, 10) === today);
  const todayRevenue = todaysSales.reduce((s, sale) => s + sale.totalAmount, 0);
  const todayProfit = todaysSales.reduce((s, sale) => s + sale.totalProfit, 0);
  const todayBills = todaysSales.length;

  // Recent 5 sales
  const recentSales = [...db.sales]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // Daily sales for the last 7 days
  const dailySales = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const daySales = db.sales.filter(s => s.createdAt.slice(0, 10) === dateStr);
    dailySales.push({
      date: dateStr,
      revenue: daySales.reduce((s, sale) => s + sale.totalAmount, 0),
      profit: daySales.reduce((s, sale) => s + sale.totalProfit, 0),
      count: daySales.length,
    });
  }

  res.json({
    totalRevenue,
    totalProfit,
    totalProducts,
    totalInventoryValue,
    totalItems,
    totalBills,
    lowStockProducts,
    todayRevenue,
    todayProfit,
    todayBills,
    recentSales,
    dailySales,
  });
});

// =============== GOOGLE SHEETS SYNC ===============
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
let sheetsClient = null;
let SPREADSHEET_ID = null;

async function initGoogleSheets() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.log('⚠️  Google Sheets credentials not found. Sheets sync disabled.');
      console.log('   Place credentials.json in the server/ directory to enable.');
      return;
    }

    // Check for spreadsheet ID in env or config
    SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || null;
    if (!SPREADSHEET_ID) {
      const configPath = path.join(__dirname, 'sheets-config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        SPREADSHEET_ID = cfg.spreadsheetId;
      }
    }

    if (!SPREADSHEET_ID) {
      console.log('⚠️  No spreadsheet ID configured. Sheets sync disabled.');
      console.log('   Create server/sheets-config.json with { "spreadsheetId": "YOUR_ID" }');
      return;
    }

    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets connected successfully.');
  } catch (err) {
    console.error('Google Sheets init error:', err.message);
  }
}

async function syncToGoogleSheets(db) {
  if (!sheetsClient || !SPREADSHEET_ID) return;

  try {
    // Sync Products sheet
    const productRows = [
      ['ID', 'Name', 'Cost Price', 'Selling Price', 'Quantity', 'Created At'],
      ...db.products.map(p => [
        p.id, p.name, p.costPrice, p.sellingPrice, p.quantity, p.createdAt,
      ]),
    ];

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Products!A1',
      valueInputOption: 'RAW',
      requestBody: { values: productRows },
    });

    // Sync Sales sheet
    const salesRows = [
      ['Bill ID', 'Customer', 'Total Amount', 'Total Profit', 'Items Sold', 'Date'],
      ...db.sales.map(s => [
        s.billId, s.customerName, s.totalAmount, s.totalProfit, s.itemCount, s.createdAt,
      ]),
    ];

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sales!A1',
      valueInputOption: 'RAW',
      requestBody: { values: salesRows },
    });
  } catch (err) {
    console.error('Sheets sync error:', err.message);
  }
}

// =============== START SERVER ===============
initGoogleSheets().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Manorama Inventory Server running at http://localhost:${PORT}`);
    console.log(`📦 API available at http://localhost:${PORT}/api`);
    console.log(`🖥️  Open http://localhost:${PORT} in your browser\n`);
  });
});
