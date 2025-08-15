/**
 * Utility class for API response formatting with tree view functionality
 */
class APIFormatterUtils {
  static parseResponse(input, responseType = 'json') {
    if (!input || !input.trim()) {
      throw new Error('Input cannot be empty');
    }

    const trimmedInput = input.trim();

    try {
      switch (responseType.toLowerCase()) {
        case 'json':
          return JSON.parse(trimmedInput);
        case 'graphql':
          // GraphQL responses are JSON format
          const parsed = JSON.parse(trimmedInput);
          this.validateGraphQLResponse(parsed);
          return parsed;
        default:
          throw new Error('Unsupported response type');
      }
    } catch (error) {
      if (
        error.message.includes('Unexpected token') ||
        error.message.includes('Expected')
      ) {
        throw new Error(
          `Invalid ${responseType.toUpperCase()} format: ${error.message}`
        );
      }
      throw error;
    }
  }

  static validateGraphQLResponse(response) {
    // GraphQL response should have data and/or errors fields
    if (typeof response !== 'object' || response === null) {
      throw new Error('GraphQL response must be an object');
    }

    if (
      !response.hasOwnProperty('data') &&
      !response.hasOwnProperty('errors')
    ) {
      throw new Error(
        'GraphQL response must contain either "data" or "errors" field'
      );
    }
  }

  static generateTreeHTML(data, path = '', level = 0) {
    if (data === null) {
      return `<span class="tree-value tree-null">null</span>`;
    }

    if (typeof data === 'undefined') {
      return `<span class="tree-value tree-undefined">undefined</span>`;
    }

    if (typeof data === 'string') {
      const escaped = this.escapeHtml(data);
      return `<span class="tree-value tree-string">"${escaped}"</span>`;
    }

    if (typeof data === 'number') {
      return `<span class="tree-value tree-number">${data}</span>`;
    }

    if (typeof data === 'boolean') {
      return `<span class="tree-value tree-boolean">${data}</span>`;
    }

    if (Array.isArray(data)) {
      return this.generateArrayHTML(data, path, level);
    }

    if (typeof data === 'object') {
      return this.generateObjectHTML(data, path, level);
    }

    return `<span class="tree-value tree-unknown">${String(data)}</span>`;
  }

  static generateArrayHTML(array, path, level) {
    if (array.length === 0) {
      return `<span class="tree-value tree-array">[]</span>`;
    }

    const itemId = `array_${path.replace(
      /[^a-zA-Z0-9]/g,
      '_'
    )}_${level}_${Date.now()}`;
    const isCollapsible = array.length > 0;

    let html = `<div class="tree-node">`;

    if (isCollapsible) {
      html += `
                <span class="tree-toggle" data-target="${itemId}">
                    <i class="fas fa-chevron-down"></i>
                </span>
            `;
    }

    html += `<span class="tree-bracket tree-array-bracket">[</span>`;
    html += `<span class="tree-count">${array.length} item${
      array.length !== 1 ? 's' : ''
    }</span>`;

    if (isCollapsible) {
      html += `<div id="${itemId}" class="tree-children">`;

      array.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        html += `
                    <div class="tree-item" data-level="${level + 1}">
                        <span class="tree-index">${index}:</span>
                        ${this.generateTreeHTML(item, itemPath, level + 1)}
                    </div>
                `;
      });

      html += `</div>`;
    }

    html += `<span class="tree-bracket tree-array-bracket">]</span>`;
    html += `</div>`;

    return html;
  }

  static generateObjectHTML(obj, path, level) {
    const keys = Object.keys(obj);

    if (keys.length === 0) {
      return `<span class="tree-value tree-object">{}</span>`;
    }

    const itemId = `object_${path.replace(
      /[^a-zA-Z0-9]/g,
      '_'
    )}_${level}_${Date.now()}`;
    const isCollapsible = keys.length > 0;

    let html = `<div class="tree-node">`;

    if (isCollapsible) {
      html += `
                <span class="tree-toggle" data-target="${itemId}">
                    <i class="fas fa-chevron-down"></i>
                </span>
            `;
    }

    html += `<span class="tree-bracket tree-object-bracket">{</span>`;
    html += `<span class="tree-count">${keys.length} key${
      keys.length !== 1 ? 's' : ''
    }</span>`;

    if (isCollapsible) {
      html += `<div id="${itemId}" class="tree-children">`;

      keys.forEach((key, index) => {
        const keyPath = path ? `${path}.${key}` : key;
        const isLast = index === keys.length - 1;

        html += `
                    <div class="tree-item" data-level="${level + 1}">
                        <span class="tree-key">"${this.escapeHtml(key)}"</span>
                        <span class="tree-colon">:</span>
                        ${this.generateTreeHTML(obj[key], keyPath, level + 1)}
                        ${!isLast ? '<span class="tree-comma">,</span>' : ''}
                    </div>
                `;
      });

      html += `</div>`;
    }

    html += `<span class="tree-bracket tree-object-bracket">}</span>`;
    html += `</div>`;

    return html;
  }

  static escapeHtml(text) {
    try {
      if (typeof document !== 'undefined' && document.createElement) {
        const div = document.createElement('div');
        if (div && typeof div.textContent !== 'undefined') {
          div.textContent = text;
          return div.innerHTML;
        }
      }
    } catch (e) {
      // Fall through to manual escaping
    }

    // Fallback for testing environments without DOM or when DOM fails
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static getResponseInfo(data) {
    const jsonString = JSON.stringify(data);
    return {
      type: Array.isArray(data) ? 'Array' : typeof data,
      size: this.formatBytes(new Blob([jsonString]).size),
      keys: this.countKeys(data),
      depth: this.getMaxDepth(data),
      charactersCount: jsonString.length,
    };
  }

  static countKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return 0;
    }

    if (Array.isArray(obj)) {
      return obj.length;
    }

    let count = 0;
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        count++;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          count += this.countKeys(obj[key]);
        }
      }
    }
    return count;
  }

  static getMaxDepth(obj, depth = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return depth;
    }

    let maxDepth = depth;

    if (Array.isArray(obj)) {
      for (let item of obj) {
        maxDepth = Math.max(maxDepth, this.getMaxDepth(item, depth + 1));
      }
    } else {
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          maxDepth = Math.max(maxDepth, this.getMaxDepth(obj[key], depth + 1));
        }
      }
    }

    return maxDepth;
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static searchInData(data, searchTerm, path = '') {
    const results = [];

    if (!searchTerm || !searchTerm.trim()) {
      return results;
    }

    const term = searchTerm.toLowerCase();

    if (typeof data === 'string' && data.toLowerCase().includes(term)) {
      results.push({
        path: path || 'root',
        type: 'value',
        value: data,
        match: 'content',
      });
    }

    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        data.forEach((item, index) => {
          const itemPath = path ? `${path}[${index}]` : `[${index}]`;
          results.push(...this.searchInData(item, searchTerm, itemPath));
        });
      } else {
        for (let key in data) {
          if (data.hasOwnProperty(key)) {
            const keyPath = path ? `${path}.${key}` : key;

            // Check if key matches
            if (key.toLowerCase().includes(term)) {
              results.push({
                path: keyPath,
                type: 'key',
                value: key,
                match: 'key',
              });
            }

            // Search in value
            results.push(...this.searchInData(data[key], searchTerm, keyPath));
          }
        }
      }
    }

    return results;
  }

  static highlightSearchResults(html, searchTerm) {
    if (!searchTerm || !searchTerm.trim()) {
      return html;
    }

    // Escape regex special characters and HTML entities
    const term = this.escapeHtml(searchTerm).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
    const regex = new RegExp(`(${term})`, 'gi');

    return html.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  static expandToPath(path) {
    // Generate selectors to expand all nodes in the path
    const pathParts = path.split(/[\.\[\]]/g).filter((part) => part !== '');
    const selectors = [];

    let currentPath = '';
    pathParts.forEach((part, index) => {
      if (index === 0) {
        currentPath = part;
      } else {
        currentPath += pathParts[index - 1].match(/^\d+$/)
          ? `[${part}]`
          : `.${part}`;
      }

      const elementId = `object_${currentPath.replace(
        /[^a-zA-Z0-9]/g,
        '_'
      )}_${index}`;
      selectors.push(`#${elementId}`);
    });

    return selectors;
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIFormatterUtils;
}

// Export for browser
if (typeof window !== 'undefined') {
  window.APIFormatterUtils = APIFormatterUtils;
}
