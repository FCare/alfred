/**
 * Authentication management for Alfred
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
    }

    /**
     * Initialize authentication
     */
    async init() {
        try {
            // Check if user is authenticated
            const isAuth = await alfredAPI.checkAuth();
            this.isAuthenticated = isAuth;
            
            if (isAuth) {
                // Get user info from cookie or API if needed
                this.currentUser = {
                    username: 'Utilisateur', // Default, will be updated if API provides user info
                    isAuthenticated: true
                };
                this.updateUI();
                return true;
            } else {
                this.redirectToLogin();
                return false;
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            this.redirectToLogin();
            return false;
        }
    }

    /**
     * Redirect to Voight-Kampff login
     */
    redirectToLogin() {
        UI.showAuthOverlay();
        setTimeout(() => {
            window.location.href = 'https://auth.caronboulme.fr/auth/login?redirect_after=' + 
                                   encodeURIComponent(window.location.href);
        }, 1000);
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            // Clear local state
            this.currentUser = null;
            this.isAuthenticated = false;
            
            // Redirect to Voight-Kampff logout
            window.location.href = 'https://auth.caronboulme.fr/auth/logout';
        } catch (error) {
            console.error('Logout failed:', error);
            // Force redirect anyway
            window.location.href = 'https://auth.caronboulme.fr/auth/logout';
        }
    }

    /**
     * Update UI based on authentication state
     */
    updateUI() {
        if (this.isAuthenticated && this.currentUser) {
            const currentUserElement = document.getElementById('current-user');
            if (currentUserElement) {
                currentUserElement.textContent = this.currentUser.username;
            }
            
            // Show app, hide loading
            UI.hideLoadingOverlay();
            UI.showApp();
        }
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Check if user is authenticated
     */
    isUserAuthenticated() {
        return this.isAuthenticated;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();