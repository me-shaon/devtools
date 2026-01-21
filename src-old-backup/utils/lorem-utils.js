/**
 * Lorem utilities for generating lorem ipsum text
 */

class LoremUtils {
  static LOREM_WORDS = [
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

  static generateWords(count) {
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

  static generateSentences(count) {
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

  static generateParagraphs(count) {
    if (count < 1) {
      throw new Error('Paragraph count must be at least 1');
    }

    const paragraphs = [];
    for (let i = 0; i < count; i++) {
      const sentenceCount = this.randomBetween(3, 7);
      const sentences = this.generateSentences(sentenceCount);
      paragraphs.push(sentences);
    }
    return paragraphs.join('\n\n');
  }

  static generateLorem(type = 'paragraphs', count = 1) {
    if (count < 1 || count > 50) {
      throw new Error('Count must be between 1 and 50');
    }

    switch (type) {
      case 'paragraphs':
        return this.generateParagraphs(count);
      case 'sentences':
        return this.generateSentences(count);
      case 'words':
        return this.generateWords(count);
      default:
        return this.generateParagraphs(count);
    }
  }

  static randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static capitalizeFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = LoremUtils;
