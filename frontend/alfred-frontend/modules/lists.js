/**
 * Lists management for Alfred
 */

class ListsManager {
    constructor() {
        this.lists = [];
        this.currentList = null;
        this.sortBy = 'updated_at';
        this.sortOrder = 'desc';
        this.currentTypeFilter = '';
    }

    /**
     * Initialize lists management
     */
    init() {
        this.setupEventListeners();
        this.loadLists();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Create list buttons - use direct DOM access since UI.addEventListener may not exist yet
        const newListBtn = document.getElementById('new-list-btn');
        if (newListBtn) {
            newListBtn.addEventListener('click', () => this.showCreateModal());
        }
        
        const newListQuick = document.getElementById('new-list-quick');
        if (newListQuick) {
            newListQuick.addEventListener('click', () => this.showCreateModal());
        }
        
        // Handle first list creation button in empty state
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('create-first-list-btn')) {
                this.showCreateModal();
            }
        });

        // List form submission
        const listForm = document.getElementById('list-form');
        if (listForm) {
            listForm.addEventListener('submit', (e) => this.handleListSubmit(e));
        }

        // Type filter
        const typeFilter = document.getElementById('type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => this.filterByType(e.target.value));
        }

        // List options menu
        UI.addEventListener('list-options-btn', 'click', () => this.showListOptions());
    }

    /**
     * Filter lists by type
     */
    async filterByType(type) {
        this.currentTypeFilter = type;
        
        // Reload lists from server with filter
        try {
            UI.showListsLoading();
            const lists = await alfredAPI.getLists(true, false, type);
            this.lists = lists || [];
            this.renderLists();
        } catch (error) {
            console.error('Failed to filter lists:', error);
            UI.showError('Impossible de filtrer les listes');
            this.renderLists(); // Fallback to client-side filtering
        }
    }

    /**
     * Load all lists
     */
    async loadLists() {
        try {
            UI.showListsLoading();
            
            const lists = await alfredAPI.getLists();
            this.lists = lists || [];
            
            if (this.lists.length === 0) {
                this.showListsEmpty();
                this.showWelcomeScreen();
            } else {
                this.renderLists();
                
                // Show first list if no current list is selected
                if (!this.currentList && this.lists.length > 0) {
                    await this.selectList(this.lists[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to load lists:', error);
            this.showError('Impossible de charger les listes');
            this.showListsEmpty();
        }
    }

    /**
     * Render lists in sidebar
     */
    renderLists() {
        const container = document.getElementById('lists-list');
        if (!container) return;

        container.innerHTML = '';

        // Filter and sort lists
        let filteredLists = this.lists;
        
        // Apply type filter
        if (this.currentTypeFilter) {
            filteredLists = filteredLists.filter(list =>
                list.list_type === this.currentTypeFilter
            );
        }
        
        const sortedLists = this.getSortedLists(filteredLists);

        sortedLists.forEach(list => {
            const listElement = this.createListElement(list);
            container.appendChild(listElement);
        });

        container.style.display = 'block';
        UI.hideElement('lists-loading');
        UI.hideElement('lists-empty');
    }

    /**
     * Create list element for sidebar
     */
    createListElement(list) {
        const div = document.createElement('div');
        div.className = `list-item ${this.currentList?.id === list.id ? 'active' : ''}`;
        div.dataset.listId = list.id;

        const progress = list.item_count > 0 ? Math.round((list.checked_count / list.item_count) * 100) : 0;
        const progressText = list.item_count > 0 ? `${list.checked_count}/${list.item_count}` : 'Vide';

        // Get list type info
        const typeInfo = this.getListTypeInfo(list.list_type || 'shopping');

        div.innerHTML = `
            <div class="list-item-info">
                <div class="list-item-header">
                    <span class="list-type-icon">${typeInfo.icon}</span>
                    <h4>${this.escapeHtml(list.name)}</h4>
                </div>
                <div class="list-item-meta">
                    <span class="list-type-label">${typeInfo.label}</span>
                    <span>${progressText}</span>
                    ${progress > 0 ? `<span>${progress}% terminé</span>` : ''}
                </div>
            </div>
            <div class="list-item-actions" style="opacity: 0;">
                <button class="item-action-btn" onclick="listsManager.showListMenu(${list.id}, event)" title="Options">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                </button>
            </div>
        `;

        // Click to select list
        div.addEventListener('click', (e) => {
            if (!e.target.closest('.list-item-actions')) {
                this.selectList(list.id);
            }
        });

        // Show actions on hover
        div.addEventListener('mouseenter', () => {
            const actions = div.querySelector('.list-item-actions');
            if (actions) actions.style.opacity = '1';
        });

        div.addEventListener('mouseleave', () => {
            const actions = div.querySelector('.list-item-actions');
            if (actions) actions.style.opacity = '0';
        });

        return div;
    }

    /**
     * Get list type information
     */
    getListTypeInfo(listType) {
        const types = {
            shopping: { icon: '🛒', label: 'Courses' },
            todo: { icon: '✅', label: 'Tâches' },
            notes: { icon: '📝', label: 'Notes' },
            checklist: { icon: '☑️', label: 'Vérification' },
            wishlist: { icon: '🎁', label: 'Souhaits' },
            inventory: { icon: '📦', label: 'Inventaire' }
        };
        
        return types[listType] || types.shopping;
    }

    /**
     * Get sorted lists
     */
    getSortedLists(listsArray = null) {
        const lists = listsArray || this.lists;
        return [...lists].sort((a, b) => {
            let aValue = a[this.sortBy];
            let bValue = b[this.sortBy];

            // Handle date sorting
            if (this.sortBy.includes('_at')) {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }

            if (this.sortOrder === 'desc') {
                return bValue - aValue;
            } else {
                return aValue - bValue;
            }
        });
    }

    /**
     * Select a list
     */
    async selectList(listId) {
        try {
            // Update UI to show we're loading
            const listItem = document.querySelector(`[data-list-id="${listId}"]`);
            if (listItem) {
                // Remove active class from all items
                document.querySelectorAll('.list-item.active').forEach(item => {
                    item.classList.remove('active');
                });
                // Add active class to selected item
                listItem.classList.add('active');
            }

            // Load full list data with items
            const fullList = await alfredAPI.getList(listId);
            this.currentList = fullList;

            // Update UI
            this.updateListHeader(fullList);
            UI.showListView(listId);
            
            // Load items for this list
            await itemsManager.loadItems(listId);

        } catch (error) {
            console.error('Failed to select list:', error);
            UI.showError('Impossible de charger la liste');
        }
    }

    /**
     * Update list header
     */
    updateListHeader(list) {
        UI.updateText('list-title', list.name);
        
        const itemCount = list.items ? list.items.length : 0;
        const checkedCount = list.items ? list.items.filter(item => item.is_checked).length : 0;
        
        UI.updateText('list-item-count', `${itemCount} article${itemCount !== 1 ? 's' : ''}`);
        UI.updateText('list-checked-count', `${checkedCount} coché${checkedCount !== 1 ? 's' : ''}`);
    }

    /**
     * Show create list modal
     */
    showCreateModal() {
        console.log('showCreateModal called'); // Debug
        this.showModal('list-modal', 'Nouvelle liste');
        document.getElementById('list-name').value = '';
        document.getElementById('list-description').value = '';
        document.getElementById('list-type').value = 'shopping';
        document.getElementById('list-private').checked = true;
        document.querySelector('#list-modal').removeAttribute('data-list-id');
    }

    /**
     * Show edit list modal
     */
    showEditModal(listData = null) {
        UI.showModal('list-modal', listData || this.currentList);
    }

    /**
     * Handle list form submission
     */
    async handleListSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const modal = form.closest('.modal');
        const listId = modal.dataset.listId;
        
        const listData = {
            name: document.getElementById('list-name').value,
            description: document.getElementById('list-description').value || '',
            list_type: document.getElementById('list-type').value,
            is_private: document.getElementById('list-private').checked
        };

        try {
            if (listId) {
                // Update existing list
                await alfredAPI.updateList(listId, listData);
                UI.showSuccess('Liste modifiée avec succès');
                
                // Update current list if it's the one being edited
                if (this.currentList && this.currentList.id == listId) {
                    this.currentList = { ...this.currentList, ...listData };
                    this.updateListHeader(this.currentList);
                }
            } else {
                // Create new list
                const newList = await alfredAPI.createList(listData);
                UI.showSuccess('Liste créée avec succès');
                
                // Add to lists array
                this.lists.unshift(newList);
                
                // Select the new list
                await this.selectList(newList.id);
            }

            // Refresh lists display
            this.renderLists();
            this.hideModal('list-modal');

        } catch (error) {
            console.error('List operation failed:', error);
            UI.showError('Impossible de sauvegarder la liste');
        }
    }

    /**
     * Show list menu
     */
    showListMenu(listId, event) {
        event.stopPropagation();
        
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;

        // Create context menu (simplified for now)
        const actions = [
            { label: 'Modifier', action: () => this.showEditModal(list) },
            { label: 'Dupliquer', action: () => this.duplicateList(listId) },
            { label: 'Partager', action: () => sharingManager.showShareModal(list) },
            { label: '---', action: null },
            { label: 'Archiver', action: () => this.archiveList(listId), style: 'warning' },
            { label: 'Supprimer', action: () => this.deleteList(listId), style: 'danger' }
        ];

        this.showContextMenu(event, actions);
    }

    /**
     * Show context menu (simplified implementation)
     */
    showContextMenu(event, actions) {
        // For now, just show first few actions as confirm dialogs
        // In a full implementation, you'd create a proper context menu
        const action = prompt('Action: 1=Modifier, 2=Dupliquer, 3=Partager, 4=Supprimer');
        
        switch(action) {
            case '1':
                actions[0].action();
                break;
            case '2':
                actions[1].action();
                break;
            case '3':
                actions[2].action();
                break;
            case '4':
                actions[5].action();
                break;
        }
    }

    /**
     * Duplicate a list
     */
    async duplicateList(listId) {
        try {
            const name = prompt('Nom de la copie:');
            if (!name) return;

            const duplicatedList = await alfredAPI.duplicateList(listId, name);
            UI.showSuccess('Liste dupliquée avec succès');
            
            this.lists.unshift(duplicatedList);
            this.renderLists();
            await this.selectList(duplicatedList.id);

        } catch (error) {
            console.error('Failed to duplicate list:', error);
            UI.showError('Impossible de dupliquer la liste');
        }
    }

    /**
     * Archive a list
     */
    async archiveList(listId) {
        if (!confirm('Êtes-vous sûr de vouloir archiver cette liste ?')) {
            return;
        }

        try {
            await alfredAPI.archiveList(listId);
            UI.showSuccess('Liste archivée avec succès');
            
            // Remove from current lists
            this.lists = this.lists.filter(l => l.id !== listId);
            this.renderLists();
            
            // If this was the current list, show welcome screen
            if (this.currentList?.id === listId) {
                this.currentList = null;
                if (this.lists.length > 0) {
                    await this.selectList(this.lists[0].id);
                } else {
                    UI.showWelcomeScreen();
                }
            }

        } catch (error) {
            console.error('Failed to archive list:', error);
            UI.showError('Impossible d\'archiver la liste');
        }
    }

    /**
     * Delete a list
     */
    async deleteList(listId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement cette liste ? Cette action est irréversible.')) {
            return;
        }

        try {
            await alfredAPI.deleteList(listId);
            UI.showSuccess('Liste supprimée avec succès');
            
            // Remove from current lists
            this.lists = this.lists.filter(l => l.id !== listId);
            this.renderLists();
            
            // If this was the current list, show welcome screen
            if (this.currentList?.id === listId) {
                this.currentList = null;
                if (this.lists.length > 0) {
                    await this.selectList(this.lists[0].id);
                } else {
                    UI.showWelcomeScreen();
                }
            }

        } catch (error) {
            console.error('Failed to delete list:', error);
            UI.showError('Impossible de supprimer la liste');
        }
    }

    /**
     * Show list options
     */
    showListOptions() {
        if (!this.currentList) return;
        this.showEditModal();
    }

    /**
     * Get current list
     */
    getCurrentList() {
        return this.currentList;
    }

    /**
     * Refresh current list
     */
    async refreshCurrentList() {
        if (this.currentList) {
            await this.selectList(this.currentList.id);
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    /**
     * Show create modal
     */
    showCreateModal() {
        this.showModal('list-modal', 'Nouvelle liste');
        document.getElementById('list-name').value = '';
        document.getElementById('list-description').value = '';
        document.getElementById('list-type').value = 'shopping';
        document.getElementById('list-private').checked = true;
        document.querySelector('#list-modal').removeAttribute('data-list-id');
    }

    /**
     * Show edit modal
     */
    showEditModal(list = null) {
        const listToEdit = list || this.currentList;
        if (!listToEdit) return;

        this.showModal('list-modal', 'Modifier la liste');
        document.getElementById('list-name').value = listToEdit.name;
        document.getElementById('list-description').value = listToEdit.description || '';
        document.getElementById('list-type').value = listToEdit.list_type || 'shopping';
        document.getElementById('list-private').checked = listToEdit.is_private;
        document.querySelector('#list-modal').setAttribute('data-list-id', listToEdit.id);
    }

    /**
     * Show modal
     */
    showModal(modalId, title = '') {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const titleElement = modal.querySelector('.modal-title');
        if (titleElement && title) {
            titleElement.textContent = title;
        }

        modal.style.display = 'flex';
    }

    /**
     * Hide modal
     */
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.style.display = 'none';
    }

    /**
     * Show lists loading state
     */
    showListsLoading() {
        const loading = document.getElementById('lists-loading');
        const empty = document.getElementById('lists-empty');
        const list = document.getElementById('lists-list');
        
        if (loading) loading.style.display = 'block';
        if (empty) empty.style.display = 'none';
        if (list) list.style.display = 'none';
    }

    /**
     * Show lists empty state
     */
    showListsEmpty() {
        const loading = document.getElementById('lists-loading');
        const empty = document.getElementById('lists-empty');
        const list = document.getElementById('lists-list');
        
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'block';
        if (list) list.style.display = 'none';
    }

    /**
     * Show welcome screen
     */
    showWelcomeScreen() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="welcome-screen">
                    <h2>Bienvenue dans Alfred !</h2>
                    <p>Créez une nouvelle liste ou sélectionnez une liste existante pour commencer.</p>
                    
                    <div class="quick-actions">
                        <button class="quick-action-btn primary" id="new-list-quick-welcome">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span>Nouvelle liste</span>
                        </button>
                    </div>
                </div>
            `;
            
            // Attach event listener to the new button
            const newListWelcomeBtn = document.getElementById('new-list-quick-welcome');
            if (newListWelcomeBtn) {
                newListWelcomeBtn.addEventListener('click', () => this.showCreateModal());
            }
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showToast(message, 'error');
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showToast(message, 'success');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    /**
     * Create toast container if it doesn't exist
     */
    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
        return container;
    }
}

// Create global lists manager instance
window.listsManager = new ListsManager();