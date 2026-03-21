/**
 * Upload management for Alfred
 */

class UploadManager {
    constructor() {
        this.uploadQueue = [];
        this.isUploading = false;
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    }

    /**
     * Initialize upload management
     */
    init() {
        this.setupDragAndDrop();
        this.setupFileInputs();
    }

    /**
     * Setup drag and drop for images
     */
    setupDragAndDrop() {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, this.preventDefaults, false);
        });

        // Highlight drop area
        ['dragenter', 'dragover'].forEach(eventName => {
            document.addEventListener(eventName, this.highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, this.unhighlight, false);
        });

        // Handle dropped files
        document.addEventListener('drop', (e) => this.handleDrop(e), false);
    }

    /**
     * Setup file input handling
     */
    setupFileInputs() {
        // Handle file input changes
        document.addEventListener('change', (e) => {
            if (e.target.type === 'file' && e.target.accept && e.target.accept.includes('image')) {
                this.handleFileSelect(e);
            }
        });
    }

    /**
     * Prevent default drag behaviors
     */
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Highlight drop area
     */
    highlight(e) {
        // Add visual feedback for drag over
        const dropZones = document.querySelectorAll('.image-upload, .item-card');
        dropZones.forEach(zone => {
            zone.classList.add('drag-over');
        });
    }

    /**
     * Remove highlight from drop area
     */
    unhighlight(e) {
        // Remove visual feedback
        const dropZones = document.querySelectorAll('.image-upload, .item-card');
        dropZones.forEach(zone => {
            zone.classList.remove('drag-over');
        });
    }

    /**
     * Handle dropped files
     */
    async handleDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => this.isValidImageFile(file));

        if (imageFiles.length === 0) {
            if (files.length > 0) {
                UI.showError('Veuillez déposer uniquement des images');
            }
            return;
        }

        // Get target context (modal or item)
        const modal = document.querySelector('.modal[style*="flex"]');
        const targetItem = e.target.closest('.item-card');

        if (modal) {
            // Handle upload in modal
            await this.handleModalUpload(imageFiles[0]);
        } else if (targetItem) {
            // Handle direct upload to item
            const itemId = targetItem.dataset.itemId;
            if (itemId) {
                await this.uploadToItem(imageFiles[0], itemId);
            }
        } else {
            // Handle general upload
            await this.handleGeneralUpload(imageFiles);
        }
    }

    /**
     * Handle file select from input
     */
    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        const imageFiles = files.filter(file => this.isValidImageFile(file));

        if (imageFiles.length === 0) {
            UI.showError('Veuillez sélectionner des images valides');
            return;
        }

        // Handle based on context
        const modal = e.target.closest('.modal');
        if (modal) {
            await this.handleModalUpload(imageFiles[0]);
        } else {
            await this.handleGeneralUpload(imageFiles);
        }
    }

    /**
     * Handle upload in modal context
     */
    async handleModalUpload(file) {
        const preview = document.getElementById('item-image-preview');
        if (!preview) return;

        try {
            // Show preview immediately
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <div class="upload-progress" style="display: none;">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 0%"></div>
                        </div>
                        <span class="progress-text">0%</span>
                    </div>
                    <button type="button" class="remove-image-btn" onclick="uploadManager.removePreview()">
                        ✕
                    </button>
                `;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);

            // Store file for form submission
            preview.dataset.pendingFile = 'true';
            this.pendingFile = file;

        } catch (error) {
            console.error('Preview failed:', error);
            UI.showError('Impossible d\'afficher l\'aperçu');
        }
    }

    /**
     * Handle general file uploads
     */
    async handleGeneralUpload(files) {
        for (const file of files) {
            await this.uploadFile(file);
        }
    }

    /**
     * Upload to specific item
     */
    async uploadToItem(file, itemId) {
        if (!this.isValidImageFile(file)) {
            UI.showError('Format d\'image non supporté');
            return;
        }

        try {
            UI.showInfo('Upload en cours...');
            
            // Upload file
            const uploadResult = await alfredAPI.uploadImage(file);
            
            // Attach to item
            await alfredAPI.attachImageToItem(itemId, uploadResult.filename);
            
            UI.showSuccess('Image ajoutée à l\'article');
            
            // Refresh items to show new image
            await itemsManager.refreshItems();

        } catch (error) {
            console.error('Upload to item failed:', error);
            UI.showError('Impossible d\'ajouter l\'image à l\'article');
        }
    }

    /**
     * Upload a single file
     */
    async uploadFile(file) {
        if (!this.isValidImageFile(file)) {
            UI.showError(`Format non supporté: ${file.name}`);
            return null;
        }

        try {
            this.isUploading = true;
            
            // Show progress toast
            const progressToast = this.showProgressToast(file.name);
            
            // Upload file
            const result = await alfredAPI.uploadImage(file);
            
            // Remove progress toast
            if (progressToast.parentNode) {
                progressToast.parentNode.removeChild(progressToast);
            }
            
            UI.showSuccess(`Image "${file.name}" uploadée`);
            
            return result;

        } catch (error) {
            console.error('Upload failed:', error);
            UI.showError(`Échec de l'upload: ${file.name}`);
            return null;
        } finally {
            this.isUploading = false;
        }
    }

    /**
     * Show progress toast
     */
    showProgressToast(filename) {
        const toast = document.createElement('div');
        toast.className = 'toast info';
        toast.innerHTML = `
            <div class="toast-icon">📤</div>
            <div class="toast-content">
                <div class="toast-title">Upload en cours</div>
                <div class="toast-message">${filename}</div>
                <div class="upload-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 50%"></div>
                    </div>
                </div>
            </div>
        `;
        
        UI.toastContainer.appendChild(toast);
        return toast;
    }

    /**
     * Remove image preview
     */
    removePreview() {
        const preview = document.getElementById('item-image-preview');
        if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
            delete preview.dataset.pendingFile;
        }

        // Clear file input
        const fileInput = document.getElementById('item-image');
        if (fileInput) {
            fileInput.value = '';
        }

        this.pendingFile = null;
    }

    /**
     * Get pending file for form submission
     */
    getPendingFile() {
        return this.pendingFile;
    }

    /**
     * Clear pending file
     */
    clearPendingFile() {
        this.pendingFile = null;
    }

    /**
     * Validate image file
     */
    isValidImageFile(file) {
        // Check file type
        if (!this.allowedTypes.includes(file.type)) {
            return false;
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            UI.showError(`Fichier trop volumineux: ${file.name} (max ${Math.round(this.maxFileSize / (1024*1024))}MB)`);
            return false;
        }

        return true;
    }

    /**
     * Get user images
     */
    async getUserImages() {
        try {
            const images = await alfredAPI.getUserImages();
            return images || [];
        } catch (error) {
            console.error('Failed to get user images:', error);
            return [];
        }
    }

    /**
     * Delete an image
     */
    async deleteImage(filename) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette image ?')) {
            return false;
        }

        try {
            await alfredAPI.deleteImage(filename);
            UI.showSuccess('Image supprimée');
            return true;
        } catch (error) {
            console.error('Failed to delete image:', error);
            UI.showError('Impossible de supprimer l\'image');
            return false;
        }
    }

    /**
     * Show image gallery
     */
    async showImageGallery() {
        try {
            const images = await this.getUserImages();
            
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'image-gallery-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Galerie d'images</h3>
                        <button class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="image-gallery">
                            ${images.length === 0 ? 
                                '<p>Aucune image uploadée</p>' :
                                images.map(img => `
                                    <div class="gallery-item" data-filename="${img.filename}">
                                        <img src="${img.url}" alt="${img.original_filename}">
                                        <div class="gallery-actions">
                                            <button class="secondary-btn" onclick="uploadManager.deleteImage('${img.filename}')">
                                                Supprimer
                                            </button>
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
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

        } catch (error) {
            console.error('Failed to show image gallery:', error);
            UI.showError('Impossible d\'afficher la galerie');
        }
    }

    /**
     * Compress image before upload
     */
    async compressImage(file, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Get file size string
     */
    getFileSizeString(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Create global upload manager instance
window.uploadManager = new UploadManager();