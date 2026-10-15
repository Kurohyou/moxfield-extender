const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup/chromeStub.js'],
    include: ['tests/**/*.test.js'],
  },
});
