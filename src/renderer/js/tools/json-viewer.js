class JSONViewer {
    constructor() {
        this.init();
    }

    init() {
        const formatBtn = document.getElementById('format-json');
        const minifyBtn = document.getElementById('minify-json');
        const validateBtn = document.getElementById('validate-json');
        const inputTextarea = document.getElementById('json-input');
        const outputPre = document.getElementById('json-output');

        if (formatBtn) {
            formatBtn.addEventListener('click', () => this.formatJSON());
        }

        if (minifyBtn) {
            minifyBtn.addEventListener('click', () => this.minifyJSON());
        }

        if (validateBtn) {
            validateBtn.addEventListener('click', () => this.validateJSON());
        }

        if (inputTextarea) {
            inputTextarea.addEventListener('input', () => this.clearOutput());
        }
    }

    formatJSON() {
        const input = document.getElementById('json-input').value;
        const output = document.getElementById('json-output');

        if (!input.trim()) {
            this.showError('Please enter JSON data to format.');
            return;
        }

        try {
            const parsed = JSON.parse(input);
            const formatted = JSON.stringify(parsed, null, 2);
            output.textContent = formatted;
            output.className = 'formatted-json';
            this.clearErrors();
            window.app?.showMessage('JSON formatted successfully!', 'success');
        } catch (error) {
            this.showError(`Invalid JSON: ${error.message}`);
        }
    }

    minifyJSON() {
        const input = document.getElementById('json-input').value;
        const output = document.getElementById('json-output');

        if (!input.trim()) {
            this.showError('Please enter JSON data to minify.');
            return;
        }

        try {
            const parsed = JSON.parse(input);
            const minified = JSON.stringify(parsed);
            output.textContent = minified;
            output.className = 'minified-json';
            this.clearErrors();
            window.app?.showMessage('JSON minified successfully!', 'success');
        } catch (error) {
            this.showError(`Invalid JSON: ${error.message}`);
        }
    }

    validateJSON() {
        const input = document.getElementById('json-input').value;
        const output = document.getElementById('json-output');

        if (!input.trim()) {
            this.showError('Please enter JSON data to validate.');
            return;
        }

        try {
            const parsed = JSON.parse(input);
            const info = this.getJSONInfo(parsed);
            output.innerHTML = `
                <div class="validation-success">
                    <h3>✅ Valid JSON</h3>
                    <div class="json-info">
                        <p><strong>Type:</strong> ${info.type}</p>
                        <p><strong>Size:</strong> ${info.size} characters</p>
                        <p><strong>Keys:</strong> ${info.keys}</p>
                        <p><strong>Depth:</strong> ${info.depth}</p>
                    </div>
                </div>
            `;
            this.clearErrors();
            window.app?.showMessage('JSON is valid!', 'success');
        } catch (error) {
            this.showError(`Invalid JSON: ${error.message}`);
            output.innerHTML = `
                <div class="validation-error">
                    <h3>❌ Invalid JSON</h3>
                    <p>${error.message}</p>
                </div>
            `;
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
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    count += this.countKeys(obj[key]);
                }
            }
        }
        return count;
    }

    getMaxDepth(obj, depth = 0) {
        if (typeof obj !== 'object' || obj === null) return depth;
        
        let maxDepth = depth;
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                maxDepth = Math.max(maxDepth, this.getMaxDepth(obj[key], depth + 1));
            }
        }
        return maxDepth;
    }

    showError(message) {
        const output = document.getElementById('json-output');
        output.innerHTML = `<div class="error">${message}</div>`;
    }

    clearErrors() {
        const existingErrors = document.querySelectorAll('.error');
        existingErrors.forEach(error => error.remove());
    }

    clearOutput() {
        const output = document.getElementById('json-output');
        output.textContent = '';
    }
}

window.JSONViewer = new JSONViewer();