/**
 * Gestionnaire de listes simplifié
 */
class ListsManager {
    constructor() {
        this.lists = [];
        this.currentList = null;
    }

    /**
     * Initialisation
     */
    init() {
        this.setupEventListeners();
        this.loadLists();
    }

    /**
     * Configuration des event listeners
     */
    setupEventListeners() {
        // Modal création de liste
        const createForm = document.getElementById('create-list-form');
        if (createForm) {
            createForm.addEventListener('submit', (e) => this.handleCreateList(e));
        }

        const cancelBtn = document.getElementById('cancel-create-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideCreateModal());
        }

        // Boutons de la vue liste
        const closeListBtn = document.getElementById('close-list-btn');
        if (closeListBtn) {
            closeListBtn.addEventListener('click', () => this.closeListView());
        }

        const deleteListBtn = document.getElementById('delete-list-btn');
        if (deleteListBtn) {
            deleteListBtn.addEventListener('click', () => this.deleteCurrentList());
        }

        // Ajout d'élément
        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => this.addItem());
        }

        const newItemInput = document.getElementById('new-item-input');
        if (newItemInput) {
            newItemInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addItem();
                }
            });
        }

        // Bouton photo
        const photoBtn = document.getElementById('photo-btn');
        const photoInput = document.getElementById('new-item-photo');
        if (photoBtn && photoInput) {
            photoBtn.addEventListener('click', () => photoInput.click());
            photoInput.addEventListener('change', (e) => this.handlePhotoSelect(e));
        }
    }

    /**
     * Charger toutes les listes
     */
    async loadLists() {
        try {
            const response = await alfredAPI.getLists();
            this.lists = response || [];
            this.renderLists();
        } catch (error) {
            console.error('Erreur chargement listes:', error);
            this.showMessage('Erreur lors du chargement des listes', 'error');
        }
    }

    /**
     * Afficher les listes
     */
    renderLists() {
        const container = document.getElementById('lists-container');
        if (!container) return;

        container.innerHTML = '';

        // Ajouter les listes existantes
        this.lists.forEach(list => {
            const card = this.createListCard(list);
            container.appendChild(card);
        });

        // Ajouter la carte "Nouvelle liste" avec un +
        const newListCard = this.createNewListCard();
        container.appendChild(newListCard);
    }

    /**
     * Créer une carte de liste
     */
    createListCard(list) {
        const card = document.createElement('div');
        card.className = `list-card ${list.list_type || 'shopping'}`;
        
        const itemCount = list.item_count || 0;
        const checkedCount = list.checked_count || 0;
        
        card.innerHTML = `
            <h3>${this.escapeHtml(list.name)}</h3>
            <div class="list-meta">
                ${itemCount} élément${itemCount !== 1 ? 's' : ''}
                ${checkedCount > 0 ? ` • ${checkedCount} coché${checkedCount !== 1 ? 's' : ''}` : ''}
            </div>
        `;

        card.addEventListener('click', () => this.openList(list.id));

        return card;
    }

    /**
     * Créer la carte "Nouvelle liste"
     */
    createNewListCard() {
        const card = document.createElement('div');
        card.className = 'list-card new-list-card';
        
        card.innerHTML = `
            <div class="new-list-content">
                <div class="plus-icon">+</div>
                <h3>Nouvelle liste</h3>
            </div>
        `;

        card.addEventListener('click', () => this.showCreateModal());

        return card;
    }

    /**
     * Ouvrir une liste
     */
    async openList(listId) {
        try {
            const list = await alfredAPI.getList(listId);
            this.currentList = list;
            this.showListView();
        } catch (error) {
            console.error('Erreur ouverture liste:', error);
            this.showMessage('Erreur lors de l\'ouverture de la liste', 'error');
        }
    }

    /**
     * Afficher la vue liste
     */
    showListView() {
        if (!this.currentList) return;

        // Cacher la vue listes, montrer la vue liste
        document.getElementById('lists-view').style.display = 'none';
        document.getElementById('list-view').style.display = 'block';

        // Centrer le header (plus de bouton à masquer)
        document.querySelector('.app-header').classList.add('centered');

        // Mettre à jour le titre
        document.getElementById('current-list-name').textContent = this.currentList.name;

        // Adapter l'interface selon le type de liste
        this.adaptInterfaceForListType();

        // Afficher les éléments
        this.renderItems();
    }

    /**
     * Adapter l'interface selon le type de liste
     */
    adaptInterfaceForListType() {
        const listType = this.currentList.list_type;
        const addItemDiv = document.querySelector('.add-item');
        const quantityInput = document.getElementById('new-item-quantity');
        const nameInput = document.getElementById('new-item-input');
        const commentInput = document.getElementById('new-item-comment');
        
        if (listType === 'todo') {
            // Pour les todos : appliquer layout spécial et adapter placeholders
            addItemDiv.classList.add('todo-layout');
            nameInput.placeholder = 'Nouvelle tâche...';
            commentInput.placeholder = 'Description (optionnel)';
        } else {
            // Pour shopping/wishlist/inventory : layout normal
            addItemDiv.classList.remove('todo-layout');
            quantityInput.style.display = 'block';
            nameInput.placeholder = 'Nom de l\'élément...';
            commentInput.placeholder = 'Commentaire (optionnel)';
            
            // Adapter le placeholder de quantité selon le type
            if (listType === 'shopping') {
                quantityInput.placeholder = 'Quantité (ex: 2 kg)';
            } else if (listType === 'inventory') {
                quantityInput.placeholder = 'Quantité en stock';
            } else {
                quantityInput.placeholder = 'Quantité (optionnel)';
            }
        }
    }

    /**
     * Fermer la vue liste
     */
    closeListView() {
        document.getElementById('list-view').style.display = 'none';
        document.getElementById('lists-view').style.display = 'block';
        
        // Décentrer le header
        document.querySelector('.app-header').classList.remove('centered');
        
        this.currentList = null;
        this.clearAddItemForm();
        
        // Recharger les listes pour mettre à jour les compteurs
        this.loadLists();
    }

    /**
     * Afficher les éléments de la liste
     */
    renderItems() {
        const container = document.getElementById('items-container');
        if (!container || !this.currentList) return;

        container.innerHTML = '';

        if (!this.currentList.items || this.currentList.items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Aucun élément dans cette liste</p>
                </div>
            `;
            return;
        }

        this.currentList.items.forEach(item => {
            const itemCard = this.createItemCard(item);
            container.appendChild(itemCard);
        });
    }

    /**
     * Créer une carte d'élément
     */
    createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';

        const listType = this.currentList.list_type;
        const showQuantity = listType !== 'todo' && item.quantity;

        // Construire le HTML avec les champs optionnels selon le type
        let itemHTML = `
            <div class="item-content">
                <input type="checkbox" class="item-checkbox" ${item.is_checked ? 'checked' : ''} />
                <div class="item-details">
                    <div class="item-main">
                        <span class="item-name ${item.is_checked ? 'checked' : ''}">${this.escapeHtml(item.name)}</span>
                        ${showQuantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                    </div>
                    ${item.description ? `<div class="item-description">${this.escapeHtml(item.description)}</div>` : ''}
                </div>
                ${item.image_path ? `<img src="/uploads/${item.image_path}" alt="Photo" class="item-photo" />` : ''}
            </div>
            <div class="item-actions">
                <button class="item-remove ${item.is_checked ? 'checked' : ''}" title="Supprimer">✕</button>
            </div>
        `;

        card.innerHTML = itemHTML;

        // Event listeners
        const checkbox = card.querySelector('.item-checkbox');
        checkbox.addEventListener('change', () => this.toggleItem(item.id, checkbox.checked));

        const removeBtn = card.querySelector('.item-remove');
        removeBtn.addEventListener('click', () => this.removeItem(item.id));

        return card;
    }

    /**
     * Ajouter un élément
     */
    async addItem() {
        const nameInput = document.getElementById('new-item-input');
        const quantityInput = document.getElementById('new-item-quantity');
        const commentInput = document.getElementById('new-item-comment');
        const photoInput = document.getElementById('new-item-photo');

        const itemName = nameInput.value.trim();
        if (!itemName || !this.currentList) return;

        try {
            // Préparer les données selon le type de liste
            const listType = this.currentList.list_type;
            const itemData = {
                name: itemName,
                description: commentInput.value.trim() || null,
                is_checked: false
            };

            // Ajouter la quantité seulement si ce n'est pas une todo et qu'elle est renseignée
            if (listType !== 'todo') {
                const quantity = quantityInput.value.trim();
                if (quantity) {
                    itemData.quantity = quantity;
                }
            }

            // Gérer l'upload de photo si présente
            if (photoInput.files && photoInput.files[0]) {
                try {
                    const uploadResponse = await alfredAPI.uploadImage(photoInput.files[0]);
                    itemData.image_path = uploadResponse.filename;
                } catch (uploadError) {
                    console.error('Erreur upload photo:', uploadError);
                    this.showMessage('Erreur lors de l\'upload de la photo', 'error');
                    return;
                }
            }

            const newItem = await alfredAPI.createItem(this.currentList.id, itemData);

            // Ajouter à la liste actuelle
            if (!this.currentList.items) {
                this.currentList.items = [];
            }
            this.currentList.items.push(newItem);

            // Réafficher et nettoyer
            this.renderItems();
            this.clearAddItemForm();

        } catch (error) {
            console.error('Erreur ajout élément:', error);
            this.showMessage('Erreur lors de l\'ajout de l\'élément', 'error');
        }
    }

    /**
     * Nettoyer le formulaire d'ajout
     */
    clearAddItemForm() {
        document.getElementById('new-item-input').value = '';
        document.getElementById('new-item-quantity').value = '';
        document.getElementById('new-item-comment').value = '';
        document.getElementById('new-item-photo').value = '';
        
        // Réapplique l'adaptation de l'interface (au cas où le type aurait changé)
        if (this.currentList) {
            this.adaptInterfaceForListType();
        }
    }

    /**
     * Gérer la sélection de photo
     */
    handlePhotoSelect(event) {
        const file = event.target.files[0];
        if (file) {
            // Optionnel: montrer un aperçu ou le nom du fichier sélectionné
            console.log('Photo sélectionnée:', file.name);
        }
    }

    /**
     * Basculer l'état coché d'un élément
     */
    async toggleItem(itemId, checked) {
        try {
            await alfredAPI.toggleItemCheck(itemId, checked);
            
            // Mettre à jour localement
            const item = this.currentList.items.find(i => i.id === itemId);
            if (item) {
                item.is_checked = checked;
                this.renderItems();
            }

        } catch (error) {
            console.error('Erreur toggle élément:', error);
            this.showMessage('Erreur lors de la mise à jour', 'error');
        }
    }

    /**
     * Supprimer un élément
     */
    async removeItem(itemId) {
        try {
            await alfredAPI.deleteItem(itemId);

            // Retirer de la liste locale
            this.currentList.items = this.currentList.items.filter(item => item.id !== itemId);
            this.renderItems();

        } catch (error) {
            console.error('Erreur suppression élément:', error);
            this.showMessage('Erreur lors de la suppression', 'error');
        }
    }

    /**
     * Afficher le modal de création
     */
    showCreateModal() {
        document.getElementById('create-list-modal').style.display = 'flex';
        document.getElementById('list-name-input').focus();
    }

    /**
     * Masquer le modal de création
     */
    hideCreateModal() {
        document.getElementById('create-list-modal').style.display = 'none';
        document.getElementById('list-name-input').value = '';
        document.getElementById('list-type-input').value = 'shopping';
    }

    /**
     * Gérer la création de liste
     */
    async handleCreateList(event) {
        event.preventDefault();

        const name = document.getElementById('list-name-input').value.trim();
        const type = document.getElementById('list-type-input').value;

        if (!name) return;

        try {
            const newList = await alfredAPI.createList({
                name: name,
                list_type: type,
                description: '',
                is_private: true
            });

            // Ajouter à la liste locale
            this.lists.unshift(newList);
            this.renderLists();
            this.hideCreateModal();
            this.showMessage('Liste créée avec succès', 'success');

        } catch (error) {
            console.error('Erreur création liste:', error);
            this.showMessage('Erreur lors de la création de la liste', 'error');
        }
    }

    /**
     * Supprimer la liste actuelle
     */
    async deleteCurrentList() {
        if (!this.currentList) return;

        if (!confirm(`Êtes-vous sûr de vouloir supprimer la liste "${this.currentList.name}" ?`)) {
            return;
        }

        try {
            await alfredAPI.deleteList(this.currentList.id);

            // Retirer de la liste locale
            this.lists = this.lists.filter(list => list.id !== this.currentList.id);
            
            this.closeListView();
            this.renderLists();
            this.showMessage('Liste supprimée', 'success');

        } catch (error) {
            console.error('Erreur suppression liste:', error);
            this.showMessage('Erreur lors de la suppression', 'error');
        }
    }

    /**
     * Afficher un message
     */
    showMessage(text, type = 'info') {
        // Retirer les anciens messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;

        const main = document.querySelector('.app-main');
        main.insertBefore(message, main.firstChild);

        // Auto-retirer après 3 secondes
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 3000);
    }

    /**
     * Échapper le HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Instance globale
const listsManager = new ListsManager();