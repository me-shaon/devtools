const { ipcRenderer } = require('electron');

class DevToolsApp {
    constructor() {
        this.currentTool = 'home';
        this.pinnedTools = this.loadPinnedTools();
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupMenuListeners();
        this.setupToolCards();
        this.setupPinButtons();
        this.updateNavigationOrder();
    }

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tool = link.dataset.tool;
                this.switchTool(tool);
            });
        });
    }

    setupMenuListeners() {
        ipcRenderer.on('navigate-to', (_, tool) => {
            this.switchTool(tool);
        });
    }

    setupToolCards() {
        const toolCards = document.querySelectorAll('.tool-card');
        
        toolCards.forEach(card => {
            card.addEventListener('click', () => {
                const tool = card.dataset.tool;
                this.switchTool(tool);
            });
        });
    }

    switchTool(toolName) {
        document.querySelectorAll('.tool-container').forEach(container => {
            container.classList.remove('active');
        });

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        const targetContainer = document.getElementById(toolName);
        const targetNavLink = document.querySelector(`[data-tool="${toolName}"]`);

        if (targetContainer) {
            targetContainer.classList.add('active');
            this.currentTool = toolName;
            
            // Auto-activate first tab for tools that have tabs
            this.initializeToolTabs(targetContainer);
        }

        if (targetNavLink) {
            targetNavLink.classList.add('active');
        }

        if (toolName === 'uuid-generator' && window.UUIDGenerator) {
            window.UUIDGenerator.init();
        }
        if (toolName === 'json-viewer' && window.JSONViewer) {
            window.JSONViewer.init();
        }
    }

    initializeToolTabs(container) {
        // Find the first tab button in this tool container
        const firstTabBtn = container.querySelector('.tab-btn');
        if (firstTabBtn && firstTabBtn.dataset.tab) {
            // Remove active class from all tabs in this container
            container.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            container.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Activate the first tab
            firstTabBtn.classList.add('active');
            const firstTabContent = document.getElementById(firstTabBtn.dataset.tab + '-tab');
            if (firstTabContent) {
                firstTabContent.classList.add('active');
            }
        }
    }

    setupPinButtons() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const toolId = link.dataset.tool;
            if (toolId === 'home') return;
            
            // Remove existing pin button if any
            const existingPin = link.querySelector('.pin-toggle');
            if (existingPin) existingPin.remove();
            
            // Create pin toggle button
            const pinButton = document.createElement('button');
            pinButton.className = `pin-toggle ${this.pinnedTools.includes(toolId) ? 'pinned' : ''}`;
            pinButton.innerHTML = '<i class="fas fa-thumbtack"></i>';
            pinButton.title = this.pinnedTools.includes(toolId) ? 'Unpin tool' : 'Pin tool';
            
            pinButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePin(toolId);
            });
            
            link.appendChild(pinButton);
        });
    }

    loadPinnedTools() {
        try {
            const stored = localStorage.getItem('devtools-pinned');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading pinned tools:', error);
            return [];
        }
    }

    savePinnedTools() {
        try {
            localStorage.setItem('devtools-pinned', JSON.stringify(this.pinnedTools));
        } catch (error) {
            console.error('Error saving pinned tools:', error);
        }
    }

    togglePin(toolId) {
        const index = this.pinnedTools.indexOf(toolId);
        if (index > -1) {
            this.pinnedTools.splice(index, 1);
        } else {
            this.pinnedTools.push(toolId);
        }
        
        this.savePinnedTools();
        this.updateNavigationOrder();
        this.updatePinButtons();
    }

    updateNavigationOrder() {
        const navMenu = document.querySelector('.nav-menu');
        const homeLink = navMenu.querySelector('[data-tool="home"]').parentElement;
        
        // Get all nav items except home
        const allNavItems = Array.from(navMenu.children).filter(item => 
            item.querySelector('[data-tool]').dataset.tool !== 'home'
        );
        
        // Separate pinned and unpinned items
        const pinnedItems = [];
        const unpinnedItems = [];
        
        allNavItems.forEach(item => {
            const toolId = item.querySelector('[data-tool]').dataset.tool;
            if (this.pinnedTools.includes(toolId)) {
                pinnedItems.push(item);
                item.classList.add('pinned');
            } else {
                unpinnedItems.push(item);
                item.classList.remove('pinned');
            }
        });
        
        // Clear the menu (except home)
        allNavItems.forEach(item => item.remove());
        
        // Re-add in order: pinned first, then unpinned
        pinnedItems.forEach(item => navMenu.appendChild(item));
        unpinnedItems.forEach(item => navMenu.appendChild(item));
        
        // Update pin buttons
        this.setupPinButtons();
    }

    updatePinButtons() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const toolId = link.dataset.tool;
            if (toolId === 'home') return;
            
            const pinButton = link.querySelector('.pin-toggle');
            if (pinButton) {
                const isPinned = this.pinnedTools.includes(toolId);
                pinButton.className = `pin-toggle ${isPinned ? 'pinned' : ''}`;
                pinButton.title = isPinned ? 'Unpin tool' : 'Pin tool';
            }
        });
    }

    async saveFile(content, filters = []) {
        try {
            const result = await ipcRenderer.invoke('save-file', {
                content,
                filters
            });
            return result;
        } catch (error) {
            console.error('Error saving file:', error);
            return { success: false, error: error.message };
        }
    }

    async openFile(filters = []) {
        try {
            const result = await ipcRenderer.invoke('open-file', filters);
            return result;
        } catch (error) {
            console.error('Error opening file:', error);
            return { success: false, error: error.message };
        }
    }

    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `notification notification-${type}`;
        
        const icon = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        }[type] || 'fa-info-circle';
        
        messageDiv.innerHTML = `
            <i class="fas ${icon}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            z-index: 10000;
            min-width: 300px;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease;
            backdrop-filter: blur(10px);
            font-weight: 500;
        `;

        const colors = {
            success: {
                bg: 'linear-gradient(135deg, rgba(45, 206, 137, 0.95), rgba(45, 206, 137, 0.85))',
                color: 'white'
            },
            error: {
                bg: 'linear-gradient(135deg, rgba(245, 54, 92, 0.95), rgba(245, 54, 92, 0.85))',
                color: 'white'
            },
            warning: {
                bg: 'linear-gradient(135deg, rgba(251, 99, 64, 0.95), rgba(251, 99, 64, 0.85))',
                color: 'white'
            },
            info: {
                bg: 'linear-gradient(135deg, rgba(94, 114, 228, 0.95), rgba(94, 114, 228, 0.85))',
                color: 'white'
            }
        };

        const colorScheme = colors[type] || colors.info;
        messageDiv.style.background = colorScheme.bg;
        messageDiv.style.color = colorScheme.color;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                margin-left: auto;
                padding: 4px;
                opacity: 0.8;
                transition: opacity 0.2s;
            }
            .notification-close:hover {
                opacity: 1;
            }
        `;
        if (!document.querySelector('#notification-styles')) {
            style.id = 'notification-styles';
            document.head.appendChild(style);
        }

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => messageDiv.remove(), 300);
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new DevToolsApp();
    console.log('Dev Tools Desktop loaded successfully');
});