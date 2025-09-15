const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());

// Custom middleware to handle webhook verification
app.use('/webhook', express.raw({ type: 'application/json', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

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
const emailTransporter = nodemailer.createTransporter(EMAIL_CONFIG);

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
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
  console.log(`🏥 Health check: GET /health`);
  console.log(`📧 Email functionality: ${process.env.EMAIL_USER ? 'Enabled' : 'Disabled'}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
