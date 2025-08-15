
class YAMLConverter {
    constructor() {
        // Input elements
        this.yamlInput = document.getElementById('yaml-input');
        this.jsonForYamlInput = document.getElementById('json-for-yaml-input');
        
        // Output elements
        this.jsonFromYamlOutput = document.getElementById('json-from-yaml-output');
        this.yamlFromJsonOutput = document.getElementById('yaml-from-json-output');
        
        // Action buttons
        this.yamlToJsonBtn = document.getElementById('yaml-to-json-btn');
        this.jsonToYamlBtn = document.getElementById('json-to-yaml-btn');
        this.validateYamlBtn = document.getElementById('validate-yaml');
        this.validateJsonBtn = document.getElementById('validate-json');
        this.clearYamlBtn = document.getElementById('clear-yaml');
        this.clearYamlJsonBtn = document.getElementById('clear-yaml-json');
        this.copyJsonBtn = document.getElementById('copy-json');
        this.copyYamlBtn = document.getElementById('copy-yaml');
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTabs();
    }

    setupEventListeners() {
        // Conversion buttons
        this.yamlToJsonBtn.addEventListener('click', () => this.convertYamlToJson());
        this.jsonToYamlBtn.addEventListener('click', () => this.convertJsonToYaml());
        
        // Clear buttons
        this.clearYamlBtn.addEventListener('click', () => this.clearYamlToJson());
        this.clearYamlJsonBtn.addEventListener('click', () => this.clearJsonToYaml());
        
        // Validation buttons
        this.validateYamlBtn.addEventListener('click', () => this.validateYaml());
        this.validateJsonBtn.addEventListener('click', () => this.validateJson());
        
        // Copy buttons
        this.copyJsonBtn.addEventListener('click', () => this.copyToClipboard(this.jsonFromYamlOutput.textContent, 'JSON'));
        this.copyYamlBtn.addEventListener('click', () => this.copyToClipboard(this.yamlFromJsonOutput.textContent, 'YAML'));
    }

    setupTabs() {
        const tabs = document.querySelectorAll('#yaml-json .tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                document.querySelectorAll('#yaml-json .tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`${e.target.dataset.tab}-tab`).classList.add('active');
            });
        });
    }

    async copyToClipboard(text, type) {
        try {
            await navigator.clipboard.writeText(text);
            window.app.showMessage(`${type} copied to clipboard`, 'success');
        } catch (err) {
            window.app.showMessage('Failed to copy to clipboard', 'error');
        }
    }

    validateYaml() {
        try {
            const yamlText = this.yamlInput.value.trim();
            if (!yamlText) {
                throw new Error('Please enter YAML text');
            }
            jsyaml.load(yamlText);
            window.app.showMessage('YAML is valid', 'success');
        } catch (error) {
            window.app.showMessage(`Invalid YAML: ${error.message}`, 'error');
        }
    }

    validateJson() {
        try {
            const jsonText = this.jsonForYamlInput.value.trim();
            if (!jsonText) {
                throw new Error('Please enter JSON text');
            }
            JSON.parse(jsonText);
            window.app.showMessage('JSON is valid', 'success');
        } catch (error) {
            window.app.showMessage(`Invalid JSON: ${error.message}`, 'error');
        }
    }

    convertYamlToJson() {
        try {
            const yamlText = this.yamlInput.value.trim();
            if (!yamlText) {
                throw new Error('Please enter YAML text');
            }

            // Convert inline objects and arrays to proper YAML format
            let fixedYaml = this.formatInlineStructures(yamlText);
            // Add proper indentation for nested structures
            fixedYaml = this.addProperIndentation(fixedYaml);

            const jsonData = jsyaml.load(fixedYaml);
            this.jsonFromYamlOutput.textContent = JSON.stringify(jsonData, null, 2);
            window.app.showMessage('Successfully converted YAML to JSON', 'success');
        } catch (error) {
            window.app.showMessage(`Error: ${error.message}`, 'error');
            this.jsonFromYamlOutput.textContent = '';
        }
    }

    formatInlineStructures(yaml) {
        // First, normalize line endings
        let result = yaml.replace(/\r\n/g, '\n');
        
        // Fix missing spaces after colons in key-value pairs
        result = result.replace(/(\w+):(\S)/g, '$1: $2');
        
        // Convert inline objects to multiline format
        result = result.replace(/(\w+):\s*\{([^}]+)\}/g, (match, key, content) => {
            const pairs = content.split(',').map(pair => {
                const [k, v] = pair.split(':').map(s => s.trim());
                return `    ${k}: ${v}`;
            });
            return `${key}:\n${pairs.join('\n')}`;
        });

        // Convert inline arrays to multiline format
        result = result.replace(/(\w+):\s*\[([^\]]+)\]/g, (match, key, content) => {
            const items = content.split(',').map(item => item.trim());
            return `${key}:\n${items.map(item => `  - ${item}`).join('\n')}`;
        });

        return result;
    }

    addProperIndentation(yaml) {
        const lines = yaml.split('\n');
        const result = [];
        let currentIndent = 0;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Determine if this line starts a new block
            if (line.endsWith(':')) {
                result.push('  '.repeat(currentIndent) + line);
                currentIndent++;
                continue;
            }

            // Handle array items
            if (line.startsWith('-')) {
                // If previous line wasn't an array item and wasn't a block start, increment indent
                if (i > 0 && !lines[i-1].trim().startsWith('-') && !lines[i-1].trim().endsWith(':')) {
                    currentIndent++;
                }
                result.push('  '.repeat(currentIndent) + line);
                continue;
            }

            // Handle normal key-value pairs
            if (line.includes(':')) {
                // If this is the first line after a block start, keep indent
                // Otherwise, decrease indent if we're not in an array
                if (i > 0 && !lines[i-1].trim().endsWith(':') && !lines[i-1].trim().startsWith('-')) {
                    currentIndent = Math.max(0, currentIndent - 1);
                }
            }

            result.push('  '.repeat(currentIndent) + line);
        }

        return result.join('\n');
    }

    convertJsonToYaml() {
        try {
            const jsonText = this.jsonForYamlInput.value.trim();
            if (!jsonText) {
                throw new Error('Please enter JSON text');
            }

            const jsonData = JSON.parse(jsonText);
            const yamlText = jsyaml.dump(jsonData, {
                indent: 2,
                lineWidth: -1,
                noRefs: true,
                sortKeys: true,
                quotingType: '"'
            });
            this.yamlFromJsonOutput.textContent = yamlText;
            window.app.showMessage('Successfully converted JSON to YAML', 'success');
        } catch (error) {
            window.app.showMessage(`Error: ${error.message}`, 'error');
            this.yamlFromJsonOutput.textContent = '';
        }
    }

    clearYamlToJson() {
        this.yamlInput.value = '';
        this.jsonFromYamlOutput.textContent = '';
    }

    clearJsonToYaml() {
        this.jsonForYamlInput.value = '';
        this.yamlFromJsonOutput.textContent = '';
    }
}

window.YAMLConverter = new YAMLConverter();
