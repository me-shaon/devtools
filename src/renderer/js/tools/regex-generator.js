class RegexGenerator {
    constructor() {
        this.init();
    }

    init() {
        const testBtn = document.getElementById('test-regex');
        const clearBtn = document.getElementById('clear-regex');
        const patternInput = document.getElementById('regex-pattern');
        const flagsInput = document.getElementById('regex-flags');
        const testInput = document.getElementById('test-string');

        if (testBtn) {
            testBtn.addEventListener('click', () => this.testRegex());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        if (patternInput || flagsInput || testInput) {
            [patternInput, flagsInput, testInput].forEach(input => {
                if (input) {
                    input.addEventListener('input', () => this.clearResults());
                }
            });
        }
    }

    testRegex() {
        const pattern = document.getElementById('regex-pattern').value;
        const flags = document.getElementById('regex-flags').value;
        const testString = document.getElementById('test-string').value;

        if (!pattern) {
            window.app?.showMessage('Please enter a regex pattern.', 'error');
            return;
        }

        if (!testString) {
            window.app?.showMessage('Please enter text to test against.', 'error');
            return;
        }

        try {
            const regex = new RegExp(pattern, flags);
            this.displayMatches(regex, testString);
            this.displayExplanation(pattern, flags);
            window.app?.showMessage('Regex tested successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Invalid regex pattern: ' + error.message, 'error');
            this.clearResults();
        }
    }

    displayMatches(regex, testString) {
        const matchesContainer = document.getElementById('matches-list');
        const matches = [];
        
        if (regex.global) {
            let match;
            while ((match = regex.exec(testString)) !== null) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    groups: match.slice(1)
                });
                
                if (match.index === regex.lastIndex) {
                    break;
                }
            }
        } else {
            const match = regex.exec(testString);
            if (match) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    groups: match.slice(1)
                });
            }
        }

        if (matches.length === 0) {
            matchesContainer.innerHTML = '<p class="no-matches">No matches found</p>';
            return;
        }

        let html = `<p class="match-count">${matches.length} match${matches.length > 1 ? 'es' : ''} found:</p>`;
        
        matches.forEach((match, index) => {
            html += `
                <div class="match-item">
                    <div class="match-header">Match ${index + 1} at position ${match.index}</div>
                    <div class="match-text">${this.escapeHtml(match.match)}</div>
            `;
            
            if (match.groups.length > 0) {
                html += '<div class="match-groups">Groups:';
                match.groups.forEach((group, groupIndex) => {
                    if (group !== undefined) {
                        html += `<span class="group">Group ${groupIndex + 1}: "${this.escapeHtml(group)}"</span>`;
                    }
                });
                html += '</div>';
            }
            
            html += '</div>';
        });

        matchesContainer.innerHTML = html;
        
        this.highlightMatches(testString, matches);
    }

    highlightMatches(text, matches) {
        const testStringElement = document.getElementById('test-string');
        let highlightedText = '';
        let lastIndex = 0;

        matches.forEach(match => {
            highlightedText += this.escapeHtml(text.slice(lastIndex, match.index));
            highlightedText += `<mark class="regex-match">${this.escapeHtml(match.match)}</mark>`;
            lastIndex = match.index + match.match.length;
        });
        
        highlightedText += this.escapeHtml(text.slice(lastIndex));

        const overlay = document.createElement('div');
        overlay.className = 'regex-overlay';
        overlay.innerHTML = highlightedText;
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 15px;
            pointer-events: none;
            white-space: pre-wrap;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            color: transparent;
            z-index: 1;
        `;

        const container = testStringElement.parentNode;
        if (container.querySelector('.regex-overlay')) {
            container.removeChild(container.querySelector('.regex-overlay'));
        }
        
        container.style.position = 'relative';
        container.appendChild(overlay);
    }

    displayExplanation(pattern, flags) {
        const explanationContainer = document.getElementById('explanation-text');
        
        let explanation = `<div class="pattern-info">`;
        explanation += `<strong>Pattern:</strong> <code>/${pattern}/${flags}</code><br>`;
        explanation += `<strong>Flags:</strong> ${this.explainFlags(flags)}<br><br>`;
        explanation += `<strong>Pattern breakdown:</strong></div>`;
        
        explanation += this.explainPattern(pattern);
        
        explanationContainer.innerHTML = explanation;
    }

    explainFlags(flags) {
        if (!flags) return 'None';
        
        const flagExplanations = {
            'g': 'Global (find all matches)',
            'i': 'Case insensitive',
            'm': 'Multiline',
            's': 'Dot matches newlines',
            'u': 'Unicode',
            'y': 'Sticky'
        };
        
        return flags.split('').map(flag => flagExplanations[flag] || flag).join(', ');
    }

    explainPattern(pattern) {
        let result = '<div class="pattern-breakdown">';
        
        const tokens = this.tokenizePattern(pattern);
        tokens.forEach(token => {
            const explanation = this.getTokenExplanation(token);
            result += `<div class="token-explanation">
                <code class="token">${this.escapeHtml(token)}</code>
                <span class="token-desc">${explanation}</span>
            </div>`;
        });
        
        result += '</div>';
        return result;
    }

    tokenizePattern(pattern) {
        const tokens = [];
        let i = 0;
        
        while (i < pattern.length) {
            const char = pattern[i];
            
            if (char === '\\' && i + 1 < pattern.length) {
                tokens.push(pattern.slice(i, i + 2));
                i += 2;
            } else if (char === '[') {
                let j = i + 1;
                while (j < pattern.length && pattern[j] !== ']') {
                    if (pattern[j] === '\\') j++;
                    j++;
                }
                tokens.push(pattern.slice(i, j + 1));
                i = j + 1;
            } else if (char === '(') {
                let j = i + 1;
                let depth = 1;
                while (j < pattern.length && depth > 0) {
                    if (pattern[j] === '\\') {
                        j++;
                    } else if (pattern[j] === '(') {
                        depth++;
                    } else if (pattern[j] === ')') {
                        depth--;
                    }
                    j++;
                }
                tokens.push(pattern.slice(i, j));
                i = j;
            } else {
                tokens.push(char);
                i++;
            }
        }
        
        return tokens;
    }

    getTokenExplanation(token) {
        const explanations = {
            '.': 'Matches any character except newline',
            '*': 'Matches zero or more of the preceding element',
            '+': 'Matches one or more of the preceding element',
            '?': 'Matches zero or one of the preceding element',
            '^': 'Matches the start of a string',
            '$': 'Matches the end of a string',
            '|': 'Alternation - matches either expression before or after',
            '\\d': 'Matches any digit (0-9)',
            '\\D': 'Matches any non-digit',
            '\\w': 'Matches any word character (a-z, A-Z, 0-9, _)',
            '\\W': 'Matches any non-word character',
            '\\s': 'Matches any whitespace character',
            '\\S': 'Matches any non-whitespace character',
            '\\b': 'Word boundary',
            '\\B': 'Non-word boundary',
            '\\n': 'Newline character',
            '\\t': 'Tab character',
            '\\r': 'Carriage return'
        };
        
        if (explanations[token]) {
            return explanations[token];
        }
        
        if (token.startsWith('[') && token.endsWith(']')) {
            return `Character class: matches any character in the set`;
        }
        
        if (token.startsWith('(') && token.endsWith(')')) {
            return `Capturing group`;
        }
        
        if (token.startsWith('{') && token.endsWith('}')) {
            return `Quantifier: specifies number of matches`;
        }
        
        if (token.startsWith('\\')) {
            return `Escaped character: ${token.slice(1)}`;
        }
        
        return `Literal character: ${token}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearResults() {
        document.getElementById('matches-list').innerHTML = '';
        document.getElementById('explanation-text').innerHTML = '';
        
        const overlay = document.querySelector('.regex-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    clearAll() {
        document.getElementById('regex-pattern').value = '';
        document.getElementById('regex-flags').value = '';
        document.getElementById('test-string').value = '';
        this.clearResults();
        window.app?.showMessage('Regex cleared!', 'info');
    }
}

window.RegexGenerator = new RegexGenerator();

const regexStyles = `
.regex-input-group {
    display: flex;
    align-items: center;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 15px;
}

.regex-delimiter {
    background: #f8f9fa;
    padding: 12px 8px;
    color: #666;
    font-family: 'Monaco', 'Consolas', monospace;
    font-weight: bold;
    font-size: 16px;
}

#regex-pattern {
    flex: 1;
    border: none;
    outline: none;
    padding: 12px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
}

#regex-flags {
    border: none;
    outline: none;
    padding: 12px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    background: #fafafa;
}

.regex-input-group:focus-within {
    border-color: #667eea;
}

.test-input label,
.regex-input label {
    display: block;
    font-weight: 500;
    color: #1d1d1f;
    margin-bottom: 8px;
}

#test-string {
    position: relative;
    z-index: 2;
    background: transparent;
}

.regex-results {
    margin-top: 30px;
}

.regex-results h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #1d1d1f;
}

.matches,
.explanation {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
}

.no-matches {
    color: #86868b;
    font-style: italic;
    margin: 0;
}

.match-count {
    color: #155724;
    font-weight: 500;
    margin: 0 0 15px 0;
}

.match-item {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    margin: 10px 0;
    padding: 15px;
}

.match-header {
    font-weight: 500;
    color: #666;
    font-size: 12px;
    margin-bottom: 8px;
}

.match-text {
    font-family: 'Monaco', 'Consolas', monospace;
    background: #e8f4fd;
    padding: 8px 12px;
    border-radius: 4px;
    border-left: 3px solid #667eea;
    word-break: break-all;
}

.match-groups {
    margin-top: 10px;
    font-size: 14px;
}

.group {
    display: inline-block;
    background: #f0f8ff;
    padding: 2px 8px;
    border-radius: 12px;
    margin: 2px 5px 2px 0;
    font-size: 12px;
    color: #0066cc;
    border: 1px solid #cce7ff;
}

.regex-match {
    background-color: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 2px;
    padding: 1px 2px;
}

.pattern-info {
    background: white;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    margin-bottom: 15px;
    line-height: 1.5;
}

.pattern-breakdown {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 15px;
}

.token-explanation {
    display: flex;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
}

.token-explanation:last-child {
    border-bottom: none;
}

.token {
    background: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
    margin-right: 15px;
    min-width: 50px;
    text-align: center;
}

.token-desc {
    color: #555;
    flex: 1;
}

.cheatsheet-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-top: 15px;
}

.cheat-item {
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
    font-size: 13px;
}

.cheat-item code {
    background: #f4f4f4;
    padding: 2px 4px;
    border-radius: 2px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-weight: bold;
    color: #d73a49;
}
`;

const style = document.createElement('style');
style.textContent = regexStyles;
document.head.appendChild(style);