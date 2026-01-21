class URLEncoder {
    constructor() {
        this.init();
    }

    init() {
        const tabButtons = document.querySelectorAll('#url-encoder .tab-btn');
        const encodeBtn = document.getElementById('url-encode-btn');
        const decodeBtn = document.getElementById('url-decode-btn');
        const copyEncodedBtn = document.getElementById('copy-encoded');
        const copyDecodedBtn = document.getElementById('copy-decoded');
        const clearEncodeBtn = document.getElementById('clear-encode');
        const clearDecodeBtn = document.getElementById('clear-decode');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchTab(button.dataset.tab);
            });
        });

        if (encodeBtn) {
            encodeBtn.addEventListener('click', () => this.encodeURL());
        }

        if (decodeBtn) {
            decodeBtn.addEventListener('click', () => this.decodeURL());
        }

        if (copyEncodedBtn) {
            copyEncodedBtn.addEventListener('click', () => this.copyToClipboard('url-encoded-output'));
        }

        if (copyDecodedBtn) {
            copyDecodedBtn.addEventListener('click', () => this.copyToClipboard('url-decoded-output'));
        }

        if (clearEncodeBtn) {
            clearEncodeBtn.addEventListener('click', () => this.clearEncode());
        }

        if (clearDecodeBtn) {
            clearDecodeBtn.addEventListener('click', () => this.clearDecode());
        }

        // Add Enter key support
        const encodeInput = document.getElementById('url-to-encode');
        const decodeInput = document.getElementById('url-to-decode');

        if (encodeInput) {
            encodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    this.encodeURL();
                }
            });
        }

        if (decodeInput) {
            decodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    this.decodeURL();
                }
            });
        }
    }

    switchTab(tabName) {
        const encoder = document.getElementById('url-encoder');

        encoder.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        encoder.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        encoder.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.clearOutputs();
    }

    encodeURL() {
        const input = document.getElementById('url-to-encode').value;
        const output = document.getElementById('url-encoded-output');

        if (!input.trim()) {
            window.app?.showMessage('Please enter URL or text to encode.', 'error');
            return;
        }

        try {
            // Use encodeURIComponent for full encoding
            const encoded = encodeURIComponent(input);
            output.value = encoded;

            // Show some stats
            const originalLength = input.length;
            const encodedLength = encoded.length;
            const message = `URL encoded successfully! (${originalLength} → ${encodedLength} characters)`;

            window.app?.showMessage(message, 'success');
            this.selectOutput('url-encoded-output');
        } catch (error) {
            window.app?.showMessage('Error encoding URL: ' + error.message, 'error');
            output.value = '';
        }
    }

    decodeURL() {
        const input = document.getElementById('url-to-decode').value;
        const output = document.getElementById('url-decoded-output');

        if (!input.trim()) {
            window.app?.showMessage('Please enter encoded URL to decode.', 'error');
            return;
        }

        try {
            const decoded = decodeURIComponent(input);
            output.value = decoded;

            // Show some stats
            const originalLength = input.length;
            const decodedLength = decoded.length;
            const message = `URL decoded successfully! (${originalLength} → ${decodedLength} characters)`;

            window.app?.showMessage(message, 'success');
            this.selectOutput('url-decoded-output');
        } catch (error) {
            window.app?.showMessage('Error decoding URL: Invalid URL encoding format', 'error');
            output.value = '';
        }
    }

    selectOutput(outputId) {
        const output = document.getElementById(outputId);
        setTimeout(() => {
            output.select();
            output.setSelectionRange(0, 99999);
        }, 100);
    }

    copyToClipboard(outputId) {
        const output = document.getElementById(outputId);

        if (!output.value.trim()) {
            window.app?.showMessage('Nothing to copy - please encode/decode some text first.', 'warning');
            return;
        }

        try {
            navigator.clipboard.writeText(output.value).then(() => {
                window.app?.showMessage('Copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                output.select();
                document.execCommand('copy');
                window.app?.showMessage('Copied to clipboard!', 'success');
            });
        } catch (error) {
            window.app?.showMessage('Failed to copy to clipboard.', 'error');
        }
    }

    clearEncode() {
        document.getElementById('url-to-encode').value = '';
        document.getElementById('url-encoded-output').value = '';
        window.app?.showMessage('Encoder cleared!', 'info');
    }

    clearDecode() {
        document.getElementById('url-to-decode').value = '';
        document.getElementById('url-decoded-output').value = '';
        window.app?.showMessage('Decoder cleared!', 'info');
    }

    clearOutputs() {
        document.getElementById('url-encoded-output').value = '';
        document.getElementById('url-decoded-output').value = '';
    }
}

window.URLEncoder = new URLEncoder();