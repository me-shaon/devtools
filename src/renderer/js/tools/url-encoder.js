class URLEncoder {
    constructor() {
        this.init();
    }

    init() {
        const tabButtons = document.querySelectorAll('#url-encoder .tab-btn');
        const encodeBtn = document.getElementById('url-encode-btn');
        const decodeBtn = document.getElementById('url-decode-btn');

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

        const inputs = document.querySelectorAll('#url-to-encode, #url-to-decode');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.clearOutputs());
        });
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
            const encoded = encodeURIComponent(input);
            output.value = encoded;
            window.app?.showMessage('URL encoded successfully!', 'success');
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
            window.app?.showMessage('URL decoded successfully!', 'success');
            this.selectOutput('url-decoded-output');
        } catch (error) {
            window.app?.showMessage('Error decoding URL: Invalid encoding', 'error');
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

    clearOutputs() {
        document.getElementById('url-encoded-output').value = '';
        document.getElementById('url-decoded-output').value = '';
    }
}

window.URLEncoder = new URLEncoder();