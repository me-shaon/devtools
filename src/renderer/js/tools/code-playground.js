class CodePlayground {
    constructor() {
        this.consoleHistory = [];
        this.init();
    }

    init() {
        const runBtn = document.getElementById('run-code');
        const clearBtn = document.getElementById('clear-code');
        const formatBtn = document.getElementById('format-code');
        const languageSelect = document.getElementById('code-language');
        const outputTabs = document.querySelectorAll('.output-tab');
        const codeInput = document.getElementById('code-input');

        if (runBtn) {
            runBtn.addEventListener('click', () => this.runCode());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCode());
        }

        if (formatBtn) {
            formatBtn.addEventListener('click', () => this.formatCode());
        }

        if (languageSelect) {
            languageSelect.addEventListener('change', () => this.updateLanguage());
        }

        if (codeInput) {
            codeInput.addEventListener('input', () => this.highlightSyntax());
            codeInput.addEventListener('scroll', () => this.syncScroll());
        }

        outputTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchOutputTab(tab.dataset.tab);
            });
        });

        this.setupConsoleCapture();
        this.setupSyntaxHighlighting();
        this.updateLanguage();
    }

    runCode() {
        const code = document.getElementById('code-input').value;
        const language = document.getElementById('code-language').value;

        if (!code.trim()) {
            window.app?.showMessage('Please enter code to run.', 'error');
            return;
        }

        this.clearOutput();
        this.switchOutputTab('result');

        try {
            switch (language) {
                case 'javascript':
                    this.runJavaScript(code);
                    break;
                case 'html':
                    this.runHTML(code);
                    break;
                case 'css':
                    this.runCSS(code);
                    break;
                case 'json':
                    this.validateJSON(code);
                    break;
                case 'markdown':
                    this.renderMarkdown(code);
                    break;
                default:
                    this.displayCode(code, language);
            }
            window.app?.showMessage('Code executed successfully!', 'success');
        } catch (error) {
            this.displayError(error.message);
            window.app?.showMessage('Error executing code: ' + error.message, 'error');
        }
    }

    runJavaScript(code) {
        const iframe = document.getElementById('result-frame');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        margin: 20px; 
                        background: white;
                    }
                    .output { 
                        background: #f8f9fa; 
                        padding: 15px; 
                        border-radius: 6px; 
                        border: 1px solid #e0e0e0;
                        margin: 10px 0;
                        font-family: 'Monaco', 'Consolas', monospace;
                        white-space: pre-wrap;
                    }
                    .error { 
                        background: #f8d7da; 
                        border-color: #f5c6cb; 
                        color: #721c24; 
                    }
                </style>
            </head>
            <body>
                <script>
                    window.parent.originalConsole = console;
                    console.log = function(...args) {
                        window.parent.postMessage({
                            type: 'console',
                            method: 'log',
                            args: args
                        }, '*');
                        const div = document.createElement('div');
                        div.className = 'output';
                        div.textContent = args.map(arg => 
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' ');
                        document.body.appendChild(div);
                    };
                    
                    console.error = function(...args) {
                        window.parent.postMessage({
                            type: 'console',
                            method: 'error',
                            args: args
                        }, '*');
                        const div = document.createElement('div');
                        div.className = 'output error';
                        div.textContent = 'Error: ' + args.join(' ');
                        document.body.appendChild(div);
                    };
                    
                    window.onerror = function(message, source, lineno, colno, error) {
                        console.error(\`\${message} at line \${lineno}\`);
                        return true;
                    };
                    
                    try {
                        ${code}
                    } catch (error) {
                        console.error(error.message);
                    }
                </script>
            </body>
            </html>
        `;

        iframe.srcdoc = html;
    }

    runHTML(code) {
        const iframe = document.getElementById('result-frame');
        iframe.srcdoc = code;
    }

    runCSS(code) {
        const iframe = document.getElementById('result-frame');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    ${code}
                </style>
            </head>
            <body>
                <h1>Heading 1</h1>
                <h2>Heading 2</h2>
                <p>This is a paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>
                <div class="container">
                    <div class="box">Box 1</div>
                    <div class="box">Box 2</div>
                    <div class="box">Box 3</div>
                </div>
                <ul>
                    <li>List item 1</li>
                    <li>List item 2</li>
                    <li>List item 3</li>
                </ul>
                <button>Button</button>
                <input type="text" placeholder="Input field">
            </body>
            </html>
        `;

        iframe.srcdoc = html;
    }

    validateJSON(code) {
        try {
            const parsed = JSON.parse(code);
            const formatted = JSON.stringify(parsed, null, 2);
            this.displayCode(formatted, 'json');
        } catch (error) {
            throw new Error('Invalid JSON: ' + error.message);
        }
    }

    renderMarkdown(code) {
        const iframe = document.getElementById('result-frame');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        max-width: 800px; 
                        margin: 0 auto; 
                        padding: 20px; 
                        line-height: 1.6; 
                        background: white;
                    }
                    h1, h2, h3 { color: #333; }
                    code { 
                        background: #f4f4f4; 
                        padding: 2px 4px; 
                        border-radius: 3px; 
                        font-family: 'Monaco', 'Consolas', monospace; 
                    }
                    pre { 
                        background: #f4f4f4; 
                        padding: 15px; 
                        border-radius: 5px; 
                        overflow-x: auto; 
                    }
                    blockquote { 
                        border-left: 4px solid #ddd; 
                        margin: 0; 
                        padding-left: 20px; 
                        color: #666; 
                    }
                </style>
            </head>
            <body>
                ${this.markdownToHtml(code)}
            </body>
            </html>
        `;

        iframe.srcdoc = html;
    }

    displayCode(code, language) {
        const iframe = document.getElementById('result-frame');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: 'Monaco', 'Consolas', monospace; 
                        margin: 20px; 
                        background: #f8f9fa; 
                    }
                    pre { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 8px; 
                        border: 1px solid #e0e0e0;
                        white-space: pre-wrap; 
                        font-size: 13px;
                        line-height: 1.4;
                    }
                    .language-label {
                        background: #667eea;
                        color: white;
                        padding: 5px 10px;
                        border-radius: 4px;
                        font-size: 12px;
                        display: inline-block;
                        margin-bottom: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="language-label">${language.toUpperCase()}</div>
                <pre><code>${this.escapeHtml(code)}</code></pre>
            </body>
            </html>
        `;

        iframe.srcdoc = html;
    }

    displayError(message) {
        const iframe = document.getElementById('result-frame');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        margin: 20px; 
                        background: white;
                    }
                    .error { 
                        background: #f8d7da; 
                        color: #721c24; 
                        padding: 20px; 
                        border-radius: 8px; 
                        border: 1px solid #f5c6cb;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <strong>Error:</strong> ${this.escapeHtml(message)}
                </div>
            </body>
            </html>
        `;

        iframe.srcdoc = html;
    }

    formatCode() {
        const code = document.getElementById('code-input').value;
        const language = document.getElementById('code-language').value;

        if (!code.trim()) {
            window.app?.showMessage('Please enter code to format.', 'error');
            return;
        }

        try {
            let formatted;
            switch (language) {
                case 'json':
                    const parsed = JSON.parse(code);
                    formatted = JSON.stringify(parsed, null, 2);
                    break;
                case 'html':
                    formatted = this.formatHTML(code);
                    break;
                case 'css':
                    formatted = this.formatCSS(code);
                    break;
                case 'javascript':
                    formatted = this.formatJavaScript(code);
                    break;
                default:
                    formatted = code;
            }

            document.getElementById('code-input').value = formatted;
            window.app?.showMessage('Code formatted!', 'success');
        } catch (error) {
            window.app?.showMessage('Error formatting code: ' + error.message, 'error');
        }
    }

    formatHTML(html) {
        return html.replace(/></g, '>\n<')
                   .replace(/\n\s*\n/g, '\n')
                   .trim();
    }

    formatCSS(css) {
        return css.replace(/\{/g, ' {\n  ')
                  .replace(/\}/g, '\n}\n')
                  .replace(/;/g, ';\n  ')
                  .replace(/\n\s*\n/g, '\n')
                  .trim();
    }

    formatJavaScript(js) {
        return js.replace(/\{/g, ' {\n  ')
                 .replace(/\}/g, '\n}')
                 .replace(/;/g, ';\n')
                 .replace(/\n\s*\n/g, '\n')
                 .trim();
    }

    setupConsoleCapture() {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'console') {
                this.addToConsole(event.data.method, event.data.args);
            }
        });
    }

    addToConsole(method, args) {
        const consoleLog = document.getElementById('console-log');
        const entry = document.createElement('div');
        entry.className = `console-entry console-${method}`;
        
        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `
            <span class="console-timestamp">${timestamp}</span>
            <span class="console-content">${args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ')}</span>
        `;
        
        consoleLog.appendChild(entry);
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    switchOutputTab(tab) {
        document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.output-content').forEach(c => c.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`${tab}-output`).classList.add('active');
    }

    clearCode() {
        document.getElementById('code-input').value = '';
        this.clearOutput();
        window.app?.showMessage('Code cleared!', 'info');
    }

    clearOutput() {
        const iframe = document.getElementById('result-frame');
        iframe.srcdoc = '';
        document.getElementById('console-log').innerHTML = '';
    }

    updateLanguage() {
        const language = document.getElementById('code-language').value;
        const codeInput = document.getElementById('code-input');
        
        const examples = {
            javascript: 'console.log("Hello, World!");\n\nfunction greet(name) {\n    return `Hello, ${name}!`;\n}\n\nconsole.log(greet("JavaScript"));',
            html: '<!DOCTYPE html>\n<html>\n<head>\n    <title>Hello World</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n    <p>This is a sample HTML document.</p>\n</body>\n</html>',
            css: 'body {\n    font-family: Arial, sans-serif;\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n    color: white;\n    text-align: center;\n    padding: 50px;\n}\n\n.container {\n    display: flex;\n    gap: 20px;\n    justify-content: center;\n}\n\n.box {\n    background: rgba(255,255,255,0.1);\n    padding: 20px;\n    border-radius: 10px;\n}',
            json: '{\n  "name": "Dev Tools",\n  "version": "1.0.0",\n  "description": "A collection of developer tools",\n  "features": [\n    "JSON Viewer",\n    "Text Compare",\n    "Base64 Converter"\n  ],\n  "settings": {\n    "theme": "dark",\n    "autoSave": true\n  }\n}',
            markdown: '# Markdown Example\n\nThis is a **markdown** document with *italic* text.\n\n## Features\n\n- Lists\n- Links: [GitHub](https://github.com)\n- Code: `console.log("Hello")`\n\n```javascript\nfunction hello() {\n    return "Hello, World!";\n}\n```\n\n> This is a blockquote\n\n---\n\nThat\'s all!'
        };

        if (!codeInput.value.trim() && examples[language]) {
            codeInput.value = examples[language];
        }

        setTimeout(() => this.highlightSyntax(), 100);
    }

    markdownToHtml(markdown) {
        let html = markdown;

        html = html.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (_, lang, code) => {
            return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code)}</code></pre>`;
        });

        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width: 100%; height: auto;">');
        html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
        html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
        html = html.replace(/---/g, '<hr>');

        const paragraphs = html.split(/\n\s*\n/);
        html = paragraphs.map(paragraph => {
            paragraph = paragraph.trim();
            if (paragraph && !paragraph.match(/^<(h[1-6]|ul|ol|li|blockquote|pre|hr)/)) {
                return `<p>${paragraph}</p>`;
            }
            return paragraph;
        }).join('\n\n');

        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupSyntaxHighlighting() {
        const codeEditor = document.querySelector('.code-editor');
        if (!codeEditor) return;

        this.highlightContainer = document.createElement('div');
        this.highlightContainer.className = 'syntax-highlight';
        codeEditor.appendChild(this.highlightContainer);
    }

    highlightSyntax() {
        if (!this.highlightContainer) return;

        const code = document.getElementById('code-input').value;
        const language = document.getElementById('code-language').value;

        let highlighted = this.escapeHtml(code);

        switch (language) {
            case 'javascript':
                highlighted = this.highlightJavaScript(highlighted);
                break;
            case 'css':
                highlighted = this.highlightCSS(highlighted);
                break;
            case 'json':
                highlighted = this.highlightJSON(highlighted);
                break;
            case 'html':
                highlighted = this.highlightHTML(highlighted);
                break;
        }

        this.highlightContainer.innerHTML = highlighted;
    }

    highlightJavaScript(code) {
        const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'import', 'export', 'default', 'async', 'await', 'true', 'false', 'null', 'undefined'];

        return code
            .replace(new RegExp(`\\b(${keywords.join('|')})\\b`, 'g'), '<span class="keyword">$1</span>')
            .replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g, '<span class="string">$1</span>')
            .replace(/\b\d+\.?\d*\b/g, '<span class="number">$&</span>')
            .replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, '<span class="comment">$1</span>')
            .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, '<span class="function">$1</span>')
            .replace(/[+\-*/%=<>!&|^~?:]/g, '<span class="operator">$&</span>');
    }

    highlightCSS(code) {
        return code
            .replace(/([a-zA-Z-]+)\s*:/g, '<span class="property">$1</span>:')
            .replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g, '<span class="string">$1</span>')
            .replace(/\b\d+\.?\d*(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|ex|ch|fr|vmin|vmax)?\b/g, '<span class="number">$&</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>');
    }

    highlightJSON(code) {
        return code
            .replace(/("([^"\\]|\\.)*")\s*:/g, '<span class="property">$1</span>:')
            .replace(/:\s*("([^"\\]|\\.)*")/g, ': <span class="string">$1</span>')
            .replace(/:\s*\b\d+\.?\d*\b/g, ': <span class="number">$&</span>')
            .replace(/:\s*\b(true|false|null)\b/g, ': <span class="keyword">$1</span>');
    }

    highlightHTML(code) {
        return code
            .replace(/(&lt;\/?[a-zA-Z][^&gt;]*&gt;)/g, '<span class="keyword">$1</span>')
            .replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g, '<span class="string">$1</span>')
            .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>');
    }

    syncScroll() {
        if (!this.highlightContainer) return;

        const codeInput = document.getElementById('code-input');
        this.highlightContainer.scrollTop = codeInput.scrollTop;
        this.highlightContainer.scrollLeft = codeInput.scrollLeft;
    }
}

window.CodePlayground = new CodePlayground();

const playgroundStyles = `
.playground-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 15px;
    min-height: 40px;
}

.language-selector {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    max-width: 300px;
}

.language-selector label {
    font-weight: 500;
    color: #32325d;
    white-space: nowrap;
    margin-bottom: 0;
}

.language-selector select {
    padding: 10px 12px;
    border: 2px solid #e3e8f0;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    color: #32325d;
    outline: none;
    transition: border-color 0.2s ease;
    flex: 1;
    min-width: 120px;
    height: 40px;
    box-sizing: border-box;
}

.language-selector select:focus {
    border-color: #5e72e4;
    box-shadow: 0 0 0 3px rgba(94, 114, 228, 0.1);
}

.playground-controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.playground-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    min-height: 500px;
}

.code-editor,
.code-output {
    border: 2px solid #e3e8f0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transition: border-color 0.2s ease;
}

.code-editor:focus-within {
    border-color: #5e72e4;
    box-shadow: 0 0 0 3px rgba(94, 114, 228, 0.1);
}

#code-input {
    width: 100%;
    height: 500px;
    border: none;
    outline: none;
    padding: 20px;
    font-family: 'JetBrains Mono', 'Monaco', 'Consolas', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    resize: none;
    background: #f8f9fc;
    color: #32325d;
    tab-size: 2;
    box-sizing: border-box;
}

#code-input::placeholder {
    color: #8898aa;
    font-style: italic;
}

.output-tabs {
    display: flex;
    background: #f8f9fa;
    border-bottom: 1px solid #e3e8f0;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    overflow: hidden;
}

.output-tab {
    background: transparent;
    border: none;
    padding: 12px 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #8898aa;
    border-bottom: 3px solid transparent;
    transition: all 0.2s ease;
    position: relative;
}

.output-tab:hover {
    color: #5e72e4;
    background: rgba(94, 114, 228, 0.05);
}

.output-tab.active {
    color: #5e72e4;
    border-bottom-color: #5e72e4;
    background: white;
    box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);
}

.output-content {
    display: none;
    height: 460px;
}

.output-content.active {
    display: block;
}

#result-frame {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
    box-sizing: border-box;
}

#console-log {
    height: 100%;
    overflow-y: auto;
    padding: 15px;
    background: #1a1a1a;
    color: #e8e8e8;
    font-family: 'JetBrains Mono', 'Monaco', 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.5;
    box-sizing: border-box;
}

#console-log::-webkit-scrollbar {
    width: 8px;
}

#console-log::-webkit-scrollbar-track {
    background: #2a2a2a;
}

#console-log::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
}

#console-log::-webkit-scrollbar-thumb:hover {
    background: #777;
}

.console-entry {
    margin: 5px 0;
    padding: 5px 0;
    border-bottom: 1px solid #333;
}

.console-timestamp {
    color: #888;
    font-size: 11px;
    margin-right: 10px;
}

.console-content {
    white-space: pre-wrap;
}

.console-log .console-content {
    color: #4CAF50;
}

.console-error .console-content {
    color: #f44336;
}

/* Syntax highlighting styles */
.code-editor {
    position: relative;
}

#code-input {
    position: relative;
    z-index: 1;
    background: transparent;
}

.syntax-highlight {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 20px;
    font-family: 'JetBrains Mono', 'Monaco', 'Consolas', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    pointer-events: none;
    background: #f8f9fc;
    color: transparent;
    z-index: 0;
}

.syntax-highlight .keyword {
    color: #8b5cf6;
    font-weight: 600;
}

.syntax-highlight .string {
    color: #10b981;
}

.syntax-highlight .number {
    color: #f59e0b;
}

.syntax-highlight .comment {
    color: #6b7280;
    font-style: italic;
}

.syntax-highlight .function {
    color: #3b82f6;
    font-weight: 500;
}

.syntax-highlight .operator {
    color: #ef4444;
}

.syntax-highlight .property {
    color: #8b5cf6;
}

@media (max-width: 1024px) {
    .playground-container {
        grid-template-columns: 1fr;
    }

    #code-input,
    .output-content {
        height: 300px;
    }

    .syntax-highlight {
        padding: 20px;
    }
}
`;

const codePlaygroundStyle = document.createElement('style');
codePlaygroundStyle.textContent = playgroundStyles;
document.head.appendChild(codePlaygroundStyle);