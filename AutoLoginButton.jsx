/**
 * React Component for Auto-Login Button
 * Use this in your Shopify app's React frontend
 */

import React, { useState } from 'react';
import { Button, Banner, Spinner } from '@shopify/polaris';
import { ExternalMinor } from '@shopify/polaris-icons';

const AutoLoginButton = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Handle auto-login button click
     */
    const handleAutoLogin = async () => {
        setLoading(true);
        setError(null);

        try {
            // Call your backend API to generate auto-login URL
            const response = await fetch('/api/generate-auto-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include' // Include session cookies
            });

            const data = await response.json();

            if (data.success) {
                // Redirect to Website 2 with auto-login
                window.open(data.autoLoginUrl, '_blank');
                // Or use window.location.href = data.autoLoginUrl; for same tab
            } else {
                throw new Error(data.error || 'Failed to generate auto-login URL');
            }

        } catch (err) {
            console.error('Auto-login failed:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            {error && (
                <Banner status="critical" onDismiss={() => setError(null)}>
                    <p>Auto-login failed: {error}</p>
                </Banner>
            )}

            <Button
                primary
                icon={ExternalMinor}
                loading={loading}
                onClick={handleAutoLogin}
                disabled={loading}
            >
                {loading ? 'Generating secure link...' : 'Access Order Management'}
            </Button>

            {loading && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center' }}>
                    <Spinner size="small" />
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                        Creating secure connection...
                    </span>
                </div>
            )}
        </div>
    );
};

export default AutoLoginButton;
