# Shopify App Auto-Login Integration Guide

## Overview

This guide shows how to integrate the auto-login functionality into your existing React Shopify app to redirect users to your order management system (Website 2).

## 🔧 Backend Setup (Node.js/Express)

### 1. Install Dependencies

```bash
npm install jsonwebtoken
```

### 2. Add Environment Variables

Add to your Shopify app's `.env` file:

```env
# JWT Auto-Login Configuration
JWT_SECRET=bcb4fb5a3fa28df971d164a62d7c97f957c5b3fa9817e99a72107da274c98c30
WEBSITE2_URL=https://your-order-management-domain.com
```

### 3. Add Backend Routes

Add these routes to your Express server:

```javascript
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const WEBSITE2_URL = process.env.WEBSITE2_URL;

// Generate JWT token for auto-login
function generateAutoLoginToken(user) {
    const payload = {
        userId: user.id,
        username: user.username || user.shopDomain,
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

// API route to generate auto-login URL
app.post('/api/generate-auto-login', async (req, res) => {
    try {
        const session = res.locals.shopify.session;
        
        if (!session) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = {
            id: session.id,
            username: session.shop,
            shopDomain: session.shop
        };

        const token = generateAutoLoginToken(user);
        const autoLoginUrl = `${WEBSITE2_URL}/auto-login?token=${encodeURIComponent(token)}`;

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

// Direct redirect route (alternative)
app.get('/redirect-to-order-management', async (req, res) => {
    try {
        const session = res.locals.shopify.session;
        
        if (!session) {
            return res.redirect('/auth');
        }

        const user = {
            id: session.id,
            username: session.shop,
            shopDomain: session.shop
        };

        const token = generateAutoLoginToken(user);
        const autoLoginUrl = `${WEBSITE2_URL}/auto-login?token=${encodeURIComponent(token)}`;

        res.redirect(autoLoginUrl);

    } catch (error) {
        console.error('Auto-login redirect failed:', error);
        res.status(500).send('Auto-login failed. Please try again.');
    }
});
```

## ⚛️ Frontend Setup (React)

### Option 1: Simple Button Component

```jsx
import React, { useState } from 'react';
import { Button, Banner } from '@shopify/polaris';
import { ExternalMinor } from '@shopify/polaris-icons';

const AutoLoginButton = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleAutoLogin = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/generate-auto-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            const data = await response.json();

            if (data.success) {
                window.open(data.autoLoginUrl, '_blank');
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {error && (
                <Banner status="critical" onDismiss={() => setError(null)}>
                    {error}
                </Banner>
            )}
            <Button
                primary
                icon={ExternalMinor}
                loading={loading}
                onClick={handleAutoLogin}
            >
                Access Order Management
            </Button>
        </div>
    );
};

export default AutoLoginButton;
```

### Option 2: Using the Custom Hook

```jsx
import React from 'react';
import { Button, Banner } from '@shopify/polaris';
import { ExternalMinor } from '@shopify/polaris-icons';
import useAutoLogin from './useAutoLogin';

const OrderManagementAccess = () => {
    const { loading, error, initiateAutoLogin, clearError } = useAutoLogin();

    return (
        <div>
            {error && (
                <Banner status="critical" onDismiss={clearError}>
                    {error}
                </Banner>
            )}
            <Button
                primary
                icon={ExternalMinor}
                loading={loading}
                onClick={() => initiateAutoLogin({ openInNewTab: true })}
            >
                {loading ? 'Generating secure link...' : 'Access Order Management'}
            </Button>
        </div>
    );
};

export default OrderManagementAccess;
```

### Option 3: Add to Existing Page

Add this to any existing page in your Shopify app:

```jsx
import React from 'react';
import { Page, Layout, Card, Button } from '@shopify/polaris';
import { ExternalMinor } from '@shopify/polaris-icons';
import useAutoLogin from './useAutoLogin';

const MyExistingPage = () => {
    const { loading, error, initiateAutoLogin } = useAutoLogin();

    return (
        <Page title="My Page">
            <Layout>
                <Layout.Section>
                    {/* Your existing content */}
                    <Card sectioned>
                        <h2>Order Management</h2>
                        <p>Access your external order management system:</p>
                        <Button
                            primary
                            icon={ExternalMinor}
                            loading={loading}
                            onClick={() => initiateAutoLogin()}
                        >
                            Access Order Management
                        </Button>
                        {error && <p style={{color: 'red'}}>{error}</p>}
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
};
```

## 🚀 Quick Integration Steps

### 1. **Copy the files to your Shopify app:**
   - `useAutoLogin.js` → `src/hooks/` or `src/utils/`
   - `AutoLoginButton.jsx` → `src/components/`
   - Backend routes → your Express server file

### 2. **Update your environment variables:**
   ```env
   JWT_SECRET=bcb4fb5a3fa28df971d164a62d7c97f957c5b3fa9817e99a72107da274c98c30
   WEBSITE2_URL=https://your-website2-domain.com
   ```

### 3. **Add to your React app:**
   ```jsx
   import AutoLoginButton from './components/AutoLoginButton';
   
   // In your component
   <AutoLoginButton />
   ```

### 4. **Test the integration:**
   - Install dependencies: `npm install jsonwebtoken`
   - Restart your Shopify app
   - Click the auto-login button
   - You should be redirected to Website 2 and automatically logged in

## 🔐 User Mapping

Make sure the user exists in Website 2. The JWT token will contain:

```json
{
  "userId": "shop-session-id",
  "username": "shop-domain.myshopify.com",
  "shopDomain": "shop-domain.myshopify.com",
  "purpose": "auto-login",
  "website": "shopify-app"
}
```

### Create User in Website 2

You may need to create a user in Website 2's database that matches the Shopify shop:

```sql
INSERT INTO users (username, password) 
VALUES ('your-shop.myshopify.com', 'hashed-password');
```

Or modify Website 2's auto-login to create users automatically.

## 🎨 Shopify Polaris Styling

The components use Shopify Polaris for consistent styling:

- `Button` with `primary` prop for main action
- `Banner` for error/success messages
- `ExternalMinor` icon for external links
- `loading` state for better UX

## 🔧 Customization Options

### Different User Identification
```javascript
// Use different user identification
const user = {
    id: session.id,
    username: session.shop,
    email: shopInfo.email, // If you fetch shop info
    shopDomain: session.shop
};
```

### Custom Success Callback
```jsx
const handleSuccess = (data) => {
    console.log('Auto-login successful:', data);
    // Show success toast
    // Track analytics
    // etc.
};

<Button onClick={() => initiateAutoLogin({ 
    openInNewTab: true,
    onSuccess: handleSuccess 
})}>
    Access Order Management
</Button>
```

### Error Handling
```jsx
const handleError = (error) => {
    console.error('Auto-login failed:', error);
    // Log to error tracking service
    // Show custom error message
    // etc.
};
```

## 🧪 Testing

1. **Run your Shopify app in development**
2. **Install the app in a test store**
3. **Add the auto-login button to a page**
4. **Click the button - you should be redirected to Website 2**
5. **Verify you're automatically logged in**

## 📱 Production Deployment

1. **Update environment variables in production:**
   ```env
   JWT_SECRET=your-production-jwt-secret
   WEBSITE2_URL=https://your-production-website2.com
   ```

2. **Ensure HTTPS is enabled on both apps**

3. **Test the flow in production environment**

That's it! Your Shopify app now has secure auto-login to your order management system.
