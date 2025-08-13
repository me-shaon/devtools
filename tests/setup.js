/**
 * Jest setup file for DevTools Desktop
 * This file runs before each test file
 */

// Mock DOM elements and browser APIs that our tools might use
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// Mock navigator.clipboard
Object.defineProperty(global.navigator, 'clipboard', {
  value: {
    writeText: jest.fn(() => Promise.resolve()),
    readText: jest.fn(() => Promise.resolve('')),
  },
  writable: true,
});

// Mock window.app (Electron main process communication)
global.window = global.window || {};
global.window.app = {
  showMessage: jest.fn(),
};

// Mock crypto for UUID generation
global.crypto = {
  getRandomValues: jest.fn((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
};

// Mock document methods
global.document = global.document || {};
global.document.getElementById = jest.fn();
global.document.querySelector = jest.fn();
global.document.querySelectorAll = jest.fn();
global.document.createElement = jest.fn();

// Helper function to create mock elements
global.createMockElement = (tag = 'div', props = {}) => {
  const element = {
    tagName: tag.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    click: jest.fn(),
    select: jest.fn(),
    setSelectionRange: jest.fn(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(),
      toggle: jest.fn(),
    },
    dataset: {},
    ...props,
  };

  return element;
};
