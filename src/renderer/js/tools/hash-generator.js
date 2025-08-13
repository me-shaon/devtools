

class HashGenerator {
    constructor() {
        this.init();
    }

    init() {
        const hashButtons = document.querySelectorAll('.hash-btn');
        const inputTextarea = document.getElementById('hash-input');

        hashButtons.forEach(button => {
            button.addEventListener('click', () => {
                const hashType = button.dataset.type;
                this.generateHash(hashType);
            });
        });

        if (inputTextarea) {
            inputTextarea.addEventListener('input', () => this.generateAllHashes());
        }
    }

    async generateHash(type) {
        const input = document.getElementById('hash-input').value;
        
        if (!input) {
            window.app?.showMessage('Please enter text to hash.', 'error');
            return;
        }

        try {
            const hash = await this.createHash(input, type);
            const resultElement = document.querySelector(`#${type}-result textarea`);
            
            if (resultElement) {
                resultElement.value = hash;
                this.selectHash(resultElement);
            }

            window.app?.showMessage(`${type.toUpperCase()} hash generated!`, 'success');
        } catch (error) {
            window.app?.showMessage(`Error generating ${type} hash: ${error.message}`, 'error');
        }
    }

    async generateAllHashes() {
        const input = document.getElementById('hash-input').value;
        
        if (!input) {
            this.clearAllHashes();
            return;
        }

        const hashTypes = ['md5', 'sha1', 'sha256', 'sha512'];
        
        for (const type of hashTypes) {
            try {
                const hash = await this.createHash(input, type);
                const resultElement = document.querySelector(`#${type}-result textarea`);
                if (resultElement) {
                    resultElement.value = hash;
                }
            } catch (error) {
                console.error(`Error generating ${type} hash:`, error);
            }
        }
    }

    async createHash(input, algorithm) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        
        let hashBuffer;
        switch (algorithm) {
            case 'md5':
                return this.md5(input);
            case 'sha1':
                hashBuffer = await crypto.subtle.digest('SHA-1', data);
                break;
            case 'sha256':
                hashBuffer = await crypto.subtle.digest('SHA-256', data);
                break;
            case 'sha512':
                hashBuffer = await crypto.subtle.digest('SHA-512', data);
                break;
            default:
                throw new Error('Unsupported hash algorithm');
        }
        
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    md5(input) {
        function rotateLeft(lValue, iShiftBits) {
            return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
        }

        function addUnsigned(lX, lY) {
            const lX4 = (lX & 0x40000000);
            const lY4 = (lY & 0x40000000);
            const lX8 = (lX & 0x80000000);
            const lY8 = (lY & 0x80000000);
            const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
            if (lX4 & lY4) {
                return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
            }
            if (lX4 | lY4) {
                if (lResult & 0x40000000) {
                    return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
                } else {
                    return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
                }
            } else {
                return (lResult ^ lX8 ^ lY8);
            }
        }

        function F(x, y, z) { return (x & y) | ((~x) & z); }
        function G(x, y, z) { return (x & z) | (y & (~z)); }
        function H(x, y, z) { return (x ^ y ^ z); }
        function I(x, y, z) { return (y ^ (x | (~z))); }

        function FF(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }

        function GG(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }

        function HH(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }

        function II(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }

        function convertToWordArray(string) {
            let lWordCount;
            const lMessageLength = string.length;
            const lNumberOfWordsTemp1 = lMessageLength + 8;
            const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
            const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
            const lWordArray = Array(lNumberOfWords - 1);
            let lBytePosition = 0;
            let lByteCount = 0;
            while (lByteCount < lMessageLength) {
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
                lByteCount++;
            }
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
            lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
            lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
            return lWordArray;
        }

        function wordToHex(lValue) {
            let wordToHexValue = '';
            let wordToHexValueTemp = '';
            let lByte, lCount;
            for (lCount = 0; lCount <= 3; lCount++) {
                lByte = (lValue >>> (lCount * 8)) & 255;
                wordToHexValueTemp = '0' + lByte.toString(16);
                wordToHexValue = wordToHexValue + wordToHexValueTemp.substring(wordToHexValueTemp.length - 2);
            }
            return wordToHexValue;
        }

        let x = convertToWordArray(input);
        let a = 0x67452301;
        let b = 0xEFCDAB89;
        let c = 0x98BADCFE;
        let d = 0x10325476;

        for (let k = 0; k < x.length; k += 16) {
            const AA = a;
            const BB = b;
            const CC = c;
            const DD = d;
            a = FF(a, b, c, d, x[k + 0], 7, 0xD76AA478);
            d = FF(d, a, b, c, x[k + 1], 12, 0xE8C7B756);
            c = FF(c, d, a, b, x[k + 2], 17, 0x242070DB);
            b = FF(b, c, d, a, x[k + 3], 22, 0xC1BDCEEE);
            a = FF(a, b, c, d, x[k + 4], 7, 0xF57C0FAF);
            d = FF(d, a, b, c, x[k + 5], 12, 0x4787C62A);
            c = FF(c, d, a, b, x[k + 6], 17, 0xA8304613);
            b = FF(b, c, d, a, x[k + 7], 22, 0xFD469501);
            a = FF(a, b, c, d, x[k + 8], 7, 0x698098D8);
            d = FF(d, a, b, c, x[k + 9], 12, 0x8B44F7AF);
            c = FF(c, d, a, b, x[k + 10], 17, 0xFFFF5BB1);
            b = FF(b, c, d, a, x[k + 11], 22, 0x895CD7BE);
            a = FF(a, b, c, d, x[k + 12], 7, 0x6B901122);
            d = FF(d, a, b, c, x[k + 13], 12, 0xFD987193);
            c = FF(c, d, a, b, x[k + 14], 17, 0xA679438E);
            b = FF(b, c, d, a, x[k + 15], 22, 0x49B40821);
            a = GG(a, b, c, d, x[k + 1], 5, 0xF61E2562);
            d = GG(d, a, b, c, x[k + 6], 9, 0xC040B340);
            c = GG(c, d, a, b, x[k + 11], 14, 0x265E5A51);
            b = GG(b, c, d, a, x[k + 0], 20, 0xE9B6C7AA);
            a = GG(a, b, c, d, x[k + 5], 5, 0xD62F105D);
            d = GG(d, a, b, c, x[k + 10], 9, 0x2441453);
            c = GG(c, d, a, b, x[k + 15], 14, 0xD8A1E681);
            b = GG(b, c, d, a, x[k + 4], 20, 0xE7D3FBC8);
            a = GG(a, b, c, d, x[k + 9], 5, 0x21E1CDE6);
            d = GG(d, a, b, c, x[k + 14], 9, 0xC33707D6);
            c = GG(c, d, a, b, x[k + 3], 14, 0xF4D50D87);
            b = GG(b, c, d, a, x[k + 8], 20, 0x455A14ED);
            a = GG(a, b, c, d, x[k + 13], 5, 0xA9E3E905);
            d = GG(d, a, b, c, x[k + 2], 9, 0xFCEFA3F8);
            c = GG(c, d, a, b, x[k + 7], 14, 0x676F02D9);
            b = GG(b, c, d, a, x[k + 12], 20, 0x8D2A4C8A);
            a = HH(a, b, c, d, x[k + 5], 4, 0xFFFA3942);
            d = HH(d, a, b, c, x[k + 8], 11, 0x8771F681);
            c = HH(c, d, a, b, x[k + 11], 16, 0x6D9D6122);
            b = HH(b, c, d, a, x[k + 14], 23, 0xFDE5380C);
            a = HH(a, b, c, d, x[k + 1], 4, 0xA4BEEA44);
            d = HH(d, a, b, c, x[k + 4], 11, 0x4BDECFA9);
            c = HH(c, d, a, b, x[k + 7], 16, 0xF6BB4B60);
            b = HH(b, c, d, a, x[k + 10], 23, 0xBEBFBC70);
            a = HH(a, b, c, d, x[k + 13], 4, 0x289B7EC6);
            d = HH(d, a, b, c, x[k + 0], 11, 0xEAA127FA);
            c = HH(c, d, a, b, x[k + 3], 16, 0xD4EF3085);
            b = HH(b, c, d, a, x[k + 6], 23, 0x4881D05);
            a = HH(a, b, c, d, x[k + 9], 4, 0xD9D4D039);
            d = HH(d, a, b, c, x[k + 12], 11, 0xE6DB99E5);
            c = HH(c, d, a, b, x[k + 15], 16, 0x1FA27CF8);
            b = HH(b, c, d, a, x[k + 2], 23, 0xC4AC5665);
            a = II(a, b, c, d, x[k + 0], 6, 0xF4292244);
            d = II(d, a, b, c, x[k + 7], 10, 0x432AFF97);
            c = II(c, d, a, b, x[k + 14], 15, 0xAB9423A7);
            b = II(b, c, d, a, x[k + 5], 21, 0xFC93A039);
            a = II(a, b, c, d, x[k + 12], 6, 0x655B59C3);
            d = II(d, a, b, c, x[k + 3], 10, 0x8F0CCC92);
            c = II(c, d, a, b, x[k + 10], 15, 0xFFEFF47D);
            b = II(b, c, d, a, x[k + 1], 21, 0x85845DD1);
            a = II(a, b, c, d, x[k + 8], 6, 0x6FA87E4F);
            d = II(d, a, b, c, x[k + 15], 10, 0xFE2CE6E0);
            c = II(c, d, a, b, x[k + 6], 15, 0xA3014314);
            b = II(b, c, d, a, x[k + 13], 21, 0x4E0811A1);
            a = II(a, b, c, d, x[k + 4], 6, 0xF7537E82);
            d = II(d, a, b, c, x[k + 11], 10, 0xBD3AF235);
            c = II(c, d, a, b, x[k + 2], 15, 0x2AD7D2BB);
            b = II(b, c, d, a, x[k + 9], 21, 0xEB86D391);
            a = addUnsigned(a, AA);
            b = addUnsigned(b, BB);
            c = addUnsigned(c, CC);
            d = addUnsigned(d, DD);
        }

        const temp = wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
        return temp.toLowerCase();
    }

    selectHash(element) {
        setTimeout(() => {
            element.select();
            element.setSelectionRange(0, 99999);
        }, 100);
    }

    clearAllHashes() {
        const hashTypes = ['md5', 'sha1', 'sha256', 'sha512'];
        hashTypes.forEach(type => {
            const resultElement = document.querySelector(`#${type}-result textarea`);
            if (resultElement) {
                resultElement.value = '';
            }
        });
    }

    copyHash(type) {
        const resultElement = document.querySelector(`#${type}-result textarea`);
        if (resultElement && resultElement.value) {
            navigator.clipboard.writeText(resultElement.value).then(() => {
                window.app?.showMessage(`${type.toUpperCase()} hash copied!`, 'success');
            });
        }
    }
}

window.HashGenerator = new HashGenerator();

const hashStyles = `
.hash-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 20px 0;
}

.hash-btn {
    background: #f0f0f0;
    border: 1px solid #d0d0d0;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
}

.hash-btn:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
}

.hash-results {
    display: grid;
    gap: 15px;
    margin-top: 20px;
}

.hash-result {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.hash-result label {
    font-weight: 500;
    color: #1d1d1f;
    font-size: 14px;
}

.hash-result textarea {
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 12px;
    padding: 10px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    resize: none;
    height: 60px;
    background-color: #fafafa;
}
`;

const style = document.createElement('style');
style.textContent = hashStyles;
document.head.appendChild(style);