class SQLFormatter {
    constructor() {
        this.keywords = [
            'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE',
            'INDEX', 'VIEW', 'DATABASE', 'SCHEMA', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'CONSTRAINT',
            'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES', 'UNIQUE', 'NOT', 'NULL', 'DEFAULT', 'CHECK',
            'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'JOIN', 'ON', 'USING', 'UNION', 'ALL',
            'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'ASC', 'DESC', 'DISTINCT',
            'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF',
            'EXISTS', 'IN', 'LIKE', 'BETWEEN', 'AND', 'OR', 'IS', 'TRUE', 'FALSE', 'CAST', 'CONVERT',
            'INT', 'INTEGER', 'VARCHAR', 'CHAR', 'TEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL',
            'FLOAT', 'DOUBLE', 'BOOLEAN', 'BLOB', 'CLOB'
        ];
        this.init();
    }

    init() {
        const formatBtn = document.getElementById('format-sql');
        const minifyBtn = document.getElementById('minify-sql');
        const clearBtn = document.getElementById('clear-sql');
        const inputTextarea = document.getElementById('sql-input');

        if (formatBtn) {
            formatBtn.addEventListener('click', () => this.formatSQL());
        }

        if (minifyBtn) {
            minifyBtn.addEventListener('click', () => this.minifySQL());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        if (inputTextarea) {
            inputTextarea.addEventListener('input', () => this.clearOutput());
        }
    }

    formatSQL() {
        const input = document.getElementById('sql-input').value.trim();
        const output = document.getElementById('sql-output');
        const uppercaseKeywords = document.getElementById('uppercase-keywords').checked;
        const useTabs = document.getElementById('indent-tabs').checked;

        if (!input) {
            window.app?.showMessage('Please enter SQL to format.', 'error');
            return;
        }

        try {
            const formatted = this.formatSQLQuery(input, {
                uppercaseKeywords,
                useTabs
            });
            output.textContent = formatted;
            window.app?.showMessage('SQL formatted successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error formatting SQL: ' + error.message, 'error');
        }
    }

    minifySQL() {
        const input = document.getElementById('sql-input').value.trim();
        const output = document.getElementById('sql-output');

        if (!input) {
            window.app?.showMessage('Please enter SQL to minify.', 'error');
            return;
        }

        try {
            const minified = this.minifySQLQuery(input);
            output.textContent = minified;
            window.app?.showMessage('SQL minified successfully!', 'success');
        } catch (error) {
            window.app?.showMessage('Error minifying SQL: ' + error.message, 'error');
        }
    }

    formatSQLQuery(sql, options = {}) {
        const { uppercaseKeywords = true, useTabs = true } = options;
        const indent = useTabs ? '\t' : '  ';
        
        let formatted = sql;
        let indentLevel = 0;
        
        formatted = formatted.replace(/\s+/g, ' ').trim();
        
        if (uppercaseKeywords) {
            this.keywords.forEach(keyword => {
                const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
                formatted = formatted.replace(regex, keyword.toUpperCase());
            });
        }
        
        formatted = formatted.replace(/\s*,\s*/g, ',\n' + indent.repeat(indentLevel + 1));
        
        formatted = formatted.replace(/\bSELECT\b/gi, '\nSELECT');
        formatted = formatted.replace(/\bFROM\b/gi, '\nFROM');
        formatted = formatted.replace(/\bWHERE\b/gi, '\nWHERE');
        formatted = formatted.replace(/\bINNER\s+JOIN\b/gi, '\nINNER JOIN');
        formatted = formatted.replace(/\bLEFT\s+JOIN\b/gi, '\nLEFT JOIN');
        formatted = formatted.replace(/\bRIGHT\s+JOIN\b/gi, '\nRIGHT JOIN');
        formatted = formatted.replace(/\bFULL\s+OUTER\s+JOIN\b/gi, '\nFULL OUTER JOIN');
        formatted = formatted.replace(/\bGROUP\s+BY\b/gi, '\nGROUP BY');
        formatted = formatted.replace(/\bORDER\s+BY\b/gi, '\nORDER BY');
        formatted = formatted.replace(/\bHAVING\b/gi, '\nHAVING');
        formatted = formatted.replace(/\bUNION\b/gi, '\nUNION');
        formatted = formatted.replace(/\bINSERT\s+INTO\b/gi, '\nINSERT INTO');
        formatted = formatted.replace(/\bUPDATE\b/gi, '\nUPDATE');
        formatted = formatted.replace(/\bSET\b/gi, '\nSET');
        formatted = formatted.replace(/\bDELETE\s+FROM\b/gi, '\nDELETE FROM');
        
        formatted = formatted.replace(/\bAND\b/gi, '\n' + indent + 'AND');
        formatted = formatted.replace(/\bOR\b/gi, '\n' + indent + 'OR');
        
        formatted = formatted.replace(/\(\s*/g, '(\n' + indent);
        formatted = formatted.replace(/\s*\)/g, '\n)');
        
        const lines = formatted.split('\n');
        let result = [];
        let currentIndent = 0;
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            if (line.endsWith('(') || line.match(/\b(SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY|HAVING)\b/i)) {
                result.push(indent.repeat(currentIndent) + line);
                if (line.endsWith('(')) {
                    currentIndent++;
                }
            } else if (line === ')') {
                currentIndent = Math.max(0, currentIndent - 1);
                result.push(indent.repeat(currentIndent) + line);
            } else if (line.startsWith('AND') || line.startsWith('OR')) {
                result.push(indent.repeat(currentIndent + 1) + line);
            } else {
                result.push(indent.repeat(currentIndent) + line);
            }
        }
        
        return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    minifySQLQuery(sql) {
        return sql.replace(/\s+/g, ' ')
                 .replace(/\s*,\s*/g, ',')
                 .replace(/\s*\(\s*/g, '(')
                 .replace(/\s*\)\s*/g, ')')
                 .replace(/\s*=\s*/g, '=')
                 .replace(/\s*<\s*/g, '<')
                 .replace(/\s*>\s*/g, '>')
                 .replace(/\s*;\s*/g, ';')
                 .trim();
    }

    clearAll() {
        document.getElementById('sql-input').value = '';
        this.clearOutput();
        window.app?.showMessage('SQL cleared!', 'info');
    }

    clearOutput() {
        document.getElementById('sql-output').textContent = '';
    }
}

window.SQLFormatter = new SQLFormatter();

const sqlStyles = `
.sql-options {
    display: flex;
    gap: 20px;
    margin: 15px 0;
    flex-wrap: wrap;
}

.sql-options label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #1d1d1f;
    cursor: pointer;
}

.sql-options input[type="checkbox"] {
    margin: 0;
}

#sql-output {
    background-color: #f8f9fa;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    padding: 15px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre;
    overflow: auto;
    max-height: 400px;
    min-height: 200px;
}
`;

const style = document.createElement('style');
style.textContent = sqlStyles;
document.head.appendChild(style);