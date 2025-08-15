class ColorPalette {
    constructor() {
        this.currentPalette = [];
        this.init();
    }

    init() {
        const generateBtn = document.getElementById('generate-palette');
        const baseColorPicker = document.getElementById('base-color');
        const baseColorHex = document.getElementById('base-color-hex');
        const paletteType = document.getElementById('palette-type');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generatePalette());
        }

        if (baseColorPicker) {
            baseColorPicker.addEventListener('input', (e) => {
                baseColorHex.value = e.target.value;
            });
        }

        if (baseColorHex) {
            baseColorHex.addEventListener('input', (e) => {
                if (this.isValidHexColor(e.target.value)) {
                    baseColorPicker.value = e.target.value;
                }
            });
        }

        if (paletteType) {
            paletteType.addEventListener('change', () => {
                if (this.currentPalette.length > 0) {
                    this.generatePalette();
                }
            });
        }
    }

    generatePalette() {
        const baseColor = document.getElementById('base-color').value;
        const paletteType = document.getElementById('palette-type').value;

        try {
            const palette = this.createPalette(baseColor, paletteType);
            this.displayPalette(palette);
            this.displayColorFormats(palette);
            this.currentPalette = palette;
            window.app?.showMessage(`${paletteType} palette generated!`, 'success');
        } catch (error) {
            window.app?.showMessage('Error generating palette: ' + error.message, 'error');
        }
    }

    createPalette(baseColor, type) {
        const baseHsl = this.hexToHsl(baseColor);
        const [h, s, l] = baseHsl;
        const colors = [];

        switch (type) {
            case 'monochromatic':
                colors.push(...this.createMonochromatic(baseHsl));
                break;
            case 'analogous':
                colors.push(...this.createAnalogous(h, s, l));
                break;
            case 'complementary':
                colors.push(...this.createComplementary(h, s, l));
                break;
            case 'triadic':
                colors.push(...this.createTriadic(h, s, l));
                break;
            case 'tetradic':
                colors.push(...this.createTetradic(h, s, l));
                break;
            default:
                colors.push(baseHsl);
        }

        return colors.map(hsl => ({
            hex: this.hslToHex(hsl),
            hsl: hsl,
            rgb: this.hslToRgb(hsl)
        }));
    }

    createMonochromatic([h, s, l]) {
        return [
            [h, s, Math.max(0, l - 0.3)],
            [h, s, Math.max(0, l - 0.15)],
            [h, s, l],
            [h, s, Math.min(1, l + 0.15)],
            [h, s, Math.min(1, l + 0.3)]
        ];
    }

    createAnalogous(h, s, l) {
        return [
            [(h - 60 + 360) % 360, s, l],
            [(h - 30 + 360) % 360, s, l],
            [h, s, l],
            [(h + 30) % 360, s, l],
            [(h + 60) % 360, s, l]
        ];
    }

    createComplementary(h, s, l) {
        const complement = (h + 180) % 360;
        return [
            [h, s, l],
            [complement, s, l],
            [h, s * 0.7, l * 0.9],
            [complement, s * 0.7, l * 0.9],
            [h, s * 0.3, l * 1.1]
        ];
    }

    createTriadic(h, s, l) {
        return [
            [h, s, l],
            [(h + 120) % 360, s, l],
            [(h + 240) % 360, s, l],
            [h, s * 0.6, l * 0.8],
            [(h + 120) % 360, s * 0.6, l * 0.8]
        ];
    }

    createTetradic(h, s, l) {
        return [
            [h, s, l],
            [(h + 90) % 360, s, l],
            [(h + 180) % 360, s, l],
            [(h + 270) % 360, s, l],
            [h, s * 0.5, l * 0.9]
        ];
    }

    displayPalette(palette) {
        const container = document.getElementById('palette-colors');
        container.innerHTML = '';

        palette.forEach((color) => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'palette-color';
            colorDiv.style.backgroundColor = color.hex;
            
            colorDiv.innerHTML = `
                <div class="color-overlay">
                    <div class="color-hex">${color.hex}</div>
                    <button class="copy-color" onclick="window.ColorPalette.copyColor('${color.hex}')">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            `;

            colorDiv.addEventListener('click', () => this.copyColor(color.hex));
            
            container.appendChild(colorDiv);
        });

        document.getElementById('color-palette-display').style.display = 'block';
    }

    displayColorFormats(palette) {
        const container = document.getElementById('color-format-list');
        container.innerHTML = '';

        palette.forEach((color) => {
            const formatDiv = document.createElement('div');
            formatDiv.className = 'color-formats-item';
            
            formatDiv.innerHTML = `
                <div class="color-sample" style="background-color: ${color.hex}"></div>
                <div class="color-values">
                    <div class="format-row">
                        <span class="format-label">HEX:</span>
                        <span class="format-value" onclick="window.ColorPalette.copyText('${color.hex}')">${color.hex}</span>
                    </div>
                    <div class="format-row">
                        <span class="format-label">RGB:</span>
                        <span class="format-value" onclick="window.ColorPalette.copyText('rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})')"
                        >rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})</span>
                    </div>
                    <div class="format-row">
                        <span class="format-label">HSL:</span>
                        <span class="format-value" onclick="window.ColorPalette.copyText('hsl(${Math.round(color.hsl[0])}, ${Math.round(color.hsl[1] * 100)}%, ${Math.round(color.hsl[2] * 100)}%)')"
                        >hsl(${Math.round(color.hsl[0])}, ${Math.round(color.hsl[1] * 100)}%, ${Math.round(color.hsl[2] * 100)}%)</span>
                    </div>
                </div>
            `;

            container.appendChild(formatDiv);
        });
    }

    copyColor(hex) {
        this.copyText(hex);
    }

    copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
            window.app?.showMessage(`${text} copied to clipboard!`, 'success');
        });
    }

    hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h * 360, s, l];
    }

    hslToRgb([h, s, l]) {
        h /= 360;
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    hslToHex([h, s, l]) {
        const [r, g, b] = this.hslToRgb([h, s, l]);
        const toHex = (n) => {
            const hex = n.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    isValidHexColor(hex) {
        return /^#[0-9A-F]{6}$/i.test(hex);
    }

    exportPalette() {
        if (this.currentPalette.length === 0) {
            window.app?.showMessage('Please generate a palette first.', 'error');
            return;
        }

        const data = {
            palette: this.currentPalette,
            timestamp: new Date().toISOString(),
            type: document.getElementById('palette-type').value
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'color-palette.json';
        a.click();
        URL.revokeObjectURL(url);
    }
}

window.ColorPalette = new ColorPalette();

const colorPaletteStyles = `
.color-input {
    margin-bottom: 30px;
}

.color-picker-group {
    margin-bottom: 20px;
}

.color-picker-group label {
    display: block;
    font-weight: 500;
    color: #1d1d1f;
    margin-bottom: 8px;
}

.color-input-container {
    display: flex;
    gap: 15px;
    align-items: center;
}

#base-color {
    width: 60px;
    height: 40px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    cursor: pointer;
}

#base-color-hex {
    flex: 1;
    padding: 10px 15px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    max-width: 150px;
}

#base-color-hex:focus {
    outline: none;
    border-color: #667eea;
}

.palette-type {
    margin-bottom: 20px;
}

.palette-type label {
    display: block;
    font-weight: 500;
    color: #1d1d1f;
    margin-bottom: 8px;
}

.palette-type select {
    padding: 10px 15px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    font-size: 14px;
    min-width: 200px;
}

.palette-type select:focus {
    outline: none;
    border-color: #667eea;
}

.color-palette-display {
    margin-top: 30px;
}

.palette-colors {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 15px;
    margin-bottom: 30px;
}

.palette-color {
    height: 120px;
    border-radius: 12px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    border: 1px solid rgba(0,0,0,0.1);
}

.palette-color:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
}

.color-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    gap: 10px;
}

.palette-color:hover .color-overlay {
    opacity: 1;
}

.color-hex {
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    font-weight: bold;
}

.copy-color {
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.3s ease;
}

.copy-color:hover {
    background: rgba(255,255,255,0.3);
    border-color: rgba(255,255,255,0.5);
}

.color-formats {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 20px;
}

.color-formats h3 {
    margin-top: 0;
    margin-bottom: 20px;
    color: #1d1d1f;
}

.color-formats-item {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    padding: 15px;
    background: white;
    border-radius: 8px;
    margin: 15px 0;
    border: 1px solid #e0e0e0;
}

.color-sample {
    width: 60px;
    height: 60px;
    border-radius: 8px;
    border: 1px solid rgba(0,0,0,0.1);
    flex-shrink: 0;
}

.color-values {
    flex: 1;
}

.format-row {
    display: flex;
    align-items: center;
    margin: 8px 0;
    gap: 15px;
}

.format-label {
    font-weight: 500;
    color: #666;
    min-width: 50px;
    font-size: 14px;
}

.format-value {
    font-family: 'Monaco', 'Consolas', monospace;
    background: #f4f4f4;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-size: 13px;
    color: #333;
}

.format-value:hover {
    background: #e0e0e0;
}

@media (max-width: 768px) {
    .color-input-container {
        flex-direction: column;
        align-items: stretch;
    }
    
    #base-color-hex {
        max-width: none;
    }
    
    .palette-colors {
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 10px;
    }
    
    .palette-color {
        height: 100px;
    }
    
    .color-formats-item {
        flex-direction: column;
        gap: 15px;
    }
    
    .color-sample {
        width: 100%;
        height: 40px;
    }
}
`;

// Use centralized style management to prevent conflicts
if (window.StyleManager) {
    window.StyleManager.addToolStyles('color-palette', colorPaletteStyles);
} else {
    // Fallback for backward compatibility
    const colorPaletteStyleElement = document.createElement('style');
    colorPaletteStyleElement.id = 'color-palette-styles';
    colorPaletteStyleElement.textContent = colorPaletteStyles;
    document.head.appendChild(colorPaletteStyleElement);
}