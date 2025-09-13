// Check if we're in Electron or browser environment
const isElectron =
  typeof require !== 'undefined' &&
  window.process &&
  window.process.type === 'renderer';
const ipcRenderer = isElectron ? require('electron').ipcRenderer : null;

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

    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tool = link.dataset.tool;
        this.switchTool(tool);
      });
    });
  }

  setupMenuListeners() {
    if (ipcRenderer) {
      ipcRenderer.on('navigate-to', (_, tool) => {
        this.switchTool(tool);
      });
    }
  }

  setupToolCards() {
    const toolCards = document.querySelectorAll('.tool-card');

    toolCards.forEach((card) => {
      card.addEventListener('click', () => {
        const tool = card.dataset.tool;
        this.switchTool(tool);
      });
    });
  }

  switchTool(toolName) {
    document.querySelectorAll('.tool-container').forEach((container) => {
      container.classList.remove('active');
    });

    document.querySelectorAll('.nav-link').forEach((link) => {
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
    if (toolName === 'lorem-generator' && window.LoremGenerator) {
      console.log('Lorem Generator activated - reinitializing');
      window.LoremGenerator.init();
    }

    /**
     * Initialize DateDifference tool if it's activated
     * and the class is available in the global scope.
     */
    if (toolName === 'date-difference' && window.DateDifference) {
      window.DateDifference.init();
    }
  }

  async saveFile(content, filters = []) {
    if (!ipcRenderer) {
      console.log('Save functionality not available in browser mode');
      return { success: false, error: 'Not available in browser' };
    }

    try {
      const result = await ipcRenderer.invoke('save-file', {
        content,
        filters,
      });
      return result;
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  }

  async openFile(filters = []) {
    if (!ipcRenderer) {
      console.log('Open file functionality not available in browser mode');
      return { success: false, error: 'Not available in browser' };
    }

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

    const icon =
      {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
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
        color: 'white',
      },
      error: {
        bg: 'linear-gradient(135deg, rgba(245, 54, 92, 0.95), rgba(245, 54, 92, 0.85))',
        color: 'white',
      },
      warning: {
        bg: 'linear-gradient(135deg, rgba(251, 99, 64, 0.95), rgba(251, 99, 64, 0.85))',
        color: 'white',
      },
      info: {
        bg: 'linear-gradient(135deg, rgba(94, 114, 228, 0.95), rgba(94, 114, 228, 0.85))',
        color: 'white',
      },
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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DevToolsApp();
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('Dev Tools Desktop loaded successfully');
});
