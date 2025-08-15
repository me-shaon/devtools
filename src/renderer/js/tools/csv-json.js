class CSVJSONConverter {
    constructor() {
        this.init();
    }

    init() {
        const tabButtons = document.querySelectorAll('#csv-json .tab-btn');
        const csvToJsonBtn = document.getElementById('csv-to-json-btn');
        const jsonToCsvBtn = document.getElementById('json-to-csv-btn');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchTab(button.dataset.tab);
            });
        });

        if (csvToJsonBtn) {
            csvToJsonBtn.addEventListener('click', () => this.convertCSVToJSON());
        }

        if (jsonToCsvBtn) {
            jsonToCsvBtn.addEventListener('click', () => this.convertJSONToCSV());
        }

        const inputs = document.querySelectorAll('#csv-input, #json-for-csv-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.clearOutputs());
        });
    }

    switchTab(tabName) {
        const container = document.getElementById('csv-json');
        
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        container.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const tabButton = container.querySelector(`[data-tab="${tabName}"]`);
        const tabContent = document.getElementById(`${tabName}-tab`);
        
        if (tabButton) {
            tabButton.classList.add('active');
        }
        if (tabContent) {
            tabContent.classList.add('active');
        }

        this.clearOutputs();
    }

    convertCSVToJSON() {
        const input = document.getElementById('csv-input').value.trim();
        const output = document.getElementById('json-from-csv-output');
        const hasHeaders = document.getElementById('has-headers').checked;
        const delimiter = document.getElementById('csv-delimiter').value;

        if (!input) {
            window.app?.showMessage('Please enter CSV data to convert.', 'error');
            return;
        }

        try {
            const jsonResult = this.csvToJson(input, delimiter, hasHeaders);
            output.textContent = JSON.stringify(jsonResult, null, 2);
            window.app?.showMessage('CSV converted to JSON successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error converting CSV: ' + error.message, 'error');
            output.textContent = '';
        }
    }

    convertJSONToCSV() {
        const input = document.getElementById('json-for-csv-input').value.trim();
        const output = document.getElementById('csv-from-json-output');

        if (!input) {
            window.app?.showMessage('Please enter JSON array to convert.', 'error');
            return;
        }

        try {
            const jsonData = JSON.parse(input);
            if (!Array.isArray(jsonData)) {
                throw new Error('JSON must be an array of objects');
            }
            
            const csvResult = this.jsonToCsv(jsonData);
            output.value = csvResult;
            window.app?.showMessage('JSON converted to CSV successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error converting JSON: ' + error.message, 'error');
            output.value = '';
        }
    }

    csvToJson(csvString, delimiter = ',', hasHeaders = true) {
        const lines = this.parseCSVLines(csvString);
        if (lines.length === 0) {
            throw new Error('No data found');
        }

        const result = [];
        let headers = [];

        if (hasHeaders) {
            headers = this.parseCSVLine(lines[0], delimiter);
            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i], delimiter);
                if (values.length > 0) {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = values[index] || '';
                    });
                    result.push(obj);
                }
            }
        } else {
            for (let i = 0; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i], delimiter);
                if (values.length > 0) {
                    result.push(values);
                }
            }
        }

        return result;
    }

    jsonToCsv(jsonArray) {
        if (jsonArray.length === 0) {
            return '';
        }

        const headers = Object.keys(jsonArray[0]);
        const csvLines = [];

        csvLines.push(headers.map(header => this.escapeCSVValue(header)).join(','));

        jsonArray.forEach(obj => {
            const values = headers.map(header => {
                const value = obj[header];
                return this.escapeCSVValue(value !== undefined ? String(value) : '');
            });
            csvLines.push(values.join(','));
        });

        return csvLines.join('\n');
    }

    parseCSVLines(csvString) {
        return csvString.split(/\r?\n/).filter(line => line.trim());
    }

    parseCSVLine(line, delimiter = ',') {
        const result = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '"';

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === quoteChar && !inQuotes) {
                inQuotes = true;
            } else if (char === quoteChar && inQuotes) {
                if (nextChar === quoteChar) {
                    current += quoteChar;
                    i++;
                } else {
                    inQuotes = false;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    escapeCSVValue(value) {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }

    clearOutputs() {
        document.getElementById('json-from-csv-output').textContent = '';
        document.getElementById('csv-from-json-output').value = '';
    }

    downloadCSV() {
        const output = document.getElementById('csv-from-json-output');
        if (output.value.trim()) {
            const blob = new Blob([output.value], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converted.csv';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    downloadJSON() {
        const output = document.getElementById('json-from-csv-output');
        if (output.textContent.trim()) {
            const blob = new Blob([output.textContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converted.json';
            a.click();
            URL.revokeObjectURL(url);
        }
    }
}

window.CSVJSONConverter = new CSVJSONConverter();

const csvJsonStyles = `
.csv-options {
    display: flex;
    gap: 20px;
    margin-bottom: 15px;
    flex-wrap: wrap;
    align-items: center;
}

.csv-options label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #1d1d1f;
    white-space: nowrap;
}

.csv-options select {
    padding: 4px 8px;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    font-size: 14px;
}

.csv-options input[type="checkbox"] {
    margin: 0;
}

#csv-input,
#json-for-csv-input {
    min-height: 150px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
}

#json-from-csv-output {
    background-color: #f8f9fa;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    padding: 15px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre;
    overflow: auto;
    max-height: 400px;
    min-height: 150px;
}

#csv-from-json-output {
    min-height: 150px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
}

.converter-tabs {
    border-bottom: 2px solid #f0f0f0;
    margin-bottom: 20px;
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
}

.tab-content textarea,
.tab-content pre {
    width: 100%;
    margin: 15px 0;
}
`;

// Use centralized style management to prevent conflicts
if (window.StyleManager) {
    window.StyleManager.addToolStyles('csv-json', csvJsonStyles);
} else {
    // Fallback for backward compatibility
    const csvJsonStyleElement = document.createElement('style');
    csvJsonStyleElement.id = 'csv-json-styles';
    csvJsonStyleElement.textContent = csvJsonStyles;
    document.head.appendChild(csvJsonStyleElement);
}