/**
 * Alfred Shopping List Manager - Main Application Script
 * Entry point and application lifecycle management
 */

class AlfredApp {
    constructor() {
        this.isInitialized = false;
        this.managers = {};
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('🚀 Starting Alfred...');
            
            // Show loading screen
            UI.showLoadingOverlay();
            
            // Initialize managers in order
            await this.initializeManagers();
            
            // Setup global event listeners
            this.setupGlobalEvents();
            
            // Initialize authentication
            const isAuthenticated = await authManager.init();
            
            if (isAuthenticated) {
                // Initialize application modules
                await this.initializeApp();
                
                console.log('✅ Alfred initialized successfully');
                this.isInitialized = true;
            } else {
                console.log('❌ Authentication failed');
            }
            
        } catch (error) {
            console.error('Failed to initialize Alfred:', error);
            UI.showError('Impossible d\'initialiser l\'application');
            UI.hideLoadingOverlay();
        }
    }

    /**
     * Initialize all managers
     */
    async initializeManagers() {
        // Initialize UI manager first
        UI.init();
        
        // Initialize other managers
        authManager.init(); // Don't await, it handles its own flow
        uploadManager.init();
        searchManager.init();
        sharingManager.init();
        listsManager.init();
        itemsManager.init();
        
        this.managers = {
            ui: UI,
            auth: authManager,
            upload: uploadManager,
            search: searchManager,
            sharing: sharingManager,
            lists: listsManager,
            items: itemsManager
        };
    }

    /**
     * Setup global event listeners
     */
    setupGlobalEvents() {
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await authManager.logout();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleGlobalKeyboard(e));
        
        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('resize', () => this.handleResize());
        
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => this.handlePopState(e));
        
        // Handle visibility change (tab switching)
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        
        // Handle online/offline
        window.addEventListener('online', () => this.handleOnlineStatus(true));
        window.addEventListener('offline', () => this.handleOnlineStatus(false));
    }

    /**
     * Initialize application after authentication
     */
    async initializeApp() {
        try {
            // Load initial data
            await this.loadInitialData();
            
            // Setup routing
            this.setupRouting();
            
            // Handle initial URL
            this.handleInitialRoute();
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            UI.showError('Erreur lors du chargement initial');
        }
    }

    /**
     * Load initial application data
     */
    async loadInitialData() {
        try {
            // Load lists (this will handle empty state automatically)
            await listsManager.loadLists();
            
            // Load pending invitations in background
            this.loadInvitationsInBackground();
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
            throw error;
        }
    }

    /**
     * Load invitations in background
     */
    async loadInvitationsInBackground() {
        try {
            const invitations = await alfredAPI.getInvitations(true); // Pending only
            
            if (invitations && invitations.length > 0) {
                // Show notification about pending invitations
                UI.showInfo(
                    `Vous avez ${invitations.length} invitation${invitations.length > 1 ? 's' : ''} en attente`,
                    'Invitations'
                );
                
                // Update shared lists button to show count
                const sharedBtn = document.getElementById('shared-lists-btn');
                if (sharedBtn) {
                    const badge = document.createElement('span');
                    badge.className = 'notification-badge';
                    badge.textContent = invitations.length;
                    sharedBtn.appendChild(badge);
                }
            }
        } catch (error) {
            console.error('Failed to load invitations:', error);
        }
    }

    /**
     * Setup client-side routing
     */
    setupRouting() {
        // Simple hash-based routing for SPAs
        window.addEventListener('hashchange', () => this.handleRouteChange());
    }

    /**
     * Handle initial route
     */
    handleInitialRoute() {
        const hash = window.location.hash;
        
        if (hash.startsWith('#/list/')) {
            const listId = parseInt(hash.split('/')[2]);
            if (listId) {
                listsManager.selectList(listId);
            }
        } else if (hash.startsWith('#/search/')) {
            const query = decodeURIComponent(hash.split('/')[2] || '');
            if (query) {
                searchManager.performSearch(query);
            }
        } else if (hash.startsWith('#/share/')) {
            const token = hash.split('/')[2];
            if (token) {
                sharingManager.handlePublicLink(token);
            }
        }
        // Default: show welcome or first list (handled by listsManager.loadLists)
    }

    /**
     * Handle route changes
     */
    handleRouteChange() {
        this.handleInitialRoute();
    }

    /**
     * Handle global keyboard shortcuts
     */
    handleGlobalKeyboard(event) {
        // Ctrl/Cmd + K: Focus search
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            const searchInput = document.getElementById('global-search');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Ctrl/Cmd + N: New list
        if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
            event.preventDefault();
            if (UI.getCurrentView() !== 'search') {
                listsManager.showCreateModal();
            }
        }
        
        // Ctrl/Cmd + Shift + N: New item
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'N') {
            event.preventDefault();
            if (UI.getCurrentView() === 'list') {
                itemsManager.showCreateModal();
            }
        }
        
        // Escape: Close modals or go back
        if (event.key === 'Escape') {
            if (UI.getCurrentView() === 'search') {
                searchManager.closeSearch();
            }
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        // Adjust UI for mobile/desktop
        const isMobile = window.innerWidth <= 768;
        document.body.classList.toggle('mobile', isMobile);
    }

    /**
     * Handle browser history navigation
     */
    handlePopState(event) {
        // Handle browser back/forward buttons
        if (event.state && event.state.listId) {
            listsManager.selectList(event.state.listId);
        }
    }

    /**
     * Handle visibility change (tab switching)
     */
    handleVisibilityChange() {
        if (!document.hidden && this.isInitialized) {
            // Tab became visible - refresh data if it's been a while
            this.refreshDataIfNeeded();
        }
    }

    /**
     * Handle online/offline status
     */
    handleOnlineStatus(isOnline) {
        if (isOnline) {
            UI.showSuccess('Connexion rétablie');
            // Sync any pending changes
            this.syncPendingChanges();
        } else {
            UI.showInfo('Mode hors ligne', 'Connexion');
        }
        
        document.body.classList.toggle('offline', !isOnline);
    }

    /**
     * Refresh data if needed
     */
    async refreshDataIfNeeded() {
        const lastRefresh = localStorage.getItem('alfred_last_refresh');
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (!lastRefresh || (now - parseInt(lastRefresh)) > fiveMinutes) {
            try {
                // Silently refresh current list
                await listsManager.refreshCurrentList();
                localStorage.setItem('alfred_last_refresh', now.toString());
            } catch (error) {
                console.error('Background refresh failed:', error);
            }
        }
    }

    /**
     * Sync pending changes (for offline functionality)
     */
    async syncPendingChanges() {
        // Placeholder for offline sync functionality
        // In a full implementation, you'd store offline changes and sync them here
        console.log('Syncing pending changes...');
    }

    /**
     * Update browser history
     */
    updateHistory(title, url) {
        if (window.history && window.history.pushState) {
            window.history.pushState({}, title, url);
        }
    }

    /**
     * Cleanup before page unload
     */
    cleanup() {
        // Save any pending state
        // Clear timeouts
        // Disconnect websockets if any
        console.log('Alfred cleanup completed');
    }

    /**
     * Show app update notification
     */
    showUpdateAvailable() {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-content">
                <strong>Mise à jour disponible</strong>
                <p>Une nouvelle version d'Alfred est disponible</p>
                <button onclick="window.location.reload()">Actualiser</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 10000);
    }

    /**
     * Get application info
     */
    getAppInfo() {
        return {
            name: 'Alfred',
            version: '1.0.0',
            initialized: this.isInitialized,
            managers: Object.keys(this.managers),
            currentView: UI.getCurrentView(),
            currentList: listsManager.getCurrentList()?.name || null
        };
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    if (window.UI && typeof UI.showError === 'function') {
        UI.showError('Une erreur inattendue s\'est produite');
    }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (window.UI && typeof UI.showError === 'function') {
        UI.showError('Erreur de communication avec le serveur');
    }
});

// Create global app instance
const alfredApp = new AlfredApp();

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => alfredApp.init());
} else {
    // DOM already loaded
    alfredApp.init();
}

// Export for debugging
window.alfredApp = alfredApp;

// Console welcome message
console.log(`
🛒 Alfred Shopping List Manager
Version: 1.0.0
Built with ❤️ for productivity

Global objects available:
- alfredApp: Main application instance
- alfredAPI: API client
- UI: User interface manager
- authManager: Authentication manager
- listsManager: Lists management
- itemsManager: Items management
- searchManager: Search functionality
- sharingManager: Sharing features
- uploadManager: File upload handling

Type alfredApp.getAppInfo() for current state.
`);