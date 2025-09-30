/**
 * Complete React Page Component for Shopify App
 * This shows how to integrate auto-login into your existing Shopify app
 */

import React, { useState, useCallback } from 'react';
import {
    Page,
    Layout,
    Card,
    Button,
    Banner,
    Spinner,
    Stack,
    TextStyle,
    Icon,
    DisplayText,
    BodyText
} from '@shopify/polaris';
import { ExternalMinor, LockMajor } from '@shopify/polaris-icons';

const OrderManagementPage = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    /**
     * Generate auto-login URL and redirect
     */
    const handleAutoLogin = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            console.log('Generating auto-login URL...');

            const response = await fetch('/api/generate-auto-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                setSuccess(true);

                // Small delay to show success message
                setTimeout(() => {
                    // Open in new tab for better UX
                    window.open(data.autoLoginUrl, '_blank');

                    // Reset success state after redirect
                    setTimeout(() => setSuccess(false), 2000);
                }, 500);

            } else {
                throw new Error(data.error || 'Failed to generate auto-login URL');
            }

        } catch (err) {
            console.error('Auto-login failed:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Alternative: Direct redirect (same tab)
     */
    const handleDirectRedirect = useCallback(() => {
        window.location.href = '/redirect-to-order-management';
    }, []);

    return (
        <Page
            title="Order Management Access"
            subtitle="Securely access your order management system"
            breadcrumbs={[{ content: 'Home', url: '/' }]}
        >
            <Layout>
                <Layout.Section>
                    {/* Error Banner */}
                    {error && (
                        <Banner
                            status="critical"
                            onDismiss={() => setError(null)}
                        >
                            <p><strong>Auto-login failed:</strong> {error}</p>
                            <p>Please try again or contact support if the issue persists.</p>
                        </Banner>
                    )}

                    {/* Success Banner */}
                    {success && (
                        <Banner status="success">
                            <p><strong>Success!</strong> Opening order management system...</p>
                        </Banner>
                    )}

                    {/* Main Card */}
                    <Card sectioned>
                        <Stack vertical spacing="loose">
                            <Stack alignment="center" spacing="tight">
                                <Icon source={LockMajor} color="primary" />
                                <DisplayText size="medium">
                                    Secure Order Management Access
                                </DisplayText>
                            </Stack>

                            <BodyText>
                                Access your external order management system with secure
                                single sign-on. No need to login again - your Shopify
                                authentication will be used automatically.
                            </BodyText>

                            <Stack distribution="center" spacing="tight">
                                {/* Primary Auto-Login Button */}
                                <Button
                                    primary
                                    size="large"
                                    icon={ExternalMinor}
                                    loading={loading}
                                    onClick={handleAutoLogin}
                                    disabled={loading}
                                >
                                    {loading
                                        ? 'Generating secure link...'
                                        : 'Access Order Management'
                                    }
                                </Button>

                                {/* Alternative Direct Link */}
                                <Button
                                    outline
                                    onClick={handleDirectRedirect}
                                    disabled={loading}
                                >
                                    Direct Access (Same Tab)
                                </Button>
                            </Stack>

                            {/* Loading State */}
                            {loading && (
                                <Stack alignment="center" spacing="tight">
                                    <Spinner size="small" />
                                    <TextStyle variation="subdued">
                                        Creating secure connection...
                                    </TextStyle>
                                </Stack>
                            )}

                            {/* Security Info */}
                            <Card.Section>
                                <Stack vertical spacing="tight">
                                    <TextStyle variation="strong">Security Features:</TextStyle>
                                    <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                                        <li>Secure JWT token authentication</li>
                                        <li>5-minute token expiry for security</li>
                                        <li>One-time use tokens (no replay attacks)</li>
                                        <li>HTTPS encryption in transit</li>
                                    </ul>
                                </Stack>
                            </Card.Section>
                        </Stack>
                    </Card>
                </Layout.Section>

                {/* Side Information */}
                <Layout.Section secondary>
                    <Card title="How It Works" sectioned>
                        <Stack vertical spacing="tight">
                            <BodyText>
                                1. Click "Access Order Management"
                            </BodyText>
                            <BodyText>
                                2. Secure token is generated using your Shopify session
                            </BodyText>
                            <BodyText>
                                3. You're automatically logged into the order system
                            </BodyText>
                            <BodyText>
                                4. Token expires after 5 minutes for security
                            </BodyText>
                        </Stack>
                    </Card>

                    <Card title="Troubleshooting" sectioned>
                        <Stack vertical spacing="tight">
                            <BodyText>
                                <strong>If auto-login fails:</strong>
                            </BodyText>
                            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                                <li>Check your internet connection</li>
                                <li>Ensure you're logged into this Shopify app</li>
                                <li>Try refreshing this page</li>
                                <li>Contact support if issues persist</li>
                            </ul>
                        </Stack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default OrderManagementPage;
