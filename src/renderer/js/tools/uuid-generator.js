class UUIDGenerator {
    constructor() {
        this.init();
    }

    init() {
        const generateBtn = document.getElementById('generate-uuid');
        const outputTextarea = document.getElementById('uuid-output');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateUUIDs());
        }

        if (outputTextarea) {
            outputTextarea.addEventListener('click', () => this.selectAllUUIDs());
        }
    }

    generateUUIDs() {
        const version = document.getElementById('uuid-version').value;
        const count = parseInt(document.getElementById('uuid-count').value);
        const output = document.getElementById('uuid-output');

        if (count < 1 || count > 100) {
            window.app?.showMessage('Please enter a count between 1 and 100.', 'error');
            return;
        }

        const uuids = [];

        for (let i = 0; i < count; i++) {
            let uuid = '';
            
            if (version === '4') {
                uuid = this.generateUUIDv4();
            } else if (version === '1') {
                uuid = this.generateUUIDv1();
            }
            
            uuids.push(uuid);
        }

        output.value = uuids.join('\n');
        window.app?.showMessage(`Generated ${count} UUID${count > 1 ? 's' : ''}!`, 'success');

        this.selectAllUUIDs();
    }

    generateUUIDv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    generateUUIDv1() {
        const timestamp = Date.now();
        const timestampHex = timestamp.toString(16);
        
        const randomBytes = [];
        for (let i = 0; i < 16; i++) {
            randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
        }

        const timeLow = timestampHex.padStart(8, '0').substring(0, 8);
        const timeMid = timestampHex.padStart(8, '0').substring(0, 4);
        const timeHi = '1' + timestampHex.padStart(8, '0').substring(0, 3);
        
        const clockSeq = randomBytes.slice(8, 10).join('');
        const node = randomBytes.slice(10, 16).join('');

        return `${timeLow}-${timeMid}-${timeHi}-${clockSeq}-${node}`;
    }

    selectAllUUIDs() {
        const output = document.getElementById('uuid-output');
        if (output.value.trim()) {
            setTimeout(() => {
                output.select();
                output.setSelectionRange(0, 99999);
            }, 100);
        }
    }

    copyToClipboard() {
        const output = document.getElementById('uuid-output');
        if (output.value.trim()) {
            navigator.clipboard.writeText(output.value).then(() => {
                window.app?.showMessage('UUIDs copied to clipboard!', 'success');
            });
        }
    }
}

window.UUIDGenerator = new UUIDGenerator();