class JSONViewerTree {
    constructor() {
        this.init();
    }

    init() {
        const formatBtn = document.getElementById('format-json');
        const minifyBtn = document.getElementById('minify-json');
        const validateBtn = document.getElementById('validate-json');
        const inputTextarea = document.getElementById('json-input');

        if (formatBtn) formatBtn.addEventListener('click', () => this.formatJSON());
        if (minifyBtn) minifyBtn.addEventListener('click', () => this.minifyJSON());
        if (validateBtn) validateBtn.addEventListener('click', () => this.validateJSON());
        if (inputTextarea) inputTextarea.addEventListener('input', () => this.clearOutput());
    }

    clearOutput() {
        const output = document.getElementById('json-output');
        output.innerHTML = '';
    }

    formatJSON() {
        const input = document.getElementById('json-input').value;
        if (!input.trim()) return this.showError('Please enter JSON data to format.');

        try {
            const parsed = JSON.parse(input);
            this.clearOutput();
            this.renderNode(parsed, document.getElementById('json-output'));
            this.clearErrors();
            window.app?.showMessage('JSON formatted successfully!', 'success');
        } catch (error) {
            this.showError(`Invalid JSON: ${error.message}`);
        }
    }

    minifyJSON() {
        const input = document.getElementById('json-input').value;
        if (!input.trim()) return this.showError('Please enter JSON data to minify.');

        try {
            const parsed = JSON.parse(input);
            const minified = JSON.stringify(parsed);
            this.clearOutput();
            this.renderNode(minified, document.getElementById('json-output'));
            this.clearErrors();
            window.app?.showMessage('JSON minified successfully!', 'success');
        } catch (error) {
            this.showError(`Invalid JSON: ${error.message}`);
        }
    }

    validateJSON() {
        const input = document.getElementById('json-input').value;
        if (!input.trim()) return this.showError('Please enter JSON data to validate.');

        try {
            const parsed = JSON.parse(input);
            this.clearOutput();

            // Append info section
            const info = this.getJSONInfo(parsed);
            const infoDiv = document.createElement('div');
            infoDiv.classList.add('json-info');
            infoDiv.innerHTML = `
                <p><strong>Type:</strong> ${info.type}</p>
                <p><strong>Size:</strong> ${info.size} characters</p>
                <p><strong>Keys:</strong> ${info.keys}</p>
                <p><strong>Depth:</strong> ${info.depth}</p>
            `;
            document.getElementById('json-output').appendChild(infoDiv);

            this.clearErrors();
            window.app?.showMessage('JSON is valid!', 'success');
        } catch (error) {
            this.showError(`Invalid JSON: ${error.message}`);
        }
    }

    getJSONInfo(obj) {
        const type = Array.isArray(obj) ? 'Array' : typeof obj;
        const size = JSON.stringify(obj).length;
        const keys = this.countKeys(obj);
        const depth = this.getMaxDepth(obj);
        return { type, size, keys, depth };
    }

    countKeys(obj) {
        if (typeof obj !== 'object' || obj === null) return 0;
        if (Array.isArray(obj)) return obj.length;

        let count = 0;
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                count++;
                count += this.countKeys(obj[key]);
            }
        }
        return count;
    }

    getMaxDepth(obj, depth = 0) {
        if (typeof obj !== 'object' || obj === null) return depth;
        let max = depth;
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                max = Math.max(max, this.getMaxDepth(obj[key], depth + 1));
            }
        }
        return max;
    }

    renderNode(value, container, key = null) {
        const node = document.createElement('div');
        node.classList.add('json-node');

        if (typeof value === 'object' && value !== null) {
            const isArray = Array.isArray(value);

            const arrow = document.createElement('span');
            arrow.textContent = '▼';
            arrow.classList.add('arrow');

            // Stringify key if not null
            const keySpan = document.createElement('span');
            keySpan.textContent = key !== null ? `"${key}": ` : '';
            keySpan.classList.add('json-key');

            const openSymbol = document.createElement('span');
            openSymbol.textContent = isArray ? '[' : '{';
            openSymbol.classList.add('brace');

            const closeSymbol = document.createElement('span');
            closeSymbol.textContent = isArray ? ']' : '}';
            closeSymbol.classList.add('brace');

            node.appendChild(arrow);
            node.appendChild(keySpan);
            node.appendChild(openSymbol);

            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('json-children');

            if (isArray) {
                value.forEach((v, i) => this.renderNode(v, childrenContainer, i));
            } else {
                for (let k in value) {
                    if (value.hasOwnProperty(k)) this.renderNode(value[k], childrenContainer, k);
                }
            }

            node.appendChild(childrenContainer);
            node.appendChild(closeSymbol);

            arrow.addEventListener('click', () => {
                node.classList.toggle('json-collapsed');
                arrow.textContent = node.classList.contains('json-collapsed') ? '▶' : '▼';
            });

        } else {
            // Primitive value
            const valueSpan = document.createElement('span');
            let displayValue = value;

            if (typeof value === 'string') {
                displayValue = `"${value}"`; // wrap string value in quotes
            } else if (value === null) {
                displayValue = 'null';
            }

            valueSpan.textContent = displayValue;
            valueSpan.classList.add(
                value === null ? 'value-null' :
                typeof value === 'string' ? 'value-string' :
                typeof value === 'number' ? 'value-number' :
                typeof value === 'boolean' ? 'value-boolean' : ''
            );

            if (key !== null && typeof key !== 'number') { 
                // wrap key in quotes if it is a string key
                const keySpan = document.createElement('span');
                keySpan.textContent = `"${key}": `;
                keySpan.classList.add('json-key');
                node.appendChild(keySpan);
            }

            node.appendChild(valueSpan);
        }

        container.appendChild(node);
    }

    showError(message) {
        const output = document.getElementById('json-output');
        output.innerHTML = `<div class="error">${message}</div>`;
    }

    clearErrors() {
        const existingErrors = document.querySelectorAll('#json-output .error');
        existingErrors.forEach(error => error.remove());
    }
}

window.JSONViewer = new JSONViewerTree();
