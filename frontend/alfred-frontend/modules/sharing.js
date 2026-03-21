/**
 * Sharing management for Alfred
 */

class SharingManager {
    constructor() {
        this.shares = [];
        this.invitations = [];
    }

    /**
     * Initialize sharing management
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Shared lists button
        UI.addEventListener('shared-lists-btn', 'click', () => this.showSharedLists());
    }

    /**
     * Show share modal for a list
     */
    async showShareModal(list) {
        if (!list) {
            UI.showError('Aucune liste sélectionnée');
            return;
        }

        try {
            // Create simple share modal (simplified implementation)
            const shareModal = document.createElement('div');
            shareModal.className = 'modal';
            shareModal.id = 'share-modal';
            shareModal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Partager "${list.name}"</h3>
                        <button class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="share-username">Nom d'utilisateur</label>
                            <input type="text" id="share-username" placeholder="Nom d'utilisateur à inviter">
                        </div>
                        <div class="form-group">
                            <label for="share-permission">Permissions</label>
                            <select id="share-permission">
                                <option value="read">Lecture seule</option>
                                <option value="write">Lecture et écriture</option>
                                <option value="admin">Administration complète</option>
                            </select>
                        </div>
                        <div class="current-shares">
                            <h4>Partages actuels</h4>
                            <div id="current-shares-list">Chargement...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="secondary-btn modal-cancel">Annuler</button>
                        <button type="button" class="primary-btn" onclick="sharingManager.shareList(${list.id})">Partager</button>
                        <button type="button" class="secondary-btn" onclick="sharingManager.createPublicLink(${list.id})">Lien public</button>
                    </div>
                </div>
            `;

            document.body.appendChild(shareModal);

            // Setup modal events
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal || e.target.classList.contains('modal-close') || e.target.classList.contains('modal-cancel')) {
                    this.hideShareModal();
                }
            });

            // Load current shares
            await this.loadListShares(list.id);

        } catch (error) {
            console.error('Failed to show share modal:', error);
            UI.showError('Impossible d\'afficher le partage');
        }
    }

    /**
     * Hide share modal
     */
    hideShareModal() {
        const modal = document.getElementById('share-modal');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Load shares for a list
     */
    async loadListShares(listId) {
        try {
            const shares = await alfredAPI.getListShares(listId);
            this.shares = shares || [];
            this.renderCurrentShares();
        } catch (error) {
            console.error('Failed to load shares:', error);
            const container = document.getElementById('current-shares-list');
            if (container) {
                container.innerHTML = 'Erreur de chargement';
            }
        }
    }

    /**
     * Render current shares
     */
    renderCurrentShares() {
        const container = document.getElementById('current-shares-list');
        if (!container) return;

        if (this.shares.length === 0) {
            container.innerHTML = '<p>Aucun partage actuel</p>';
            return;
        }

        container.innerHTML = '';
        
        this.shares.forEach(share => {
            const div = document.createElement('div');
            div.className = 'share-item';
            div.innerHTML = `
                <div class="share-info">
                    <strong>${share.shared_with_username || 'Lien public'}</strong>
                    <span class="share-permission">${this.getPermissionLabel(share.permission_level)}</span>
                    ${share.accepted_at ? '' : '<span class="share-pending">En attente</span>'}
                </div>
                <button class="secondary-btn" onclick="sharingManager.revokeShare(${share.id})">
                    Révoquer
                </button>
            `;
            container.appendChild(div);
        });
    }

    /**
     * Share a list
     */
    async shareList(listId) {
        const usernameInput = document.getElementById('share-username');
        const permissionSelect = document.getElementById('share-permission');
        
        if (!usernameInput || !permissionSelect) return;

        const username = usernameInput.value.trim();
        const permission = permissionSelect.value;

        if (!username) {
            UI.showError('Veuillez saisir un nom d\'utilisateur');
            return;
        }

        try {
            const shareData = {
                shared_with_username: username,
                permission_level: permission
            };

            await alfredAPI.shareList(listId, shareData);
            UI.showSuccess(`Liste partagée avec ${username}`);
            
            // Reload shares
            await this.loadListShares(listId);
            
            // Clear form
            usernameInput.value = '';

        } catch (error) {
            console.error('Failed to share list:', error);
            UI.showError('Impossible de partager la liste');
        }
    }

    /**
     * Create public link
     */
    async createPublicLink(listId) {
        const permission = document.getElementById('share-permission')?.value || 'read';
        
        try {
            const shareData = await alfredAPI.createPublicLink(listId, permission);
            
            // Show link in a simple prompt (in a real app, you'd create a proper modal)
            const baseUrl = window.location.origin;
            const shareUrl = `${baseUrl}/share/${shareData.invitation_token}`;
            
            // Copy to clipboard if available
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                UI.showSuccess('Lien public créé et copié dans le presse-papier');
            } else {
                prompt('Lien public créé:', shareUrl);
            }
            
            // Reload shares
            await this.loadListShares(listId);

        } catch (error) {
            console.error('Failed to create public link:', error);
            UI.showError('Impossible de créer le lien public');
        }
    }

    /**
     * Revoke a share
     */
    async revokeShare(shareId) {
        if (!confirm('Êtes-vous sûr de vouloir révoquer ce partage ?')) {
            return;
        }

        try {
            await alfredAPI.revokeShare(shareId);
            UI.showSuccess('Partage révoqué');
            
            // Remove from local array
            this.shares = this.shares.filter(s => s.id !== shareId);
            this.renderCurrentShares();

        } catch (error) {
            console.error('Failed to revoke share:', error);
            UI.showError('Impossible de révoquer le partage');
        }
    }

    /**
     * Show shared lists
     */
    async showSharedLists() {
        try {
            const invitations = await alfredAPI.getInvitations(false); // All invitations
            this.invitations = invitations || [];
            
            if (this.invitations.length === 0) {
                UI.showInfo('Aucune liste partagée');
                return;
            }

            // Create shared lists modal (simplified)
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'shared-lists-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Listes partagées</h3>
                        <button class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div id="shared-lists-content"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="secondary-btn modal-close">Fermer</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Setup modal events
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-close')) {
                    modal.remove();
                }
            });

            this.renderSharedLists();

        } catch (error) {
            console.error('Failed to load shared lists:', error);
            UI.showError('Impossible de charger les listes partagées');
        }
    }

    /**
     * Render shared lists
     */
    renderSharedLists() {
        const container = document.getElementById('shared-lists-content');
        if (!container) return;

        container.innerHTML = '';

        // Group by status
        const pendingInvitations = this.invitations.filter(inv => !inv.accepted_at);
        const acceptedInvitations = this.invitations.filter(inv => inv.accepted_at);

        // Pending invitations
        if (pendingInvitations.length > 0) {
            const section = document.createElement('div');
            section.innerHTML = '<h4>Invitations en attente</h4>';
            
            pendingInvitations.forEach(invitation => {
                const div = document.createElement('div');
                div.className = 'invitation-item';
                div.innerHTML = `
                    <div class="invitation-info">
                        <strong>Liste partagée par ${invitation.shared_by_username}</strong>
                        <span class="invitation-permission">${this.getPermissionLabel(invitation.permission_level)}</span>
                    </div>
                    <div class="invitation-actions">
                        <button class="primary-btn" onclick="sharingManager.acceptInvitation('${invitation.invitation_token}')">
                            Accepter
                        </button>
                    </div>
                `;
                section.appendChild(div);
            });
            
            container.appendChild(section);
        }

        // Accepted shared lists
        if (acceptedInvitations.length > 0) {
            const section = document.createElement('div');
            section.innerHTML = '<h4>Listes partagées acceptées</h4>';
            
            acceptedInvitations.forEach(invitation => {
                const div = document.createElement('div');
                div.className = 'shared-list-item';
                div.innerHTML = `
                    <div class="shared-list-info">
                        <strong>Partagé par ${invitation.shared_by_username}</strong>
                        <span class="shared-list-permission">${this.getPermissionLabel(invitation.permission_level)}</span>
                    </div>
                    <div class="shared-list-actions">
                        <button class="secondary-btn" onclick="sharingManager.leaveSharedList(${invitation.list_id})">
                            Quitter
                        </button>
                    </div>
                `;
                section.appendChild(div);
            });
            
            container.appendChild(section);
        }
    }

    /**
     * Accept an invitation
     */
    async acceptInvitation(invitationToken) {
        try {
            const result = await alfredAPI.acceptInvitation(invitationToken);
            UI.showSuccess(`Invitation acceptée pour "${result.list_name}"`);
            
            // Refresh lists
            await listsManager.loadLists();
            
            // Close modal and refresh
            const modal = document.getElementById('shared-lists-modal');
            if (modal) modal.remove();

        } catch (error) {
            console.error('Failed to accept invitation:', error);
            UI.showError('Impossible d\'accepter l\'invitation');
        }
    }

    /**
     * Leave a shared list
     */
    async leaveSharedList(listId) {
        if (!confirm('Êtes-vous sûr de vouloir quitter cette liste partagée ?')) {
            return;
        }

        try {
            const result = await alfredAPI.leaveSharedList(listId);
            UI.showSuccess('Vous avez quitté la liste partagée');
            
            // Refresh lists
            await listsManager.loadLists();
            
            // Close modal
            const modal = document.getElementById('shared-lists-modal');
            if (modal) modal.remove();

        } catch (error) {
            console.error('Failed to leave shared list:', error);
            UI.showError('Impossible de quitter la liste partagée');
        }
    }

    /**
     * Handle public link access
     */
    async handlePublicLink(invitationToken) {
        try {
            // Get public link info first
            const linkInfo = await alfredAPI.request(`/shares/public/${invitationToken}`);
            
            const shouldAccept = confirm(
                `Voulez-vous accéder à la liste "${linkInfo.list_name}" partagée par ${linkInfo.shared_by} ?`
            );
            
            if (shouldAccept) {
                await this.acceptInvitation(invitationToken);
            }

        } catch (error) {
            console.error('Failed to handle public link:', error);
            UI.showError('Lien d\'invitation invalide ou expiré');
        }
    }

    /**
     * Get permission label
     */
    getPermissionLabel(permission) {
        const labels = {
            'read': 'Lecture seule',
            'write': 'Lecture et écriture',
            'admin': 'Administration'
        };
        return labels[permission] || permission;
    }

    /**
     * Get current shares
     */
    getCurrentShares() {
        return this.shares;
    }

    /**
     * Get current invitations
     */
    getCurrentInvitations() {
        return this.invitations;
    }
}

// Create global sharing manager instance
window.sharingManager = new SharingManager();