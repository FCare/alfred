/**
 * API client for Alfred backend
 */

class AlfredAPI {
    constructor() {
        // Use simple relative URLs - nginx routes /api/ to backend
        this.baseURL = '/api/v1';
        this.defaultHeaders = {
            'Content-Type': 'application/json',
        };
    }

    /**
     * Generic API request method
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            method: 'GET',
            headers: { ...this.defaultHeaders },
            credentials: 'include', // Include cookies for authentication
            ...options
        };

        if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            
            // Authentication is handled by Traefik

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return response;
            }
        } catch (error) {
            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    // === LISTS API ===

    /**
     * Get all lists for the current user
     */
    async getLists(includeShared = true, archived = false, listType = null) {
        const params = new URLSearchParams({
            include_shared: includeShared,
            archived
        });
        
        if (listType) {
            params.set('list_type', listType);
        }
        
        return this.request(`/lists?${params}`);
    }

    /**
     * Get a specific list with all its items
     */
    async getList(listId) {
        return this.request(`/lists/${listId}`);
    }

    /**
     * Create a new list
     */
    async createList(listData) {
        return this.request('/lists', {
            method: 'POST',
            body: listData
        });
    }

    /**
     * Update a list
     */
    async updateList(listId, listData) {
        return this.request(`/lists/${listId}`, {
            method: 'PUT',
            body: listData
        });
    }

    /**
     * Delete a list
     */
    async deleteList(listId) {
        return this.request(`/lists/${listId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Archive a list
     */
    async archiveList(listId) {
        return this.request(`/lists/${listId}/archive`, {
            method: 'POST'
        });
    }

    /**
     * Duplicate a list
     */
    async duplicateList(listId, newName = null) {
        const params = newName ? `?new_name=${encodeURIComponent(newName)}` : '';
        return this.request(`/lists/${listId}/duplicate${params}`, {
            method: 'POST'
        });
    }

    /**
     * Get list activity history
     */
    async getListActivity(listId, limit = 50) {
        return this.request(`/lists/${listId}/activity?limit=${limit}`);
    }

    // === ITEMS API ===

    /**
     * Get all items from a list
     */
    async getListItems(listId) {
        return this.request(`/items/list/${listId}`);
    }

    /**
     * Get a specific item
     */
    async getItem(itemId) {
        return this.request(`/items/${itemId}`);
    }

    /**
     * Create a new item
     */
    async createItem(listId, itemData) {
        return this.request(`/items/list/${listId}`, {
            method: 'POST',
            body: itemData
        });
    }

    /**
     * Update an item
     */
    async updateItem(itemId, itemData) {
        return this.request(`/items/${itemId}`, {
            method: 'PUT',
            body: itemData
        });
    }

    /**
     * Delete an item
     */
    async deleteItem(itemId) {
        return this.request(`/items/${itemId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Toggle item check status
     */
    async toggleItemCheck(itemId, checked) {
        const params = new URLSearchParams({ checked });
        return this.request(`/items/${itemId}/check?${params}`, {
            method: 'POST'
        });
    }

    /**
     * Reorder items in a list
     */
    async reorderItems(listId, itemOrders) {
        return this.request(`/items/list/${listId}/reorder`, {
            method: 'POST',
            body: itemOrders
        });
    }

    /**
     * Duplicate an item
     */
    async duplicateItem(itemId) {
        return this.request(`/items/${itemId}/duplicate`, {
            method: 'POST'
        });
    }

    /**
     * Move item to another list
     */
    async moveItem(itemId, targetListId) {
        const params = new URLSearchParams({ target_list_id: targetListId });
        return this.request(`/items/${itemId}/move?${params}`, {
            method: 'POST'
        });
    }

    /**
     * Clear all checked items from a list
     */
    async clearCheckedItems(listId) {
        return this.request(`/items/list/${listId}/clear-checked`, {
            method: 'POST'
        });
    }

    // === SHARING API ===

    /**
     * Get user invitations
     */
    async getInvitations(pendingOnly = true) {
        const params = new URLSearchParams({ pending_only: pendingOnly });
        return this.request(`/shares/invitations?${params}`);
    }

    /**
     * Get shares for a specific list
     */
    async getListShares(listId) {
        return this.request(`/shares/list/${listId}`);
    }

    /**
     * Share a list
     */
    async shareList(listId, shareData) {
        return this.request(`/shares/list/${listId}`, {
            method: 'POST',
            body: shareData
        });
    }

    /**
     * Accept an invitation
     */
    async acceptInvitation(invitationToken) {
        return this.request(`/shares/accept/${invitationToken}`, {
            method: 'POST'
        });
    }

    /**
     * Revoke a share
     */
    async revokeShare(shareId) {
        return this.request(`/shares/${shareId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Create a public link
     */
    async createPublicLink(listId, permissionLevel = 'read', expiresHours = null) {
        const params = new URLSearchParams({ permission_level: permissionLevel });
        if (expiresHours) {
            params.append('expires_hours', expiresHours);
        }
        return this.request(`/shares/list/${listId}/public-link?${params}`, {
            method: 'POST'
        });
    }

    /**
     * Leave a shared list
     */
    async leaveSharedList(listId) {
        return this.request(`/shares/list/${listId}/leave`, {
            method: 'DELETE'
        });
    }

    // === UPLOAD API ===

    /**
     * Upload an image
     */
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        return this.request('/upload/image', {
            method: 'POST',
            headers: {}, // Let browser set content-type for FormData
            body: formData
        });
    }

    /**
     * Delete an image
     */
    async deleteImage(filename) {
        return this.request(`/upload/image/${filename}`, {
            method: 'DELETE'
        });
    }

    /**
     * Get user images
     */
    async getUserImages() {
        return this.request('/upload/user-images');
    }

    /**
     * Attach image to item
     */
    async attachImageToItem(itemId, filename) {
        const params = new URLSearchParams({ filename });
        return this.request(`/upload/image/${itemId}/attach?${params}`, {
            method: 'POST'
        });
    }

    // === SEARCH API ===

    /**
     * Search for lists and items
     */
    async search(query, options = {}) {
        const params = new URLSearchParams({ q: query });
        
        if (options.limit) params.append('limit', options.limit);
        if (options.includeItems !== undefined) params.append('include_items', options.includeItems);
        if (options.includeLists !== undefined) params.append('include_lists', options.includeLists);
        if (options.listId) params.append('list_id', options.listId);
        
        return this.request(`/search?${params}`);
    }

    /**
     * Get search suggestions
     */
    async getSearchSuggestions(partialQuery, limit = 10) {
        const params = new URLSearchParams({ q: partialQuery, limit });
        return this.request(`/search/suggestions?${params}`);
    }

    /**
     * Get recent items
     */
    async getRecentItems(limit = 20) {
        const params = new URLSearchParams({ limit });
        return this.request(`/search/recent?${params}`);
    }

    /**
     * Get popular items
     */
    async getPopularItems(limit = 20) {
        const params = new URLSearchParams({ limit });
        return this.request(`/search/popular?${params}`);
    }

    // === UTILITY METHODS ===

    /**
     * Get image URL
     */
    getImageURL(filename) {
        return `${this.baseURL}/upload/image/${filename}`;
    }

}

// Create a global API instance
window.alfredAPI = new AlfredAPI();