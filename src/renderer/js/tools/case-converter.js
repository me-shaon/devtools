class CaseConverter {
    constructor() {
        this.init();
    }

    init() {
        const inputTextarea = document.getElementById('case-input');
        const outputTextarea = document.getElementById('case-output');
        const caseButtons = document.querySelectorAll('.case-btn');

        if (caseButtons.length > 0) {
            caseButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const caseType = button.dataset.case;
                    this.convertCase(caseType);
                });
            });
        }

        if (inputTextarea) {
            inputTextarea.addEventListener('input', () => {
                outputTextarea.value = '';
            });
        }
    }

    convertCase(caseType) {
        const input = document.getElementById('case-input').value;
        const output = document.getElementById('case-output');

        if (!input.trim()) {
            window.app?.showMessage('Please enter text to convert.', 'error');
            return;
        }

        let convertedText = '';

        switch (caseType) {
            case 'camel':
                convertedText = this.toCamelCase(input);
                break;
            case 'pascal':
                convertedText = this.toPascalCase(input);
                break;
            case 'snake':
                convertedText = this.toSnakeCase(input);
                break;
            case 'kebab':
                convertedText = this.toKebabCase(input);
                break;
            case 'upper':
                convertedText = input.toUpperCase();
                break;
            case 'lower':
                convertedText = input.toLowerCase();
                break;
            case 'title':
                convertedText = this.toTitleCase(input);
                break;
            default:
                convertedText = input;
        }

        output.value = convertedText;
        window.app?.showMessage(`Text converted to ${caseType} case!`, 'success');

        this.selectOutput();
    }

    toCamelCase(str) {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
                return index === 0 ? word.toLowerCase() : word.toUpperCase();
            })
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    toPascalCase(str) {
        return str
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
                return word.toUpperCase();
            })
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    toSnakeCase(str) {
        return str
            .replace(/\W+/g, ' ')
            .split(/ |\B(?=[A-Z])/)
            .map(word => word.toLowerCase())
            .join('_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
    }

    toKebabCase(str) {
        return str
            .replace(/\W+/g, ' ')
            .split(/ |\B(?=[A-Z])/)
            .map(word => word.toLowerCase())
            .join('-')
            .replace(/-{2,}/g, '-')
            .replace(/^-|-$/g, '');
    }

    toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) => {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }

    selectOutput() {
        const output = document.getElementById('case-output');
        setTimeout(() => {
            output.select();
            output.setSelectionRange(0, 99999);
        }, 100);
    }
}

window.CaseConverter = new CaseConverter();