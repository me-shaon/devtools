class MarkdownEditor {
    constructor() {
        this.previewMode = 'split';
        this.init();
    }

    init() {
        const toolbarButtons = document.querySelectorAll('.toolbar-btn');
        const togglePreviewBtn = document.getElementById('toggle-preview');
        const markdownInput = document.getElementById('markdown-input');

        toolbarButtons.forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                this.handleToolbarAction(action);
            });
        });

        if (togglePreviewBtn) {
            togglePreviewBtn.addEventListener('click', () => this.togglePreview());
        }

        if (markdownInput) {
            markdownInput.addEventListener('input', () => this.updatePreview());
            markdownInput.addEventListener('scroll', () => this.syncScroll());
        }

        this.updatePreview();
    }

    handleToolbarAction(action) {
        const textarea = document.getElementById('markdown-input');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        let replacement = '';
        let newCursorPos = start;

        switch (action) {
            case 'bold':
                replacement = `**${selectedText || 'bold text'}**`;
                newCursorPos = start + (selectedText ? 2 : 2);
                break;
            case 'italic':
                replacement = `*${selectedText || 'italic text'}*`;
                newCursorPos = start + (selectedText ? 1 : 1);
                break;
            case 'heading':
                replacement = `## ${selectedText || 'Heading'}`;
                newCursorPos = start + 3;
                break;
            case 'link':
                replacement = `[${selectedText || 'link text'}](https://example.com)`;
                newCursorPos = start + 1;
                break;
            case 'code':
                if (selectedText.includes('\n')) {
                    replacement = `\`\`\`\n${selectedText || 'code'}\n\`\`\``;
                    newCursorPos = start + 4;
                } else {
                    replacement = `\`${selectedText || 'code'}\``;
                    newCursorPos = start + 1;
                }
                break;
            case 'list':
                const lines = selectedText.split('\n');
                replacement = lines.map(line => `- ${line}`).join('\n') || '- List item';
                newCursorPos = start + 2;
                break;
        }

        textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        this.updatePreview();
    }

    togglePreview() {
        const input = document.querySelector('.markdown-input');
        const preview = document.querySelector('.markdown-preview');
        const button = document.getElementById('toggle-preview');

        switch (this.previewMode) {
            case 'split':
                this.previewMode = 'preview';
                input.style.display = 'none';
                preview.style.width = '100%';
                button.textContent = 'Show Editor';
                break;
            case 'preview':
                this.previewMode = 'editor';
                preview.style.display = 'none';
                input.style.width = '100%';
                button.textContent = 'Show Preview';
                break;
            case 'editor':
                this.previewMode = 'split';
                input.style.display = 'flex';
                input.style.width = '50%';
                preview.style.display = 'block';
                preview.style.width = '50%';
                button.textContent = 'Toggle Preview';
                break;
        }
    }

    updatePreview() {
        const input = document.getElementById('markdown-input').value;
        const preview = document.getElementById('preview-content');
        
        if (input.trim() === '') {
            preview.innerHTML = '<p class="empty-preview">Preview will appear here...</p>';
            return;
        }

        const html = this.markdownToHtml(input);
        preview.innerHTML = html;
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

    syncScroll() {
        const input = document.getElementById('markdown-input');
        const preview = document.getElementById('preview-content');
        
        if (this.previewMode === 'split') {
            const percentage = input.scrollTop / (input.scrollHeight - input.clientHeight);
            preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
        }
    }

    exportMarkdown() {
        const content = document.getElementById('markdown-input').value;
        if (content.trim()) {
            const blob = new Blob([content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.md';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    exportHTML() {
        const markdown = document.getElementById('markdown-input').value;
        if (markdown.trim()) {
            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Document</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-family: 'Monaco', 'Consolas', monospace; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    </style>
</head>
<body>
${this.markdownToHtml(markdown)}
</body>
</html>`;
            
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.html';
            a.click();
            URL.revokeObjectURL(url);
        }
    }
}

window.MarkdownEditor = new MarkdownEditor();

const markdownStyles = `
.markdown-toolbar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid #e0e0e0;
    flex-wrap: wrap;
}

.toolbar-btn {
    background: none;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    padding: 8px 10px;
    cursor: pointer;
    color: #666;
    font-size: 14px;
    transition: all 0.3s ease;
}

.toolbar-btn:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
}

.toolbar-divider {
    width: 1px;
    height: 20px;
    background: #d0d0d0;
    margin: 0 10px;
}

.markdown-container {
    display: flex;
    border: 2px solid #f0f0f0;
    border-radius: 0 0 8px 8px;
    min-height: 400px;
}

.markdown-input,
.markdown-preview {
    flex: 1;
    overflow: auto;
}

.markdown-input {
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e0e0e0;
}

#markdown-input {
    width: 100%;
    height: 400px;
    border: none;
    outline: none;
    padding: 20px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    background: #fafafa;
}

.markdown-preview {
    background: white;
}

#preview-content {
    padding: 20px;
    height: 400px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
}

#preview-content h1,
#preview-content h2,
#preview-content h3 {
    color: #1d1d1f;
    margin-top: 0;
    margin-bottom: 16px;
}

#preview-content h1 { font-size: 2rem; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; }
#preview-content h2 { font-size: 1.5rem; }
#preview-content h3 { font-size: 1.2rem; }

#preview-content p {
    margin-bottom: 16px;
    color: #333;
}

#preview-content code {
    background: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
}

#preview-content pre {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 16px 0;
    border: 1px solid #e0e0e0;
}

#preview-content pre code {
    background: none;
    padding: 0;
}

#preview-content blockquote {
    border-left: 4px solid #667eea;
    margin: 16px 0;
    padding-left: 16px;
    color: #666;
    font-style: italic;
}

#preview-content ul,
#preview-content ol {
    padding-left: 20px;
    margin: 16px 0;
}

#preview-content li {
    margin: 4px 0;
}

#preview-content a {
    color: #667eea;
    text-decoration: none;
}

#preview-content a:hover {
    text-decoration: underline;
}

#preview-content hr {
    border: none;
    height: 1px;
    background: #e0e0e0;
    margin: 20px 0;
}

.empty-preview {
    color: #86868b;
    font-style: italic;
    text-align: center;
    margin-top: 50px;
}

@media (max-width: 768px) {
    .markdown-container {
        flex-direction: column;
    }
    
    .markdown-input {
        border-right: none;
        border-bottom: 1px solid #e0e0e0;
    }
    
    #markdown-input,
    #preview-content {
        height: 300px;
    }
}
`;

const markdownEditorStyle = document.createElement('style');
style.textContent = markdownStyles;
document.head.appendChild(markdownEditorStyle);