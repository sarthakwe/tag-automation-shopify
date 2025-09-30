#!/usr/bin/env node

/**
 * Test script for auto-login functionality
 * This script generates a test JWT token and provides a test URL
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Generate a test auto-login token
 */
function generateTestToken(userId = 1, username = 'admin') {
    try {
        const payload = {
            userId: userId,
            username: username,
            purpose: 'auto-login',
            website: 'website1',
            iat: Math.floor(Date.now() / 1000)
        };

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: '5m',
            issuer: 'website1',
            audience: 'website2'
        });

        return token;
    } catch (error) {
        console.error('Error generating test token:', error.message);
        throw error;
    }
}

/**
 * Test token verification
 */
function testTokenVerification(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('✅ Token verification successful');
        console.log('   Decoded payload:', JSON.stringify(decoded, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);
        return false;
    }
}

/**
 * Main test function
 */
function runAutoLoginTest() {
    console.log('🔧 Auto-Login Test Script');
    console.log('==========================');
    console.log();

    // Test with default admin user
    console.log('1. Generating test token for admin user...');
    const token = generateTestToken(1, 'admin');
    console.log('✅ Token generated successfully');
    console.log('   Token length:', token.length, 'characters');
    console.log();

    // Test token verification
    console.log('2. Testing token verification...');
    const isValid = testTokenVerification(token);
    console.log();

    if (isValid) {
        // Generate test URL
        const testUrl = `${BASE_URL}/auto-login?token=${encodeURIComponent(token)}`;

        console.log('3. Test URL generated:');
        console.log('🔗', testUrl);
        console.log();

        console.log('4. Testing instructions:');
        console.log('   • Copy the URL above');
        console.log('   • Paste it in your browser');
        console.log('   • You should be redirected to /dashboard?auto_login=success');
        console.log('   • The token can only be used once (replay protection)');
        console.log('   • The token expires in 5 minutes');
        console.log();

        console.log('5. Expected behavior:');
        console.log('   ✅ First use: Successful login → Dashboard');
        console.log('   ❌ Second use: "Token has already been used" error');
        console.log('   ❌ After 5 min: "Token has expired" error');
        console.log();

        // Test with custom user
        console.log('6. Generate custom user token:');
        const customUserId = process.argv[2] || 1;
        const customUsername = process.argv[3] || 'admin';

        if (process.argv[2] || process.argv[3]) {
            const customToken = generateTestToken(customUserId, customUsername);
            const customUrl = `${BASE_URL}/auto-login?token=${encodeURIComponent(customToken)}`;
            console.log(`   User ID: ${customUserId}, Username: ${customUsername}`);
            console.log('🔗', customUrl);
        } else {
            console.log('   Usage: node test-auto-login.js <userId> <username>');
            console.log('   Example: node test-auto-login.js 2 testuser');
        }
    }

    console.log();
    console.log('📋 Configuration check:');
    console.log('   JWT_SECRET:', JWT_SECRET.substring(0, 10) + '...');
    console.log('   BASE_URL:', BASE_URL);
    console.log('   Server should be running on:', BASE_URL);
}

// Run the test
if (require.main === module) {
    runAutoLoginTest();
}

module.exports = {
    generateTestToken,
    testTokenVerification
};
