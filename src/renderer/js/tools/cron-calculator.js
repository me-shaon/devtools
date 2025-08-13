class CronCalculator {
    constructor() {
        this.init();
    }

    init() {
        const generateBtn = document.getElementById('generate-cron');
        const parseBtn = document.getElementById('parse-cron');
        const cronFields = document.querySelectorAll('#cron-minute, #cron-hour, #cron-day, #cron-month, #cron-dow');
        const expressionInput = document.getElementById('cron-expression');

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateExpression());
        }

        if (parseBtn) {
            parseBtn.addEventListener('click', () => this.parseExpression());
        }

        cronFields.forEach(field => {
            field.addEventListener('input', () => this.updateFromFields());
        });

        if (expressionInput) {
            expressionInput.addEventListener('input', () => this.updateDescription());
        }
    }

    generateExpression() {
        const minute = document.getElementById('cron-minute').value.trim() || '*';
        const hour = document.getElementById('cron-hour').value.trim() || '*';
        const day = document.getElementById('cron-day').value.trim() || '*';
        const month = document.getElementById('cron-month').value.trim() || '*';
        const dow = document.getElementById('cron-dow').value.trim() || '*';

        const expression = `${minute} ${hour} ${day} ${month} ${dow}`;
        document.getElementById('cron-expression').value = expression;
        
        this.updateDescription();
        this.calculateNextRuns();
        window.app?.showMessage('Cron expression generated!', 'success');
    }

    parseExpression() {
        const expression = document.getElementById('cron-expression').value.trim();
        
        if (!expression) {
            window.app?.showMessage('Please enter a cron expression to parse.', 'error');
            return;
        }

        const parts = expression.split(/\s+/);
        if (parts.length !== 5) {
            window.app?.showMessage('Invalid cron expression. Must have 5 fields.', 'error');
            return;
        }

        document.getElementById('cron-minute').value = parts[0];
        document.getElementById('cron-hour').value = parts[1];
        document.getElementById('cron-day').value = parts[2];
        document.getElementById('cron-month').value = parts[3];
        document.getElementById('cron-dow').value = parts[4];

        this.updateDescription();
        this.calculateNextRuns();
        window.app?.showMessage('Cron expression parsed!', 'success');
    }

    updateFromFields() {
        this.generateExpression();
    }

    updateDescription() {
        const expression = document.getElementById('cron-expression').value.trim();
        const descriptionElement = document.getElementById('cron-description-text');

        if (!expression) {
            descriptionElement.textContent = 'Enter a cron expression to see description';
            return;
        }

        try {
            const description = this.describeCronExpression(expression);
            descriptionElement.textContent = description;
        } catch (error) {
            descriptionElement.textContent = 'Invalid cron expression';
        }
    }

    describeCronExpression(expression) {
        const parts = expression.split(/\s+/);
        if (parts.length !== 5) {
            throw new Error('Invalid expression');
        }

        const [minute, hour, day, month, dow] = parts;
        
        let description = 'Runs ';

        const minuteDesc = this.describeField(minute, 'minute', ['past the hour', 'every minute']);
        const hourDesc = this.describeField(hour, 'hour', ['', 'every hour']);
        const dayDesc = this.describeField(day, 'day', ['on day', 'every day']);
        const monthDesc = this.describeField(month, 'month', ['in', 'every month']);
        const dowDesc = this.describeField(dow, 'weekday', ['on', 'every day']);

        if (minute === '*' && hour === '*' && day === '*' && month === '*' && dow === '*') {
            return 'Runs every minute';
        }

        if (dow !== '*' && day === '*') {
            description += `${dowDesc} at ${this.formatTime(hour, minute)}`;
        } else if (day !== '*' && dow === '*') {
            description += `${dayDesc} of ${monthDesc} at ${this.formatTime(hour, minute)}`;
        } else if (day === '*' && dow === '*') {
            description += `${hourDesc} ${minuteDesc} ${monthDesc}`;
        } else {
            description += `${dayDesc} of ${monthDesc} and ${dowDesc} at ${this.formatTime(hour, minute)}`;
        }

        return description;
    }

    describeField(field, type, prefixes) {
        if (field === '*') {
            return prefixes[1];
        }

        if (field.includes(',')) {
            const values = field.split(',');
            return `${prefixes[0]} ${values.join(', ')}`;
        }

        if (field.includes('-')) {
            const [start, end] = field.split('-');
            return `${prefixes[0]} ${start} through ${end}`;
        }

        if (field.includes('/')) {
            const [base, step] = field.split('/');
            if (base === '*') {
                return `every ${step} ${type}${step > 1 ? 's' : ''}`;
            }
            return `every ${step} ${type}${step > 1 ? 's' : ''} starting at ${base}`;
        }

        return `${prefixes[0]} ${field}`;
    }

    formatTime(hour, minute) {
        if (hour === '*' && minute === '*') {
            return 'every minute';
        }
        if (hour === '*') {
            return `minute ${minute} of every hour`;
        }
        if (minute === '*') {
            return `every minute of hour ${hour}`;
        }
        
        const h = parseInt(hour);
        const m = parseInt(minute);
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const displayMinute = m.toString().padStart(2, '0');
        
        return `${displayHour}:${displayMinute} ${period}`;
    }

    calculateNextRuns() {
        const expression = document.getElementById('cron-expression').value.trim();
        const nextRunsList = document.getElementById('next-runs-list');

        if (!expression) {
            nextRunsList.innerHTML = '<li>Enter a cron expression</li>';
            return;
        }

        try {
            const nextRuns = this.getNextRuns(expression, 5);
            nextRunsList.innerHTML = nextRuns.map(date => 
                `<li>${date.toLocaleString()}</li>`
            ).join('');
        } catch (error) {
            nextRunsList.innerHTML = '<li>Invalid cron expression</li>';
        }
    }

    getNextRuns(expression, count) {
        const parts = expression.split(/\s+/);
        if (parts.length !== 5) {
            throw new Error('Invalid expression');
        }

        const [minutePattern, hourPattern, dayPattern, monthPattern, dowPattern] = parts;
        const runs = [];
        let currentDate = new Date();
        currentDate.setSeconds(0, 0);
        currentDate.setMinutes(currentDate.getMinutes() + 1);

        let attempts = 0;
        const maxAttempts = 10000;

        while (runs.length < count && attempts < maxAttempts) {
            attempts++;
            
            if (this.matchesCronPattern(currentDate, minutePattern, hourPattern, dayPattern, monthPattern, dowPattern)) {
                runs.push(new Date(currentDate));
            }
            
            currentDate.setMinutes(currentDate.getMinutes() + 1);
        }

        return runs;
    }

    matchesCronPattern(date, minute, hour, day, month, dow) {
        const dateMinute = date.getMinutes();
        const dateHour = date.getHours();
        const dateDay = date.getDate();
        const dateMonth = date.getMonth() + 1;
        const dateDow = date.getDay();

        return this.matchesPattern(dateMinute, minute, 0, 59) &&
               this.matchesPattern(dateHour, hour, 0, 23) &&
               this.matchesPattern(dateDay, day, 1, 31) &&
               this.matchesPattern(dateMonth, month, 1, 12) &&
               this.matchesPattern(dateDow, dow, 0, 7);
    }

    matchesPattern(value, pattern, min, max) {
        if (pattern === '*') {
            return true;
        }

        if (pattern.includes(',')) {
            return pattern.split(',').some(p => this.matchesPattern(value, p.trim(), min, max));
        }

        if (pattern.includes('-')) {
            const [start, end] = pattern.split('-').map(x => parseInt(x.trim()));
            return value >= start && value <= end;
        }

        if (pattern.includes('/')) {
            const [base, step] = pattern.split('/');
            const stepNum = parseInt(step);
            
            if (base === '*') {
                return (value - min) % stepNum === 0;
            } else {
                const baseNum = parseInt(base);
                return value >= baseNum && (value - baseNum) % stepNum === 0;
            }
        }

        return value === parseInt(pattern);
    }
}

window.CronCalculator = new CronCalculator();

const cronStyles = `
.cron-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
}

.cron-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.cron-field label {
    font-weight: 500;
    color: #1d1d1f;
    font-size: 14px;
}

.cron-field input {
    padding: 8px 12px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    transition: border-color 0.3s ease;
}

.cron-field input:focus {
    outline: none;
    border-color: #667eea;
}

.cron-expression {
    margin: 20px 0;
}

.cron-expression label {
    display: block;
    font-weight: 500;
    color: #1d1d1f;
    margin-bottom: 8px;
}

#cron-expression {
    width: 100%;
    padding: 12px 15px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 16px;
    font-weight: bold;
    text-align: center;
    background: #f8f9fa;
}

#cron-expression:focus {
    outline: none;
    border-color: #667eea;
}

.cron-description,
.next-runs {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
}

.cron-description h3,
.next-runs h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #1d1d1f;
}

#cron-description-text {
    color: #333;
    line-height: 1.5;
    font-size: 15px;
}

#next-runs-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

#next-runs-list li {
    background: white;
    padding: 10px 15px;
    margin: 8px 0;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    color: #333;
}

.controls {
    display: flex;
    gap: 15px;
    margin: 20px 0;
    flex-wrap: wrap;
}
`;

const style = document.createElement('style');
style.textContent = cronStyles;
document.head.appendChild(style);