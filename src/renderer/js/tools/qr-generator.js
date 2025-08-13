class QRGenerator {
    constructor() {
        this.init();
    }

    init() {
        const generateBtn = document.getElementById('generate-qr');
        const downloadBtn = document.getElementById('download-qr');
        const textInput = document.getElementById('qr-text');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateQR());
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadQR());
        }

        if (textInput) {
            textInput.addEventListener('input', () => this.onInputChange());
        }
    }

    generateQR() {
        const text = document.getElementById('qr-text').value.trim();
        const size = parseInt(document.getElementById('qr-size').value);
        const errorLevel = document.getElementById('error-level').value;

        if (!text) {
            window.app?.showMessage('Please enter text to generate QR code.', 'error');
            return;
        }

        try {
            this.createQRCode(text, size, errorLevel);
            document.getElementById('download-qr').disabled = false;
            window.app?.showMessage('QR code generated successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error generating QR code: ' + error.message, 'error');
        }
    }

    createQRCode(text, size, errorLevel) {
        const canvas = document.getElementById('qr-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = size;
        canvas.height = size;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, size, size);

        const qr = this.generateQRMatrix(text, errorLevel);
        const moduleSize = Math.floor(size / qr.length);
        const offset = (size - (qr.length * moduleSize)) / 2;

        ctx.fillStyle = 'black';
        for (let row = 0; row < qr.length; row++) {
            for (let col = 0; col < qr[row].length; col++) {
                if (qr[row][col]) {
                    ctx.fillRect(
                        offset + col * moduleSize,
                        offset + row * moduleSize,
                        moduleSize,
                        moduleSize
                    );
                }
            }
        }

        document.getElementById('qr-preview').style.display = 'block';
    }

    generateQRMatrix(text, errorLevel) {
        const version = this.determineVersion(text);
        const size = 17 + 4 * version;
        const matrix = Array(size).fill().map(() => Array(size).fill(false));

        this.addFinderPatterns(matrix, size);
        this.addSeparators(matrix, size);
        this.addDarkModule(matrix, version);
        this.addTimingPatterns(matrix, size);
        
        if (version >= 2) {
            this.addAlignmentPatterns(matrix, version);
        }
        
        if (version >= 7) {
            this.addVersionInfo(matrix, version);
        }

        const data = this.encodeData(text, version, errorLevel);
        this.addDataToMatrix(matrix, data);

        return matrix;
    }

    determineVersion(text) {
        const length = text.length;
        if (length <= 17) return 1;
        if (length <= 32) return 2;
        if (length <= 53) return 3;
        if (length <= 78) return 4;
        return 5;
    }

    addFinderPatterns(matrix, size) {
        const pattern = [
            [1,1,1,1,1,1,1],
            [1,0,0,0,0,0,1],
            [1,0,1,1,1,0,1],
            [1,0,1,1,1,0,1],
            [1,0,1,1,1,0,1],
            [1,0,0,0,0,0,1],
            [1,1,1,1,1,1,1]
        ];

        const positions = [
            [0, 0],
            [0, size - 7],
            [size - 7, 0]
        ];

        positions.forEach(([startRow, startCol]) => {
            for (let row = 0; row < 7; row++) {
                for (let col = 0; col < 7; col++) {
                    matrix[startRow + row][startCol + col] = pattern[row][col] === 1;
                }
            }
        });
    }

    addSeparators(matrix, size) {
        for (let i = 0; i < 8; i++) {
            matrix[7][i] = false;
            matrix[i][7] = false;
            matrix[7][size - 8 + i] = false;
            matrix[i][size - 8] = false;
            matrix[size - 8][i] = false;
            matrix[size - 8 + i][7] = false;
        }
    }

    addDarkModule(matrix, version) {
        const size = matrix.length;
        matrix[4 * version + 9][8] = true;
    }

    addTimingPatterns(matrix, size) {
        for (let i = 8; i < size - 8; i++) {
            matrix[6][i] = (i % 2) === 0;
            matrix[i][6] = (i % 2) === 0;
        }
    }

    addAlignmentPatterns(matrix, version) {
        const positions = this.getAlignmentPatternPositions(version);
        
        positions.forEach(pos => {
            const [centerRow, centerCol] = pos;
            const pattern = [
                [1,1,1,1,1],
                [1,0,0,0,1],
                [1,0,1,0,1],
                [1,0,0,0,1],
                [1,1,1,1,1]
            ];

            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 5; col++) {
                    const matrixRow = centerRow - 2 + row;
                    const matrixCol = centerCol - 2 + col;
                    if (matrixRow >= 0 && matrixRow < matrix.length && 
                        matrixCol >= 0 && matrixCol < matrix.length) {
                        matrix[matrixRow][matrixCol] = pattern[row][col] === 1;
                    }
                }
            }
        });
    }

    getAlignmentPatternPositions(version) {
        const positions = {
            2: [[6, 18]],
            3: [[6, 22]],
            4: [[6, 26]],
            5: [[6, 30]]
        };
        return positions[version] || [];
    }

    addVersionInfo() {
    }

    encodeData(text, version, errorLevel) {
        const mode = '0100';
        const charCount = text.length.toString(2).padStart(8, '0');
        
        let data = mode + charCount;
        
        for (let i = 0; i < text.length; i++) {
            data += text.charCodeAt(i).toString(2).padStart(8, '0');
        }
        
        data += '0000';
        
        const capacities = {
            1: { L: 152, M: 128, Q: 104, H: 72 },
            2: { L: 272, M: 224, Q: 176, H: 128 },
            3: { L: 440, M: 352, Q: 272, H: 208 },
            4: { L: 640, M: 512, Q: 384, H: 288 },
            5: { L: 864, M: 688, Q: 496, H: 368 }
        };
        
        const capacity = capacities[version][errorLevel]; 
        
        while (data.length < capacity) {
            data += data.length % 16 < 8 ? '11101100' : '00010001';
        }
        
        return data.substring(0, capacity);
    }

    addDataToMatrix(matrix, data) {
        let bitIndex = 0;
        let up = true;
        const size = matrix.length;
        
        for (let col = size - 1; col > 0; col -= 2) {
            if (col === 6) col--;
            
            for (let i = 0; i < size; i++) {
                for (let c = 0; c < 2; c++) {
                    const currentCol = col - c;
                    const currentRow = up ? size - 1 - i : i;
                    
                    if (!this.isReserved(matrix, currentRow, currentCol, size)) {
                        if (bitIndex < data.length) {
                            matrix[currentRow][currentCol] = data[bitIndex] === '1';
                            bitIndex++;
                        }
                    }
                }
            }
            up = !up;
        }
    }

    isReserved(_, row, col, size) {
        if (row < 9 && col < 9) return true;
        if (row < 9 && col >= size - 8) return true;
        if (row >= size - 8 && col < 9) return true;
        if (row === 6 || col === 6) return true;
        if (row === 4 * Math.floor((size - 17) / 4) + 9 && col === 8) return true;
        
        return false;
    }

    downloadQR() {
        const canvas = document.getElementById('qr-canvas');
        if (!canvas.width) {
            window.app?.showMessage('Please generate a QR code first.', 'error');
            return;
        }

        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = canvas.toDataURL();
        link.click();

        window.app?.showMessage('QR code downloaded!', 'success');
    }

    onInputChange() {
        document.getElementById('download-qr').disabled = true;
        document.getElementById('qr-preview').style.display = 'none';
    }

    generateQRFromUrl(url) {
        document.getElementById('qr-text').value = url;
        this.generateQR();
    }
}

window.QRGenerator = new QRGenerator();

const qrStyles = `
#qr-text {
    width: 100%;
    min-height: 100px;
    padding: 15px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    margin-bottom: 20px;
}

#qr-text:focus {
    outline: none;
    border-color: #667eea;
}

.qr-options {
    display: flex;
    gap: 30px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.option-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.option-group label {
    font-weight: 500;
    color: #1d1d1f;
    font-size: 14px;
}

.option-group select {
    padding: 8px 12px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    font-size: 14px;
    min-width: 150px;
}

.option-group select:focus {
    outline: none;
    border-color: #667eea;
}

.qr-preview {
    text-align: center;
    margin-top: 30px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
}

#qr-canvas {
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    background: white;
    max-width: 100%;
    height: auto;
}

.controls {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

#download-qr:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

@media (max-width: 768px) {
    .qr-options {
        flex-direction: column;
        gap: 15px;
    }
    
    .option-group select {
        min-width: auto;
        width: 100%;
    }
}
`;

const style = document.createElement('style');
style.textContent = qrStyles;
document.head.appendChild(style);