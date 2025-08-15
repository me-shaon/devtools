class TimestampConverter {
    constructor() {
        this.init();
        this.updateCurrentTime();
        this.startClock();
    }

    init() {
        const tabButtons = document.querySelectorAll('#timestamp .tab-btn');
        const refreshBtn = document.getElementById('refresh-time');
        const convertTsBtn = document.getElementById('convert-ts-to-date');
        const convertDateBtn = document.getElementById('convert-date-to-ts');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchTab(button.dataset.tab);
            });
        });

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.updateCurrentTime());
        }

        if (convertTsBtn) {
            convertTsBtn.addEventListener('click', () => this.convertTimestampToDate());
        }

        if (convertDateBtn) {
            convertDateBtn.addEventListener('click', () => this.convertDateToTimestamp());
        }

        const inputs = document.querySelectorAll('#timestamp-input, #date-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.clearOutputs());
        });
    }

    startClock() {
        this.clockInterval = setInterval(() => {
            this.updateCurrentTime();
        }, 1000);
    }

    updateCurrentTime() {
        const now = new Date();
        const timestamp = Math.floor(now.getTime() / 1000);
        const dateString = now.toLocaleString();

        document.getElementById('current-timestamp').textContent = timestamp;
        document.getElementById('current-date').textContent = dateString;
    }

    switchTab(tabName) {
        const container = document.getElementById('timestamp');
        
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        container.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        container.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        container.getElementById(`${tabName}-tab`).classList.add('active');

        this.clearOutputs();
    }

    convertTimestampToDate() {
        const input = document.getElementById('timestamp-input').value;
        const output = document.getElementById('date-output');

        if (!input.trim()) {
            window.app?.showMessage('Please enter a timestamp.', 'error');
            return;
        }

        try {
            let timestamp = parseInt(input);
            
            if (timestamp.toString().length === 10) {
                timestamp = timestamp * 1000;
            } else if (timestamp.toString().length !== 13) {
                throw new Error('Invalid timestamp format');
            }

            const date = new Date(timestamp);
            
            if (isNaN(date.getTime())) {
                throw new Error('Invalid timestamp');
            }

            const result = `
Local Time: ${date.toLocaleString()}
UTC Time: ${date.toUTCString()}
ISO String: ${date.toISOString()}
Date Only: ${date.toDateString()}
Time Only: ${date.toTimeString()}

Timestamp (seconds): ${Math.floor(timestamp / 1000)}
Timestamp (milliseconds): ${timestamp}
            `.trim();

            output.value = result;
            window.app?.showMessage('Timestamp converted successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error: ' + error.message, 'error');
            output.value = '';
        }
    }

    convertDateToTimestamp() {
        const input = document.getElementById('date-input').value;
        const output = document.getElementById('timestamp-output');

        if (!input.trim()) {
            window.app?.showMessage('Please select a date and time.', 'error');
            return;
        }

        try {
            const date = new Date(input);
            
            if (isNaN(date.getTime())) {
                throw new Error('Invalid date');
            }

            const timestamp = date.getTime();
            const timestampSeconds = Math.floor(timestamp / 1000);

            const result = `
Date: ${date.toLocaleString()}
UTC: ${date.toUTCString()}
ISO: ${date.toISOString()}

Timestamp (seconds): ${timestampSeconds}
Timestamp (milliseconds): ${timestamp}
            `.trim();

            output.value = result;
            window.app?.showMessage('Date converted successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error: ' + error.message, 'error');
            output.value = '';
        }
    }

    clearOutputs() {
        document.getElementById('date-output').value = '';
        document.getElementById('timestamp-output').value = '';
    }

    destroy() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
        }
    }
}

window.TimestampConverter = new TimestampConverter();

const timestampStyles = `
.timestamp-section {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
}

.current-time {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 15px;
}

.time-display {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.time-display strong {
    font-size: 1.5rem;
    color: #667eea;
    font-family: 'Monaco', 'Consolas', monospace;
}

.time-display span {
    color: #86868b;
    font-size: 0.9rem;
}

#timestamp-input,
#date-input {
    width: 100%;
    padding: 10px 15px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    font-size: 14px;
    margin-bottom: 15px;
    transition: border-color 0.3s ease;
}

#timestamp-input:focus,
#date-input:focus {
    outline: none;
    border-color: #667eea;
}
`;

// Use centralized style management to prevent conflicts
if (window.StyleManager) {
    window.StyleManager.addToolStyles('timestamp', timestampStyles);
} else {
    // Fallback for backward compatibility
    const timestampStyleElement = document.createElement('style');
    timestampStyleElement.id = 'timestamp-styles';
    timestampStyleElement.textContent = timestampStyles;
    document.head.appendChild(timestampStyleElement);
}