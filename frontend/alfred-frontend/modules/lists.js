/**
 * Lists management for Alfred
 */

class ListsManager {
    constructor() {
        this.lists = [];
        this.currentList = null;
        this.sortBy = 'updated_at';
        this.sortOrder = 'desc';
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
        // Create list buttons
        UI.addEventListener('create-list-btn', 'click', () => this.showCreateModal());
        UI.addEventListener('welcome-create-list', 'click', () => this.showCreateModal());
        
        // Handle first list creation button in empty state
        const createFirstListBtns = document.querySelectorAll('.create-first-list-btn');
        createFirstListBtns.forEach(btn => {
            btn.addEventListener('click', () => this.showCreateModal());
        });

        // List form submission
        const listForm = document.getElementById('list-form');
        if (listForm) {
            listForm.addEventListener('submit', (e) => this.handleListSubmit(e));
        }

        // List options menu
        UI.addEventListener('list-options-btn', 'click', () => this.showListOptions());
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
                UI.showListsEmpty();
                UI.showWelcomeScreen();
            } else {
                this.renderLists();
                
                // Show first list if no current list is selected
                if (!this.currentList && this.lists.length > 0) {
                    await this.selectList(this.lists[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to load lists:', error);
            UI.showError('Impossible de charger les listes');
            UI.showListsEmpty();
        }
    }

    /**
     * Render lists in sidebar
     */
    renderLists() {
        const container = document.getElementById('lists-list');
        if (!container) return;

        container.innerHTML = '';

        // Sort lists
        const sortedLists = this.getSortedLists();

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

        div.innerHTML = `
            <div class="list-item-info">
                <h4>${this.escapeHtml(list.name)}</h4>
                <div class="list-item-meta">
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
     * Get sorted lists
     */
    getSortedLists() {
        return [...this.lists].sort((a, b) => {
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
        UI.showModal('list-modal');
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
            name: formData.get('name'),
            description: formData.get('description') || '',
            is_private: formData.has('is_private')
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
            UI.hideModal('list-modal');

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
}

// Create global lists manager instance
window.listsManager = new ListsManager();