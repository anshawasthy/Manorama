// ===== Manorama Inventory & POS — Client App =====
// API_BASE_URL comes from config.js (loaded before this script)
const API = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '').replace(/\/+$/, '');

// ===== STATE =====
let cart = [];
let allProducts = [];

// ===== SECURITY: HTML escaping to prevent XSS =====
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== ASSET URL: resolve relative paths against API base =====
function assetURL(path) {
  if (!path) return '';
  // Already absolute URL — leave as-is
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  // Relative path like /uploads/... — prefix with API base
  return API + path;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initClock();
  initSSE();
  loadDashboard();
  loadProducts();
  initProductModal();
  initBilling();
});

// ===== NAVIGATION =====
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const titles = { dashboard: 'Dashboard', inventory: 'Inventory', billing: 'Billing', sales: 'Sales History' };

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${view}`).classList.add('active');
      document.getElementById('page-title').textContent = titles[view] || 'Dashboard';

      // Refresh data on view switch
      if (view === 'dashboard') loadDashboard();
      if (view === 'inventory') loadProducts();
      if (view === 'billing') loadBillingProducts();
      if (view === 'sales') loadSales();

      // Close sidebar on mobile
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Hamburger
  document.getElementById('hamburger-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

// ===== CLOCK =====
function initClock() {
  const el = document.getElementById('clock');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short'
    }) + '  ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 30000);
}

// ===== SSE =====
function initSSE() {
  const evtSource = new EventSource(`${API}/api/events`);
  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'db-update') {
        // Refresh whichever view is active
        const activeView = document.querySelector('.view.active');
        if (activeView) {
          const id = activeView.id;
          if (id === 'view-dashboard') loadDashboard();
          if (id === 'view-inventory') loadProducts();
          if (id === 'view-billing') loadBillingProducts();
          if (id === 'view-sales') loadSales();
        }
      }
    } catch (err) {
      console.error('SSE message parse error:', err);
    }
  };
  evtSource.onerror = () => {
    console.warn('SSE connection lost. Reconnecting automatically...');
  };
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== FORMAT CURRENCY =====
function fmt(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    document.getElementById('stat-today-revenue').textContent = fmt(d.todayRevenue);
    document.getElementById('stat-today-profit').textContent = fmt(d.todayProfit);
    document.getElementById('stat-today-bills').textContent = d.todayBills;
    document.getElementById('stat-total-products').textContent = d.totalProducts;

    document.getElementById('stat-total-revenue').textContent = fmt(d.totalRevenue);
    document.getElementById('stat-total-profit').textContent = fmt(d.totalProfit);
    document.getElementById('stat-inv-value').textContent = fmt(d.totalInventoryValue);
    document.getElementById('stat-total-items').textContent = d.totalItems.toLocaleString();

    // Chart
    renderChart(d.dailySales);

    // Recent sales
    const tbody = document.getElementById('recent-sales-body');
    if (d.recentSales.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No sales yet</td></tr>';
    } else {
      tbody.innerHTML = d.recentSales.map(s => `
        <tr>
          <td>${escapeHTML(s.customerName)}</td>
          <td>${fmt(s.totalAmount)}</td>
          <td class="profit-positive">${fmt(s.totalProfit)}</td>
          <td>${fmtDate(s.createdAt)}</td>
        </tr>
      `).join('');
    }

    // Low stock
    const lowEl = document.getElementById('low-stock-list');
    if (d.lowStockProducts.length === 0) {
      lowEl.innerHTML = '<p class="empty-state">All products stocked well! 👍</p>';
    } else {
      lowEl.innerHTML = d.lowStockProducts.map(p => `
        <div class="low-stock-item">
          <span class="name">${escapeHTML(p.name)}</span>
          <span class="qty">${p.quantity} left</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function renderChart(dailySales) {
  const container = document.getElementById('chart-container');
  const maxVal = Math.max(1, ...dailySales.map(d => d.revenue));

  container.innerHTML = dailySales.map(d => {
    const revH = Math.max(4, (d.revenue / maxVal) * 160);
    const profH = Math.max(4, (d.profit / maxVal) * 160);
    const dayLabel = new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' });
    return `
      <div class="chart-bar-group">
        <div class="chart-bar-wrapper">
          <div class="chart-bar revenue" style="height:${revH}px" title="Revenue: ${fmt(d.revenue)}"></div>
          <div class="chart-bar profit" style="height:${profH}px" title="Profit: ${fmt(d.profit)}"></div>
        </div>
        <span class="chart-label">${dayLabel}</span>
      </div>
    `;
  }).join('');
}

// ===== PRODUCTS / INVENTORY =====
async function loadProducts() {
  try {
    const res = await fetch(`${API}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allProducts = await res.json();
    renderProducts(allProducts);
  } catch (err) {
    console.error('Products load error:', err);
  }
}

function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  if (products.length === 0) {
    grid.innerHTML = '<p class="empty-state">No products yet. Add your first product!</p>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const stockClass = p.quantity === 0 ? 'out-of-stock' : p.quantity <= 5 ? 'low-stock' : 'in-stock';
    const stockText = p.quantity === 0 ? 'Out of Stock' : p.quantity <= 5 ? `Low: ${p.quantity}` : `${p.quantity} in stock`;
    const escapedName = escapeHTML(p.name);
    const imgHtml = p.image
      ? `<img src="${escapeHTML(assetURL(p.image))}" alt="${escapedName}" />`
      : `<span class="no-image">📦</span>`;

    return `
      <div class="product-card" data-id="${escapeHTML(p.id)}">
        <div class="product-image">${imgHtml}</div>
        <div class="product-details">
          <h4 class="product-name">${escapedName}</h4>
          <div class="product-prices">
            <div class="price-item">
              <span class="price-label">Cost</span>
              <span class="price-value cost">${fmt(p.costPrice)}</span>
            </div>
            <div class="price-item">
              <span class="price-label">Selling</span>
              <span class="price-value sell">${fmt(p.sellingPrice)}</span>
            </div>
          </div>
          <div class="product-stock">
            <span class="stock-badge ${stockClass}">${stockText}</span>
            <div class="product-actions">
              <button class="btn btn-secondary btn-sm" onclick="editProduct('${escapeHTML(p.id)}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProduct('${escapeHTML(p.id)}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Search
document.getElementById('inventory-search')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(q)
  );
  renderProducts(filtered);
});

// ===== PRODUCT MODAL =====
function initProductModal() {
  const modal = document.getElementById('product-modal');
  const form = document.getElementById('product-form');
  const addBtn = document.getElementById('add-product-btn');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const imageInput = document.getElementById('product-image');
  const preview = document.getElementById('image-preview');
  const placeholder = document.getElementById('upload-placeholder');

  addBtn.addEventListener('click', () => openProductModal());
  closeBtn.addEventListener('click', () => closeProductModal());
  cancelBtn.addEventListener('click', () => closeProductModal());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeProductModal();
  });

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        preview.src = ev.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const formData = new FormData();
    formData.append('name', document.getElementById('product-name').value);
    formData.append('costPrice', document.getElementById('product-cost').value);
    formData.append('sellingPrice', document.getElementById('product-selling').value);
    formData.append('quantity', document.getElementById('product-quantity').value);

    const imageFile = imageInput.files[0];
    if (imageFile) formData.append('image', imageFile);

    try {
      const url = id ? `${API}/api/products/${id}` : `${API}/api/products`;
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: formData });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to save product', 'error');
        return;
      }

      showToast(id ? 'Product updated!' : 'Product added!', 'success');
      closeProductModal();
      loadProducts();
    } catch (err) {
      showToast('Network error', 'error');
    }
  });
}

function openProductModal(product = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('modal-title');
  const preview = document.getElementById('image-preview');
  const placeholder = document.getElementById('upload-placeholder');

  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  preview.style.display = 'none';
  placeholder.style.display = 'block';

  if (product) {
    title.textContent = 'Edit Product';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-cost').value = product.costPrice;
    document.getElementById('product-selling').value = product.sellingPrice;
    document.getElementById('product-quantity').value = product.quantity;
    if (product.image) {
      preview.src = assetURL(product.image);
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    }
  } else {
    title.textContent = 'Add Product';
  }

  modal.classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

async function editProduct(id) {
  try {
    const res = await fetch(`${API}/api/products/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const product = await res.json();
    openProductModal(product);
  } catch (err) {
    showToast('Failed to load product', 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    const res = await fetch(`${API}/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Product deleted', 'success');
      loadProducts();
    } else {
      showToast('Failed to delete', 'error');
    }
  } catch (err) {
    console.error('Delete product error:', err);
    showToast('Network error', 'error');
  }
}

// ===== BILLING =====
function initBilling() {
  document.getElementById('billing-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allProducts.filter(p =>
      p.name.toLowerCase().includes(q) && p.quantity > 0
    );
    renderBillingProducts(filtered);
  });

  document.getElementById('generate-bill-btn').addEventListener('click', generateBill);

  // Payment method toggle — show cash received only for Cash
  const paymentSelect = document.getElementById('payment-method');
  const cashSection = document.getElementById('cash-change-section');
  paymentSelect.addEventListener('change', () => {
    cashSection.style.display = paymentSelect.value === 'Cash' ? 'block' : 'none';
    if (paymentSelect.value !== 'Cash') {
      document.getElementById('cash-received').value = '';
      document.getElementById('change-display').style.display = 'none';
    }
  });
  // Show by default since Cash is default
  cashSection.style.display = 'block';

  // Cash received — calculate change
  document.getElementById('cash-received').addEventListener('input', () => {
    const cashReceived = parseFloat(document.getElementById('cash-received').value) || 0;
    const totalText = document.getElementById('cart-total-amount').textContent;
    const total = parseFloat(totalText.replace(/[₹,]/g, '')) || 0;
    const changeDisplay = document.getElementById('change-display');
    const changeAmount = document.getElementById('change-amount');

    if (cashReceived > 0 && total > 0) {
      const change = cashReceived - total;
      changeDisplay.style.display = 'flex';
      if (change >= 0) {
        changeAmount.textContent = fmt(change);
        changeAmount.style.color = 'var(--success)';
      } else {
        changeAmount.textContent = '−' + fmt(Math.abs(change));
        changeAmount.style.color = 'var(--danger)';
      }
    } else {
      changeDisplay.style.display = 'none';
    }
  });

  // Receipt modal
  document.getElementById('receipt-close').addEventListener('click', () => {
    document.getElementById('receipt-modal').classList.remove('active');
  });
  document.getElementById('receipt-done-btn').addEventListener('click', () => {
    document.getElementById('receipt-modal').classList.remove('active');
  });
  document.getElementById('print-receipt-btn').addEventListener('click', () => {
    window.print();
  });
}

async function loadBillingProducts() {
  try {
    const res = await fetch(`${API}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allProducts = await res.json();
    const available = allProducts.filter(p => p.quantity > 0);
    renderBillingProducts(available);
  } catch (err) {
    console.error('Billing products load error:', err);
  }
}

function renderBillingProducts(products) {
  const list = document.getElementById('billing-product-list');
  if (products.length === 0) {
    list.innerHTML = '<p class="empty-state">No products available</p>';
    return;
  }

  list.innerHTML = products.map(p => {
    const stockClass = p.quantity === 0 ? 'out-of-stock' : p.quantity <= 5 ? 'low-stock' : 'in-stock';
    const stockText = p.quantity === 0 ? 'Out of Stock' : p.quantity <= 5 ? `Low: ${p.quantity}` : `${p.quantity} in stock`;
    const escapedName = escapeHTML(p.name);
    const imgHtml = p.image
      ? `<img src="${escapeHTML(assetURL(p.image))}" alt="${escapedName}" />`
      : `<span class="no-image">📦</span>`;
    return `
      <div class="product-card" data-id="${escapeHTML(p.id)}">
        <div class="product-image" style="cursor: pointer;" onclick="addToCart('${escapeHTML(p.id)}')">${imgHtml}</div>
        <div class="product-details">
          <h4 class="product-name">${escapedName}</h4>
          <div class="product-prices">
            <div class="price-item">
              <span class="price-label">Cost</span>
              <span class="price-value cost">${fmt(p.costPrice)}</span>
            </div>
            <div class="price-item">
              <span class="price-label">Selling</span>
              <span class="price-value sell">${fmt(p.sellingPrice)}</span>
            </div>
          </div>
          <div class="product-stock">
            <span class="stock-badge ${stockClass}">${stockText}</span>
            <div class="product-actions">
              <button class="btn btn-sm btn-primary" onclick="addToCart('${escapeHTML(p.id)}')">+ Add</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(c => c.productId === productId);
  const currentStock = product.quantity; // Always use live stock data
  if (existing) {
    if (existing.quantity >= currentStock) {
      showToast(`Only ${currentStock} in stock!`, 'error');
      return;
    }
    existing.quantity++;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      quantity: 1,
    });
  }

  renderCart();
  showToast(`Added ${escapeHTML(product.name)}`, 'success');
}

function updateCartQty(productId, delta) {
  const item = cart.find(c => c.productId === productId);
  if (!item) return;

  // Always check live stock from allProducts
  const product = allProducts.find(p => p.id === productId);
  const maxQty = product ? product.quantity : item.quantity;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    cart = cart.filter(c => c.productId !== productId);
  } else if (newQty > maxQty) {
    showToast(`Only ${maxQty} in stock!`, 'error');
    return;
  } else {
    item.quantity = newQty;
  }
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(c => c.productId !== productId);
  renderCart();
}

function renderCart() {
  const cartEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total-amount');
  const profitEl = document.getElementById('cart-profit-amount');
  const billBtn = document.getElementById('generate-bill-btn');

  if (cart.length === 0) {
    cartEl.innerHTML = '<p class="empty-state">No items added yet</p>';
    totalEl.textContent = '₹0.00';
    profitEl.textContent = '₹0.00';
    billBtn.disabled = true;
    return;
  }

  let total = 0;
  let profit = 0;

  cartEl.innerHTML = cart.map(item => {
    const itemTotal = item.sellingPrice * item.quantity;
    const itemProfit = (item.sellingPrice - item.costPrice) * item.quantity;
    total += itemTotal;
    profit += itemProfit;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHTML(item.name)}</div>
          <div class="cart-item-price">${fmt(item.sellingPrice)} each</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateCartQty('${escapeHTML(item.productId)}', -1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="updateCartQty('${escapeHTML(item.productId)}', 1)">+</button>
        </div>
        <span class="cart-item-total">${fmt(itemTotal)}</span>
        <button class="cart-item-remove" onclick="removeFromCart('${escapeHTML(item.productId)}')">&times;</button>
      </div>
    `;
  }).join('');

  totalEl.textContent = fmt(total);
  profitEl.textContent = fmt(profit);
  billBtn.disabled = false;
}

async function generateBill() {
  if (cart.length === 0) return;

  const customerName = document.getElementById('customer-name').value || 'Walk-in Customer';
  const paymentMethod = document.getElementById('payment-method').value;
  const items = cart.map(c => ({ productId: c.productId, quantity: c.quantity }));

  try {
    const res = await fetch(`${API}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, customerName, paymentMethod }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to generate bill', 'error');
      return;
    }

    const bill = await res.json();
    showToast('Bill generated successfully!', 'success');

    // Show receipt
    showReceipt(bill);

    // Clear cart
    cart = [];
    renderCart();
    document.getElementById('customer-name').value = '';
    document.getElementById('payment-method').value = 'Cash';
    document.getElementById('cash-received').value = '';
    document.getElementById('change-display').style.display = 'none';
    document.getElementById('cash-change-section').style.display = 'block';
    loadBillingProducts();
  } catch (err) {
    showToast('Network error', 'error');
  }
}

function showReceipt(bill) {
  const content = document.getElementById('receipt-content');
  const date = fmtDate(bill.createdAt);

  content.innerHTML = `
    <div class="receipt-header">
      <img src="logo.png" alt="Manorama Logo" style="height: 48px; margin-bottom: 8px;">
      <p>Invoice #${escapeHTML(bill.id.slice(0, 8).toUpperCase())}</p>
      <p>${date}</p>
      <p>Customer: ${escapeHTML(bill.customerName)}</p>
      <p>Payment: ${escapeHTML(bill.paymentMethod || 'Cash')}</p>
    </div>
    <div class="receipt-items">
      <div class="receipt-line" style="font-weight:600;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px;">
        <span>Item</span>
        <span>Qty × Price</span>
        <span>Total</span>
      </div>
      ${bill.items.map(i => `
        <div class="receipt-line">
          <span>${escapeHTML(i.productName)}</span>
          <span>${i.quantity} × ${fmt(i.sellingPrice)}</span>
          <span>${fmt(i.total)}</span>
        </div>
      `).join('')}
    </div>
    <div class="receipt-line receipt-total">
      <span>TOTAL</span>
      <span>${fmt(bill.totalAmount)}</span>
    </div>
    <p style="text-align:center;margin-top:16px;font-size:11px;color:var(--text-muted);">Thank you for shopping with us!</p>
  `;

  document.getElementById('receipt-modal').classList.add('active');
}

// ===== SALES HISTORY =====
async function loadSales() {
  try {
    const res = await fetch(`${API}/api/bills`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bills = await res.json();
    const tbody = document.getElementById('sales-body');

    if (bills.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No bills yet</td></tr>';
      return;
    }

    tbody.innerHTML = bills.map(b => `
      <tr>
        <td><span class="bill-id-link" onclick="viewBillReceipt('${escapeHTML(b.id)}')">#${escapeHTML(b.id.slice(0, 8).toUpperCase())}</span></td>
        <td>${escapeHTML(b.customerName)}</td>
        <td>${b.items.reduce((s, i) => s + i.quantity, 0)}</td>
        <td>${fmt(b.totalAmount)}</td>
        <td class="profit-positive">${fmt(b.totalProfit)}</td>
        <td>${escapeHTML(b.paymentMethod || 'Cash')}</td>
        <td>${fmtDate(b.createdAt)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="viewBillReceipt('${escapeHTML(b.id)}')">View</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Sales load error:', err);
  }
}

async function viewBillReceipt(billId) {
  try {
    const res = await fetch(`${API}/api/bills/${encodeURIComponent(billId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bill = await res.json();
    showReceipt(bill);
  } catch (err) {
    console.error('View bill error:', err);
    showToast('Failed to load bill', 'error');
  }
}
