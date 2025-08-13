class LoremGenerator {
  constructor() {
    // Use the same word list as our tested utils
    this.LOREM_WORDS = [
      'lorem',
      'ipsum',
      'dolor',
      'sit',
      'amet',
      'consectetur',
      'adipiscing',
      'elit',
      'sed',
      'do',
      'eiusmod',
      'tempor',
      'incididunt',
      'ut',
      'labore',
      'et',
      'dolore',
      'magna',
      'aliqua',
      'enim',
      'ad',
      'minim',
      'veniam',
      'quis',
      'nostrud',
      'exercitation',
      'ullamco',
      'laboris',
      'nisi',
      'aliquip',
      'ex',
      'ea',
      'commodo',
      'consequat',
      'duis',
      'aute',
      'irure',
      'in',
      'reprehenderit',
      'voluptate',
      'velit',
      'esse',
      'cillum',
      'fugiat',
      'nulla',
      'pariatur',
      'excepteur',
      'sint',
      'occaecat',
      'cupidatat',
      'non',
      'proident',
      'sunt',
      'culpa',
      'qui',
      'officia',
      'deserunt',
      'mollit',
      'anim',
      'id',
      'est',
      'laborum',
      'at',
      'vero',
      'eos',
      'accusamus',
      'accusantium',
      'doloremque',
      'laudantium',
      'totam',
      'rem',
      'aperiam',
      'eaque',
      'ipsa',
      'quae',
      'ab',
      'illo',
      'inventore',
      'veritatis',
      'et',
      'quasi',
      'architecto',
      'beatae',
      'vitae',
      'dicta',
      'sunt',
      'explicabo',
      'nemo',
      'ipsam',
      'voluptatem',
      'quia',
      'voluptas',
      'aspernatur',
      'aut',
      'odit',
      'fugit',
      'sed',
      'quia',
      'consequuntur',
      'magni',
      'dolores',
      'ratione',
      'sequi',
      'nesciunt',
      'neque',
      'porro',
      'quisquam',
      'dolorem',
      'adipisci',
      'numquam',
      'eius',
      'modi',
      'tempora',
      'incidunt',
      'magnam',
      'quaerat',
      'voluptatem',
      'laudantium',
      'doloremque',
      'laudantium',
    ];
    this.init();
  }

  init() {
    const generateBtn = document.getElementById('generate-lorem');
    const typeSelect = document.getElementById('lorem-type');
    const countInput = document.getElementById('lorem-count');

    console.log('LoremGenerator init:', {
      generateBtn: !!generateBtn,
      typeSelect: !!typeSelect,
      countInput: !!countInput,
    });

    // Alert for debugging in case console isn't visible
    if (!generateBtn || !typeSelect || !countInput) {
      window.app?.showMessage(
        'Lorem Generator: Some elements not found!',
        'error'
      );
    }

    if (generateBtn) {
      generateBtn.addEventListener('click', (e) => {
        console.log('Generate lorem button clicked');
        window.app?.showMessage('Button clicked!', 'info');
        this.generateLorem();
      });
    } else {
      console.error('Generate button not found!');
      window.app?.showMessage('Generate button not found!', 'error');
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', () => this.clearOutput());
    }

    if (countInput) {
      countInput.addEventListener('input', () => this.clearOutput());
    }
  }

  generateLorem() {
    const typeElement = document.getElementById('lorem-type');
    const countElement = document.getElementById('lorem-count');
    const output = document.getElementById('lorem-output');

    if (!typeElement || !countElement || !output) {
      console.error('Lorem generator: Required elements not found', {
        typeElement: !!typeElement,
        countElement: !!countElement,
        output: !!output,
      });
      return;
    }

    const type = typeElement.value;
    const count = parseInt(countElement.value);

    if (isNaN(count) || count < 1 || count > 50) {
      window.app?.showMessage(
        'Please enter a count between 1 and 50.',
        'error'
      );
      return;
    }

    try {
      let result = '';

      switch (type) {
        case 'paragraphs':
          result = this.generateParagraphs(count);
          break;
        case 'sentences':
          result = this.generateSentences(count);
          break;
        case 'words':
          result = this.generateWords(count);
          break;
        default:
          result = this.generateParagraphs(count);
      }

      output.value = result;
      window.app?.showMessage(`Generated ${count} ${type}!`, 'success');
      this.selectOutput();
    } catch (error) {
      console.error('Error generating lorem text:', error);
      window.app?.showMessage(
        'Error generating lorem text: ' + error.message,
        'error'
      );
    }
  }

  generateParagraphs(count) {
    if (count < 1) {
      throw new Error('Paragraph count must be at least 1');
    }

    const paragraphs = [];
    for (let i = 0; i < count; i++) {
      const sentences = this.generateSentences(this.randomBetween(3, 7));
      paragraphs.push(sentences);
    }
    return paragraphs.join('\n\n');
  }

  generateSentences(count) {
    if (count < 1) {
      throw new Error('Sentence count must be at least 1');
    }

    const sentences = [];
    for (let i = 0; i < count; i++) {
      const wordCount = this.randomBetween(8, 20);
      const words = this.generateWords(wordCount).split(' ');

      words[0] = this.capitalizeFirst(words[0]);

      let sentence = words.join(' ');

      if (Math.random() < 0.1) {
        sentence += '!';
      } else if (Math.random() < 0.1) {
        sentence += '?';
      } else {
        sentence += '.';
      }

      sentences.push(sentence);
    }
    return sentences.join(' ');
  }

  generateWords(count) {
    if (count < 1) {
      throw new Error('Word count must be at least 1');
    }

    const words = [];
    for (let i = 0; i < count; i++) {
      const word =
        this.LOREM_WORDS[Math.floor(Math.random() * this.LOREM_WORDS.length)];
      words.push(word);
    }
    return words.join(' ');
  }

  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  selectOutput() {
    const output = document.getElementById('lorem-output');
    setTimeout(() => {
      output.select();
      output.setSelectionRange(0, 99999);
    }, 100);
  }

  clearOutput() {
    document.getElementById('lorem-output').value = '';
  }

  copyToClipboard() {
    const output = document.getElementById('lorem-output');
    if (output.value.trim()) {
      navigator.clipboard.writeText(output.value).then(() => {
        window.app?.showMessage('Lorem text copied to clipboard!', 'success');
      });
    }
  }

  // Test method that can be called directly
  testGeneration() {
    window.app?.showMessage('Testing lorem generation...', 'info');
    try {
      const words = this.generateWords(5);
      window.app?.showMessage(`Generated words: ${words}`, 'success');
      return words;
    } catch (error) {
      window.app?.showMessage(`Error: ${error.message}`, 'error');
      return null;
    }
  }

  // Direct method to test DOM elements
  testDOMElements() {
    const generateBtn = document.getElementById('generate-lorem');
    const typeSelect = document.getElementById('lorem-type');
    const countInput = document.getElementById('lorem-count');
    const output = document.getElementById('lorem-output');

    const results = {
      generateBtn: !!generateBtn,
      typeSelect: !!typeSelect,
      countInput: !!countInput,
      output: !!output,
      generateBtnVisible: generateBtn
        ? window.getComputedStyle(generateBtn).display !== 'none'
        : false,
      containerActive: !!document.querySelector('#lorem-generator.active'),
    };

    console.log('DOM Elements Test:', results);
    window.app?.showMessage(`DOM test: ${JSON.stringify(results)}`, 'info');
    return results;
  }
}

window.LoremGenerator = new LoremGenerator();

// Also ensure initialization happens when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.LoremGenerator) {
    console.log('DOM loaded, reinitializing LoremGenerator');
    window.LoremGenerator.init();
  }
});

// Add event delegation as backup
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'generate-lorem') {
    console.log('Generate lorem clicked via delegation');
    window.app?.showMessage('Clicked via delegation!', 'info');
    if (window.LoremGenerator) {
      window.LoremGenerator.generateLorem();
    }
  }
});

// Global test functions for debugging
window.testLoremGeneration = function () {
  if (window.LoremGenerator) {
    return window.LoremGenerator.testGeneration();
  }
  return 'LoremGenerator not found';
};

window.testLoremDOM = function () {
  if (window.LoremGenerator) {
    return window.LoremGenerator.testDOMElements();
  }
  return 'LoremGenerator not found';
};

window.forceLoremGeneration = function () {
  if (window.LoremGenerator) {
    window.app?.showMessage('Force generating lorem...', 'info');
    window.LoremGenerator.generateLorem();
    return 'Forced generation attempted';
  }
  return 'LoremGenerator not found';
};

const loremStyles = `
.lorem-controls {
    display: flex;
    align-items: end;
    gap: 20px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.lorem-controls .control-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.lorem-controls label {
    font-weight: 500;
    color: #1d1d1f;
}

.lorem-controls select,
.lorem-controls input {
    padding: 8px 12px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.3s ease;
}

.lorem-controls select:focus,
.lorem-controls input:focus {
    outline: none;
    border-color: #667eea;
}

#lorem-output {
    min-height: 300px;
    line-height: 1.6;
}
`;

const loremStyleElement = document.createElement('style');
loremStyleElement.textContent = loremStyles;
document.head.appendChild(loremStyleElement);
