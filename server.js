const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https:"] // For PDF iframes
    },
  },
}));
app.use(cors());

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = '5m'; // 5 minutes for auto-login tokens

// Token blacklist for preventing replay attacks (in production, use Redis)
const tokenBlacklist = new Set();

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Enable secure cookies in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files (for logo and assets)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve temporary PDF files
app.use('/public/temp', express.static(path.join(__dirname, 'public', 'temp')));

// Custom middleware to handle webhook verification
app.use('/webhook', express.raw({ type: 'application/json', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Shopify configuration
const SHOPIFY_CONFIG = {
  shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
  apiVersion: '2024-01'
};

// Email configuration
const EMAIL_CONFIG = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

// Create email transporter
const emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);

// ApprovePro configuration
const APPROVEPRO_CONFIG = {
  apiKey: process.env.APPROVEPRO_API_KEY,
  baseUrl: process.env.APPROVEPRO_BASE_URL || 'https://app.approvepro.com/api/v1'
};

// Initialize SQLite database
const dbPath = path.join(__dirname, 'auth.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Initialize admin user
async function initializeAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Q<56K(*JZ';

  db.get('SELECT * FROM users WHERE username = ?', [adminUsername], async (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return;
    }

    if (!row) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      db.run('INSERT INTO users (username, password) VALUES (?, ?)',
        [adminUsername, hashedPassword],
        (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log(`✅ Admin user created: ${adminUsername}`);
          }
        }
      );
    }
  });
}

// Initialize admin user on startup
initializeAdminUser();

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.redirect('/login');
  }
}

// Check if user is already authenticated (for auto-login)
function checkExistingAuth(req, res, next) {
  if (req.session && req.session.userId) {
    // User is already logged in, redirect to dashboard
    return res.redirect('/dashboard');
  }
  // User not logged in, continue to auto-login process
  next();
}

// JWT Token validation functions
function verifyJWT(token) {
  try {
    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      throw new Error('Token has already been used');
    }

    // Verify token signature and expiry
    const decoded = jwt.verify(token, JWT_SECRET);

    // Validate required fields
    if (!decoded.userId && !decoded.username) {
      throw new Error('Invalid token: missing user identification');
    }

    // Check if token is not too old (additional safety check)
    const tokenAge = Date.now() / 1000 - decoded.iat;
    if (tokenAge > 5 * 60) { // 5 minutes in seconds
      throw new Error('Token has expired');
    }

    return decoded;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

function blacklistToken(token) {
  tokenBlacklist.add(token);

  // Clean up old tokens periodically (in production, handle this with Redis TTL)
  if (tokenBlacklist.size > 1000) {
    // Simple cleanup - in production, use proper cache with TTL
    const tokensArray = Array.from(tokenBlacklist);
    tokenBlacklist.clear();
    // Keep only recent half (this is a simple approach)
    tokensArray.slice(-500).forEach(t => tokenBlacklist.add(t));
  }
}

// Authentication functions
async function authenticateUser(username, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row && await bcrypt.compare(password, row.password)) {
        resolve(row);
      } else {
        resolve(null);
      }
    });
  });
}

// Verify webhook authenticity
function verifyWebhook(data, signature) {
  if (!SHOPIFY_CONFIG.webhookSecret) {
    console.warn('Webhook secret not configured, skipping verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', SHOPIFY_CONFIG.webhookSecret);
  hmac.update(data, 'utf8');
  const hash = hmac.digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// Extract charity value from line item properties
function extractCharityFromProperties(lineItems) {
  for (const item of lineItems) {
    if (item.properties && Array.isArray(item.properties)) {
      for (const property of item.properties) {
        if (property.name && property.name.toLowerCase().includes('charity')) {
          return property.value;
        }
      }
    }
  }
  return null;
}

// Update order tags using Shopify Admin API
async function updateOrderTags(orderId, charityValue) {
  try {
    const url = `https://${SHOPIFY_CONFIG.shopDomain}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${orderId}.json`;

    const response = await axios.put(url, {
      order: {
        id: orderId,
        tags: charityValue
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken,
        'Content-Type': 'application/json'
      }
    });

    console.log(`Successfully updated order ${orderId} with tag: ${charityValue}`);
    return response.data;
  } catch (error) {
    console.error(`Error updating order ${orderId}:`, error.response?.data || error.message);
    throw error;
  }
}

// Calculate donation amount (10% of order total)
function calculateDonationAmount(orderTotal) {
  const donationPercentage = 0.10; // 10%
  const donationAmount = parseFloat(orderTotal) * donationPercentage;
  return donationAmount.toFixed(2);
}

// Send donation confirmation email
async function sendDonationConfirmationEmail(customerEmail, orderNumber, donationAmount, charityName) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Charity Greeting Cards Pty Ltd <orders@charitygreetingcards.com.au>',
      to: customerEmail,
      subject: 'Thank you – your order has helped make a difference',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">Thank you – your order has helped make a difference</h2>
          
          <p>Dear Valued Customer,</p>
          
          <p>Thank you for supporting Australian Charities!</p>
          
          <p>We are proud to confirm that <strong>$${donationAmount}</strong> is to be donated to your chosen charity${charityName ? `: <strong>${charityName}</strong>` : ''}.</p>
          
          <p>Your order number: <strong>#${orderNumber}</strong></p>
          
          <p>Your generosity makes a real difference in the lives of those in need. Thank you for choosing to support Australian charities through your purchase.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          
          <p style="font-size: 12px; color: #666;">
            <strong>From:</strong> Charity Greeting Cards Pty Ltd - orders@charitygreetingcards.com.au<br>
            <a href="#" style="color: #666;">To stop receiving these notifications, click here: Unsubscribe</a>
          </p>
        </div>
      `,
      text: `
Thank you – your order has helped make a difference

Dear Valued Customer,

Thank you for supporting Australian Charities!

We are proud to confirm that $${donationAmount} is to be donated to your chosen charity${charityName ? `: ${charityName}` : ''}.

Your order number: #${orderNumber}

Your generosity makes a real difference in the lives of those in need. Thank you for choosing to support Australian charities through your purchase.

From: Charity Greeting Cards Pty Ltd - orders@charitygreetingcards.com.au
To stop receiving these notifications, click here: Unsubscribe
      `
    };

    const result = await emailTransporter.sendMail(mailOptions);
    console.log(`Donation confirmation email sent to ${customerEmail} for order #${orderNumber}`);
    return result;
  } catch (error) {
    console.error(`Error sending donation confirmation email to ${customerEmail}:`, error.message);
    throw error;
  }
}

// In-memory order storage (in production, use a database)
let orderStorage = new Map();

// Extract customily properties from line items
function extractCustomilyProperties(lineItems) {
  const properties = {};

  for (const item of lineItems) {
    if (item.properties && Array.isArray(item.properties)) {
      for (const property of item.properties) {
        if (property.name && property.value) {
          properties[property.name] = property.value;
        }
      }
    }
  }

  return properties;
}

// Store order data for dashboard
function storeOrderData(order) {
  const orderData = {
    id: order.id,
    orderNumber: order.order_number || order.name,
    customerName: order.customer?.first_name + ' ' + order.customer?.last_name || 'Unknown',
    customerEmail: order.customer?.email,
    totalPrice: order.total_price,
    createdAt: order.created_at,
    properties: extractCustomilyProperties(order.line_items || []),
    charityValue: extractCharityFromProperties(order.line_items || []),
    status: 'pending', // pending, sent_to_customer, approved
    sentAt: null,
    approveProOrderId: null
  };

  orderStorage.set(order.id.toString(), orderData);
  console.log(`Stored order ${order.id} in dashboard`);
  return orderData;
}

// Fetch orders from Shopify API
async function fetchOrdersFromShopify(limit = 50) {
  try {
    if (!SHOPIFY_CONFIG.accessToken || !SHOPIFY_CONFIG.shopDomain) {
      throw new Error('Shopify configuration missing');
    }

    const url = `https://${SHOPIFY_CONFIG.shopDomain}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders.json?limit=${limit}&status=any`;

    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken,
        'Content-Type': 'application/json'
      }
    });

    const orders = response.data.orders || [];
    console.log(`Fetched ${orders.length} orders from Shopify`);

    // Store each order in our system
    orders.forEach(order => {
      storeOrderData(order);
    });

    return orders;
  } catch (error) {
    console.error('Error fetching orders from Shopify:', error.response?.data || error.message);
    throw error;
  }
}

// Send design to customer via ApprovePro API
async function sendDesignToCustomer(orderId, customilPdfUrl, comment = '') {
  try {
    if (!APPROVEPRO_CONFIG.apiKey) {
      throw new Error('ApprovePro API key not configured');
    }

    const orderData = orderStorage.get(orderId);
    if (!orderData) {
      throw new Error('Order not found in storage');
    }

    // Get the ApprovePro order ID (assuming it's synced with Shopify order ID)
    const approveProOrderId = orderData.approveProOrderId || orderId;

    const response = await axios.post(
      `${APPROVEPRO_CONFIG.baseUrl}/orders/${approveProOrderId}/designs`,
      {
        comment: comment || `Design for order #${orderData.orderNumber}`,
        files: [customilPdfUrl],
        approval_mode: 'AS_ONE'
      },
      {
        headers: {
          'Authorization': `Bearer ${APPROVEPRO_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update order status
    orderData.status = 'sent_to_customer';
    orderData.sentAt = new Date().toISOString();
    orderStorage.set(orderId, orderData);

    console.log(`Successfully sent design to customer for order ${orderId}`);
    return response.data;
  } catch (error) {
    console.error(`Error sending design to customer for order ${orderId}:`, error.response?.data || error.message);
    throw error;
  }
}

// Auto-login endpoint for trusted external website
app.get('/auto-login', checkExistingAuth, async (req, res) => {
  try {
    const { token } = req.query;

    // Validate token presence
    if (!token) {
      console.warn('Auto-login attempted without token');
      return res.redirect('/login?error=missing_token');
    }

    console.log('Processing auto-login request...');

    // Verify and decode JWT token
    let decoded;
    try {
      decoded = verifyJWT(token);
    } catch (error) {
      console.error('JWT verification failed:', error.message);
      return res.redirect('/login?error=invalid_token');
    }

    // Blacklist the token immediately to prevent reuse
    blacklistToken(token);

    // Extract user information from token
    let user = null;

    if (decoded.userId) {
      // Look up user by ID
      user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE id = ?', [decoded.userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    } else if (decoded.username) {
      // Look up user by username
      user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE username = ?', [decoded.username], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }

    if (!user) {
      console.error('Auto-login failed: User not found', { userId: decoded.userId, username: decoded.username });
      return res.redirect('/login?error=user_not_found');
    }

    // Create secure session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.autoLogin = true; // Flag to indicate this was an auto-login
    req.session.loginTime = new Date().toISOString();

    console.log(`Auto-login successful for user: ${user.username} (ID: ${user.id})`);

    // Regenerate session ID for security
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration failed:', err);
        return res.redirect('/login?error=session_error');
      }

      // Restore session data after regeneration
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.autoLogin = true;
      req.session.loginTime = new Date().toISOString();

      // Save session and redirect to dashboard
      req.session.save((err) => {
        if (err) {
          console.error('Session save failed:', err);
          return res.redirect('/login?error=session_error');
        }

        console.log(`Auto-login completed successfully for ${user.username}`);
        res.redirect('/dashboard?auto_login=success');
      });
    });

  } catch (error) {
    console.error('Auto-login error:', error);
    res.redirect('/login?error=system_error');
  }
});

// Root route - redirect to dashboard
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Helper function for error messages
function getErrorMessage(errorCode) {
  const errorMessages = {
    '1': 'Invalid username or password',
    'missing_token': 'Auto-login failed: Missing authentication token',
    'invalid_token': 'Auto-login failed: Invalid or expired token',
    'user_not_found': 'Auto-login failed: User account not found',
    'session_error': 'Auto-login failed: Session error occurred',
    'system_error': 'Auto-login failed: System error occurred'
  };
  return errorMessages[errorCode] || 'An error occurred during login';
}

// Login page
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - Order Management</title>
        <link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen flex items-center justify-center">
        <div class="max-w-md w-full mx-4">
            <div class="bg-white rounded-lg shadow-xl p-8">
                <div class="text-center mb-8">
                    <div class="mx-auto mb-6">
                        <img src="/public/images/logo.png" alt="Charity Greeting Cards" class="mx-auto h-16 w-auto" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center" style="display: none;">
                            <i class="fas fa-heart text-2xl text-blue-600"></i>
                        </div>
                    </div>
                    <h1 class="text-2xl font-bold text-gray-900">Charity Greeting Cards</h1>
                    <p class="text-gray-600 mt-2">Order Management System</p>
                </div>

                ${req.query.error ? `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <div class="flex items-center">
                            <i class="fas fa-exclamation-circle text-red-500 mr-2"></i>
                            <span class="text-red-700 text-sm">${getErrorMessage(req.query.error)}</span>
                        </div>
                    </div>
                ` : ''}

                <form method="POST" action="/login" class="space-y-6">
                    <div>
                        <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
                            <i class="fas fa-user mr-2"></i>Username
                        </label>
                        <input 
                            type="text" 
                            id="username" 
                            name="username" 
                            required
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                            placeholder="Enter your username"
                        >
                    </div>

                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
                            <i class="fas fa-lock mr-2"></i>Password
                        </label>
                        <input 
                            type="password" 
                            id="password" 
                            name="password" 
                            required
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                            placeholder="Enter your password"
                        >
                    </div>

                    <button 
                        type="submit" 
                        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
                    >
                        <i class="fas fa-sign-in-alt mr-2"></i>
                        Sign In
                    </button>
                </form>

                <div class="mt-8 text-center">
                    <p class="text-xs text-gray-500">
                        © Charity Greeting Cards Pty Ltd - Secure Order Management System
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Login handler
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.redirect('/login?error=1');
    }

    const user = await authenticateUser(username, password);

    if (user) {
      req.session.userId = user.id;
      req.session.username = user.username;
      res.redirect('/dashboard');
    } else {
      res.redirect('/login?error=1');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.redirect('/login?error=1');
  }
});

// Logout handler
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

// Change password endpoint (protected)
app.post('/api/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Verify current password
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user || !await bcrypt.compare(currentPassword, user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`Password updated for user ${user.username}`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Dashboard endpoint - serve the main UI (protected)
app.get('/dashboard', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Management Dashboard - Charity Greeting Cards</title>
        <link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">
        <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            .pdf-viewer { height: 600px; }
            .status-badge { @apply px-3 py-1 rounded-full text-sm font-medium; }
            .status-pending { @apply bg-yellow-100 text-yellow-800; }
            .status-sent { @apply bg-blue-100 text-blue-800; }
            .status-approved { @apply bg-green-100 text-green-800; }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div x-data="orderDashboard()" x-init="loadOrders()" class="container mx-auto px-4 py-8">
            <!-- Auto-login success message -->
            ${req.query.auto_login === 'success' ? `
                <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <div class="flex items-center">
                        <i class="fas fa-check-circle text-green-500 mr-2"></i>
                        <span class="text-green-700 text-sm">Successfully logged in via secure auto-login</span>
                    </div>
                </div>
            ` : ''}

            <!-- Header -->
            <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div>
                            <img src="/public/images/logo.png" alt="Charity Greeting Cards" class="h-12 w-auto" onerror="this.style.display='none';">
                        </div>
                        <div>
                            <h1 class="text-3xl font-bold text-gray-900">Order Management Dashboard</h1>
                            <p class="text-gray-600 mt-2">Charity Greeting Cards - Manage orders and send designs</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4">
                        <form method="POST" action="/logout" class="inline">
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-200 flex items-center">
                                <i class="fas fa-sign-out-alt mr-2"></i>
                                Logout
                            </button>
                        </form>
                    </div>
                </div>
            </div>


            <!-- Orders Table -->
            <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-semibold text-gray-900">Recent Orders</h2>
                        <div class="flex items-center space-x-4">
                            <div class="relative">
                                <input 
                                    type="text" 
                                    x-model="searchTerm" 
                                    @input.debounce.500ms="filterOrders()"
                                    placeholder="Search orders..." 
                                    class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
                                >
                                <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                            </div>
                            <select x-model="statusFilter" @change="filterOrders()" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                <option value="">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="awaiting_design">Awaiting Design</option>
                                <option value="design_ready">Design Ready</option>
                                <option value="sent_to_customer">Sent to Customer</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="draft">Draft</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-sm text-gray-500">
                        <span x-text="'Showing ' + orders.length + ' of ' + totalOrders + ' orders'"></span>
                        <div class="flex items-center space-x-2">
                            <span>Show:</span>
                            <select x-model="pageSize" @change="changePageSize()" class="border border-gray-300 rounded px-2 py-1 text-sm">
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                            <span>per page</span>
                        </div>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Charity</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <tr x-show="loading">
                                <td colspan="6" class="px-6 py-8 text-center">
                                    <div class="flex items-center justify-center">
                                        <i class="fas fa-spinner fa-spin text-blue-600 mr-2"></i>
                                        <span class="text-gray-500">Loading orders...</span>
                                    </div>
                                </td>
                            </tr>
                            <template x-for="order in orders" :key="order.id">
                                <tr class="hover:bg-gray-50 cursor-pointer" @click="viewOrder(order)">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900" x-text="'#' + order.orderNumber"></div>
                                        <div class="text-sm text-gray-500" x-text="formatDate(order.createdAt)"></div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900" x-text="order.customerName"></div>
                                        <div class="text-sm text-gray-500" x-text="order.customerEmail"></div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-900" x-text="order.charityValue || 'Not specified'"></div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900" x-text="'$' + order.totalPrice"></div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="status-badge" :class="getStatusClass(order.status)" x-text="getStatusText(order.status)"></span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button @click.stop="viewOrder(order)" class="text-blue-600 hover:text-blue-900 mr-3">
                                            <i class="fas fa-eye"></i> View
                                        </button>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
                <!-- Pagination -->
                <div class="px-6 py-4 border-t border-gray-200" x-show="totalPages > 1">
                    <div class="flex items-center justify-between">
                        <div class="text-sm text-gray-500">
                            <span x-text="'Page ' + currentPage + ' of ' + totalPages"></span>
                        </div>
                        <div class="flex items-center space-x-1">
                            <!-- Previous Button -->
                            <button 
                                @click="changePage(currentPage - 1)" 
                                :disabled="currentPage === 1 || loading"
                                class="px-3 py-1 rounded border disabled:bg-gray-100 disabled:text-gray-400 hover:bg-gray-50"
                            >
                                <i class="fas fa-angle-left"></i>
                            </button>
                            
                            <!-- Page Numbers -->
                            <template x-for="page in getPageNumbers()" :key="page">
                                <button 
                                    @click="changePage(page)" 
                                    :disabled="loading"
                                    :class="page === currentPage ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'"
                                    class="px-3 py-1 rounded border font-medium transition duration-200"
                                    x-text="page"
                                ></button>
                            </template>
                            
                            <!-- Next Button -->
                            <button 
                                @click="changePage(currentPage + 1)" 
                                :disabled="currentPage === totalPages || loading"
                                class="px-3 py-1 rounded border disabled:bg-gray-100 disabled:text-gray-400 hover:bg-gray-50"
                            >
                                <i class="fas fa-angle-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Order Detail Modal -->
            <div x-show="selectedOrder" x-transition class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="display: none;">
                <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-screen overflow-y-auto">
                    <div class="p-6 border-b border-gray-200">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="text-lg font-semibold text-gray-900" x-text="selectedOrder ? 'Order #' + selectedOrder.orderNumber : ''"></h3>
                                <p class="text-sm text-gray-500" x-text="selectedOrder ? selectedOrder.customerName + ' • ' + selectedOrder.customerEmail : ''"></p>
                            </div>
                            <button @click="selectedOrder = null" class="text-gray-400 hover:text-gray-600">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-6" x-show="selectedOrder">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <!-- Order Details -->
                            <div>
                                <h4 class="text-lg font-medium text-gray-900 mb-4">Order Details</h4>
                                <div class="space-y-3">
                                    <div class="flex justify-between">
                                        <span class="text-sm text-gray-500">Order Number:</span>
                                        <span class="text-sm font-medium" x-text="selectedOrder ? '#' + selectedOrder.orderNumber : ''"></span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-sm text-gray-500">Total Amount:</span>
                                        <span class="text-sm font-medium" x-text="selectedOrder ? '$' + selectedOrder.totalPrice : ''"></span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-sm text-gray-500">Charity:</span>
                                        <span class="text-sm font-medium" x-text="selectedOrder ? (selectedOrder.charityValue || 'Not specified') : ''"></span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-sm text-gray-500">Status:</span>
                                        <span class="status-badge" :class="selectedOrder ? getStatusClass(selectedOrder.status) : ''" x-text="selectedOrder ? getStatusText(selectedOrder.status) : ''"></span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-sm text-gray-500">Created:</span>
                                        <span class="text-sm font-medium" x-text="selectedOrder ? formatDate(selectedOrder.createdAt) : ''"></span>
                                    </div>
                                </div>

                                <!-- Customily Properties -->
                                <div class="mt-6" x-show="selectedOrder && selectedOrder.properties">
                                    <h5 class="text-md font-medium text-gray-900 mb-3">Design Properties</h5>
                                    <div class="space-y-2">
                                        <template x-for="[key, value] in Object.entries(selectedOrder?.properties || {})" :key="key">
                                            <div class="flex justify-between text-sm" x-show="!key.startsWith('_customily-') || key === '_customily-eps-name'">
                                                <span class="text-gray-500" x-text="key"></span>
                                                <span class="font-medium" x-text="value"></span>
                                            </div>
                                        </template>
                                    </div>
                                </div>

                                <!-- Action Buttons -->
                                <div class="mt-8" x-show="selectedOrder && selectedOrder.properties && selectedOrder.properties['_customily-production-url']">
                                    <!-- Send Button for Pending/Awaiting Design -->
                                    <button 
                                        x-show="selectedOrder?.status === 'pending' || selectedOrder?.status === 'awaiting_design'"
                                        @click="sendToCustomer(selectedOrder)" 
                                        :disabled="sendingToCustomer"
                                        class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
                                    >
                                        <i class="fas fa-paper-plane mr-2" x-show="!sendingToCustomer"></i>
                                        <i class="fas fa-spinner fa-spin mr-2" x-show="sendingToCustomer"></i>
                                        <span x-show="!sendingToCustomer">Send to Customer</span>
                                        <span x-show="sendingToCustomer">Sending...</span>
                                    </button>

                                    <!-- Reject Button for Design Ready -->
                                    <button 
                                        x-show="selectedOrder?.status === 'design_ready'"
                                        @click="rejectDesign(selectedOrder)" 
                                        :disabled="sendingToCustomer"
                                        class="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
                                    >
                                        <i class="fas fa-times mr-2" x-show="!sendingToCustomer"></i>
                                        <i class="fas fa-spinner fa-spin mr-2" x-show="sendingToCustomer"></i>
                                        <span x-show="!sendingToCustomer">Reject Design</span>
                                        <span x-show="sendingToCustomer">Rejecting...</span>
                                    </button>

                                    <!-- Status Messages for Final States -->
                                    <div 
                                        x-show="!['pending', 'awaiting_design', 'design_ready'].includes(selectedOrder?.status)"
                                        class="w-full bg-green-100 text-green-800 font-medium py-3 px-4 rounded-lg flex items-center justify-center border border-green-200"
                                    >
                                        <i class="fas fa-check-circle mr-2"></i>
                                        <span x-show="selectedOrder?.status === 'approved'">Design Approved by Customer</span>
                                        <span x-show="selectedOrder?.status === 'rejected'">Design Rejected by Customer</span>
                                        <span x-show="selectedOrder?.status === 'sent_to_customer'">Design Already Sent to Customer</span>
                                        <span x-show="selectedOrder?.status === 'draft'">Design in Draft Status</span>
                                        <span x-show="!['approved', 'rejected', 'sent_to_customer', 'draft'].includes(selectedOrder?.status)">Design Processing Complete</span>
                                    </div>
                                </div>
                            </div>

                            <!-- PDF Preview -->
                            <div x-show="selectedOrder && selectedOrder.properties && selectedOrder.properties['_customily-production-url']">
                                <h4 class="text-lg font-medium text-gray-900 mb-4">Design Preview</h4>
                                <div class="border rounded-lg overflow-hidden">
                                    <iframe 
                                        :src="selectedOrder?.properties['_customily-production-url']" 
                                        class="w-full pdf-viewer"
                                        frameborder="0">
                                    </iframe>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            function orderDashboard() {
                return {
                    orders: [],
                    selectedOrder: null,
                    sendingToCustomer: false,
                    loading: false,
                    searchTerm: '',
                    statusFilter: '',
                    currentPage: 1,
                    pageSize: 25,
                    totalPages: 1,
                    totalOrders: 0,

                    async loadOrders() {
                        this.loading = true;
                        try {
                            const params = new URLSearchParams({
                                page: this.currentPage,
                                pageSize: this.pageSize,
                                search: this.searchTerm,
                                status: this.statusFilter
                            });

                            console.log('Loading orders from Shopify via AJAX...');
                            const response = await fetch('/api/orders?' + params);
                            
                            if (response.ok) {
                                const data = await response.json();
                                this.orders = data.orders;
                                this.totalPages = data.pagination.totalPages;
                                this.totalOrders = data.pagination.totalOrders;
                                console.log('Loaded orders:', this.orders.length, 'of', this.totalOrders);
                            } else {
                                console.error('Failed to load orders:', response.statusText);
                            }
                        } catch (error) {
                            console.error('Error loading orders:', error);
                        } finally {
                            this.loading = false;
                        }
                    },

                    async filterOrders() {
                        this.currentPage = 1;
                        await this.loadOrders();
                    },

                    async changePage(newPage) {
                        this.currentPage = newPage;
                        await this.loadOrders();
                    },

                    async changePageSize() {
                        this.currentPage = 1;
                        await this.loadOrders();
                    },


                    viewOrder(order) {
                        this.selectedOrder = order;
                    },

                    async sendToCustomer(order) {
                        if (!order.properties['_customily-production-url']) {
                            alert('No design file found for this order');
                            return;
                        }

                        this.sendingToCustomer = true;
                        try {
                            const response = await fetch('/api/orders/' + order.id + '/send-to-customer', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    pdfUrl: order.properties['_customily-production-url']
                                })
                            });

                            if (response.ok) {
                                // Refresh the order data to get updated status from ApprovePro
                                await this.loadOrders();
                                alert('Design sent to customer successfully!');
                                // Close the modal to show updated table
                                this.selectedOrder = null;
                            } else {
                                const error = await response.json();
                                alert('Error: ' + error.message);
                            }
                        } catch (error) {
                            console.error('Error sending to customer:', error);
                            alert('Error sending design to customer');
                        } finally {
                            this.sendingToCustomer = false;
                        }
                    },

                    async rejectDesign(order) {
                        if (!confirm('Are you sure you want to reject this design? This action cannot be undone.')) {
                            return;
                        }

                        this.sendingToCustomer = true;
                        try {
                            const response = await fetch('/api/orders/' + order.id + '/reject', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });

                            if (response.ok) {
                                // Refresh the order data to get updated status
                                await this.loadOrders();
                                alert('Design rejected successfully!');
                                // Close the modal to show updated table
                                this.selectedOrder = null;
                            } else {
                                const error = await response.json();
                                alert('Error: ' + error.message);
                            }
                        } catch (error) {
                            console.error('Error rejecting design:', error);
                            alert('Error rejecting design');
                        } finally {
                            this.sendingToCustomer = false;
                        }
                    },


                    getStatusClass(status) {
                        switch(status) {
                            case 'pending': return 'status-pending';
                            case 'awaiting_design': return 'status-pending';
                            case 'design_ready': return 'bg-purple-100 text-purple-800';
                            case 'sent_to_customer': return 'status-sent';
                            case 'approved': return 'status-approved';
                            case 'rejected': return 'bg-red-100 text-red-800';
                            case 'draft': return 'bg-gray-100 text-gray-800';
                            default: return 'status-pending';
                        }
                    },

                    getStatusText(status) {
                        switch(status) {
                            case 'pending': return 'Pending';
                            case 'awaiting_design': return 'Awaiting Design';
                            case 'design_ready': return 'Design Ready';
                            case 'sent_to_customer': return 'Sent to Customer';
                            case 'approved': return 'Approved';
                            case 'rejected': return 'Rejected';
                            case 'draft': return 'Draft';
                            default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
                        }
                    },

                    getPageNumbers() {
                        const pages = [];
                        const maxVisible = 5;
                        let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
                        let end = Math.min(this.totalPages, start + maxVisible - 1);
                        
                        // Adjust start if we're near the end
                        if (end - start + 1 < maxVisible) {
                            start = Math.max(1, end - maxVisible + 1);
                        }
                        
                        for (let i = start; i <= end; i++) {
                            pages.push(i);
                        }
                        
                        return pages;
                    },

                    formatDate(dateString) {
                        return new Date(dateString).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    }
                }
            }
        </script>
    </body>
    </html>
  `);
});

// Get ApprovePro order status
async function getApproveProOrderStatus(orderId) {
  try {
    if (!APPROVEPRO_CONFIG.apiKey) {
      return 'pending'; // Default if no API key
    }

    const response = await axios.get(
      `${APPROVEPRO_CONFIG.baseUrl}/orders/${orderId}`,
      {
        headers: {
          'Authorization': `Bearer ${APPROVEPRO_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const approveProOrder = response.data;

    // Return the exact ApprovePro status
    const status = approveProOrder.status || 'Pending';

    // Map common ApprovePro statuses to display names
    switch (status) {
      case 'Approved':
        return 'approved';
      case 'Rejected':
        return 'rejected';
      case 'Awaiting Design':
        return 'awaiting_design';
      case 'Design Ready':
        return 'design_ready';
      case 'Pending':
        return 'pending';
      case 'Draft':
        return 'draft';
      default:
        return status.toLowerCase().replace(/\s+/g, '_');
    }
  } catch (error) {
    // If order doesn't exist in ApprovePro or API error, assume pending
    console.log(`ApprovePro status check failed for order ${orderId}: ${error.message}`);
    return 'pending';
  }
}

// API endpoint to get paginated orders from Shopify (protected)
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 25;
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';

    console.log(`Fetching orders from Shopify - Page: ${page}, Size: ${pageSize}, Search: "${search}", Status: "${statusFilter}"`);

    if (!SHOPIFY_CONFIG.accessToken || !SHOPIFY_CONFIG.shopDomain) {
      return res.status(500).json({ error: 'Shopify configuration missing' });
    }

    // Fetch more orders to allow for filtering
    const fetchLimit = Math.max(pageSize * 10, 250); // Fetch extra to allow filtering
    const url = `https://${SHOPIFY_CONFIG.shopDomain}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders.json?limit=${fetchLimit}&status=any`;

    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken,
        'Content-Type': 'application/json'
      }
    });

    const shopifyOrders = response.data.orders || [];
    console.log(`Fetched ${shopifyOrders.length} orders from Shopify`);

    // Transform all orders first
    const allOrders = await Promise.all(shopifyOrders.map(async (order) => {
      const properties = extractCustomilyProperties(order.line_items || []);
      const charityValue = extractCharityFromProperties(order.line_items || []);

      // Get ApprovePro status for this order (only for first batch to avoid too many API calls)
      const approveProStatus = shopifyOrders.indexOf(order) < 50 ? await getApproveProOrderStatus(order.id) : 'pending';

      return {
        id: order.id,
        orderNumber: order.order_number || order.name,
        customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Unknown',
        customerEmail: order.customer?.email,
        totalPrice: order.total_price,
        createdAt: order.created_at,
        properties: properties,
        charityValue: charityValue,
        status: approveProStatus,
        sentAt: approveProStatus === 'sent_to_customer' ? order.updated_at : null,
        approveProOrderId: order.id
      };
    }));

    // Apply filters
    let filteredOrders = allOrders;

    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrders = filteredOrders.filter(order =>
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.customerName.toLowerCase().includes(searchLower) ||
        order.customerEmail?.toLowerCase().includes(searchLower) ||
        order.charityValue?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by status
    if (statusFilter) {
      filteredOrders = filteredOrders.filter(order => order.status === statusFilter);
    }

    // Calculate pagination
    const totalOrders = filteredOrders.length;
    const totalPages = Math.ceil(totalOrders / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);


    console.log(`Returning page ${page}/${totalPages} with ${paginatedOrders.length} orders`);

    res.json({
      orders: paginatedOrders,
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalPages: totalPages,
        totalOrders: totalOrders,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        search: search,
        status: statusFilter
      }
    });
  } catch (error) {
    console.error('Error fetching orders from Shopify:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch orders from Shopify' });
  }
});

// Function to download and rename PDF
async function downloadAndRenamePdf(originalUrl, newFilename) {
  try {

    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download the PDF
    const response = await axios.get(originalUrl, { responseType: 'stream' });

    // Save with new filename
    const tempFilePath = path.join(tempDir, newFilename);
    const writer = fs.createWriteStream(tempFilePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`PDF downloaded and renamed to ${newFilename}`);
        resolve(tempFilePath);
      });
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading/renaming PDF:', error);
    throw error;
  }
}

// Function to upload PDF to a temporary hosting service (or return original URL with renamed reference)
async function getPublicPdfUrl(localFilePath, filename) {
  try {
    // For now, we'll use the original URL but with a renamed reference
    // In a production environment, you might want to upload to a cloud storage service

    // Option 1: Return original URL (ApprovePro will handle the filename)
    // Option 2: Upload to cloud storage and return new URL
    // Option 3: Serve from local server temporarily

    // For now, let's serve it from our local server
    const publicDir = path.join(__dirname, 'public', 'temp');

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const publicFilePath = path.join(publicDir, filename);
    fs.copyFileSync(localFilePath, publicFilePath);

    // Return the public URL
    const publicUrl = `https://flow.charitygreetingcards.com.au/public/temp/${filename}`;
    console.log(`PDF available at: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error('Error creating public PDF URL:', error);
    throw error;
  }
}

// API endpoint to send design to customer (protected)
app.post('/api/orders/:orderId/send-to-customer', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pdfUrl, comment } = req.body;

    if (!pdfUrl) {
      return res.status(400).json({ error: 'PDF URL is required' });
    }

    if (!APPROVEPRO_CONFIG.apiKey) {
      return res.status(500).json({ error: 'ApprovePro API key not configured' });
    }

    console.log(`Processing design for order ${orderId}...`);

    // Download and rename PDF with order ID
    const newFilename = `${orderId}.pdf`;
    const localFilePath = await downloadAndRenamePdf(pdfUrl, newFilename);

    // Get public URL for the renamed PDF
    const renamedPdfUrl = await getPublicPdfUrl(localFilePath, newFilename);

    // Send to ApprovePro with renamed PDF
    const response = await axios.post(
      `${APPROVEPRO_CONFIG.baseUrl}/orders/${orderId}/designs`,
      {
        comment: comment || `Design for order #${orderId}`,
        files: [renamedPdfUrl],
        approval_mode: 'AS_ONE'
      },
      {
        headers: {
          'Authorization': `Bearer ${APPROVEPRO_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Successfully sent design to customer for order ${orderId} with filename ${newFilename}`);

    // Clean up temporary files
    try {
      fs.unlinkSync(localFilePath);
    } catch (cleanupError) {
      console.warn('Could not clean up temp file:', cleanupError.message);
    }

    res.json({ success: true, message: 'Design sent to customer successfully', data: response.data });
  } catch (error) {
    console.error('Error sending design to customer:', error);
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

// API endpoint to reject design (protected)
app.post('/api/orders/:orderId/reject', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { comment } = req.body;

    if (!APPROVEPRO_CONFIG.apiKey) {
      return res.status(500).json({ error: 'ApprovePro API key not configured' });
    }

    // Note: ApprovePro API doesn't seem to have a direct reject endpoint
    // This is a placeholder - you might need to check ApprovePro documentation
    // for the correct way to reject designs. For now, we'll log the rejection.

    console.log(`Design rejection requested for order ${orderId}`);

    // You might need to implement this based on ApprovePro's actual reject API
    // For now, we'll return success and let the status check handle the update

    res.json({ success: true, message: 'Design rejection processed' });
  } catch (error) {
    console.error('Error rejecting design:', error);
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

// Webhook endpoint for order creation
app.post('/webhook/orders/create', (req, res) => {
  try {
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = req.body;

    // Verify webhook authenticity
    if (!verifyWebhook(rawBody, signature)) {
      console.error('Webhook verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const order = JSON.parse(rawBody);
    console.log(`Processing order ${order.id}...`);

    // Store order data for dashboard
    storeOrderData(order);

    // Extract charity value from line items
    const charityValue = extractCharityFromProperties(order.line_items || []);

    if (charityValue) {
      console.log(`Found charity value: ${charityValue}`);

      // Update order with charity tag
      updateOrderTags(order.id, charityValue)
        .then(() => {
          console.log(`Order ${order.id} tagged successfully with: ${charityValue}`);
        })
        .catch((error) => {
          console.error(`Failed to tag order ${order.id}:`, error.message);
        });
    } else {
      console.log(`No charity value found in order ${order.id}`);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      orderId: order.id,
      charityValue: charityValue || 'Not found'
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Webhook endpoint for order updates (optional)
app.post('/webhook/orders/updated', (req, res) => {
  try {
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = req.body;

    // Verify webhook authenticity
    if (!verifyWebhook(rawBody, signature)) {
      console.error('Webhook verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const order = JSON.parse(rawBody);
    console.log(`Processing order update ${order.id}...`);

    // Extract charity value from line items
    const charityValue = extractCharityFromProperties(order.line_items || []);

    if (charityValue && !order.tags?.includes(charityValue)) {
      console.log(`Found charity value: ${charityValue}`);

      // Update order with charity tag
      updateOrderTags(order.id, charityValue)
        .then(() => {
          console.log(`Order ${order.id} tagged successfully with: ${charityValue}`);
        })
        .catch((error) => {
          console.error(`Failed to tag order ${order.id}:`, error.message);
        });
    } else {
      console.log(`No charity value found or already tagged in order ${order.id}`);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      orderId: order.id,
      charityValue: charityValue || 'Not found'
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Webhook endpoint for order fulfillment (donation confirmation email)
app.post('/webhook/orders/fulfilled', (req, res) => {
  try {
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = req.body;

    // Verify webhook authenticity
    if (!verifyWebhook(rawBody, signature)) {
      console.error('Webhook verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const order = JSON.parse(rawBody);
    console.log(`Processing order fulfillment ${order.id}...`);

    // Extract customer email and order details
    const customerEmail = order.customer?.email;
    const orderNumber = order.order_number || order.name;
    const orderTotal = order.total_price;

    if (customerEmail) {
      // Extract charity value from line items
      const charityValue = extractCharityFromProperties(order.line_items || []);

      // Calculate donation amount (10% of order total)
      const donationAmount = calculateDonationAmount(orderTotal);

      console.log(`Sending donation confirmation email to ${customerEmail} for order #${orderNumber}`);
      console.log(`Donation amount: $${donationAmount} to charity: ${charityValue || 'Not specified'}`);

      // Send donation confirmation email
      sendDonationConfirmationEmail(customerEmail, orderNumber, donationAmount, charityValue)
        .then(() => {
          console.log(`Donation confirmation email sent successfully to ${customerEmail}`);
        })
        .catch((error) => {
          console.error(`Failed to send donation confirmation email to ${customerEmail}:`, error.message);
        });
    } else {
      console.log(`No customer email found for order ${order.id}`);
    }

    res.status(200).json({
      success: true,
      message: 'Fulfillment webhook processed successfully',
      orderId: order.id,
      orderNumber: orderNumber,
      customerEmail: customerEmail || 'Not found',
      donationAmount: orderTotal ? calculateDonationAmount(orderTotal) : 'N/A'
    });

  } catch (error) {
    console.error('Error processing fulfillment webhook:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Shopify Tag Automation Server running on port ${PORT}`);
  console.log(`📡 Webhook endpoints:`);
  console.log(`   POST /webhook/orders/create`);
  console.log(`   POST /webhook/orders/updated`);
  console.log(`   POST /webhook/orders/fulfilled`);
  console.log(`🎨 Dashboard: GET /dashboard`);
  console.log(`📊 API endpoints:`);
  console.log(`   GET /api/orders`);
  console.log(`   POST /api/orders/:orderId/send-to-customer`);
  console.log(`🏥 Health check: GET /health`);
  console.log(`📧 Email functionality: ${process.env.EMAIL_USER ? 'Enabled' : 'Disabled'}`);
  console.log(`🔗 ApprovePro integration: ${process.env.APPROVEPRO_API_KEY ? 'Enabled' : 'Disabled'}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
