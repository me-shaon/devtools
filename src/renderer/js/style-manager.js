/**
 * Centralized style management utility
 * Prevents duplicate style elements and manages CSS injection
 */
window.StyleManager = {
    addedStyles: new Set(),
    
    /**
     * Add styles for a tool, preventing duplicates
     * @param {string} toolName - Name of the tool (e.g., 'color-palette')
     * @param {string} cssContent - CSS content to add
     */
    addToolStyles(toolName, cssContent) {
        // Check if styles for this tool already exist
        if (this.addedStyles.has(toolName)) {
            return; // Styles already added
        }
        
        // Create and add style element
        const styleElement = document.createElement('style');
        styleElement.id = `${toolName}-styles`;
        styleElement.textContent = cssContent;
        document.head.appendChild(styleElement);
        
        // Mark as added
        this.addedStyles.add(toolName);
        
        console.log(`✅ Styles added for: ${toolName}`);
    },
    
    /**
     * Remove styles for a specific tool
     * @param {string} toolName - Name of the tool
     */
    removeToolStyles(toolName) {
        const existingStyle = document.getElementById(`${toolName}-styles`);
        if (existingStyle) {
            existingStyle.remove();
            this.addedStyles.delete(toolName);
            console.log(`🗑️ Styles removed for: ${toolName}`);
        }
    },
    
    /**
     * Check if styles are already loaded for a tool
     * @param {string} toolName - Name of the tool
     * @returns {boolean}
     */
    hasStyles(toolName) {
        return this.addedStyles.has(toolName);
    }
};
