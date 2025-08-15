class NumberBaseConverter {
  constructor() {
    this.init();
  }

  init() {
    const inputs = document.querySelectorAll(
      '#decimal-input, #binary-input, #octal-input, #hex-input'
    );
    const clearBtn = document.getElementById('clear-bases');

    inputs.forEach((input) => {
      input.addEventListener('input', (e) => this.convertFromInput(e.target));
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
    }
  }

  convertFromInput(sourceInput) {
    const value = sourceInput.value.trim();
    if (!value) {
      this.clearOtherInputs(sourceInput.id);
      return;
    }

    try {
      let decimalValue;

      switch (sourceInput.id) {
        case 'decimal-input':
          decimalValue = this.parseDecimal(value);
          break;
        case 'binary-input':
          decimalValue = this.parseBinary(value);
          break;
        case 'octal-input':
          decimalValue = this.parseOctal(value);
          break;
        case 'hex-input':
          decimalValue = this.parseHex(value);
          break;
        default:
          return;
      }

      if (decimalValue === null) {
        this.showError(sourceInput.id, 'Invalid format');
        return;
      }

      this.updateAllFields(decimalValue, sourceInput.id);
      this.clearError(sourceInput.id);
    } catch (error) {
      this.showError(sourceInput.id, error.message);
    }
  }

  parseDecimal(value) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return null;
    return num;
  }

  parseBinary(value) {
    if (!/^[01]+$/.test(value)) return null;
    return parseInt(value, 2);
  }

  parseOctal(value) {
    if (!/^[0-7]+$/.test(value)) return null;
    return parseInt(value, 8);
  }

  parseHex(value) {
    const cleaned = value.replace(/^0x/i, '');
    if (!/^[0-9a-f]+$/i.test(cleaned)) return null;
    return parseInt(cleaned, 16);
  }

  updateAllFields(decimalValue, sourceInputId) {
    if (sourceInputId !== 'decimal-input') {
      document.getElementById('decimal-input').value = decimalValue.toString();
    }

    if (sourceInputId !== 'binary-input') {
      document.getElementById('binary-input').value = decimalValue.toString(2);
    }

    if (sourceInputId !== 'octal-input') {
      document.getElementById('octal-input').value = decimalValue.toString(8);
    }

    if (sourceInputId !== 'hex-input') {
      document.getElementById('hex-input').value = decimalValue
        .toString(16)
        .toUpperCase();
    }
  }

  clearOtherInputs(sourceInputId) {
    const inputs = [
      'decimal-input',
      'binary-input',
      'octal-input',
      'hex-input',
    ];
    inputs.forEach((inputId) => {
      if (inputId !== sourceInputId) {
        document.getElementById(inputId).value = '';
      }
    });
  }

  showError(inputId, message) {
    const input = document.getElementById(inputId);
    input.style.borderColor = '#dc3545';
    input.title = message;

    let errorSpan = input.parentNode.querySelector('.error-message');
    if (!errorSpan) {
      errorSpan = document.createElement('span');
      errorSpan.className = 'error-message';
      errorSpan.style.cssText =
        'color: #dc3545; font-size: 12px; display: block; margin-top: 5px;';
      input.parentNode.appendChild(errorSpan);
    }
    errorSpan.textContent = message;
  }

  clearError(inputId) {
    const input = document.getElementById(inputId);
    input.style.borderColor = '#f0f0f0';
    input.title = '';

    const errorSpan = input.parentNode.querySelector('.error-message');
    if (errorSpan) {
      errorSpan.remove();
    }
  }

  clearAll() {
    const inputs = [
      'decimal-input',
      'binary-input',
      'octal-input',
      'hex-input',
    ];
    inputs.forEach((inputId) => {
      document.getElementById(inputId).value = '';
      this.clearError(inputId);
    });
    window.app?.showMessage('All fields cleared!', 'info');
  }

  copyValue(inputId) {
    const input = document.getElementById(inputId);
    if (input.value.trim()) {
      navigator.clipboard.writeText(input.value).then(() => {
        window.app?.showMessage('Value copied to clipboard!', 'success');
      });
    }
  }
}

window.NumberBaseConverter = new NumberBaseConverter();

const baseStyles = `
.base-inputs {
    display: grid;
    gap: 20px;
    margin-bottom: 20px;
}

.base-input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.base-input-group label {
    font-weight: 500;
    color: #1d1d1f;
    font-size: 14px;
}

.base-input-group input {
    padding: 12px 15px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    transition: border-color 0.3s ease;
}

.base-input-group input:focus {
    outline: none;
    border-color: #667eea;
}

.base-input-group input:invalid {
    border-color: #dc3545;
}

@media (min-width: 768px) {
    .base-inputs {
        grid-template-columns: 1fr 1fr;
    }
}

.error-message {
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}
`;

const numberBaseStyle = document.createElement('style');
numberBaseStyle.textContent = numberBaseStyles;
document.head.appendChild(numberBaseStyle);
