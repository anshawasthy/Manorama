/**
 * Google Apps Script for Manorama Inventory & POS
 * 
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code, replacing everything in Code.gs
 * 4. Click "Deploy" > "New deployment"
 * 5. Type: "Web App"
 * 6. Execute as: "Me"
 * 7. Who has access: "Anyone"
 * 8. Copy the Web App URL and put it in client/config.js
 */

const SPREADSHEET_ID = '1AfnjHVhRTtJaSSKW9cCeXi7N-f5mZY7E1x_Nro5ATLw';

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const payload = request.payload || {};
    
    let result = {};
    if (action === 'GET_PRODUCTS') result = getProducts();
    else if (action === 'CREATE_PRODUCT') result = createProduct(payload);
    else if (action === 'UPDATE_PRODUCT') result = updateProduct(payload);
    else if (action === 'DELETE_PRODUCT') result = deleteProduct(payload);
    else if (action === 'GET_BILLS') result = getBills();
    else if (action === 'CREATE_BILL') result = createBill(payload);
    else throw new Error('Unknown action: ' + action);

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Ensure CORS preflight OPTIONS requests succeed
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON);
}

// --------------------------- INVENTORY ---------------------------
function getInventorySheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Inventory');
  if (!sheet) {
    sheet = ss.insertSheet('Inventory');
    sheet.appendRow(['ID', 'Name', 'Cost Price', 'Selling Price', 'Quantity', 'Image', 'Created At', 'Updated At']);
  }
  return sheet;
}

function getProducts() {
  const sheet = getInventorySheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const products = [];
  
  for (let i = 1; i < data.length; i++) {
    products.push({
      id: data[i][0],
      name: data[i][1],
      costPrice: parseFloat(data[i][2]),
      sellingPrice: parseFloat(data[i][3]),
      quantity: parseInt(data[i][4], 10),
      image: data[i][5],
      createdAt: data[i][6],
      updatedAt: data[i][7]
    });
  }
  return products;
}

function createProduct(payload) {
  const sheet = getInventorySheet();
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  
  sheet.appendRow([
    id,
    payload.name,
    payload.costPrice,
    payload.sellingPrice,
    payload.quantity,
    payload.imageBase64 || '',
    now,
    now
  ]);
  
  return { id, message: 'Product created successfully' };
}

function updateProduct(payload) {
  const sheet = getInventorySheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.id) {
      if (payload.name !== undefined) sheet.getRange(i + 1, 2).setValue(payload.name);
      if (payload.costPrice !== undefined) sheet.getRange(i + 1, 3).setValue(payload.costPrice);
      if (payload.sellingPrice !== undefined) sheet.getRange(i + 1, 4).setValue(payload.sellingPrice);
      if (payload.quantity !== undefined) sheet.getRange(i + 1, 5).setValue(payload.quantity);
      if (payload.imageBase64 !== undefined) sheet.getRange(i + 1, 6).setValue(payload.imageBase64);
      sheet.getRange(i + 1, 8).setValue(new Date().toISOString());
      return { message: 'Product updated' };
    }
  }
  throw new Error('Product not found');
}

function deleteProduct(payload) {
  const sheet = getInventorySheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.id) {
      sheet.deleteRow(i + 1);
      return { message: 'Product deleted' };
    }
  }
  throw new Error('Product not found');
}

// --------------------------- SALES ---------------------------
function getSalesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Sales');
  if (!sheet) {
    sheet = ss.insertSheet('Sales');
    sheet.appendRow(['ID', 'Customer Name', 'Payment Method', 'Total Amount', 'Total Profit', 'Items JSON', 'Created At']);
  }
  return sheet;
}

function getBills() {
  const sheet = getSalesSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const bills = [];
  for (let i = 1; i < data.length; i++) {
    bills.push({
      id: data[i][0],
      customerName: data[i][1],
      paymentMethod: data[i][2],
      totalAmount: parseFloat(data[i][3]),
      totalProfit: parseFloat(data[i][4]),
      items: JSON.parse(data[i][5] || '[]'),
      createdAt: data[i][6]
    });
  }
  return bills.reverse();
}

function createBill(payload) {
  const salesSheet = getSalesSheet();
  const invSheet = getInventorySheet();
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  
  // 1. Deduct Stock in Inventory
  const invData = invSheet.getDataRange().getValues();
  payload.items.forEach(item => {
    for (let i = 1; i < invData.length; i++) {
      if (invData[i][0] === item.productId) {
        let currentQty = parseInt(invData[i][4], 10);
        invSheet.getRange(i + 1, 5).setValue(currentQty - item.quantity);
        break;
      }
    }
  });
  
  // 2. Record Sale in Sales 
  salesSheet.appendRow([
    id,
    payload.customerName || 'Walk-in Customer',
    payload.paymentMethod || 'Cash',
    payload.totalAmount,
    payload.totalProfit,
    JSON.stringify(payload.items),
    now
  ]);
  
  return { id, message: 'Bill generated successfully' };
}
