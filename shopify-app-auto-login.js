/**
 * Shopify App (Website 1) - Auto-Login Implementation
 * 
 * This shows how to implement auto-login from a React Shopify app
 * to your Node.js order management system (Website 2)
 */

// ===== BACKEND (Node.js/Express) =====

const express = require('express');
const jwt = require('jsonwebtoken');
const { shopifyApp } = require('@shopify/shopify-app-express');

// JWT Configuration - MUST match Website 2
const JWT_SECRET = 'bcb4fb5a3fa28df971d164a62d7c97f957c5b3fa9817e99a72107da274c98c30';
const WEBSITE2_URL = 'https://flow.charitygreetingcards.com.au'; // Your Website 2 URL

/**
 * Generate JWT token for auto-login
 * @param {Object} user - User object from Shopify session
 * @returns {string} JWT token
 */
function generateAutoLoginToken(user) {
    const payload = {
        userId: user.id,
        username: user.username || user.email,
        shopDomain: user.shopDomain,
        purpose: 'auto-login',
        website: 'shopify-app',
        iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: '5m',
        issuer: 'shopify-app',
        audience: 'website2'
    });
}

// ===== SHOPIFY APP ROUTES =====

/**
 * API route to generate auto-login URL
 */
app.post('/api/generate-auto-login', async (req, res) => {
    try {
        const session = res.locals.shopify.session;

        if (!session) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Extract user info from Shopify session
        const user = {
            id: session.id,
            username: session.shop, // Use shop domain as username
            email: session.scope, // Or extract from shop info
            shopDomain: session.shop
        };

        // Generate JWT token
        const token = generateAutoLoginToken(user);

        // Create auto-login URL
        const autoLoginUrl = `${WEBSITE2_URL}/auto-login?token=${encodeURIComponent(token)}`;

        console.log(`Generated auto-login URL for shop: ${session.shop}`);

        res.json({
            success: true,
            autoLoginUrl: autoLoginUrl,
            expiresIn: '5 minutes'
        });

    } catch (error) {
        console.error('Auto-login generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate auto-login URL'
        });
    }
});

/**
 * Direct redirect route (alternative method)
 */
app.get('/redirect-to-order-management', async (req, res) => {
    try {
        const session = res.locals.shopify.session;

        if (!session) {
            return res.redirect('/auth'); // Redirect to Shopify auth
        }

        const user = {
            id: session.id,
            username: session.shop,
            shopDomain: session.shop
        };

        const token = generateAutoLoginToken(user);
        const autoLoginUrl = `${WEBSITE2_URL}/auto-login?token=${encodeURIComponent(token)}`;

        console.log(`Redirecting shop ${session.shop} to order management`);

        // Redirect to Website 2
        res.redirect(autoLoginUrl);

    } catch (error) {
        console.error('Auto-login redirect failed:', error);
        res.status(500).send('Auto-login failed. Please try again.');
    }
});

module.exports = { generateAutoLoginToken };
