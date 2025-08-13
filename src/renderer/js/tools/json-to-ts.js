class JSONToTypeScript {
    constructor() {
        this.init();
    }

    init() {
        const convertBtn = document.getElementById('convert-to-ts');
        const clearBtn = document.getElementById('clear-ts');
        const inputTextarea = document.getElementById('json-to-ts-input');

        if (convertBtn) {
            convertBtn.addEventListener('click', () => this.convertToTypeScript());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        if (inputTextarea) {
            inputTextarea.addEventListener('input', () => this.clearOutput());
        }
    }

    convertToTypeScript() {
        const input = document.getElementById('json-to-ts-input').value.trim();
        const output = document.getElementById('typescript-output');

        if (!input) {
            window.app?.showMessage('Please enter JSON data to convert.', 'error');
            return;
        }

        try {
            const parsed = JSON.parse(input);
            const typescript = this.generateTypeScript(parsed, 'RootObject');
            output.textContent = typescript;
            window.app?.showMessage('JSON converted to TypeScript!', 'success');
        } catch (error) {
            window.app?.showMessage('Error: Invalid JSON format', 'error');
            output.textContent = '';
        }
    }

    generateTypeScript(obj, interfaceName = 'RootObject', level = 0) {
        const indent = '  '.repeat(level);
        let result = '';

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return 'any[]';
            }
            const firstItem = obj[0];
            if (typeof firstItem === 'object' && firstItem !== null) {
                const itemInterface = this.generateTypeScript(firstItem, interfaceName + 'Item', level + 1);
                return itemInterface + '\n' + indent + `type ${interfaceName} = ${interfaceName}Item[];`;
            } else {
                return `${this.getTypeScriptType(firstItem)}[]`;
            }
        }

        if (typeof obj === 'object' && obj !== null) {
            result += `${indent}interface ${interfaceName} {\n`;
            
            const nestedInterfaces = [];
            
            for (const [key, value] of Object.entries(obj)) {
                const safeKey = this.makeSafePropertyName(key);
                const optional = this.shouldBeOptional(value) ? '?' : '';
                
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        result += `${indent}  ${safeKey}${optional}: any[];\n`;
                    } else {
                        const firstItem = value[0];
                        if (typeof firstItem === 'object' && firstItem !== null) {
                            const itemInterfaceName = this.capitalizeFirst(safeKey) + 'Item';
                            const itemInterface = this.generateTypeScript(firstItem, itemInterfaceName, level + 1);
                            nestedInterfaces.push(itemInterface);
                            result += `${indent}  ${safeKey}${optional}: ${itemInterfaceName}[];\n`;
                        } else {
                            result += `${indent}  ${safeKey}${optional}: ${this.getTypeScriptType(firstItem)}[];\n`;
                        }
                    }
                } else if (typeof value === 'object' && value !== null) {
                    const nestedInterfaceName = this.capitalizeFirst(safeKey);
                    const nestedInterface = this.generateTypeScript(value, nestedInterfaceName, level + 1);
                    nestedInterfaces.push(nestedInterface);
                    result += `${indent}  ${safeKey}${optional}: ${nestedInterfaceName};\n`;
                } else {
                    result += `${indent}  ${safeKey}${optional}: ${this.getTypeScriptType(value)};\n`;
                }
            }
            
            result += `${indent}}\n`;
            
            if (nestedInterfaces.length > 0) {
                result = nestedInterfaces.join('\n') + '\n' + result;
            }
            
            return result;
        }

        return this.getTypeScriptType(obj);
    }

    getTypeScriptType(value) {
        if (value === null) return 'any';
        if (typeof value === 'string') return 'string';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (Array.isArray(value)) return 'any[]';
        if (typeof value === 'object') return 'object';
        return 'any';
    }

    makeSafePropertyName(key) {
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
            return key;
        }
        return `"${key}"`;
    }

    shouldBeOptional(value) {
        return value === null || value === undefined;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    clearAll() {
        document.getElementById('json-to-ts-input').value = '';
        this.clearOutput();
        window.app?.showMessage('Cleared!', 'info');
    }

    clearOutput() {
        document.getElementById('typescript-output').textContent = '';
    }
}

window.JSONToTypeScript = new JSONToTypeScript();