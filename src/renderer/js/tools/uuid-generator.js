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
            } else if (version === '3') {
                uuid = this.generateUUIDv3();
            } else if (version === '5') {
                uuid = this.generateUUIDv5();
            } else if (version === '6') {
                uuid = this.generateUUIDv6();
            } else if (version === '7') {
                uuid = this.generateUUIDv7();
            } else if (version === 'ulid') {
                uuid = this.generateULID();
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

    generateUUIDv3() {
        // UUID v3 using MD5 hash - simplified implementation
        const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace
        const name = 'example.com'; // Default name
        const hash = this.md5(namespace + name);
        return this.formatUUIDFromHash(hash, 3);
    }

    generateUUIDv5() {
        // UUID v5 using SHA-1 hash - simplified implementation
        const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace
        const name = 'example.com'; // Default name
        const hash = this.sha1(namespace + name);
        return this.formatUUIDFromHash(hash, 5);
    }

    generateUUIDv6() {
        // UUID v6 - Gregorian time, reordered for sorting
        const timestamp = Date.now();
        const timestampHex = (timestamp + 0x01b21dd213814000).toString(16).padStart(24, '0');

        const timeHiVer = '6' + timestampHex.substring(0, 3);
        const timeMid = timestampHex.substring(3, 7);
        const timeLow = timestampHex.substring(7, 15);

        const randomBytes = [];
        for (let i = 0; i < 8; i++) {
            randomBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
        }

        const clockSeq = '8' + randomBytes[0].substring(1) + randomBytes[1];
        const node = randomBytes.slice(2, 8).join('');

        return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}-${node}`;
    }

    generateUUIDv7() {
        // UUID v7 - Random-based with Unix timestamp
        const timestamp = Math.floor(Date.now() / 1000);
        const timestampHex = timestamp.toString(16).padStart(12, '0');
        const randomHex = Array.from({length: 10}, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');

        const timeHiVer = '7' + timestampHex.substring(0, 3);
        const timeMid = timestampHex.substring(3, 7);
        const timeLow = timestampHex.substring(7, 12);
        const randB = randomHex.substring(0, 4);
        const clockSeq = '8' + randomHex.substring(4, 7);
        const node = randomHex.substring(7, 18);

        return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}${randB}-${node}`;
    }

    generateULID() {
        // ULID implementation (26 chars: 10 timestamp + 16 random)
        const encoding = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's Base32

        // Get current timestamp in milliseconds since Unix epoch
        const timestamp = Date.now();

        // Convert timestamp to base32 (first 10 characters)
        let timestampEncoded = '';
        let remainingTime = timestamp;

        for (let i = 0; i < 10; i++) {
            const remainder = remainingTime % 32;
            timestampEncoded = encoding[remainder] + timestampEncoded;
            remainingTime = Math.floor(remainingTime / 32);
        }

        // Generate random part (16 characters)
        let randomEncoded = '';
        const randomBytes = [];
        for (let i = 0; i < 16; i++) {
            randomBytes.push(Math.floor(Math.random() * 32));
        }

        for (const byte of randomBytes) {
            randomEncoded += encoding[byte];
        }

        return timestampEncoded + randomEncoded;
    }

    // Helper methods for hash functions (simplified)
    md5(str) {
        // Simplified MD5-like hash for demonstration
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16).padStart(32, '0');
    }

    sha1(str) {
        // Simplified SHA-1-like hash for demonstration
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(40, '0');
    }

    formatUUIDFromHash(hash, version) {
        // Format hash into UUID structure
        const hex = hash.substring(0, 32);
        const timeLow = hex.substring(0, 8);
        const timeMid = hex.substring(8, 12);
        const timeHiVer = version.toString() + hex.substring(13, 16);
        const clockSeq = '8' + hex.substring(17, 20);
        const node = hex.substring(20, 32);

        return `${timeLow}-${timeMid}-${timeHiVer}-${clockSeq}-${node}`;
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