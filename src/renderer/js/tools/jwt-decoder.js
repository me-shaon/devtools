class JWTDecoder {
    constructor() {
        this.init();
    }

    init() {
        const decodeBtn = document.getElementById('decode-jwt');
        const jwtInput = document.getElementById('jwt-input');

        if (decodeBtn) {
            decodeBtn.addEventListener('click', () => this.decodeJWT());
        }

        if (jwtInput) {
            jwtInput.addEventListener('input', () => this.clearOutput());
        }
    }

    decodeJWT() {
        const input = document.getElementById('jwt-input').value.trim();
        const headerOutput = document.getElementById('jwt-header');
        const payloadOutput = document.getElementById('jwt-payload');
        const signatureOutput = document.getElementById('jwt-signature');

        if (!input) {
            window.app?.showMessage('Please enter a JWT token to decode.', 'error');
            return;
        }

        try {
            const parts = input.split('.');
            
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format. JWT should have 3 parts separated by dots.');
            }

            const [headerPart, payloadPart, signaturePart] = parts;

            const header = this.decodeJWTPart(headerPart);
            const payload = this.decodeJWTPart(payloadPart);

            headerOutput.textContent = JSON.stringify(header, null, 2);
            payloadOutput.textContent = JSON.stringify(payload, null, 2);
            signatureOutput.textContent = signaturePart;

            this.highlightClaimsInfo(payload);
            
            window.app?.showMessage('JWT decoded successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error decoding JWT: ' + error.message, 'error');
            this.clearOutput();
        }
    }

    decodeJWTPart(part) {
        try {
            const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
            const decoded = atob(padded);
            return JSON.parse(decoded);
        } catch (error) {
            throw new Error('Failed to decode JWT part: ' + error.message);
        }
    }

    highlightClaimsInfo(payload) {
        const payloadOutput = document.getElementById('jwt-payload');
        let infoHtml = JSON.stringify(payload, null, 2);

        if (payload.exp) {
            const expDate = new Date(payload.exp * 1000);
            const now = new Date();
            const isExpired = expDate < now;
            
            infoHtml += `\n\n/* Token Information */\n`;
            infoHtml += `/* Expires: ${expDate.toLocaleString()} */\n`;
            infoHtml += `/* Status: ${isExpired ? '🔴 EXPIRED' : '🟢 VALID'} */\n`;
            
            if (payload.iat) {
                const iatDate = new Date(payload.iat * 1000);
                infoHtml += `/* Issued: ${iatDate.toLocaleString()} */\n`;
            }
            
            if (payload.nbf) {
                const nbfDate = new Date(payload.nbf * 1000);
                infoHtml += `/* Not Before: ${nbfDate.toLocaleString()} */\n`;
            }
        }

        if (payload.iss) {
            infoHtml += `/* Issuer: ${payload.iss} */\n`;
        }

        if (payload.aud) {
            infoHtml += `/* Audience: ${Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud} */\n`;
        }

        if (payload.sub) {
            infoHtml += `/* Subject: ${payload.sub} */\n`;
        }

        payloadOutput.textContent = infoHtml;
    }

    clearOutput() {
        document.getElementById('jwt-header').textContent = '';
        document.getElementById('jwt-payload').textContent = '';
        document.getElementById('jwt-signature').textContent = '';
    }

    copySection(section) {
        const element = document.getElementById(`jwt-${section}`);
        if (element && element.textContent.trim()) {
            navigator.clipboard.writeText(element.textContent).then(() => {
                window.app?.showMessage(`JWT ${section} copied to clipboard!`, 'success');
            });
        }
    }
}

window.JWTDecoder = new JWTDecoder();