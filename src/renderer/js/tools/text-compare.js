class TextCompare {
    constructor() {
        this.init();
    }

    init() {
        const compareBtn = document.getElementById('compare-texts');
        const clearBtn = document.getElementById('clear-comparison');

        if (compareBtn) {
            compareBtn.addEventListener('click', () => this.compareTexts());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearComparison());
        }
    }

    compareTexts() {
        const text1 = document.getElementById('text1').value;
        const text2 = document.getElementById('text2').value;
        const resultDiv = document.getElementById('comparison-result');

        if (!text1.trim() && !text2.trim()) {
            resultDiv.innerHTML = '<div class="error">Please enter text in both fields to compare.</div>';
            return;
        }

        if (!text1.trim() || !text2.trim()) {
            resultDiv.innerHTML = '<div class="error">Please enter text in both fields to compare.</div>';
            return;
        }

        const differences = this.getDifferences(text1, text2);
        const stats = this.getComparisonStats(text1, text2, differences);

        resultDiv.innerHTML = `
            <div class="comparison-stats">
                <h3>Comparison Results</h3>
                <div class="stats-grid">
                    <div class="stat">
                        <label>Text 1 Length:</label>
                        <span>${stats.text1Length} characters</span>
                    </div>
                    <div class="stat">
                        <label>Text 2 Length:</label>
                        <span>${stats.text2Length} characters</span>
                    </div>
                    <div class="stat">
                        <label>Similarity:</label>
                        <span>${stats.similarity}%</span>
                    </div>
                    <div class="stat">
                        <label>Differences:</label>
                        <span>${differences.length} changes</span>
                    </div>
                </div>
            </div>
            <div class="diff-view">
                <div class="diff-column">
                    <h4>Text 1</h4>
                    <div class="diff-content">${this.highlightDifferences(text1, differences, 'left')}</div>
                </div>
                <div class="diff-column">
                    <h4>Text 2</h4>
                    <div class="diff-content">${this.highlightDifferences(text2, differences, 'right')}</div>
                </div>
            </div>
        `;

        window.app?.showMessage('Text comparison completed!', 'success');
    }

    getDifferences(text1, text2) {
        const lines1 = text1.split('\n');
        const lines2 = text2.split('\n');
        const differences = [];

        const maxLines = Math.max(lines1.length, lines2.length);

        for (let i = 0; i < maxLines; i++) {
            const line1 = lines1[i] || '';
            const line2 = lines2[i] || '';

            if (line1 !== line2) {
                differences.push({
                    line: i,
                    text1: line1,
                    text2: line2,
                    type: this.getDifferenceType(line1, line2)
                });
            }
        }

        return differences;
    }

    getDifferenceType(line1, line2) {
        if (!line1) return 'added';
        if (!line2) return 'removed';
        return 'modified';
    }

    getComparisonStats(text1, text2, differences) {
        const text1Length = text1.length;
        const text2Length = text2.length;
        
        const similarity = this.calculateSimilarity(text1, text2);

        return {
            text1Length,
            text2Length,
            similarity: Math.round(similarity * 100),
            differences: differences.length
        };
    }

    calculateSimilarity(text1, text2) {
        const longer = text1.length > text2.length ? text1 : text2;
        const shorter = text1.length > text2.length ? text2 : text1;

        if (longer.length === 0) {
            return 1.0;
        }

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    highlightDifferences(text, differences, side) {
        const lines = text.split('\n');
        const highlightedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const diff = differences.find(d => d.line === i);
            if (diff) {
                let className = '';
                if (diff.type === 'added' && side === 'right') {
                    className = 'diff-added';
                } else if (diff.type === 'removed' && side === 'left') {
                    className = 'diff-removed';
                } else if (diff.type === 'modified') {
                    className = 'diff-modified';
                }
                highlightedLines.push(`<div class="diff-line ${className}">${this.escapeHtml(lines[i])}</div>`);
            } else {
                highlightedLines.push(`<div class="diff-line">${this.escapeHtml(lines[i])}</div>`);
            }
        }

        return highlightedLines.join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearComparison() {
        document.getElementById('text1').value = '';
        document.getElementById('text2').value = '';
        document.getElementById('comparison-result').innerHTML = '';
        window.app?.showMessage('Comparison cleared!', 'info');
    }
}

window.TextCompare = new TextCompare();

const additionalStyles = `
.comparison-stats {
    margin-bottom: 20px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-top: 15px;
}

.stat {
    display: flex;
    justify-content: space-between;
    padding: 10px;
    background: white;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
}

.stat label {
    font-weight: 500;
    color: #666;
}

.diff-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.diff-column h4 {
    margin-bottom: 10px;
    color: #333;
    padding-bottom: 5px;
    border-bottom: 2px solid #eee;
}

.diff-content {
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    max-height: 400px;
    overflow-y: auto;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
}

.diff-line {
    padding: 4px 12px;
    border-bottom: 1px solid #f0f0f0;
    white-space: pre-wrap;
}

.diff-line.diff-added {
    background-color: #d4edda;
    border-left: 3px solid #28a745;
}

.diff-line.diff-removed {
    background-color: #f8d7da;
    border-left: 3px solid #dc3545;
}

.diff-line.diff-modified {
    background-color: #fff3cd;
    border-left: 3px solid #ffc107;
}
`;

const style = document.createElement('style');
style.textContent = additionalStyles;
document.head.appendChild(style);