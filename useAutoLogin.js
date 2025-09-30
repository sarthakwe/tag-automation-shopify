/**
 * Custom React Hook for Auto-Login Functionality
 * Use this hook in any component that needs auto-login capability
 */

import { useState, useCallback } from 'react';

const useAutoLogin = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Generate auto-login URL and redirect to Website 2
     * @param {Object} options - Configuration options
     * @param {boolean} options.openInNewTab - Whether to open in new tab (default: true)
     * @param {function} options.onSuccess - Callback on successful generation
     * @param {function} options.onError - Callback on error
     */
    const initiateAutoLogin = useCallback(async (options = {}) => {
        const {
            openInNewTab = true,
            onSuccess,
            onError
        } = options;

        setLoading(true);
        setError(null);

        try {
            console.log('Initiating auto-login...');

            // Call backend API to generate secure auto-login URL
            const response = await fetch('/api/generate-auto-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include' // Include session cookies for Shopify auth
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            if (data.success && data.autoLoginUrl) {
                console.log('Auto-login URL generated successfully');

                // Call success callback if provided
                if (onSuccess) {
                    onSuccess(data);
                }

                // Redirect to Website 2
                if (openInNewTab) {
                    window.open(data.autoLoginUrl, '_blank');
                } else {
                    window.location.href = data.autoLoginUrl;
                }

                return data;

            } else {
                throw new Error(data.error || 'Failed to generate auto-login URL');
            }

        } catch (err) {
            console.error('Auto-login failed:', err);
            const errorMessage = err.message || 'An unexpected error occurred';

            setError(errorMessage);

            // Call error callback if provided
            if (onError) {
                onError(err);
            }

            throw err; // Re-throw for component-level handling if needed

        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Clear any existing error
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    /**
     * Direct redirect method (simpler, but less control)
     */
    const redirectToOrderManagement = useCallback(() => {
        window.location.href = '/redirect-to-order-management';
    }, []);

    return {
        // State
        loading,
        error,

        // Actions
        initiateAutoLogin,
        redirectToOrderManagement,
        clearError,

        // Computed
        isReady: !loading && !error
    };
};

export default useAutoLogin;
