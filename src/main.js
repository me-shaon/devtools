// Tauri-compatible main.js for DevTools application
// This file provides the main application logic and window management

class DevToolsMain {
    constructor() {
        this.isDev = process.env.NODE_ENV === 'development';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        console.log('DevTools Main initialized');
    }

    setupEventListeners() {
        // Listen for DOM content loaded
        document.addEventListener('DOMContentLoaded', () => {
            this.setupMenuFunctionality();
            this.setupFileOperations();
        });

        // Listen for window focus/blur events
        window.addEventListener('focus', () => {
            this.onWindowFocus();
        });

        window.addEventListener('blur', () => {
            this.onWindowBlur();
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + N: New window (placeholder)
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.createNewWindow();
            }

            // Ctrl/Cmd + Q: Quit (placeholder)
            if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
                e.preventDefault();
                this.quitApplication();
            }

            // F12: Toggle DevTools
            if (e.key === 'F12') {
                e.preventDefault();
                this.toggleDevTools();
            }

            // Ctrl/Cmd + R: Reload
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                this.reloadWindow();
            }

            // Ctrl/Cmd + Plus/Minus: Zoom
            if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                this.zoomIn();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            }

            // Ctrl/Cmd + 0: Reset zoom
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
        });
    }

    setupMenuFunctionality() {
        // Create a virtual menu system that can be triggered by keyboard shortcuts
        // or programmatically called from the renderer
        window.mainApp = {
            navigateTo: (tool) => {
                if (window.app && window.app.switchTool) {
                    window.app.switchTool(tool);
                }
            },
            saveFile: (content, filters) => {
                return this.saveFile(content, filters);
            },
            openFile: (filters) => {
                return this.openFile(filters);
            },
            showAbout: () => {
                this.showAboutDialog();
            },
            toggleDevTools: () => {
                this.toggleDevTools();
            },
            reload: () => {
                this.reloadWindow();
            },
            zoomIn: () => {
                this.zoomIn();
            },
            zoomOut: () => {
                this.zoomOut();
            },
            resetZoom: () => {
                this.resetZoom();
            }
        };
    }

    setupFileOperations() {
        // Add file operation buttons to the UI if needed
        this.addFileOperationButtons();
    }

    addFileOperationButtons() {
        // Add file operation buttons to tools that need them
        const toolsWithFileOps = ['json-viewer', 'markdown-editor', 'sql-formatter'];
        
        toolsWithFileOps.forEach(toolId => {
            const container = document.getElementById(toolId);
            if (container) {
                const controls = container.querySelector('.controls');
                if (controls) {
                    // Add file operation buttons
                    const fileOpsDiv = document.createElement('div');
                    fileOpsDiv.className = 'file-operations';
                    fileOpsDiv.innerHTML = `
                        <button class="btn btn-secondary" onclick="mainApp.openFile([{name: 'All Files', extensions: ['*']}])">
                            <i class="fas fa-folder-open"></i> Open File
                        </button>
                        <button class="btn btn-secondary" onclick="mainApp.saveFile(document.querySelector('#${toolId} textarea')?.value || '', [{name: 'Text Files', extensions: ['txt', 'json', 'md', 'sql']}])">
                            <i class="fas fa-save"></i> Save File
                        </button>
                    `;
                    controls.appendChild(fileOpsDiv);
                }
            }
        });
    }

    // Window management functions
    createNewWindow() {
        // In Tauri, this would typically open a new window
        // For now, we'll show a message
        if (window.app) {
            window.app.showMessage('New window functionality will be implemented with Tauri window API', 'info');
        }
    }

    quitApplication() {
        // In Tauri, this would quit the application
        if (window.app) {
            window.app.showMessage('Quit functionality will be implemented with Tauri app API', 'info');
        }
    }

    toggleDevTools() {
        // In Tauri, this would toggle the developer tools
        if (window.app) {
            window.app.showMessage('DevTools toggle will be implemented with Tauri window API', 'info');
        }
    }

    reloadWindow() {
        window.location.reload();
    }

    zoomIn() {
        // Implement zoom functionality
        const currentZoom = parseFloat(document.body.style.zoom) || 1;
        document.body.style.zoom = Math.min(currentZoom + 0.1, 2);
    }

    zoomOut() {
        // Implement zoom functionality
        const currentZoom = parseFloat(document.body.style.zoom) || 1;
        document.body.style.zoom = Math.max(currentZoom - 0.1, 0.5);
    }

    resetZoom() {
        document.body.style.zoom = 1;
    }

    onWindowFocus() {
        // Handle window focus events
        document.body.classList.remove('window-blurred');
        document.body.classList.add('window-focused');
    }

    onWindowBlur() {
        // Handle window blur events
        document.body.classList.remove('window-focused');
        document.body.classList.add('window-blurred');
    }

    // File operations (Tauri-compatible placeholders)
    async saveFile(content, filters = []) {
        try {
            // This would be implemented with Tauri's file system API
            console.log('Save file:', { content: content.substring(0, 100) + '...', filters });
            
            // For now, create a download link
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'devtools-export.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.app) {
                window.app.showMessage('File saved successfully!', 'success');
            }
            
            return { success: true, path: 'devtools-export.txt' };
        } catch (error) {
            console.error('Error saving file:', error);
            if (window.app) {
                window.app.showMessage('Error saving file: ' + error.message, 'error');
            }
            return { success: false, error: error.message };
        }
    }

    async openFile(filters = []) {
        try {
            // This would be implemented with Tauri's file system API
            console.log('Open file:', { filters });
            
            // For now, create a file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = filters.map(f => f.extensions?.join(',') || '*').join(',');
            
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const content = e.target.result;
                        // Find the active tool and populate its input
                        const activeTool = document.querySelector('.tool-container.active');
                        if (activeTool) {
                            const textarea = activeTool.querySelector('textarea');
                            if (textarea) {
                                textarea.value = content;
                                // Trigger any necessary events
                                textarea.dispatchEvent(new Event('input'));
                            }
                        }
                        
                        if (window.app) {
                            window.app.showMessage('File opened successfully!', 'success');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            
            input.click();
            
            return { success: true };
        } catch (error) {
            console.error('Error opening file:', error);
            if (window.app) {
                window.app.showMessage('Error opening file: ' + error.message, 'error');
            }
            return { success: false, error: error.message };
        }
    }

    showAboutDialog() {
        // Create a simple about dialog
        const aboutDialog = document.createElement('div');
        aboutDialog.className = 'about-dialog';
        aboutDialog.innerHTML = `
            <div class="about-content">
                <h2>DevTools Desktop</h2>
                <p>Professional Developer Toolkit</p>
                <p>Version 1.0.0</p>
                <p>Built with Tauri</p>
                <button onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        
        aboutDialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        aboutDialog.querySelector('.about-content').style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            max-width: 400px;
        `;
        
        document.body.appendChild(aboutDialog);
    }
}

// Initialize the main application
const mainApp = new DevToolsMain();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DevToolsMain;
}
