# Auto-Login System Implementation Guide

## Overview

This guide explains how to implement secure auto-login functionality for Website 2 (Order Management System) that accepts JWT tokens from Website 1 (trusted external website).

## Security Features Implemented

- ✅ JWT token verification with shared secret
- ✅ Token blacklist to prevent replay attacks
- ✅ Short-lived tokens (5 minutes expiry)
- ✅ Secure session management
- ✅ HTTPS-only cookies in production
- ✅ Session regeneration after auto-login
- ✅ Comprehensive error handling and logging

## Website 2 (Order Management System) - Already Implemented

### New Endpoints

1. **GET /auto-login** - Secure auto-login endpoint
2. **GET /login** - Enhanced with auto-login error handling
3. **GET /dashboard** - Shows success message for auto-login

### Security Middleware

- `checkExistingAuth()` - Prevents duplicate logins
- `verifyJWT()` - Validates JWT tokens
- `blacklistToken()` - Prevents token reuse

## Website 1 (External Website) - Implementation Required

### Required Dependencies

```bash
npm install jsonwebtoken
```

### Environment Variables

Add to your `.env` file:

```env
# JWT Configuration for auto-login to Website 2
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
WEBSITE2_BASE_URL=https://your-website2-domain.com
```

### JWT Token Generation Code

```javascript
const jwt = require('jsonwebtoken');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET; // Must match Website 2
const WEBSITE2_URL = process.env.WEBSITE2_BASE_URL;

/**
 * Generate secure auto-login token for Website 2
 * @param {Object} user - User object with id and username
 * @returns {string} JWT token valid for 5 minutes
 */
function generateAutoLoginToken(user) {
    try {
        // Validate required user data
        if (!user.id && !user.username) {
            throw new Error('User must have either id or username');
        }

        // Create JWT payload
        const payload = {
            userId: user.id,           // User ID (optional if username provided)
            username: user.username,   // Username (optional if userId provided)
            purpose: 'auto-login',     // Token purpose
            website: 'website1',       // Source identification
            iat: Math.floor(Date.now() / 1000) // Issued at timestamp
        };

        // Generate token with 5-minute expiry
        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: '5m',
            issuer: 'website1',
            audience: 'website2'
        });

        console.log('Auto-login token generated for user:', user.username || user.id);
        return token;

    } catch (error) {
        console.error('Error generating auto-login token:', error.message);
        throw error;
    }
}

/**
 * Create auto-login URL for Website 2
 * @param {Object} user - User object
 * @returns {string} Complete auto-login URL
 */
function createAutoLoginUrl(user) {
    try {
        const token = generateAutoLoginToken(user);
        const autoLoginUrl = `${WEBSITE2_URL}/auto-login?token=${encodeURIComponent(token)}`;
        
        console.log('Auto-login URL created for user:', user.username || user.id);
        return autoLoginUrl;

    } catch (error) {
        console.error('Error creating auto-login URL:', error.message);
        throw error;
    }
}

module.exports = {
    generateAutoLoginToken,
    createAutoLoginUrl
};
```

### Express Route Example

```javascript
const express = require('express');
const { createAutoLoginUrl } = require('./auto-login-utils');

const router = express.Router();

// Route to redirect user to Website 2 with auto-login
router.get('/redirect-to-website2', async (req, res) => {
    try {
        // Ensure user is authenticated on Website 1
        if (!req.session || !req.session.user) {
            return res.redirect('/login');
        }

        const user = req.session.user;

        // Generate auto-login URL
        const autoLoginUrl = createAutoLoginUrl({
            id: user.id,
            username: user.username
        });

        // Log the redirect for security auditing
        console.log(`Redirecting user ${user.username} to Website 2 via auto-login`);

        // Redirect to Website 2
        res.redirect(autoLoginUrl);

    } catch (error) {
        console.error('Auto-login redirect failed:', error.message);
        res.status(500).send('Auto-login failed. Please try again.');
    }
});

module.exports = router;
```

### HTML Button/Link Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Website 1 - Access Order Management</title>
</head>
<body>
    <div class="auto-login-section">
        <h2>Access Order Management System</h2>
        <p>Click below to securely access your order management dashboard:</p>
        
        <a href="/redirect-to-website2" 
           class="btn btn-primary auto-login-btn">
            Access Order Management
        </a>
        
        <script>
            // Optional: Add loading state
            document.querySelector('.auto-login-btn').addEventListener('click', function(e) {
                this.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Connecting...';
                this.disabled = true;
            });
        </script>
    </div>
</body>
</html>
```

### Frontend JavaScript Example

```javascript
/**
 * Generate auto-login URL via AJAX
 * (if you prefer client-side token generation)
 */
async function redirectToWebsite2() {
    try {
        // Show loading state
        const button = document.getElementById('auto-login-btn');
        button.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generating secure link...';
        button.disabled = true;

        // Request auto-login URL from your backend
        const response = await fetch('/api/generate-auto-login-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' // Include session cookies
        });

        if (response.ok) {
            const data = await response.json();
            
            // Redirect to Website 2
            window.location.href = data.autoLoginUrl;
        } else {
            throw new Error('Failed to generate auto-login URL');
        }

    } catch (error) {
        console.error('Auto-login failed:', error);
        alert('Auto-login failed. Please try again.');
        
        // Reset button state
        const button = document.getElementById('auto-login-btn');
        button.innerHTML = 'Access Order Management';
        button.disabled = false;
    }
}
```

## Security Considerations

### 1. JWT Secret Management

- **Critical**: Use a strong, unique secret for JWT signing
- Never expose the JWT secret in client-side code
- Use different secrets for different environments
- Rotate secrets periodically

### 2. HTTPS Requirement

```javascript
// In production, enforce HTTPS
if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
}
```

### 3. Token Expiry

- Tokens expire in 5 minutes for security
- Implement proper error handling for expired tokens
- Consider shorter expiry for highly sensitive applications

### 4. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// Rate limit auto-login requests
const autoLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: 'Too many auto-login attempts, please try again later'
});

app.use('/auto-login', autoLoginLimiter);
```

### 5. Logging and Monitoring

```javascript
// Log all auto-login attempts for security monitoring
function logAutoLoginAttempt(req, success, reason = null) {
    const logData = {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        success: success,
        reason: reason,
        userId: req.session?.userId || 'unknown'
    };
    
    console.log('AUTO_LOGIN_ATTEMPT:', JSON.stringify(logData));
}
```

## Testing

### 1. Test Token Generation

```javascript
// Test script for token generation
const { generateAutoLoginToken } = require('./auto-login-utils');

const testUser = { id: 1, username: 'testuser' };
const token = generateAutoLoginToken(testUser);
console.log('Generated token:', token);

// Verify token can be decoded
const jwt = require('jsonwebtoken');
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('Decoded token:', decoded);
```

### 2. Test Auto-Login Flow

1. Generate token on Website 1
2. Navigate to auto-login URL
3. Verify redirect to dashboard
4. Confirm session is created
5. Test token reuse prevention

## Production Deployment

### 1. Environment Variables

```env
# Production environment variables
NODE_ENV=production
JWT_SECRET=STRONG_RANDOM_SECRET_32_CHARACTERS_PLUS
SESSION_SECRET=ANOTHER_STRONG_SECRET_FOR_SESSIONS
WEBSITE2_BASE_URL=https://your-production-domain.com
```

### 2. Security Headers

Website 2 already includes Helmet.js for security headers.

### 3. Database Considerations

Consider upgrading from in-memory token blacklist to Redis:

```javascript
const redis = require('redis');
const client = redis.createClient();

async function blacklistToken(token) {
    // Store token with 5-minute TTL
    await client.setex(`blacklist:${token}`, 300, '1');
}

async function isTokenBlacklisted(token) {
    const result = await client.get(`blacklist:${token}`);
    return result !== null;
}
```

## Error Handling

All error scenarios are handled with appropriate redirects:

- Missing token → `/login?error=missing_token`
- Invalid token → `/login?error=invalid_token`
- User not found → `/login?error=user_not_found`
- Session error → `/login?error=session_error`
- System error → `/login?error=system_error`

## Support

For questions or issues with the auto-login implementation:

1. Check server logs for detailed error messages
2. Verify JWT secret matches between websites
3. Ensure user exists in Website 2 database
4. Test token generation and verification separately
5. Monitor network requests for debugging

## API Reference

### Website 2 Endpoints

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/auto-login?token=JWT` | GET | Auto-login with JWT token |
| `/login` | GET | Normal login page with error handling |
| `/dashboard` | GET | Protected dashboard with success messages |

### Expected JWT Payload

```json
{
  "userId": 1,
  "username": "admin",
  "purpose": "auto-login",
  "website": "website1",
  "iat": 1234567890,
  "exp": 1234568190,
  "iss": "website1",
  "aud": "website2"
}
```

This implementation provides a robust, secure auto-login system that prevents common security vulnerabilities while maintaining ease of use.
