/**
 * UI management for Alfred
 */

class UIManager {
    constructor() {
        this.currentView = 'welcome';
        this.currentListId = null;
        this.modals = {};
        this.toastContainer = null;
    }

    /**
     * Initialize UI
     */
    init() {
        this.toastContainer = document.getElementById('toast-container');
        this.setupModals();
        this.setupEventListeners();
    }

    /**
     * Setup modal management
     */
    setupModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const modalId = modal.id;
            this.modals[modalId] = modal;
            
            // Close modal on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modalId);
                }
            });
            
            // Close modal on close button click
            const closeBtn = modal.querySelector('.modal-close, .modal-cancel');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.hideModal(modalId);
                });
            }
        });
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });
    }

    // === VIEW MANAGEMENT ===

    /**
     * Show loading overlay
     */
    showLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }


    /**
     * Show main app
     */
    showApp() {
        const app = document.getElementById('app');
        if (app) {
            app.style.display = 'flex';
        }
    }

    /**
     * Show welcome screen
     */
    showWelcomeScreen() {
        this.hideAllViews();
        const welcome = document.getElementById('welcome-screen');
        if (welcome) {
            welcome.style.display = 'flex';
            this.currentView = 'welcome';
        }
    }

    /**
     * Show list view
     */
    showListView(listId) {
        this.hideAllViews();
        const listView = document.getElementById('list-view');
        if (listView) {
            listView.style.display = 'flex';
            this.currentView = 'list';
            this.currentListId = listId;
        }
    }

    /**
     * Show search results
     */
    showSearchResults() {
        this.hideAllViews();
        const searchResults = document.getElementById('search-results');
        if (searchResults) {
            searchResults.style.display = 'flex';
            this.currentView = 'search';
        }
    }

    /**
     * Hide all content views
     */
    hideAllViews() {
        const views = ['welcome-screen', 'list-view', 'search-results'];
        views.forEach(viewId => {
            const view = document.getElementById(viewId);
            if (view) {
                view.style.display = 'none';
            }
        });
    }

    // === MODAL MANAGEMENT ===

    /**
     * Show modal
     */
    showModal(modalId, data = null) {
        const modal = this.modals[modalId];
        if (modal) {
            if (data && modalId === 'list-modal') {
                this.populateListModal(data);
            } else if (data && modalId === 'item-modal') {
                this.populateItemModal(data);
            }
            
            modal.style.display = 'flex';
            
            // Focus first input
            setTimeout(() => {
                const firstInput = modal.querySelector('input, textarea');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        }
    }

    /**
     * Hide modal
     */
    hideModal(modalId) {
        const modal = this.modals[modalId];
        if (modal) {
            modal.style.display = 'none';
            this.resetModalForms(modalId);
        }
    }

    /**
     * Hide all modals
     */
    hideAllModals() {
        Object.keys(this.modals).forEach(modalId => {
            this.hideModal(modalId);
        });
    }

    /**
     * Reset modal forms
     */
    resetModalForms(modalId) {
        const modal = this.modals[modalId];
        if (modal) {
            const forms = modal.querySelectorAll('form');
            forms.forEach(form => form.reset());
            
            // Clear image previews
            const imagePreviews = modal.querySelectorAll('.image-preview');
            imagePreviews.forEach(preview => {
                preview.style.display = 'none';
                preview.innerHTML = '';
            });
        }
    }

    /**
     * Populate list modal with data
     */
    populateListModal(listData) {
        const modal = this.modals['list-modal'];
        if (!modal) return;
        
        const titleElement = modal.querySelector('#list-modal-title');
        const nameInput = modal.querySelector('#list-name');
        const descInput = modal.querySelector('#list-description');
        const privateInput = modal.querySelector('#list-private');
        const submitBtn = modal.querySelector('button[type="submit"]');
        
        if (listData && listData.id) {
            // Edit mode
            if (titleElement) titleElement.textContent = 'Modifier la liste';
            if (nameInput) nameInput.value = listData.name || '';
            if (descInput) descInput.value = listData.description || '';
            if (privateInput) privateInput.checked = listData.is_private || false;
            if (submitBtn) submitBtn.textContent = 'Modifier';
            
            // Store list ID for form submission
            modal.dataset.listId = listData.id;
        } else {
            // Create mode
            if (titleElement) titleElement.textContent = 'Nouvelle liste';
            if (submitBtn) submitBtn.textContent = 'Créer';
            delete modal.dataset.listId;
        }
    }

    /**
     * Populate item modal with data
     */
    populateItemModal(itemData) {
        const modal = this.modals['item-modal'];
        if (!modal) return;
        
        const titleElement = modal.querySelector('#item-modal-title');
        const nameInput = modal.querySelector('#item-name');
        const quantityInput = modal.querySelector('#item-quantity');
        const descInput = modal.querySelector('#item-description');
        const submitBtn = modal.querySelector('button[type="submit"]');
        const imagePreview = modal.querySelector('#item-image-preview');
        
        if (itemData && itemData.id) {
            // Edit mode
            if (titleElement) titleElement.textContent = 'Modifier l\'article';
            if (nameInput) nameInput.value = itemData.name || '';
            if (quantityInput) quantityInput.value = itemData.quantity || '';
            if (descInput) descInput.value = itemData.description || '';
            if (submitBtn) submitBtn.textContent = 'Modifier';
            
            // Show existing image if any
            if (itemData.image_path && imagePreview) {
                imagePreview.innerHTML = `
                    <img src="${alfredAPI.getImageURL(itemData.image_path)}" alt="Preview">
                    <button type="button" class="remove-image-btn" onclick="this.parentElement.style.display='none'">
                        ✕
                    </button>
                `;
                imagePreview.style.display = 'block';
            }
            
            // Store item ID for form submission
            modal.dataset.itemId = itemData.id;
        } else {
            // Create mode
            if (titleElement) titleElement.textContent = 'Nouvel article';
            if (submitBtn) submitBtn.textContent = 'Ajouter';
            delete modal.dataset.itemId;
        }
    }

    // === LOADING STATES ===

    /**
     * Show loading state for lists
     */
    showListsLoading() {
        this.hideElement('lists-list');
        this.hideElement('lists-empty');
        this.showElement('lists-loading');
    }

    /**
     * Show loading state for items
     */
    showItemsLoading() {
        this.hideElement('items-list');
        this.hideElement('items-empty');
        this.showElement('items-loading');
    }

    /**
     * Show empty state for lists
     */
    showListsEmpty() {
        this.hideElement('lists-loading');
        this.hideElement('lists-list');
        this.showElement('lists-empty');
    }

    /**
     * Show empty state for items
     */
    showItemsEmpty() {
        this.hideElement('items-loading');
        this.hideElement('items-list');
        this.showElement('items-empty');
    }

    // === TOAST NOTIFICATIONS ===

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', title = null, duration = 4000) {
        if (!this.toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const iconMap = {
            success: '✓',
            error: '✕',
            info: 'ℹ',
            warning: '⚠'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, duration);
        }
        
        // Click to dismiss
        toast.addEventListener('click', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }

    /**
     * Show success toast
     */
    showSuccess(message, title = null) {
        this.showToast(message, 'success', title);
    }

    /**
     * Show error toast
     */
    showError(message, title = 'Erreur') {
        this.showToast(message, 'error', title, 6000); // Longer duration for errors
    }

    /**
     * Show info toast
     */
    showInfo(message, title = null) {
        this.showToast(message, 'info', title);
    }

    // === UTILITY METHODS ===

    /**
     * Show element
     */
    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'block';
        }
    }

    /**
     * Hide element
     */
    hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'none';
        }
    }

    /**
     * Update element text content
     */
    updateText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * Update element HTML content
     */
    updateHTML(elementId, html) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
        }
    }

    /**
     * Add event listener to element
     */
    addEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    /**
     * Get current view
     */
    getCurrentView() {
        return this.currentView;
    }

    /**
     * Get current list ID
     */
    getCurrentListId() {
        return this.currentListId;
    }
}

// Create global UI manager instance
window.UI = new UIManager();