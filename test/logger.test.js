const assert = require('node:assert/strict');
const test = require('node:test');

const { redact } = require('../src/logger');

test('redacts identity and credential-like log metadata', () => {
  assert.deepEqual(redact({
    email: 'person@example.com',
    nested: { accessToken: 'secret', count: 2 }
  }), {
    email: '[REDACTED]',
    nested: { accessToken: '[REDACTED]', count: 2 }
  });
});
