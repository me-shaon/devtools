/**
 * API Response Formatter - Format REST/GraphQL responses with tree view
 *
 * Features:
 * - Interactive tree view with expand/collapse
 * - Real-time search with highlighting and navigation
 * - JSON and GraphQL response support
 * - Syntax highlighting and validation
 * - Copy/export functionality
 *
 * @version 1.0.1 - Fixed multi-character search bug with DOM normalization
 */
class APIResponseFormatter {
  constructor() {
    this.currentData = null;
    this.currentType = 'json';
    this.searchResults = [];
    this.currentSearchIndex = 0;
    this.searchDebounceTimer = null;
    this.bindEvents();
  }

  bindEvents() {
    const formatBtn = document.getElementById('format-response');
    const validateBtn = document.getElementById('validate-response');
    const expandAllBtn = document.getElementById('expand-all');
    const collapseAllBtn = document.getElementById('collapse-all');
    const copyBtn = document.getElementById('copy-response');
    const clearBtn = document.getElementById('clear-response');
    const typeSelect = document.getElementById('response-type');
    const searchInput = document.getElementById('search-response');
    const searchPrevBtn = document.getElementById('search-prev');
    const searchNextBtn = document.getElementById('search-next');

    if (formatBtn)
      formatBtn.addEventListener('click', () => this.formatResponse());
    if (validateBtn)
      validateBtn.addEventListener('click', () => this.validateResponse());
    if (expandAllBtn)
      expandAllBtn.addEventListener('click', () => this.expandAll());
    if (collapseAllBtn)
      collapseAllBtn.addEventListener('click', () => this.collapseAll());
    if (copyBtn)
      copyBtn.addEventListener('click', () => this.copyToClipboard());
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearAll());
    if (typeSelect)
      typeSelect.addEventListener('change', () => this.onTypeChange());
    if (searchInput) {
      searchInput.addEventListener('input', () =>
        this.onSearchInputDebounced()
      );
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchNext();
        }
      });
    }
    if (searchPrevBtn)
      searchPrevBtn.addEventListener('click', () => this.searchPrev());
    if (searchNextBtn)
      searchNextBtn.addEventListener('click', () => this.searchNext());

    // Bind tree toggle events using event delegation
    const output = document.getElementById('response-output');
    if (output) {
      output.addEventListener('click', (e) => {
        if (e.target.closest('.tree-toggle')) {
          this.toggleTreeNode(e.target.closest('.tree-toggle'));
        }
      });
    }
  }

  formatResponse() {
    this.clearButtonStates(); // Clear all active button states
    this.setButtonActive('format-response'); // Set this button as active

    const input = document.getElementById('response-input').value;
    const typeSelect = document.getElementById('response-type');
    const output = document.getElementById('response-output');
    const responseType = typeSelect ? typeSelect.value : 'json';

    if (!input.trim()) {
      this.showError('Please enter API response data to format.');
      return;
    }

    try {
      this.currentData = window.APIFormatterUtils.parseResponse(
        input,
        responseType
      );
      this.currentType = responseType;

      const treeHTML = window.APIFormatterUtils.generateTreeHTML(
        this.currentData
      );
      const info = window.APIFormatterUtils.getResponseInfo(this.currentData);

      output.innerHTML = `
                <div class="response-info">
                    <div class="info-row">
                        <span class="info-label">Type:</span>
                        <span class="info-value">${info.type}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Size:</span>
                        <span class="info-value">${info.size}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Keys:</span>
                        <span class="info-value">${info.keys}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Depth:</span>
                        <span class="info-value">${info.depth}</span>
                    </div>
                </div>
                <div class="tree-container">
                    ${treeHTML}
                </div>
            `;

      this.clearErrors();
      this.updateSearchResults();
      window.app?.showMessage(
        `${responseType.toUpperCase()} formatted successfully!`,
        'success'
      );
    } catch (error) {
      this.showError(error.message);
      this.currentData = null;
    }
  }

  validateResponse() {
    this.clearButtonStates(); // Clear all active button states
    this.setButtonActive('validate-response'); // Set this button as active

    const input = document.getElementById('response-input').value;
    const typeSelect = document.getElementById('response-type');
    const output = document.getElementById('response-output');
    const responseType = typeSelect ? typeSelect.value : 'json';

    if (!input.trim()) {
      this.showError('Please enter API response data to validate.');
      return;
    }

    try {
      const data = window.APIFormatterUtils.parseResponse(input, responseType);
      const info = window.APIFormatterUtils.getResponseInfo(data);

      let validationMessage = '';
      if (responseType === 'graphql') {
        validationMessage = this.validateGraphQLStructure(data);
      }

      output.innerHTML = `
                <div class="validation-success">
                    <h3>✅ Valid ${responseType.toUpperCase()}</h3>
                    ${validationMessage ? `<p>${validationMessage}</p>` : ''}
                    <div class="response-info">
                        <div class="info-row">
                            <span class="info-label">Type:</span>
                            <span class="info-value">${info.type}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Size:</span>
                            <span class="info-value">${info.size}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Keys:</span>
                            <span class="info-value">${info.keys}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Depth:</span>
                            <span class="info-value">${info.depth}</span>
                        </div>
                    </div>
                </div>
            `;

      this.clearErrors();
      window.app?.showMessage(
        `${responseType.toUpperCase()} is valid!`,
        'success'
      );
    } catch (error) {
      this.showError(error.message);
      output.innerHTML = `
                <div class="validation-error">
                    <h3>❌ Invalid ${responseType.toUpperCase()}</h3>
                    <p>${error.message}</p>
                </div>
            `;
    }
  }

  validateGraphQLStructure(data) {
    const messages = [];

    if (data.data) {
      messages.push('Contains data field');
    }

    if (data.errors && Array.isArray(data.errors)) {
      messages.push(`Contains ${data.errors.length} error(s)`);
    }

    if (data.extensions) {
      messages.push('Contains extensions field');
    }

    return messages.join(', ');
  }

  expandAll() {
    this.clearButtonStates(); // Clear button states
    this.setButtonActive('expand-all');

    const toggles = document.querySelectorAll(
      '.tree-toggle i.fa-chevron-right'
    );
    toggles.forEach((toggle) => {
      const toggleBtn = toggle.parentElement;
      this.expandTreeNode(toggleBtn);
    });

    window.app?.showMessage('All nodes expanded', 'info');

    // Clear active state after a short delay
    setTimeout(() => this.clearButtonStates(), 1000);
  }

  collapseAll() {
    this.clearButtonStates(); // Clear button states
    this.setButtonActive('collapse-all');

    const toggles = document.querySelectorAll('.tree-toggle i.fa-chevron-down');
    toggles.forEach((toggle) => {
      const toggleBtn = toggle.parentElement;
      this.collapseTreeNode(toggleBtn);
    });

    window.app?.showMessage('All nodes collapsed', 'info');

    // Clear active state after a short delay
    setTimeout(() => this.clearButtonStates(), 1000);
  }

  toggleTreeNode(toggleBtn) {
    const icon = toggleBtn.querySelector('i');
    const target = document.getElementById(toggleBtn.dataset.target);

    if (!target) return;

    if (icon.classList.contains('fa-chevron-down')) {
      this.collapseTreeNode(toggleBtn);
    } else {
      this.expandTreeNode(toggleBtn);
    }
  }

  expandTreeNode(toggleBtn) {
    const icon = toggleBtn.querySelector('i');
    const target = document.getElementById(toggleBtn.dataset.target);

    if (!target) return;

    icon.classList.remove('fa-chevron-right');
    icon.classList.add('fa-chevron-down');
    target.style.display = 'block';
  }

  collapseTreeNode(toggleBtn) {
    const icon = toggleBtn.querySelector('i');
    const target = document.getElementById(toggleBtn.dataset.target);

    if (!target) return;

    icon.classList.remove('fa-chevron-down');
    icon.classList.add('fa-chevron-right');
    target.style.display = 'none';
  }

  onSearchInputDebounced() {
    // Clear any existing timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    const searchInput = document.getElementById('search-response');
    const searchTerm = searchInput ? searchInput.value : '';

    // For very short queries (1-2 characters), use shorter debounce
    // For longer queries, use longer debounce to avoid too many searches while typing
    const debounceDelay = searchTerm.length <= 2 ? 150 : 300;

    // Set a new timer to perform search after debounce delay
    this.searchDebounceTimer = setTimeout(() => {
      this.performSearch();
    }, debounceDelay);
  }

  performSearch() {
    const searchInput = document.getElementById('search-response');
    const searchTerm = searchInput ? searchInput.value : '';

    // Clear previous highlights
    this.clearSearchHighlights();

    if (!searchTerm.trim()) {
      this.searchResults = [];
      this.currentSearchIndex = 0;
      this.updateSearchStats();
      return;
    }

    // Highlight results and count them
    const highlightedCount = this.highlightSearchResults(searchTerm);

    // For now, create a simple results array for navigation
    this.searchResults = Array.from({ length: highlightedCount }, (_, i) => ({
      index: i,
    }));
    this.currentSearchIndex = 0;

    this.updateSearchStats();

    if (this.searchResults.length > 0) {
      this.updateCurrentSearchResult(0);
    }
  }

  searchNext() {
    if (this.searchResults.length === 0) return;

    this.currentSearchIndex =
      (this.currentSearchIndex + 1) % this.searchResults.length;
    this.updateCurrentSearchResult(this.currentSearchIndex);
    this.updateSearchStats();
  }

  searchPrev() {
    if (this.searchResults.length === 0) return;

    this.currentSearchIndex =
      this.currentSearchIndex === 0
        ? this.searchResults.length - 1
        : this.currentSearchIndex - 1;
    this.updateCurrentSearchResult(this.currentSearchIndex);
    this.updateSearchStats();
  }

  highlightSearchResults(searchTerm) {
    const output = document.getElementById('response-output');
    if (!output) return 0;

    // Clear previous highlights first
    this.clearSearchHighlights();

    if (!searchTerm || !searchTerm.trim()) return 0;

    // Use a safer approach: find text nodes and highlight matches
    return this.highlightInTextNodes(output, searchTerm.toLowerCase());
  }

  /**
   * Clear all search highlighting from the formatted output.
   *
   * CRITICAL: This method includes DOM normalization to prevent TreeWalker
   * issues when replacing highlight elements with text nodes. Without
   * normalization, adjacent text nodes created during highlight removal
   * can fragment the DOM and break subsequent search functionality.
   *
   * Fix for: Multi-character search queries failing after first character
   * @since 1.0.1
   */
  clearSearchHighlights() {
    const highlights = document.querySelectorAll(
      '.search-highlight, .search-current'
    );
    const parents = new Set();

    highlights.forEach((highlight) => {
      const text = highlight.textContent;
      const parent = highlight.parentNode;
      parents.add(parent);
      parent.replaceChild(document.createTextNode(text), highlight);
    });

    // Normalize adjacent text nodes to prevent TreeWalker issues
    parents.forEach((parent) => {
      if (parent && parent.normalize) {
        parent.normalize();
      }
    });
  }

  highlightInTextNodes(element, searchTerm) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.toLowerCase().includes(searchTerm)) {
        textNodes.push(node);
      }
    }

    let highlightCount = 0;

    textNodes.forEach((textNode) => {
      const parent = textNode.parentNode;
      if (
        parent &&
        !parent.classList.contains('search-highlight') &&
        !parent.classList.contains('search-current')
      ) {
        const text = textNode.textContent;
        const lowerText = text.toLowerCase();
        let currentIndex = 0;
        let searchIndex = lowerText.indexOf(searchTerm, currentIndex);

        if (searchIndex !== -1) {
          const fragment = document.createDocumentFragment();

          while (searchIndex !== -1) {
            // Add text before the match
            if (searchIndex > currentIndex) {
              const beforeText = text.substring(currentIndex, searchIndex);
              fragment.appendChild(document.createTextNode(beforeText));
            }

            // Add the highlighted match
            const matchText = text.substring(
              searchIndex,
              searchIndex + searchTerm.length
            );
            const highlight = document.createElement('mark');
            highlight.className = 'search-highlight';
            highlight.textContent = matchText;
            fragment.appendChild(highlight);
            highlightCount++;

            // Move to next potential match
            currentIndex = searchIndex + searchTerm.length;
            searchIndex = lowerText.indexOf(searchTerm, currentIndex);
          }

          // Add any remaining text
          if (currentIndex < text.length) {
            const afterText = text.substring(currentIndex);
            fragment.appendChild(document.createTextNode(afterText));
          }

          parent.replaceChild(fragment, textNode);
        }
      }
    });

    return highlightCount;
  }

  updateCurrentSearchResult(index) {
    // Remove previous current highlighting
    const currentHighlights = document.querySelectorAll('.search-current');
    currentHighlights.forEach((highlight) => {
      highlight.classList.remove('search-current');
      highlight.classList.add('search-highlight');
    });

    // Add current highlighting to new result
    const highlights = document.querySelectorAll('.search-highlight');
    if (highlights[index]) {
      highlights[index].classList.remove('search-highlight');
      highlights[index].classList.add('search-current');
      highlights[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  updateSearchStats() {
    const searchStats = document.getElementById('search-stats');
    if (!searchStats) return;

    if (this.searchResults.length === 0) {
      searchStats.textContent = '';
    } else {
      searchStats.textContent = `${this.currentSearchIndex + 1} of ${
        this.searchResults.length
      }`;
    }
  }

  updateSearchResults() {
    // Clear search when data changes
    const searchInput = document.getElementById('search-response');
    if (searchInput) {
      searchInput.value = '';
    }
    this.searchResults = [];
    this.currentSearchIndex = 0;
    this.updateSearchStats();
  }

  copyToClipboard() {
    this.clearButtonStates(); // Clear button states
    this.setButtonActive('copy-response');

    if (!this.currentData) {
      this.showError('No formatted data to copy.');
      setTimeout(() => this.clearButtonStates(), 1000);
      return;
    }

    try {
      const formatted = JSON.stringify(this.currentData, null, 2);
      navigator.clipboard
        .writeText(formatted)
        .then(() => {
          window.app?.showMessage(
            'Formatted response copied to clipboard!',
            'success'
          );
          setTimeout(() => this.clearButtonStates(), 1000);
        })
        .catch(() => {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = formatted;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          window.app?.showMessage(
            'Formatted response copied to clipboard!',
            'success'
          );
          setTimeout(() => this.clearButtonStates(), 1000);
        });
    } catch (error) {
      this.showError('Failed to copy to clipboard.');
      setTimeout(() => this.clearButtonStates(), 1000);
    }
  }

  onTypeChange() {
    // Clear output when type changes
    this.clearOutput();
    this.currentData = null;
    this.updateSearchResults();
  }

  clearAll() {
    this.clearButtonStates(); // Clear button states
    this.setButtonActive('clear-response');

    const input = document.getElementById('response-input');
    const searchInput = document.getElementById('search-response');

    if (input) input.value = '';
    if (searchInput) searchInput.value = '';

    this.clearOutput();
    this.currentData = null;
    this.searchResults = [];

    window.app?.showMessage('All data cleared!', 'info');
    setTimeout(() => this.clearButtonStates(), 1000);
  }

  clearOutput() {
    const output = document.getElementById('response-output');
    if (output) output.innerHTML = '';
  }

  showError(message) {
    const output = document.getElementById('response-output');
    if (output) {
      output.innerHTML = `<div class="error">${message}</div>`;
    }
  }

  clearErrors() {
    const existingErrors = document.querySelectorAll('.error');
    existingErrors.forEach((error) => error.remove());
  }

  // Button state management methods
  clearButtonStates() {
    const buttons = [
      'format-response',
      'validate-response',
      'expand-all',
      'collapse-all',
      'copy-response',
      'clear-response',
    ];

    buttons.forEach((buttonId) => {
      const button = document.getElementById(buttonId);
      if (button) {
        button.classList.remove('active');
      }
    });
  }

  setButtonActive(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.classList.add('active');
    }
  }
}

window.APIResponseFormatter = new APIResponseFormatter();
