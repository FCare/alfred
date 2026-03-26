/**
 * Application Alfred - Point d'entrée principal
 */
class AlfredApp {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            console.log('🚀 Initialisation d\'Alfred...');
            
            // Initialiser les gestionnaires globaux
            window.alfredAPI = new AlfredAPI();
            window.listsManager = listsManager;
            
            // Initialiser les gestionnaires
            listsManager.init();
            
            this.initialized = true;
            console.log('✅ Alfred initialisé avec succès');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation d\'Alfred:', error);
        }
    }
}

// Démarrer l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', async () => {
    const app = new AlfredApp();
    await app.init();
});

// Exposer l'application globalement pour debug
window.alfredApp = new AlfredApp();