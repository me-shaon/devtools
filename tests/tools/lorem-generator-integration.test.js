/**
 * Integration test for Lorem Generator UI functionality
 */

// Mock DOM elements and environment
const mockElements = {
  type: { value: 'paragraphs' },
  count: { value: '2' },
  output: { value: '' },
  generateBtn: { addEventListener: jest.fn() },
  typeSelect: { addEventListener: jest.fn() },
  countInput: { addEventListener: jest.fn() },
};

// Mock document.getElementById
global.document = {
  getElementById: jest.fn((id) => {
    switch (id) {
      case 'lorem-type':
        return mockElements.type;
      case 'lorem-count':
        return mockElements.count;
      case 'lorem-output':
        return mockElements.output;
      case 'generate-lorem':
        return mockElements.generateBtn;
      default:
        return null;
    }
  }),
};

// Mock window.app
global.window = {
  app: {
    showMessage: jest.fn(),
  },
};

// Mock console.log to capture debug output
global.console = {
  log: jest.fn(),
  error: jest.fn(),
};

// Import the lorem generator class by evaluating the code
const fs = require('fs');
const path = require('path');
const loremGeneratorCode = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/js/tools/lorem-generator.js'),
  'utf8'
);

// Remove the style creation and global assignment parts that would fail in test env
const cleanCode = loremGeneratorCode
  .replace(
    /const style = document\.createElement.*?document\.head\.appendChild\(style\);/gs,
    ''
  )
  .replace('window.LoremGenerator = new LoremGenerator();', '');

eval(cleanCode);

describe('LoremGenerator UI Integration', () => {
  let generator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockElements.output.value = '';
    mockElements.count.value = '2';
    mockElements.type.value = 'paragraphs';
    generator = new LoremGenerator();
  });

  test('initializes and finds DOM elements', () => {
    expect(console.log).toHaveBeenCalledWith('LoremGenerator init:', {
      generateBtn: true,
      typeSelect: true,
      countInput: true,
    });
  });

  test('generates paragraphs successfully', () => {
    generator.generateLorem();

    expect(mockElements.output.value).toBeTruthy();
    expect(mockElements.output.value).toContain('lorem');
    expect(window.app.showMessage).toHaveBeenCalledWith(
      'Generated 2 paragraphs!',
      'success'
    );
  });

  test('generates sentences successfully', () => {
    mockElements.type.value = 'sentences';
    mockElements.count.value = '3';

    generator.generateLorem();

    expect(mockElements.output.value).toBeTruthy();
    const sentenceCount = (mockElements.output.value.match(/[.!?]/g) || [])
      .length;
    expect(sentenceCount).toBe(3);
    expect(window.app.showMessage).toHaveBeenCalledWith(
      'Generated 3 sentences!',
      'success'
    );
  });

  test('generates words successfully', () => {
    mockElements.type.value = 'words';
    mockElements.count.value = '10';

    generator.generateLorem();

    expect(mockElements.output.value).toBeTruthy();
    const wordCount = mockElements.output.value.split(' ').length;
    expect(wordCount).toBe(10);
    expect(window.app.showMessage).toHaveBeenCalledWith(
      'Generated 10 words!',
      'success'
    );
  });

  test('handles invalid count', () => {
    mockElements.count.value = '0';

    generator.generateLorem();

    expect(mockElements.output.value).toBe('');
    expect(window.app.showMessage).toHaveBeenCalledWith(
      'Please enter a count between 1 and 50.',
      'error'
    );
  });

  test('handles missing elements gracefully', () => {
    // Mock missing elements
    document.getElementById.mockReturnValue(null);

    generator.generateLorem();

    expect(console.error).toHaveBeenCalledWith(
      'Lorem generator: Required elements not found',
      {
        typeElement: false,
        countElement: false,
        output: false,
      }
    );
  });

  test('handles errors in generation', () => {
    mockElements.count.value = 'invalid';

    generator.generateLorem();

    expect(window.app.showMessage).toHaveBeenCalledWith(
      'Please enter a count between 1 and 50.',
      'error'
    );
  });
});
