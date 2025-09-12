// Test script to simulate Shopify webhook payload
// Run with: node test-webhook.js

const axios = require('axios');

// Test webhook payload simulating a Shopify order
const testOrderPayload = {
    id: 123456789,
    order_number: 1001,
    created_at: "2024-01-15T10:30:00-05:00",
    updated_at: "2024-01-15T10:30:00-05:00",
    processed_at: "2024-01-15T10:30:00-05:00",
    total_price: "29.99",
    subtotal_price: "25.99",
    total_tax: "4.00",
    currency: "USD",
    financial_status: "pending",
    fulfillment_status: null,
    tags: "",
    line_items: [
        {
            id: 987654321,
            variant_id: 123456789,
            title: "Custom Charity Product",
            quantity: 1,
            price: "25.99",
            properties: [
                {
                    name: "Choose your Charity",
                    value: "Act for kids"
                },
                {
                    name: "Choose your Greeting",
                    value: "Write your Own"
                },
                {
                    name: "Write your Own",
                    value: "Happy Birthday!"
                },
                {
                    name: "Select Font",
                    value: "Ashley Southine"
                },
                {
                    name: "Select Font Size",
                    value: "12 pts"
                }
            ]
        }
    ],
    customer: {
        id: 123456789,
        email: "test@example.com",
        first_name: "John",
        last_name: "Doe"
    }
};

// Function to create HMAC signature for webhook verification
function createWebhookSignature(payload, secret) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload), 'utf8');
    return hmac.digest('base64');
}

// Test function
async function testWebhook() {
    const webhookUrl = 'http://localhost:3000/webhook/orders/create';
    const webhookSecret = '8d22a403b70f0bc6dc4e88bcb40e59cb';

    try {
        console.log('🧪 Testing Shopify webhook...');
        console.log('📦 Test order payload:');
        console.log(`   Order ID: ${testOrderPayload.id}`);
        console.log(`   Charity: ${testOrderPayload.line_items[0].properties[0].value}`);

        // Create signature
        const signature = createWebhookSignature(testOrderPayload, webhookSecret);

        // Send webhook
        const response = await axios.post(webhookUrl, JSON.stringify(testOrderPayload), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Hmac-Sha256': signature,
                'X-Shopify-Topic': 'orders/create',
                'X-Shopify-Shop-Domain': 'test-shop.myshopify.com'
            }
        });

        console.log('✅ Webhook test successful!');
        console.log('📊 Response:', response.data);

    } catch (error) {
        console.error('❌ Webhook test failed:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    testWebhook();
}

module.exports = { testWebhook, testOrderPayload };
