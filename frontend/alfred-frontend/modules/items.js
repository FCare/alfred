/**
 * Items management for Alfred
 */

class ItemsManager {
    constructor() {
        this.items = [];
        this.currentListId = null;
        this.draggedItem = null;
    }

    /**
     * Initialize items management
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Add item buttons
        UI.addEventListener('add-item-btn', 'click', () => this.showCreateModal());
        
        // Handle add first item button in empty state
        const addFirstItemBtns = document.querySelectorAll('.add-first-item-btn');
        addFirstItemBtns.forEach(btn => {
            btn.addEventListener('click', () => this.showCreateModal());
        });

        // Item form submission
        const itemForm = document.getElementById('item-form');
        if (itemForm) {
            itemForm.addEventListener('submit', (e) => this.handleItemSubmit(e));
        }

        // Image upload handling
        const imageInput = document.getElementById('item-image');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }
    }

    /**
     * Load items for a specific list
     */
    async loadItems(listId) {
        try {
            UI.showItemsLoading();
            this.currentListId = listId;
            
            // Items are already loaded with the list, get them from current list
            const currentList = listsManager.getCurrentList();
            this.items = currentList?.items || [];
            
            if (this.items.length === 0) {
                UI.showItemsEmpty();
            } else {
                this.renderItems();
            }
        } catch (error) {
            console.error('Failed to load items:', error);
            UI.showError('Impossible de charger les articles');
            UI.showItemsEmpty();
        }
    }

    /**
     * Render items list
     */
    renderItems() {
        const container = document.getElementById('items-list');
        if (!container) return;

        container.innerHTML = '';

        // Sort items by position, then by creation date
        const sortedItems = [...this.items].sort((a, b) => {
            if (a.position !== b.position) {
                return a.position - b.position;
            }
            return new Date(a.created_at) - new Date(b.created_at);
        });

        sortedItems.forEach((item, index) => {
            const itemElement = this.createItemElement(item, index);
            container.appendChild(itemElement);
        });

        container.style.display = 'block';
        UI.hideElement('items-loading');
        UI.hideElement('items-empty');
    }

    /**
     * Create item element
     */
    createItemElement(item, index) {
        const div = document.createElement('div');
        div.className = `item-card ${item.is_checked ? 'checked' : ''}`;
        div.dataset.itemId = item.id;
        div.dataset.position = index;
        
        // Make items draggable for reordering
        div.draggable = true;

        div.innerHTML = `
            <div class="item-checkbox ${item.is_checked ? 'checked' : ''}" 
                 onclick="itemsManager.toggleItemCheck(${item.id})">
                ${item.is_checked ? '✓' : ''}
            </div>
            
            ${item.image_path ? `
                <img class="item-image" 
                     src="${alfredAPI.getImageURL(item.image_path)}" 
                     alt="${this.escapeHtml(item.name)}"
                     onerror="this.style.display='none'">
            ` : ''}
            
            <div class="item-content">
                <div class="item-name">${this.escapeHtml(item.name)}</div>
                <div class="item-details">
                    ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                    ${item.description ? `<span class="item-description">${this.escapeHtml(item.description)}</span>` : ''}
                </div>
            </div>
            
            <div class="item-actions">
                <button class="item-action-btn" onclick="itemsManager.showEditModal(${item.id})" title="Modifier">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="item-action-btn" onclick="itemsManager.showItemMenu(${item.id}, event)" title="Plus d'options">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                </button>
            </div>
        `;

        // Drag and drop events
        div.addEventListener('dragstart', (e) => this.handleDragStart(e, item));
        div.addEventListener('dragover', (e) => this.handleDragOver(e));
        div.addEventListener('drop', (e) => this.handleDrop(e));
        div.addEventListener('dragend', () => this.handleDragEnd());

        // Double click to edit
        div.addEventListener('dblclick', () => this.showEditModal(item.id));

        return div;
    }

    /**
     * Show create item modal
     */
    showCreateModal() {
        if (!this.currentListId) {
            UI.showError('Aucune liste sélectionnée');
            return;
        }
        UI.showModal('item-modal');
    }

    /**
     * Show edit item modal
     */
    showEditModal(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        
        UI.showModal('item-modal', item);
    }

    /**
     * Handle item form submission
     */
    async handleItemSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const modal = form.closest('.modal');
        const itemId = modal.dataset.itemId;
        
        const itemData = {
            name: formData.get('name'),
            quantity: formData.get('quantity') || '',
            description: formData.get('description') || ''
        };

        try {
            let result;
            
            if (itemId) {
                // Update existing item
                result = await alfredAPI.updateItem(itemId, itemData);
                UI.showSuccess('Article modifié avec succès');
                
                // Update in local array
                const index = this.items.findIndex(i => i.id == itemId);
                if (index !== -1) {
                    this.items[index] = result;
                }
            } else {
                // Create new item
                result = await alfredAPI.createItem(this.currentListId, itemData);
                UI.showSuccess('Article ajouté avec succès');
                
                // Add to local array
                this.items.push(result);
            }

            // Handle image upload if file was selected
            const imageFile = formData.get('file');
            if (imageFile && imageFile.size > 0) {
                try {
                    const uploadResult = await alfredAPI.uploadImage(imageFile);
                    await alfredAPI.attachImageToItem(result.id, uploadResult.filename);
                    
                    // Update item with image path
                    result.image_path = uploadResult.filename;
                    if (itemId) {
                        const index = this.items.findIndex(i => i.id == itemId);
                        if (index !== -1) {
                            this.items[index] = result;
                        }
                    }
                } catch (uploadError) {
                    console.error('Image upload failed:', uploadError);
                    UI.showError('Article créé mais impossible d\'ajouter l\'image');
                }
            }

            this.renderItems();
            this.updateListCounts();
            UI.hideModal('item-modal');

        } catch (error) {
            console.error('Item operation failed:', error);
            UI.showError('Impossible de sauvegarder l\'article');
        }
    }

    /**
     * Handle image upload in form
     */
    handleImageUpload(event) {
        const file = event.target.files[0];
        const preview = document.getElementById('item-image-preview');
        
        if (!preview) return;

        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                UI.showError('Veuillez sélectionner une image valide');
                event.target.value = '';
                return;
            }

            // Validate file size (10MB max)
            if (file.size > 10 * 1024 * 1024) {
                UI.showError('L\'image est trop grande (10MB maximum)');
                event.target.value = '';
                return;
            }

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button type="button" class="remove-image-btn" onclick="this.parentElement.style.display='none'; document.getElementById('item-image').value=''">
                        ✕
                    </button>
                `;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
    }

    /**
     * Toggle item check status
     */
    async toggleItemCheck(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        try {
            const newCheckedState = !item.is_checked;
            const result = await alfredAPI.toggleItemCheck(itemId, newCheckedState);
            
            // Update local state
            item.is_checked = newCheckedState;
            
            // Update UI
            this.renderItems();
            this.updateListCounts();
            
        } catch (error) {
            console.error('Failed to toggle item check:', error);
            UI.showError('Impossible de modifier le statut de l\'article');
        }
    }

    /**
     * Show item menu
     */
    showItemMenu(itemId, event) {
        event.stopPropagation();
        
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        // Create context menu (simplified for now)
        const actions = [
            { label: 'Modifier', action: () => this.showEditModal(itemId) },
            { label: 'Dupliquer', action: () => this.duplicateItem(itemId) },
            { label: 'Déplacer vers...', action: () => this.showMoveModal(itemId) },
            { label: '---', action: null },
            { label: 'Supprimer', action: () => this.deleteItem(itemId), style: 'danger' }
        ];

        this.showContextMenu(event, actions);
    }

    /**
     * Show context menu (simplified implementation)
     */
    showContextMenu(event, actions) {
        // For now, just show actions as confirm dialogs
        // In a full implementation, you'd create a proper context menu
        const action = prompt('Action: 1=Modifier, 2=Dupliquer, 3=Supprimer');
        
        switch(action) {
            case '1':
                actions[0].action();
                break;
            case '2':
                actions[1].action();
                break;
            case '3':
                actions[4].action();
                break;
        }
    }

    /**
     * Duplicate an item
     */
    async duplicateItem(itemId) {
        try {
            const duplicatedItem = await alfredAPI.duplicateItem(itemId);
            UI.showSuccess('Article dupliqué avec succès');
            
            this.items.push(duplicatedItem);
            this.renderItems();
            this.updateListCounts();

        } catch (error) {
            console.error('Failed to duplicate item:', error);
            UI.showError('Impossible de dupliquer l\'article');
        }
    }

    /**
     * Delete an item
     */
    async deleteItem(itemId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) {
            return;
        }

        try {
            await alfredAPI.deleteItem(itemId);
            UI.showSuccess('Article supprimé avec succès');
            
            // Remove from local array
            this.items = this.items.filter(i => i.id !== itemId);
            
            if (this.items.length === 0) {
                UI.showItemsEmpty();
            } else {
                this.renderItems();
            }
            
            this.updateListCounts();

        } catch (error) {
            console.error('Failed to delete item:', error);
            UI.showError('Impossible de supprimer l\'article');
        }
    }

    /**
     * Clear all checked items
     */
    async clearCheckedItems() {
        const checkedItems = this.items.filter(item => item.is_checked);
        
        if (checkedItems.length === 0) {
            UI.showInfo('Aucun article coché à supprimer');
            return;
        }

        if (!confirm(`Supprimer ${checkedItems.length} article(s) coché(s) ?`)) {
            return;
        }

        try {
            await alfredAPI.clearCheckedItems(this.currentListId);
            UI.showSuccess(`${checkedItems.length} article(s) supprimé(s)`);
            
            // Remove checked items from local array
            this.items = this.items.filter(item => !item.is_checked);
            
            if (this.items.length === 0) {
                UI.showItemsEmpty();
            } else {
                this.renderItems();
            }
            
            this.updateListCounts();

        } catch (error) {
            console.error('Failed to clear checked items:', error);
            UI.showError('Impossible de supprimer les articles cochés');
        }
    }

    // === DRAG AND DROP ===

    /**
     * Handle drag start
     */
    handleDragStart(event, item) {
        this.draggedItem = item;
        event.dataTransfer.effectAllowed = 'move';
        event.target.style.opacity = '0.5';
    }

    /**
     * Handle drag over
     */
    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        
        const targetCard = event.target.closest('.item-card');
        if (targetCard && this.draggedItem) {
            targetCard.style.borderTop = '2px solid #3b82f6';
        }
    }

    /**
     * Handle drop
     */
    async handleDrop(event) {
        event.preventDefault();
        
        const targetCard = event.target.closest('.item-card');
        if (!targetCard || !this.draggedItem) return;
        
        const targetItemId = parseInt(targetCard.dataset.itemId);
        const targetPosition = parseInt(targetCard.dataset.position);
        
        if (this.draggedItem.id === targetItemId) return;
        
        try {
            // Create new order array
            const reorderedItems = [...this.items];
            const draggedIndex = reorderedItems.findIndex(i => i.id === this.draggedItem.id);
            const targetIndex = reorderedItems.findIndex(i => i.id === targetItemId);
            
            // Move item
            const [removed] = reorderedItems.splice(draggedIndex, 1);
            reorderedItems.splice(targetIndex, 0, removed);
            
            // Create position array for API
            const itemOrders = reorderedItems.map((item, index) => ({
                id: item.id,
                position: index
            }));
            
            await alfredAPI.reorderItems(this.currentListId, itemOrders);
            
            // Update local state
            this.items = reorderedItems;
            this.renderItems();
            
        } catch (error) {
            console.error('Failed to reorder items:', error);
            UI.showError('Impossible de réorganiser les articles');
        }
    }

    /**
     * Handle drag end
     */
    handleDragEnd() {
        // Reset drag styles
        document.querySelectorAll('.item-card').forEach(card => {
            card.style.opacity = '1';
            card.style.borderTop = '';
        });
        
        this.draggedItem = null;
    }

    /**
     * Update list item counts in header
     */
    updateListCounts() {
        if (!this.items) return;
        
        const itemCount = this.items.length;
        const checkedCount = this.items.filter(item => item.is_checked).length;
        
        UI.updateText('list-item-count', `${itemCount} article${itemCount !== 1 ? 's' : ''}`);
        UI.updateText('list-checked-count', `${checkedCount} coché${checkedCount !== 1 ? 's' : ''}`);
        
        // Update sidebar list counts
        listsManager.renderLists();
    }

    /**
     * Get current items
     */
    getCurrentItems() {
        return this.items;
    }

    /**
     * Refresh items
     */
    async refreshItems() {
        if (this.currentListId) {
            await this.loadItems(this.currentListId);
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

// Create global items manager instance
window.itemsManager = new ItemsManager();