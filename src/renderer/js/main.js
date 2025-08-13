const { ipcRenderer } = require('electron');

class DevToolsApp {
    constructor() {
        this.currentTool = 'home';
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupMenuListeners();
        this.setupToolCards();
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
        ipcRenderer.on('navigate-to', (event, tool) => {
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
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 6px;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        `;

        if (type === 'success') {
            messageDiv.style.backgroundColor = '#d4edda';
            messageDiv.style.color = '#155724';
            messageDiv.style.border = '1px solid #c3e6cb';
        } else if (type === 'error') {
            messageDiv.style.backgroundColor = '#f8d7da';
            messageDiv.style.color = '#721c24';
            messageDiv.style.border = '1px solid #f5c6cb';
        } else {
            messageDiv.style.backgroundColor = '#d1ecf1';
            messageDiv.style.color = '#0c5460';
            messageDiv.style.border = '1px solid #bee5eb';
        }

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
}

window.app = new DevToolsApp();

document.addEventListener('DOMContentLoaded', () => {
    console.log('Dev Tools Desktop loaded successfully');
});