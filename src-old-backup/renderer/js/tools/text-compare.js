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
        const caseSensitive = document.getElementById('case-sensitive').checked;
        const ignoreWhitespace = document.getElementById('ignore-whitespace').checked;
        const resultDiv = document.getElementById('comparison-result');

        if (!text1.trim() && !text2.trim()) {
            resultDiv.innerHTML = '<div class="error">Please enter text in both fields to compare.</div>';
            return;
        }

        if (!text1.trim() || !text2.trim()) {
            resultDiv.innerHTML = '<div class="error">Please enter text in both fields to compare.</div>';
            return;
        }

        const options = { caseSensitive, ignoreWhitespace };
        const differences = this.getDifferences(text1, text2, options);
        const stats = this.getComparisonStats(text1, text2, differences, options);

        if (differences.length === 0) {
            resultDiv.innerHTML = `
                <div class="comparison-stats">
                    <h3>Comparison Results</h3>
                    <div class="stats-grid">
                        <div class="stat">
                            <label>Text 1 Length</label>
                            <span>${stats.text1Length} characters</span>
                        </div>
                        <div class="stat">
                            <label>Text 2 Length</label>
                            <span>${stats.text2Length} characters</span>
                        </div>
                        <div class="stat similarity">
                            <label>Similarity</label>
                            <span>${stats.similarity}%</span>
                        </div>
                        <div class="stat">
                            <label>Status</label>
                            <span style="color: var(--success-color);">Identical</span>
                        </div>
                    </div>
                </div>
                <div class="no-differences">
                    <h3>Texts are identical!</h3>
                    <p>No differences were found between the two texts.</p>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="comparison-stats">
                    <h3>Comparison Results</h3>
                    <div class="stats-grid">
                        <div class="stat">
                            <label>Text 1 Length</label>
                            <span>${stats.text1Length} characters</span>
                        </div>
                        <div class="stat">
                            <label>Text 2 Length</label>
                            <span>${stats.text2Length} characters</span>
                        </div>
                        <div class="stat similarity">
                            <label>Similarity</label>
                            <span>${stats.similarity}%</span>
                        </div>
                        <div class="stat differences">
                            <label>Differences</label>
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
        }

        window.app?.showMessage('Text comparison completed!', 'success');
    }

    getDifferences(text1, text2, options = {}) {
        let processedText1 = text1;
        let processedText2 = text2;

        // Apply preprocessing based on options
        if (!options.caseSensitive) {
            processedText1 = processedText1.toLowerCase();
            processedText2 = processedText2.toLowerCase();
        }

        if (options.ignoreWhitespace) {
            processedText1 = processedText1.replace(/\s+/g, ' ').trim();
            processedText2 = processedText2.replace(/\s+/g, ' ').trim();
        }

        const lines1 = processedText1.split('\n');
        const lines2 = processedText2.split('\n');
        const originalLines1 = text1.split('\n');
        const originalLines2 = text2.split('\n');
        const differences = [];

        const maxLines = Math.max(lines1.length, lines2.length);

        for (let i = 0; i < maxLines; i++) {
            const line1 = lines1[i] || '';
            const line2 = lines2[i] || '';
            const originalLine1 = originalLines1[i] || '';
            const originalLine2 = originalLines2[i] || '';

            if (line1 !== line2) {
                differences.push({
                    line: i,
                    text1: originalLine1,
                    text2: originalLine2,
                    type: this.getDifferenceType(originalLine1, originalLine2)
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

    getComparisonStats(text1, text2, differences, options = {}) {
        const text1Length = text1.length;
        const text2Length = text2.length;

        let processedText1 = text1;
        let processedText2 = text2;

        // Apply same preprocessing for similarity calculation
        if (!options.caseSensitive) {
            processedText1 = processedText1.toLowerCase();
            processedText2 = processedText2.toLowerCase();
        }

        if (options.ignoreWhitespace) {
            processedText1 = processedText1.replace(/\s+/g, ' ').trim();
            processedText2 = processedText2.replace(/\s+/g, ' ').trim();
        }

        const similarity = this.calculateSimilarity(processedText1, processedText2);

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
                let lineContent = '';

                if (diff.type === 'added' && side === 'right') {
                    className = 'diff-added';
                    lineContent = this.escapeHtml(lines[i] || '');
                } else if (diff.type === 'removed' && side === 'left') {
                    className = 'diff-removed';
                    lineContent = this.escapeHtml(lines[i] || '');
                } else if (diff.type === 'modified') {
                    className = 'diff-modified';
                    // For modified lines, highlight character-level differences
                    const currentLine = lines[i] || '';
                    const otherLine = side === 'left' ? diff.text2 : diff.text1;
                    lineContent = this.highlightCharacterDifferences(currentLine, otherLine);
                }

                const lineNumber = `${i + 1}`.padStart(3, ' ');
                highlightedLines.push(`<div class="diff-line ${className}" title="Line ${i + 1}"><span class="line-number">${lineNumber}</span>${lineContent}</div>`);
            } else {
                const lineNumber = `${i + 1}`.padStart(3, ' ');
                highlightedLines.push(`<div class="diff-line" title="Line ${i + 1}"><span class="line-number">${lineNumber}</span>${this.escapeHtml(lines[i] || '')}</div>`);
            }
        }

        return highlightedLines.join('');
    }

    highlightCharacterDifferences(currentLine, otherLine) {
        if (!currentLine && !otherLine) return '';
        if (!currentLine) return this.escapeHtml(currentLine);
        if (!otherLine) return this.escapeHtml(currentLine);

        // Use a more sophisticated approach to find the longest common subsequence
        const matrix = this.buildDiffMatrix(currentLine, otherLine);
        const diffs = this.extractDiffs(currentLine, otherLine, matrix);

        return this.renderCharacterDiffs(diffs);
    }

    buildDiffMatrix(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;

        // Initialize matrix
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [];
            for (let j = 0; j <= len2; j++) {
                matrix[i][j] = 0;
            }
        }

        // Fill the matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1] + 1;
                } else {
                    matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
                }
            }
        }

        return matrix;
    }

    extractDiffs(str1, str2, matrix) {
        const diffs = [];
        let i = str1.length;
        let j = str2.length;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && str1[i - 1] === str2[j - 1]) {
                diffs.unshift({ type: 'equal', char: str1[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
                diffs.unshift({ type: 'insert', char: str2[j - 1] });
                j--;
            } else if (i > 0) {
                diffs.unshift({ type: 'delete', char: str1[i - 1] });
                i--;
            }
        }

        return diffs;
    }

    renderCharacterDiffs(diffs) {
        const result = [];
        let inDiffGroup = false;
        let diffGroup = [];

        for (let i = 0; i < diffs.length; i++) {
            const diff = diffs[i];

            if (diff.type === 'equal') {
                // If we were in a diff group, close it
                if (inDiffGroup) {
                    if (diffGroup.length > 0) {
                        result.push(`<span class="char-diff">${diffGroup.join('')}</span>`);
                    }
                    diffGroup = [];
                    inDiffGroup = false;
                }
                result.push(this.escapeHtml(diff.char));
            } else {
                // Start or continue a diff group
                if (!inDiffGroup) {
                    inDiffGroup = true;
                }

                if (diff.type === 'delete') {
                    diffGroup.push(this.escapeHtml(diff.char));
                }
                // For 'insert' type, we don't add to current line (it belongs to the other line)
            }
        }

        // Close any remaining diff group
        if (inDiffGroup && diffGroup.length > 0) {
            result.push(`<span class="char-diff">${diffGroup.join('')}</span>`);
        }

        return result.join('');
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