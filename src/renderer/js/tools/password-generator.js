class PasswordGenerator {
    constructor() {
        this.characterSets = {
            uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            lowercase: 'abcdefghijklmnopqrstuvwxyz',
            numbers: '0123456789',
            symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
            ambiguous: '0O1lI'
        };
        this.init();
    }

    init() {
        const lengthSlider = document.getElementById('password-length');
        const lengthValue = document.getElementById('length-value');
        const generateBtn = document.getElementById('generate-password');
        const copyBtn = document.getElementById('copy-passwords');
        const checkboxes = document.querySelectorAll('#password-generator input[type="checkbox"]');

        if (lengthSlider) {
            lengthSlider.addEventListener('input', () => {
                lengthValue.textContent = lengthSlider.value;
                this.updateStrengthMeter();
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generatePasswords());
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyPasswords());
        }

        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateStrengthMeter());
        });

        // Initial strength meter update
        this.updateStrengthMeter();
    }

    generatePasswords() {
        const length = parseInt(document.getElementById('password-length').value);
        const count = parseInt(document.getElementById('password-count').value);
        const includeUppercase = document.getElementById('include-uppercase').checked;
        const includeLowercase = document.getElementById('include-lowercase').checked;
        const includeNumbers = document.getElementById('include-numbers').checked;
        const includeSymbols = document.getElementById('include-symbols').checked;
        const excludeAmbiguous = document.getElementById('exclude-ambiguous').checked;
        const output = document.getElementById('password-output');

        // Validate that at least one character set is selected
        if (!includeUppercase && !includeLowercase && !includeNumbers && !includeSymbols) {
            window.app?.showMessage('Please select at least one character type.', 'error');
            return;
        }

        try {
            const passwords = [];
            for (let i = 0; i < count; i++) {
                const password = this.generateSinglePassword({
                    length,
                    includeUppercase,
                    includeLowercase,
                    includeNumbers,
                    includeSymbols,
                    excludeAmbiguous
                });
                passwords.push(password);
            }

            output.value = passwords.join('\n');
            this.updateStrengthMeter();
            window.app?.showMessage(`Generated ${count} password${count > 1 ? 's' : ''} successfully!`, 'success');
        } catch (error) {
            window.app?.showMessage('Error generating passwords: ' + error.message, 'error');
        }
    }

    generateSinglePassword(options) {
        let charset = '';

        if (options.includeUppercase) {
            charset += this.characterSets.uppercase;
        }
        if (options.includeLowercase) {
            charset += this.characterSets.lowercase;
        }
        if (options.includeNumbers) {
            charset += this.characterSets.numbers;
        }
        if (options.includeSymbols) {
            charset += this.characterSets.symbols;
        }

        // Remove ambiguous characters if requested
        if (options.excludeAmbiguous) {
            for (const char of this.characterSets.ambiguous) {
                charset = charset.replace(new RegExp(char, 'g'), '');
            }
        }

        if (charset.length === 0) {
            throw new Error('No valid characters available for password generation');
        }

        let password = '';
        
        // Ensure password contains at least one character from each selected set
        const requiredChars = [];
        if (options.includeUppercase) {
            const upperChars = this.characterSets.uppercase;
            const filteredUpper = options.excludeAmbiguous ? 
                upperChars.split('').filter(c => !this.characterSets.ambiguous.includes(c)).join('') : 
                upperChars;
            if (filteredUpper.length > 0) {
                requiredChars.push(filteredUpper[Math.floor(Math.random() * filteredUpper.length)]);
            }
        }
        if (options.includeLowercase) {
            const lowerChars = this.characterSets.lowercase;
            const filteredLower = options.excludeAmbiguous ? 
                lowerChars.split('').filter(c => !this.characterSets.ambiguous.includes(c)).join('') : 
                lowerChars;
            if (filteredLower.length > 0) {
                requiredChars.push(filteredLower[Math.floor(Math.random() * filteredLower.length)]);
            }
        }
        if (options.includeNumbers) {
            const numberChars = this.characterSets.numbers;
            const filteredNumbers = options.excludeAmbiguous ? 
                numberChars.split('').filter(c => !this.characterSets.ambiguous.includes(c)).join('') : 
                numberChars;
            if (filteredNumbers.length > 0) {
                requiredChars.push(filteredNumbers[Math.floor(Math.random() * filteredNumbers.length)]);
            }
        }
        if (options.includeSymbols) {
            requiredChars.push(this.characterSets.symbols[Math.floor(Math.random() * this.characterSets.symbols.length)]);
        }

        // Fill the rest of the password with random characters
        const remainingLength = options.length - requiredChars.length;
        for (let i = 0; i < remainingLength; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }

        // Add required characters and shuffle
        password += requiredChars.join('');
        return this.shuffleString(password);
    }

    shuffleString(str) {
        const array = str.split('');
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array.join('');
    }

    calculatePasswordStrength(password, options) {
        let score = 0;
        const length = password.length;
        
        // Length scoring
        if (length >= 8) score += 1;
        if (length >= 12) score += 1;
        if (length >= 16) score += 1;
        if (length >= 20) score += 1;

        // Character variety scoring
        if (options.includeUppercase) score += 1;
        if (options.includeLowercase) score += 1;
        if (options.includeNumbers) score += 1;
        if (options.includeSymbols) score += 2;

        // Bonus for longer passwords
        if (length >= 24) score += 1;
        if (length >= 32) score += 1;

        return Math.min(score, 10); // Cap at 10
    }

    updateStrengthMeter() {
        const length = parseInt(document.getElementById('password-length').value);
        const includeUppercase = document.getElementById('include-uppercase').checked;
        const includeLowercase = document.getElementById('include-lowercase').checked;
        const includeNumbers = document.getElementById('include-numbers').checked;
        const includeSymbols = document.getElementById('include-symbols').checked;
        
        const mockPassword = 'a'.repeat(length); // Mock password for strength calculation
        const options = { includeUppercase, includeLowercase, includeNumbers, includeSymbols };
        const strength = this.calculatePasswordStrength(mockPassword, options);
        
        const strengthBar = document.getElementById('strength-bar');
        const strengthText = document.getElementById('strength-text');
        
        if (strengthBar && strengthText) {
            const percentage = (strength / 10) * 100;
            strengthBar.style.width = percentage + '%';
            
            let strengthLabel = '';
            let colorClass = '';
            
            if (strength <= 2) {
                strengthLabel = 'Very Weak';
                colorClass = 'very-weak';
            } else if (strength <= 4) {
                strengthLabel = 'Weak';
                colorClass = 'weak';
            } else if (strength <= 6) {
                strengthLabel = 'Fair';
                colorClass = 'fair';
            } else if (strength <= 8) {
                strengthLabel = 'Strong';
                colorClass = 'strong';
            } else {
                strengthLabel = 'Very Strong';
                colorClass = 'very-strong';
            }
            
            strengthText.textContent = strengthLabel;
            strengthBar.className = `strength-bar ${colorClass}`;
        }
    }

    copyPasswords() {
        const output = document.getElementById('password-output');
        if (output.value.trim()) {
            navigator.clipboard.writeText(output.value).then(() => {
                window.app?.showMessage('Passwords copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                output.select();
                document.execCommand('copy');
                window.app?.showMessage('Passwords copied to clipboard!', 'success');
            });
        } else {
            window.app?.showMessage('No passwords to copy. Generate some passwords first.', 'error');
        }
    }
}

window.PasswordGenerator = new PasswordGenerator();

const passwordGeneratorStyles = `
.password-controls {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 20px;
}

.control-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.control-group label {
    min-width: 100px;
    font-weight: 500;
    color: #1d1d1f;
}

#password-length {
    flex: 1;
    max-width: 200px;
}

#length-value {
    background: #007aff;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
    min-width: 30px;
    text-align: center;
}

.character-options {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    background: #f8f9fa;
}

.checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.checkbox-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #1d1d1f;
    min-width: auto;
}

.checkbox-group input[type="checkbox"] {
    margin: 0;
}

.button-group {
    display: flex;
    gap: 10px;
}

.password-strength {
    margin-bottom: 15px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
}

.strength-meter {
    width: 100%;
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 5px;
}

.strength-bar {
    height: 100%;
    transition: width 0.3s ease, background-color 0.3s ease;
    border-radius: 4px;
}

.strength-bar.very-weak {
    background: #ff3b30;
}

.strength-bar.weak {
    background: #ff9500;
}

.strength-bar.fair {
    background: #ffcc00;
}

.strength-bar.strong {
    background: #34c759;
}

.strength-bar.very-strong {
    background: #007aff;
}

#strength-text {
    font-size: 12px;
    font-weight: 600;
    color: #1d1d1f;
}

#password-output {
    min-height: 120px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    line-height: 1.6;
}

#password-count {
    width: 80px;
}

@media (max-width: 768px) {
    .button-group {
        flex-direction: column;
    }
    
    .control-group {
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
    }
    
    .control-group label {
        min-width: auto;
    }
}
`;

// Use centralized style management to prevent conflicts
if (window.StyleManager) {
    window.StyleManager.addToolStyles('password-generator', passwordGeneratorStyles);
} else {
    // Fallback for backward compatibility
    const passwordGeneratorStyleElement = document.createElement('style');
    passwordGeneratorStyleElement.id = 'password-generator-styles';
    passwordGeneratorStyleElement.textContent = passwordGeneratorStyles;
    document.head.appendChild(passwordGeneratorStyleElement);
}
