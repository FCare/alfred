/**
 * Search management for Alfred
 */

class SearchManager {
    constructor() {
        this.searchInput = null;
        this.searchResults = [];
        this.searchTimeout = null;
        this.isSearching = false;
    }

    /**
     * Initialize search management
     */
    init() {
        this.searchInput = document.getElementById('global-search');
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (!this.searchInput) return;

        // Search input events
        this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
        this.searchInput.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
        
        // Search button
        UI.addEventListener('search-btn', 'click', () => this.performSearch());
        
        // Close search results
        UI.addEventListener('close-search', 'click', () => this.closeSearch());
        
        // ESC to close search
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && UI.getCurrentView() === 'search') {
                this.closeSearch();
            }
        });
    }

    /**
     * Handle search input
     */
    handleSearchInput(event) {
        const query = event.target.value.trim();
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        if (query.length === 0) {
            this.clearSearch();
            return;
        }
        
        // Debounce search
        this.searchTimeout = setTimeout(() => {
            if (query.length >= 2) {
                this.performSearch(query);
            }
        }, 300);
    }

    /**
     * Handle search keydown events
     */
    handleSearchKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.performSearch();
        } else if (event.key === 'Escape') {
            this.clearSearch();
        }
    }

    /**
     * Perform search
     */
    async performSearch(query = null) {
        const searchQuery = query || this.searchInput.value.trim();
        
        if (!searchQuery || searchQuery.length < 2) {
            UI.showError('Veuillez saisir au moins 2 caractères');
            return;
        }

        if (this.isSearching) return;

        try {
            this.isSearching = true;
            this.showSearchLoading();
            
            const options = {
                limit: 50,
                includeItems: true,
                includeLists: true
            };
            
            const results = await alfredAPI.search(searchQuery, options);
            this.searchResults = results.results || [];
            
            this.renderSearchResults(searchQuery, results);
            UI.showSearchResults();
            
        } catch (error) {
            console.error('Search failed:', error);
            UI.showError('Erreur lors de la recherche');
        } finally {
            this.isSearching = false;
        }
    }

    /**
     * Show search loading state
     */
    showSearchLoading() {
        const container = document.getElementById('search-results-list');
        if (container) {
            container.innerHTML = `
                <div class="search-loading">
                    <div class="mini-spinner"></div>
                    <span>Recherche en cours...</span>
                </div>
            `;
        }
    }

    /**
     * Render search results
     */
    renderSearchResults(query, results) {
        const container = document.getElementById('search-results-list');
        if (!container) return;

        if (results.results.length === 0) {
            container.innerHTML = `
                <div class="search-empty">
                    <div class="empty-illustration">🔍</div>
                    <h3>Aucun résultat trouvé</h3>
                    <p>Essayez avec d'autres mots-clés</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        
        // Group results by type
        const listResults = results.results.filter(r => r.type === 'list');
        const itemResults = results.results.filter(r => r.type === 'item');
        
        // Show lists first
        if (listResults.length > 0) {
            this.addResultsSection(container, 'Listes', listResults);
        }
        
        // Then items
        if (itemResults.length > 0) {
            this.addResultsSection(container, 'Articles', itemResults);
        }
    }

    /**
     * Add results section
     */
    addResultsSection(container, title, results) {
        const section = document.createElement('div');
        section.className = 'search-results-section';
        
        const sectionTitle = document.createElement('h3');
        sectionTitle.className = 'search-section-title';
        sectionTitle.textContent = `${title} (${results.length})`;
        section.appendChild(sectionTitle);
        
        results.forEach(result => {
            const resultElement = this.createResultElement(result);
            section.appendChild(resultElement);
        });
        
        container.appendChild(section);
    }

    /**
     * Create result element
     */
    createResultElement(result) {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.dataset.resultType = result.type;
        div.dataset.resultId = result.id;
        
        const icon = result.type === 'list' ? 
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3"></path>
            </svg>` :
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>`;
        
        const metaText = result.type === 'list' ? 
            `Liste ${result.is_private ? 'privée' : 'partagée'}` :
            `Dans "${result.list_name}"`;
        
        div.innerHTML = `
            <div class="search-result-icon">
                ${icon}
            </div>
            <div class="search-result-content">
                <div class="search-result-title">${this.escapeHtml(result.name)}</div>
                <div class="search-result-meta">
                    ${metaText}
                    ${result.highlight ? ` • ${this.escapeHtml(result.highlight)}` : ''}
                </div>
            </div>
        `;
        
        // Click handler
        div.addEventListener('click', () => this.handleResultClick(result));
        
        return div;
    }

    /**
     * Handle result click
     */
    async handleResultClick(result) {
        try {
            if (result.type === 'list') {
                // Navigate to list
                await listsManager.selectList(result.id);
                this.closeSearch();
            } else if (result.type === 'item') {
                // Navigate to list containing the item, then highlight item
                await listsManager.selectList(result.list_id);
                this.closeSearch();
                
                // Highlight the item
                setTimeout(() => {
                    const itemElement = document.querySelector(`[data-item-id="${result.id}"]`);
                    if (itemElement) {
                        itemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        itemElement.style.animation = 'highlight 2s ease-out';
                    }
                }, 500);
            }
        } catch (error) {
            console.error('Failed to navigate to result:', error);
            UI.showError('Impossible d\'accéder au résultat');
        }
    }

    /**
     * Search within current list
     */
    async searchInList(query, listId) {
        try {
            const options = {
                limit: 50,
                includeItems: true,
                includeLists: false,
                listId: listId
            };
            
            const results = await alfredAPI.search(query, options);
            return results.results || [];
            
        } catch (error) {
            console.error('List search failed:', error);
            return [];
        }
    }

    /**
     * Get search suggestions
     */
    async getSearchSuggestions(query) {
        try {
            const suggestions = await alfredAPI.getSearchSuggestions(query);
            return suggestions || [];
        } catch (error) {
            console.error('Failed to get suggestions:', error);
            return [];
        }
    }

    /**
     * Get recent items
     */
    async getRecentItems() {
        try {
            const recentItems = await alfredAPI.getRecentItems();
            return recentItems || [];
        } catch (error) {
            console.error('Failed to get recent items:', error);
            return [];
        }
    }

    /**
     * Get popular items
     */
    async getPopularItems() {
        try {
            const popularItems = await alfredAPI.getPopularItems();
            return popularItems || [];
        } catch (error) {
            console.error('Failed to get popular items:', error);
            return [];
        }
    }

    /**
     * Clear search
     */
    clearSearch() {
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        this.searchResults = [];
        this.closeSearch();
    }

    /**
     * Close search results
     */
    closeSearch() {
        // Return to previous view
        const currentList = listsManager.getCurrentList();
        if (currentList) {
            UI.showListView(currentList.id);
        } else {
            UI.showWelcomeScreen();
        }
    }

    /**
     * Filter items in current list
     */
    filterCurrentList(query) {
        if (!query) {
            // Show all items
            itemsManager.renderItems();
            return;
        }
        
        const items = itemsManager.getCurrentItems();
        const filteredItems = items.filter(item => 
            item.name.toLowerCase().includes(query.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(query.toLowerCase())) ||
            (item.quantity && item.quantity.toLowerCase().includes(query.toLowerCase()))
        );
        
        // Temporarily update items display
        const container = document.getElementById('items-list');
        if (container) {
            if (filteredItems.length === 0) {
                container.innerHTML = `
                    <div class="search-empty">
                        <p>Aucun article trouvé pour "${this.escapeHtml(query)}"</p>
                    </div>
                `;
            } else {
                container.innerHTML = '';
                filteredItems.forEach((item, index) => {
                    const itemElement = itemsManager.createItemElement(item, index);
                    container.appendChild(itemElement);
                });
            }
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

// Create global search manager instance
window.searchManager = new SearchManager();