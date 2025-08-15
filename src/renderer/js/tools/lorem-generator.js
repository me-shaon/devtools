class LoremGenerator {
    constructor() {
        this.loremWords = [
            'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
            'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
            'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
            'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
            'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
            'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
            'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
            'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'at', 'vero', 'eos',
            'accusamus', 'accusantium', 'doloremque', 'laudantium', 'totam', 'rem',
            'aperiam', 'eaque', 'ipsa', 'quae', 'ab', 'illo', 'inventore', 'veritatis',
            'et', 'quasi', 'architecto', 'beatae', 'vitae', 'dicta', 'sunt', 'explicabo',
            'nemo', 'ipsam', 'voluptatem', 'quia', 'voluptas', 'aspernatur', 'aut',
            'odit', 'fugit', 'sed', 'quia', 'consequuntur', 'magni', 'dolores', 'ratione',
            'sequi', 'nesciunt', 'neque', 'porro', 'quisquam', 'dolorem', 'adipisci',
            'numquam', 'eius', 'modi', 'tempora', 'incidunt', 'magnam', 'quaerat',
            'voluptatem', 'laudantium', 'doloremque', 'laudantium'
        ];
        this.init();
    }

    init() {
        const generateBtn = document.getElementById('generate-lorem');
        const typeSelect = document.getElementById('lorem-type');
        const countInput = document.getElementById('lorem-count');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateLorem());
        }

        if (typeSelect) {
            typeSelect.addEventListener('change', () => this.clearOutput());
        }

        if (countInput) {
            countInput.addEventListener('input', () => this.clearOutput());
        }
    }

    generateLorem() {
        const type = document.getElementById('lorem-type').value;
        const count = parseInt(document.getElementById('lorem-count').value);
        const output = document.getElementById('lorem-output');

        if (count < 1 || count > 50) {
            window.app?.showMessage('Please enter a count between 1 and 50.', 'error');
            return;
        }

        let result = '';

        switch (type) {
            case 'paragraphs':
                result = this.generateParagraphs(count);
                break;
            case 'sentences':
                result = this.generateSentences(count);
                break;
            case 'words':
                result = this.generateWords(count);
                break;
            default:
                result = this.generateParagraphs(count);
        }

        output.value = result;
        window.app?.showMessage(`Generated ${count} ${type}!`, 'success');
        this.selectOutput();
    }

    generateParagraphs(count) {
        const paragraphs = [];
        for (let i = 0; i < count; i++) {
            const sentences = this.generateSentences(this.randomBetween(3, 7));
            paragraphs.push(sentences);
        }
        return paragraphs.join('\n\n');
    }

    generateSentences(count) {
        const sentences = [];
        for (let i = 0; i < count; i++) {
            const wordCount = this.randomBetween(8, 20);
            const words = this.generateWords(wordCount).split(' ');
            
            words[0] = this.capitalizeFirst(words[0]);
            
            let sentence = words.join(' ');
            
            if (Math.random() < 0.1) {
                sentence += '!';
            } else if (Math.random() < 0.1) {
                sentence += '?';
            } else {
                sentence += '.';
            }
            
            sentences.push(sentence);
        }
        return sentences.join(' ');
    }

    generateWords(count) {
        const words = [];
        for (let i = 0; i < count; i++) {
            const word = this.loremWords[Math.floor(Math.random() * this.loremWords.length)];
            words.push(word);
        }
        return words.join(' ');
    }

    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    selectOutput() {
        const output = document.getElementById('lorem-output');
        setTimeout(() => {
            output.select();
            output.setSelectionRange(0, 99999);
        }, 100);
    }

    clearOutput() {
        document.getElementById('lorem-output').value = '';
    }

    copyToClipboard() {
        const output = document.getElementById('lorem-output');
        if (output.value.trim()) {
            navigator.clipboard.writeText(output.value).then(() => {
                window.app?.showMessage('Lorem text copied to clipboard!', 'success');
            });
        }
    }
}

window.LoremGenerator = new LoremGenerator();

const loremStyles = `
.lorem-controls {
    display: flex;
    align-items: end;
    gap: 20px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.lorem-controls .control-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.lorem-controls label {
    font-weight: 500;
    color: #1d1d1f;
}

.lorem-controls select,
.lorem-controls input {
    padding: 8px 12px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.3s ease;
}

.lorem-controls select:focus,
.lorem-controls input:focus {
    outline: none;
    border-color: #667eea;
}

#lorem-output {
    min-height: 300px;
    line-height: 1.6;
}
`;

// Use centralized style management to prevent conflicts
if (window.StyleManager) {
    window.StyleManager.addToolStyles('lorem-generator', loremStyles);
} else {
    // Fallback for backward compatibility
    const loremGeneratorStyleElement = document.createElement('style');
    loremGeneratorStyleElement.id = 'lorem-generator-styles';
    loremGeneratorStyleElement.textContent = loremStyles;
    document.head.appendChild(loremGeneratorStyleElement);
}