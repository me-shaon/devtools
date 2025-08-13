/**
 * Password utilities for generating secure passwords and passphrases
 * Browser-compatible version without require()
 */
class PasswordUtils {
  static LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
  static UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  static NUMBERS = '0123456789';
  static SYMBOLS = '!@#$%^&*()_+-=[]{};\':"|,.<>?';
  static AMBIGUOUS = '0OIl1';

  // Word list for passphrases (subset for testing)
  static WORDS = [
    'apple',
    'brave',
    'chair',
    'dream',
    'eagle',
    'flame',
    'grape',
    'house',
    'image',
    'judge',
    'knife',
    'lemon',
    'magic',
    'novel',
    'ocean',
    'piano',
    'queen',
    'river',
    'stone',
    'table',
    'unity',
    'value',
    'water',
    'youth',
    'zebra',
    'beach',
    'cloud',
    'dance',
    'earth',
    'field',
    'green',
    'happy',
    'light',
    'mouse',
    'night',
    'party',
    'quick',
    'smile',
    'trust',
    'voice',
  ];

  static generatePassword(options = {}) {
    const {
      length = 12,
      includeLowercase = true,
      includeUppercase = true,
      includeNumbers = true,
      includeSymbols = false,
      excludeAmbiguous = false,
    } = options;

    let charset = '';

    // Build character set based on options
    if (includeLowercase) charset += this.LOWERCASE;
    if (includeUppercase) charset += this.UPPERCASE;
    if (includeNumbers) charset += this.NUMBERS;
    if (includeSymbols) charset += this.SYMBOLS;

    if (!charset) {
      throw new Error('At least one character set must be selected');
    }

    // Remove ambiguous characters if requested
    if (excludeAmbiguous) {
      for (const char of this.AMBIGUOUS) {
        charset = charset.replace(new RegExp(char, 'g'), '');
      }
    }

    // Generate password
    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }

    return password;
  }

  static generateMultiplePasswords(count, options = {}) {
    const passwords = [];
    for (let i = 0; i < count; i++) {
      passwords.push(this.generatePassword(options));
    }
    return passwords;
  }

  static calculatePasswordStrength(password) {
    if (!password) {
      return {
        score: 0,
        strength: 'Very Weak',
        feedback: ['Password is required'],
        entropy: 0,
      };
    }

    let score = 0;
    let feedback = [];

    // Length check
    if (password.length >= 12) score += 2;
    else if (password.length >= 8) score += 1;
    else feedback.push('Use at least 8 characters');

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Add numbers');

    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else feedback.push('Add symbols');

    // Common pattern penalties
    if (/(.)\1{2,}/.test(password)) {
      score -= 1;
      feedback.push('Avoid repeated characters');
    }

    if (
      /123|234|345|456|567|678|789|abc|bcd|cde|def/.test(password.toLowerCase())
    ) {
      score -= 1;
      feedback.push('Avoid sequential characters');
    }

    // Calculate entropy
    let charset = 0;
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/[0-9]/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;

    const entropy = Math.log2(Math.pow(charset, password.length));

    // Determine strength label
    let strength;
    if (score < 1) strength = 'Very Weak';
    else if (score < 2) strength = 'Weak';
    else if (score < 4) strength = 'Fair';
    else if (score < 6) strength = 'Good';
    else strength = 'Strong';

    return {
      score: Math.max(0, score),
      strength,
      feedback,
      entropy: Math.round(entropy),
    };
  }

  static generatePassphrase(options = {}) {
    const {
      wordCount = 4,
      separator = '-',
      capitalize = false,
      includeNumbers = false,
    } = options;

    const selectedWords = [];

    // Select random words
    for (let i = 0; i < wordCount; i++) {
      const randomIndex = Math.floor(Math.random() * this.WORDS.length);
      let word = this.WORDS[randomIndex];

      if (capitalize) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }

      selectedWords.push(word);
    }

    let passphrase = selectedWords.join(separator);

    // Add numbers if requested
    if (includeNumbers) {
      const randomNum = Math.floor(Math.random() * 1000);
      passphrase += randomNum;
    }

    return passphrase;
  }
}

class PasswordGenerator {
  constructor() {
    this.init();
  }

  init() {
    // Initialize UI event listeners
    const generateBtn = document.getElementById('generate-password');
    const lengthSlider = document.getElementById('password-length');
    const lengthDisplay = document.getElementById('length-display');
    const copyBtn = document.getElementById('copy-password');
    const copyPassphraseBtn = document.getElementById('copy-passphrase');
    const regenerateBtn = document.getElementById('regenerate-password');
    const generateMultipleBtn = document.getElementById('generate-multiple');
    const passphraseBtn = document.getElementById('generate-passphrase');
    const passwordInput = document.getElementById('password-strength-input');

    // Tab functionality
    const tabButtons = document.querySelectorAll(
      '#password-generator .tab-btn'
    );
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.switchTab(button.dataset.tab);
      });
    });

    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generatePassword());
    }

    if (lengthSlider) {
      lengthSlider.addEventListener('input', (e) => {
        lengthDisplay.textContent = e.target.value;
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    if (copyPassphraseBtn) {
      copyPassphraseBtn.addEventListener('click', () =>
        this.copyPassphraseToClipboard()
      );
    }

    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => this.generatePassword());
    }

    if (generateMultipleBtn) {
      generateMultipleBtn.addEventListener('click', () =>
        this.generateMultiplePasswords()
      );
    }

    if (passphraseBtn) {
      passphraseBtn.addEventListener('click', () => this.generatePassphrase());
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', (e) =>
        this.checkPasswordStrength(e.target.value, '2')
      );
    }
  }

  switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('#password-generator .tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });
    document
      .querySelectorAll('#password-generator .tab-content')
      .forEach((content) => {
        content.classList.remove('active');
      });

    // Add active class to selected tab and content
    document
      .querySelector(`#password-generator [data-tab="${tabName}"]`)
      .classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }

  generatePassword() {
    try {
      const options = this.getPasswordOptions();
      const password = PasswordUtils.generatePassword(options);

      this.displayPassword(password);
      this.checkPasswordStrength(password);

      window.app?.showMessage('Password generated successfully!', 'success');
    } catch (error) {
      window.app?.showMessage(error.message, 'error');
    }
  }

  generateMultiplePasswords() {
    try {
      const options = this.getPasswordOptions();
      const count =
        parseInt(document.getElementById('password-count').value) || 5;
      const passwords = PasswordUtils.generateMultiplePasswords(count, options);

      const output = document.getElementById('multiple-passwords-output');
      if (output) {
        output.value = passwords.join('\n');
        output.style.height = Math.min(passwords.length * 25, 200) + 'px';
      }

      window.app?.showMessage(`Generated ${count} passwords!`, 'success');
    } catch (error) {
      window.app?.showMessage(error.message, 'error');
    }
  }

  generatePassphrase() {
    try {
      const options = this.getPassphraseOptions();
      const passphrase = PasswordUtils.generatePassphrase(options);

      this.displayPassphrase(passphrase);
      this.checkPasswordStrength(passphrase);

      window.app?.showMessage('Passphrase generated successfully!', 'success');
    } catch (error) {
      window.app?.showMessage(error.message, 'error');
    }
  }

  getPasswordOptions() {
    return {
      length: parseInt(document.getElementById('password-length').value) || 12,
      includeLowercase: document.getElementById('include-lowercase').checked,
      includeUppercase: document.getElementById('include-uppercase').checked,
      includeNumbers: document.getElementById('include-numbers').checked,
      includeSymbols: document.getElementById('include-symbols').checked,
      excludeAmbiguous: document.getElementById('exclude-ambiguous').checked,
    };
  }

  getPassphraseOptions() {
    return {
      wordCount:
        parseInt(document.getElementById('passphrase-words').value) || 4,
      separator: document.getElementById('passphrase-separator').value || '-',
      capitalize: document.getElementById('passphrase-capitalize').checked,
      includeNumbers: document.getElementById('passphrase-numbers').checked,
    };
  }

  displayPassword(password) {
    const output = document.getElementById('password-output');
    if (output) {
      output.value = password;
      output.style.color = this.getPasswordStrengthColor(password);
    }
  }

  displayPassphrase(passphrase) {
    const output = document.getElementById('passphrase-output');
    if (output) {
      output.value = passphrase;
      output.style.color = this.getPasswordStrengthColor(passphrase);
    }
  }

  checkPasswordStrength(password, suffix = '') {
    if (!password) return;

    const result = PasswordUtils.calculatePasswordStrength(password);

    // Update strength indicator
    const strengthIndicator = document.getElementById(
      'strength-indicator' + (suffix ? '-' + suffix : '')
    );
    const strengthText = document.getElementById(
      'strength-text' + (suffix ? '-' + suffix : '')
    );
    const entropyText = document.getElementById(
      'entropy-text' + (suffix ? '-' + suffix : '')
    );
    const feedbackList = document.getElementById(
      'strength-feedback' + (suffix ? '-' + suffix : '')
    );

    if (strengthIndicator) {
      strengthIndicator.className = `strength-indicator ${result.strength
        .toLowerCase()
        .replace(' ', '-')}`;
      strengthIndicator.style.width = `${(result.score / 6) * 100}%`;
    }

    if (strengthText) {
      strengthText.textContent = result.strength;
      strengthText.className = `strength-text ${result.strength
        .toLowerCase()
        .replace(' ', '-')}`;
    }

    if (entropyText) {
      entropyText.textContent = `${result.entropy} bits`;
    }

    if (feedbackList) {
      feedbackList.innerHTML = '';
      result.feedback.forEach((feedback) => {
        const li = document.createElement('li');
        li.textContent = feedback;
        feedbackList.appendChild(li);
      });
    }
  }

  getPasswordStrengthColor(password) {
    const result = PasswordUtils.calculatePasswordStrength(password);
    const colorMap = {
      'Very Weak': '#ff4757',
      Weak: '#ff6b81',
      Fair: '#ffa502',
      Good: '#2ed573',
      Strong: '#1e90ff',
    };
    return colorMap[result.strength] || '#666';
  }

  copyToClipboard() {
    const output = document.getElementById('password-output');
    if (output && output.value) {
      navigator.clipboard
        .writeText(output.value)
        .then(() => {
          window.app?.showMessage('Password copied to clipboard!', 'success');
        })
        .catch(() => {
          window.app?.showMessage('Failed to copy password', 'error');
        });
    }
  }

  copyPassphraseToClipboard() {
    const output = document.getElementById('passphrase-output');
    if (output && output.value) {
      navigator.clipboard
        .writeText(output.value)
        .then(() => {
          window.app?.showMessage('Passphrase copied to clipboard!', 'success');
        })
        .catch(() => {
          window.app?.showMessage('Failed to copy passphrase', 'error');
        });
    }
  }

  selectAllPasswords() {
    const output = document.getElementById('multiple-passwords-output');
    if (output && output.value) {
      output.select();
      output.setSelectionRange(0, 99999);
    }
  }
}

window.PasswordGenerator = new PasswordGenerator();
