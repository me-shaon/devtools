/**
 * Unit Converter Tool
 * Converts between different units of measurement including:
 * - Length (mm, cm, m, km, in, ft, yd, mi)
 * - Weight (mg, g, kg, oz, lb, st, t)
 * - Temperature (C, F, K)
 * - Currency (USD, EUR, GBP, JPY, CAD, AUD)
 */

class UnitConverter {
  constructor() {
    this.currentCategory = 'length';
    this.init();
  }

  init() {
    // Set up event listeners
    const categorySelect = document.getElementById('unit-category');
    const convertBtn = document.getElementById('convert-units');
    const swapBtn = document.getElementById('swap-units');
    const inputField = document.getElementById('unit-input');

    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.onCategoryChange());
    }

    if (convertBtn) {
      convertBtn.addEventListener('click', () => this.convertUnits());
    }

    if (swapBtn) {
      swapBtn.addEventListener('click', () => this.swapUnits());
    }

    if (inputField) {
      inputField.addEventListener('input', () => {
        this.clearErrors();
        this.convertUnits();
      });
      inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.convertUnits();
        }
      });
    }

    // Initialize the form
    this.initializeCategories();
    this.onCategoryChange();
  }

  initializeCategories() {
    const categorySelect = document.getElementById('unit-category');
    if (!categorySelect) return;

    // Clear existing options
    categorySelect.innerHTML = '';

    // Add categories
    const categories = this.getCategories();
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = this.getCategoryName(category);
      categorySelect.appendChild(option);
    });

    categorySelect.value = this.currentCategory;
  }

  onCategoryChange() {
    const categorySelect = document.getElementById('unit-category');
    if (!categorySelect) return;

    this.currentCategory = categorySelect.value;
    this.populateUnitSelects();
    this.clearResults();
    this.clearErrors();

    // Show currency disclaimer for currency conversions
    this.showCurrencyDisclaimer();
  }

  populateUnitSelects() {
    const fromSelect = document.getElementById('unit-from');
    const toSelect = document.getElementById('unit-to');

    if (!fromSelect || !toSelect) return;

    const units = this.getUnitsForCategory(this.currentCategory);
    const unitKeys = Object.keys(units);

    // Clear existing options
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    // Populate both selects
    unitKeys.forEach((unitKey) => {
      const fromOption = document.createElement('option');
      fromOption.value = unitKey;
      fromOption.textContent = units[unitKey];
      fromSelect.appendChild(fromOption);

      const toOption = document.createElement('option');
      toOption.value = unitKey;
      toOption.textContent = units[unitKey];
      toSelect.appendChild(toOption);
    });

    // Set default selections
    if (unitKeys.length >= 2) {
      fromSelect.value = unitKeys[0];
      toSelect.value = unitKeys[1];
    }
  }

  convertUnits() {
    const inputValue = document.getElementById('unit-input').value;
    const fromUnit = document.getElementById('unit-from').value;
    const toUnit = document.getElementById('unit-to').value;
    const outputField = document.getElementById('unit-output');

    if (!inputValue.trim()) {
      this.clearResults();
      return;
    }

    try {
      const result = this.convert(
        inputValue,
        this.currentCategory,
        fromUnit,
        toUnit
      );

      if (outputField) {
        outputField.value = result.toString();
      }

      this.clearErrors();
      this.updateConversionInfo(inputValue, fromUnit, toUnit, result);
    } catch (error) {
      this.showError(error.message);
      this.clearResults();
    }
  }

  swapUnits() {
    const fromSelect = document.getElementById('unit-from');
    const toSelect = document.getElementById('unit-to');
    const inputField = document.getElementById('unit-input');
    const outputField = document.getElementById('unit-output');

    if (!fromSelect || !toSelect) return;

    // Swap the unit selections
    const tempValue = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = tempValue;

    // Swap the input/output values if they exist
    if (inputField && outputField && inputField.value && outputField.value) {
      const tempInput = inputField.value;
      inputField.value = outputField.value;
      outputField.value = tempInput;
    }

    // Convert with new values
    this.convertUnits();
  }

  updateConversionInfo(inputValue, fromUnit, toUnit, result) {
    const infoDiv = document.getElementById('conversion-info');
    if (!infoDiv) return;

    const fromUnitName = this.getUnitsForCategory(this.currentCategory)[
      fromUnit
    ];
    const toUnitName = this.getUnitsForCategory(this.currentCategory)[toUnit];

    infoDiv.innerHTML = `
      <div class="conversion-summary">
        <strong>${inputValue} ${fromUnitName}</strong> =
        <strong>${result} ${toUnitName}</strong>
      </div>
    `;
    infoDiv.style.display = 'block';
  }

  showCurrencyDisclaimer() {
    const disclaimerDiv = document.getElementById('currency-disclaimer');
    if (!disclaimerDiv) return;

    if (this.currentCategory === 'currency') {
      disclaimerDiv.style.display = 'block';
    } else {
      disclaimerDiv.style.display = 'none';
    }
  }

  clearResults() {
    const outputField = document.getElementById('unit-output');
    const infoDiv = document.getElementById('conversion-info');

    if (outputField) {
      outputField.value = '';
    }

    if (infoDiv) {
      infoDiv.style.display = 'none';
    }
  }

  showError(message) {
    const errorDiv = document.getElementById('unit-converter-error');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  clearErrors() {
    const errorDiv = document.getElementById('unit-converter-error');
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  // Utility methods that delegate to UnitConverterUtils
  convert(value, category, fromUnit, toUnit) {
    // Check if we're in browser environment and need to use embedded utils
    if (typeof UnitConverterUtils !== 'undefined') {
      return UnitConverterUtils.convert(value, category, fromUnit, toUnit);
    }

    // Fallback error if utils not available
    throw new Error('Unit conversion utilities not available');
  }

  getUnitsForCategory(category) {
    if (typeof UnitConverterUtils !== 'undefined') {
      return UnitConverterUtils.getUnitsForCategory(category);
    }
    return {};
  }

  getCategories() {
    if (typeof UnitConverterUtils !== 'undefined') {
      return UnitConverterUtils.getCategories();
    }
    return [];
  }

  getCategoryName(category) {
    if (typeof UnitConverterUtils !== 'undefined') {
      return UnitConverterUtils.getCategoryName(category);
    }
    return category;
  }
}

// Global instance registration
window.UnitConverter = new UnitConverter();

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnitConverter;
}
