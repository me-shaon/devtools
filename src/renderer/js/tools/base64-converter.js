class Base64Converter {
    constructor() {
        this.init();
    }

    init() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const encodeBtn = document.getElementById('encode-btn');
        const decodeBtn = document.getElementById('decode-btn');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchTab(button.dataset.tab);
            });
        });

        if (encodeBtn) {
            encodeBtn.addEventListener('click', () => this.encodeToBase64());
        }

        if (decodeBtn) {
            decodeBtn.addEventListener('click', () => this.decodeFromBase64());
        }

        const textInputs = document.querySelectorAll('#text-to-encode, #base64-to-decode');
        textInputs.forEach(input => {
            input.addEventListener('input', () => this.clearOutputs());
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.clearOutputs();
    }

    encodeToBase64() {
        const input = document.getElementById('text-to-encode').value;
        const output = document.getElementById('encoded-output');

        if (!input.trim()) {
            window.app?.showMessage('Please enter text to encode.', 'error');
            return;
        }

        try {
            const encoded = btoa(unescape(encodeURIComponent(input)));
            output.value = encoded;
            window.app?.showMessage('Text encoded to Base64!', 'success');
            this.selectOutput('encoded-output');
        } catch (error) {
            window.app?.showMessage('Error encoding text: ' + error.message, 'error');
            output.value = '';
        }
    }

    decodeFromBase64() {
        const input = document.getElementById('base64-to-decode').value;
        const output = document.getElementById('decoded-output');

        if (!input.trim()) {
            window.app?.showMessage('Please enter Base64 to decode.', 'error');
            return;
        }

        try {
            if (!this.isValidBase64(input.trim())) {
                throw new Error('Invalid Base64 format');
            }

            const decoded = decodeURIComponent(escape(atob(input.trim())));
            output.value = decoded;
            window.app?.showMessage('Base64 decoded successfully!', 'success');
            this.selectOutput('decoded-output');
        } catch (error) {
            window.app?.showMessage('Error decoding Base64: Invalid format or corrupted data', 'error');
            output.value = '';
        }
    }

    isValidBase64(str) {
        try {
            return btoa(atob(str)) === str;
        } catch (err) {
            return false;
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
        document.getElementById('encoded-output').value = '';
        document.getElementById('decoded-output').value = '';
    }
}

window.Base64Converter = new Base64Converter();