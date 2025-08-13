// Tauri-compatible main.js for DevTools application
class DevToolsApp {
    constructor() {
        this.currentTool = 'home';
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupToolCards();
        this.initializeCurrentTool();
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
        // Hide all tool containers
        document.querySelectorAll('.tool-container').forEach(container => {
            container.classList.remove('active');
        });

        // Remove active class from all nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Show target container and activate nav link
        const targetContainer = document.getElementById(toolName);
        const targetNavLink = document.querySelector(`[data-tool="${toolName}"]`);

        if (targetContainer) {
            targetContainer.classList.add('active');
            this.currentTool = toolName;
        }

        if (targetNavLink) {
            targetNavLink.classList.add('active');
        }

        // Initialize tool-specific functionality
        this.initializeTool(toolName);
    }

    initializeTool(toolName) {
        // Initialize specific tools when they become active
        switch(toolName) {
            case 'uuid-generator':
                if (window.UUIDGenerator) {
                    window.UUIDGenerator.init();
                }
                break;
            case 'json-viewer':
                if (window.JSONViewer) {
                    window.JSONViewer.init();
                }
                break;
            case 'timestamp':
                if (window.TimestampTool) {
                    window.TimestampTool.init();
                }
                break;
            case 'hash-generator':
                if (window.HashGenerator) {
                    window.HashGenerator.init();
                }
                break;
            case 'base64-converter':
                if (window.Base64Converter) {
                    window.Base64Converter.init();
                }
                break;
            case 'jwt-decoder':
                if (window.JWTDecoder) {
                    window.JWTDecoder.init();
                }
                break;
            case 'case-converter':
                if (window.CaseConverter) {
                    window.CaseConverter.init();
                }
                break;
            case 'text-compare':
                if (window.TextCompare) {
                    window.TextCompare.init();
                }
                break;
            case 'json-to-ts':
                if (window.JSONToTS) {
                    window.JSONToTS.init();
                }
                break;
            case 'sql-formatter':
                if (window.SQLFormatter) {
                    window.SQLFormatter.init();
                }
                break;
            case 'number-base':
                if (window.NumberBase) {
                    window.NumberBase.init();
                }
                break;
            case 'csv-json':
                if (window.CSVJSON) {
                    window.CSVJSON.init();
                }
                break;
            case 'image-converter':
                if (window.ImageConverter) {
                    window.ImageConverter.init();
                }
                break;
            case 'markdown-editor':
                if (window.MarkdownEditor) {
                    window.MarkdownEditor.init();
                }
                break;
            case 'cron-calculator':
                if (window.CronCalculator) {
                    window.CronCalculator.init();
                }
                break;
            case 'regex-generator':
                if (window.RegexGenerator) {
                    window.RegexGenerator.init();
                }
                break;
            case 'code-playground':
                if (window.CodePlayground) {
                    window.CodePlayground.init();
                }
                break;
            case 'qr-generator':
                if (window.QRGenerator) {
                    window.QRGenerator.init();
                }
                break;
            case 'color-palette':
                if (window.ColorPalette) {
                    window.ColorPalette.init();
                }
                break;
            case 'url-encoder':
                if (window.URLEncoder) {
                    window.URLEncoder.init();
                }
                break;
            case 'lorem-generator':
                if (window.LoremGenerator) {
                    window.LoremGenerator.init();
                }
                break;
        }
    }

    initializeCurrentTool() {
        // Initialize the currently active tool on page load
        const activeContainer = document.querySelector('.tool-container.active');
        if (activeContainer) {
            const toolName = activeContainer.id;
            this.initializeTool(toolName);
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
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
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

    // Tauri-compatible file operations using mainApp
    async saveFile(content, filters = []) {
        if (window.mainApp && window.mainApp.saveFile) {
            return await window.mainApp.saveFile(content, filters);
        } else {
            this.showMessage('File operations not available', 'error');
            return { success: false, error: 'File operations not available' };
        }
    }

    async openFile(filters = []) {
        if (window.mainApp && window.mainApp.openFile) {
            return await window.mainApp.openFile(filters);
        } else {
            this.showMessage('File operations not available', 'error');
            return { success: false, error: 'File operations not available' };
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DevToolsApp();
    console.log('Dev Tools Desktop loaded successfully with Tauri');
});