/**
 * Integration tests for UnitConverter tool
 */

// Mock the UnitConverterUtils for browser environment
global.UnitConverterUtils = require('../../src/utils/unit-converter-utils');

describe('UnitConverter Integration', () => {
  let unitConverter;
  let mockElements;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock window object
    global.window = global.window || {};
    global.window.UnitConverter = undefined;

    // Create mock DOM elements
    mockElements = {
      categorySelect: global.createMockElement('select', {
        id: 'unit-category',
      }),
      convertBtn: global.createMockElement('button', { id: 'convert-units' }),
      swapBtn: global.createMockElement('button', { id: 'swap-units' }),
      inputField: global.createMockElement('input', { id: 'unit-input' }),
      outputField: global.createMockElement('input', { id: 'unit-output' }),
      fromSelect: global.createMockElement('select', { id: 'unit-from' }),
      toSelect: global.createMockElement('select', { id: 'unit-to' }),
      errorDiv: global.createMockElement('div', { id: 'unit-converter-error' }),
      infoDiv: global.createMockElement('div', { id: 'conversion-info' }),
      disclaimerDiv: global.createMockElement('div', {
        id: 'currency-disclaimer',
      }),
    };

    // Add appendChild method to elements that need it
    mockElements.categorySelect.appendChild = jest.fn();
    mockElements.fromSelect.appendChild = jest.fn();
    mockElements.toSelect.appendChild = jest.fn();

    // Add style property to elements that need it
    Object.keys(mockElements).forEach((key) => {
      mockElements[key].style = { display: '' };
    });

    // Mock document.getElementById
    global.document.getElementById = jest.fn((id) => {
      switch (id) {
        case 'unit-category':
          return mockElements.categorySelect;
        case 'convert-units':
          return mockElements.convertBtn;
        case 'swap-units':
          return mockElements.swapBtn;
        case 'unit-input':
          return mockElements.inputField;
        case 'unit-output':
          return mockElements.outputField;
        case 'unit-from':
          return mockElements.fromSelect;
        case 'unit-to':
          return mockElements.toSelect;
        case 'unit-converter-error':
          return mockElements.errorDiv;
        case 'conversion-info':
          return mockElements.infoDiv;
        case 'currency-disclaimer':
          return mockElements.disclaimerDiv;
        default:
          return null;
      }
    });

    // Mock document.createElement
    global.document.createElement = jest.fn((tagName) => {
      const element = global.createMockElement(tagName);
      element.appendChild = jest.fn();
      return element;
    });

    // Create instance after mocks are set up
    const UnitConverter = require('../../src/renderer/js/tools/unit-converter');
    unitConverter = new UnitConverter();
  });

  describe('Initialization', () => {
    it('should set up event listeners correctly', () => {
      expect(mockElements.categorySelect.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
      expect(mockElements.convertBtn.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
      expect(mockElements.swapBtn.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
      expect(mockElements.inputField.addEventListener).toHaveBeenCalledWith(
        'input',
        expect.any(Function)
      );
      expect(mockElements.inputField.addEventListener).toHaveBeenCalledWith(
        'keypress',
        expect.any(Function)
      );
    });

    it('should initialize with length category by default', () => {
      expect(unitConverter.currentCategory).toBe('length');
    });

    it('should populate category select on initialization', () => {
      expect(global.document.createElement).toHaveBeenCalledWith('option');
    });
  });

  describe('Category Change', () => {
    beforeEach(() => {
      mockElements.categorySelect.value = 'weight';
    });

    it('should update current category when category changes', () => {
      unitConverter.onCategoryChange();
      expect(unitConverter.currentCategory).toBe('weight');
    });

    it('should populate unit selects when category changes', () => {
      unitConverter.onCategoryChange();
      expect(global.document.createElement).toHaveBeenCalledWith('option');
    });

    it('should show currency disclaimer for currency category', () => {
      mockElements.categorySelect.value = 'currency';
      unitConverter.onCategoryChange();
      expect(mockElements.disclaimerDiv.style.display).toBe('block');
    });

    it('should hide currency disclaimer for non-currency categories', () => {
      mockElements.categorySelect.value = 'length';
      unitConverter.onCategoryChange();
      expect(mockElements.disclaimerDiv.style.display).toBe('none');
    });
  });

  describe('Unit Conversion', () => {
    beforeEach(() => {
      mockElements.inputField.value = '100';
      mockElements.fromSelect.value = 'cm';
      mockElements.toSelect.value = 'm';
      unitConverter.currentCategory = 'length';
    });

    it('should convert units correctly', () => {
      unitConverter.convertUnits();
      expect(mockElements.outputField.value).toBe('1');
    });

    it('should clear errors on successful conversion', () => {
      unitConverter.convertUnits();
      expect(mockElements.errorDiv.style.display).toBe('none');
    });

    it('should update conversion info on successful conversion', () => {
      unitConverter.convertUnits();
      expect(mockElements.infoDiv.style.display).toBe('block');
      expect(mockElements.infoDiv.innerHTML).toContain('100');
      expect(mockElements.infoDiv.innerHTML).toContain('1');
    });

    it('should clear results when input is empty', () => {
      mockElements.inputField.value = '';
      unitConverter.convertUnits();
      expect(mockElements.outputField.value).toBe('');
    });

    it('should show error for invalid input', () => {
      mockElements.inputField.value = 'invalid';
      unitConverter.convertUnits();
      expect(mockElements.errorDiv.style.display).toBe('block');
      expect(mockElements.errorDiv.textContent).toContain('valid number');
    });

    it('should show error for negative length', () => {
      mockElements.inputField.value = '-10';
      unitConverter.convertUnits();
      expect(mockElements.errorDiv.style.display).toBe('block');
      expect(mockElements.errorDiv.textContent).toContain('cannot be negative');
    });
  });

  describe('Unit Swapping', () => {
    beforeEach(() => {
      mockElements.fromSelect.value = 'cm';
      mockElements.toSelect.value = 'm';
      mockElements.inputField.value = '100';
      mockElements.outputField.value = '1';
    });

    it('should swap unit selections', () => {
      unitConverter.swapUnits();
      expect(mockElements.fromSelect.value).toBe('m');
      expect(mockElements.toSelect.value).toBe('cm');
    });

    it('should swap input and output values when both exist', () => {
      unitConverter.swapUnits();
      expect(mockElements.inputField.value).toBe('1');
      expect(mockElements.outputField.value).toBe('100');
    });

    it('should trigger conversion after swap', () => {
      const convertSpy = jest.spyOn(unitConverter, 'convertUnits');
      unitConverter.swapUnits();
      expect(convertSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should show errors correctly', () => {
      unitConverter.showError('Test error message');
      expect(mockElements.errorDiv.textContent).toBe('Test error message');
      expect(mockElements.errorDiv.style.display).toBe('block');
    });

    it('should clear errors correctly', () => {
      mockElements.errorDiv.style.display = 'block';
      unitConverter.clearErrors();
      expect(mockElements.errorDiv.style.display).toBe('none');
    });

    it('should handle missing error element gracefully', () => {
      global.document.getElementById = jest.fn(() => null);
      expect(() => {
        unitConverter.showError('Test error');
      }).not.toThrow();
    });
  });

  describe('Results Management', () => {
    beforeEach(() => {
      mockElements.outputField.value = '100';
      mockElements.infoDiv.style.display = 'block';
    });

    it('should clear results correctly', () => {
      unitConverter.clearResults();
      expect(mockElements.outputField.value).toBe('');
      expect(mockElements.infoDiv.style.display).toBe('none');
    });

    it('should handle missing elements gracefully', () => {
      global.document.getElementById = jest.fn(() => null);
      expect(() => {
        unitConverter.clearResults();
      }).not.toThrow();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should convert on Enter key press', () => {
      const convertSpy = jest.spyOn(unitConverter, 'convertUnits');

      // Simulate Enter key press
      const keyEvent = { key: 'Enter' };
      const keypressListener =
        mockElements.inputField.addEventListener.mock.calls.find(
          (call) => call[0] === 'keypress'
        )[1];

      keypressListener(keyEvent);
      expect(convertSpy).toHaveBeenCalled();
    });

    it('should not convert on other key presses', () => {
      const convertSpy = jest.spyOn(unitConverter, 'convertUnits');

      // Simulate other key press
      const keyEvent = { key: 'a' };
      const keypressListener =
        mockElements.inputField.addEventListener.mock.calls.find(
          (call) => call[0] === 'keypress'
        )[1];

      keypressListener(keyEvent);
      expect(convertSpy).not.toHaveBeenCalled();
    });
  });

  describe('Input Change Handling', () => {
    it('should clear errors and convert on input change', () => {
      const clearErrorsSpy = jest.spyOn(unitConverter, 'clearErrors');
      const convertSpy = jest.spyOn(unitConverter, 'convertUnits');

      // Simulate input event
      const inputListener =
        mockElements.inputField.addEventListener.mock.calls.find(
          (call) => call[0] === 'input'
        )[1];

      inputListener();

      expect(clearErrorsSpy).toHaveBeenCalled();
      expect(convertSpy).toHaveBeenCalled();
    });
  });

  describe('Currency Conversions', () => {
    beforeEach(() => {
      unitConverter.currentCategory = 'currency';
      mockElements.inputField.value = '100';
      mockElements.fromSelect.value = 'USD';
      mockElements.toSelect.value = 'EUR';
    });

    it('should handle currency conversions with proper rounding', () => {
      unitConverter.convertUnits();
      expect(mockElements.outputField.value).toBe('85');
    });

    it('should show currency disclaimer', () => {
      mockElements.categorySelect.value = 'currency';
      unitConverter.onCategoryChange();
      expect(mockElements.disclaimerDiv.style.display).toBe('block');
    });
  });

  describe('Temperature Conversions', () => {
    beforeEach(() => {
      unitConverter.currentCategory = 'temperature';
      mockElements.inputField.value = '0';
      mockElements.fromSelect.value = 'C';
      mockElements.toSelect.value = 'F';
    });

    it('should handle temperature conversions correctly', () => {
      unitConverter.convertUnits();
      expect(mockElements.outputField.value).toBe('32');
    });

    it('should allow negative temperatures', () => {
      mockElements.inputField.value = '-10';
      unitConverter.convertUnits();
      expect(mockElements.outputField.value).toBe('14');
    });
  });
});
