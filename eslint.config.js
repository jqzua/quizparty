const browserGlobals = Object.fromEntries([
  'window', 'document', 'location', 'history', 'localStorage', 'sessionStorage',
  'alert', 'confirm', 'crypto', 'performance', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'Blob', 'URL', 'TextEncoder', 'CustomEvent', 'structuredClone',
].map(name => [name, 'readonly']));
export default [{
  files: ['js/**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: browserGlobals },
  rules: {
    'no-undef': 'error', 'no-unused-vars': ['error', { caughtErrors: 'none' }],
    'no-unreachable': 'error', 'no-constant-condition': 'error', 'eqeqeq': 'error',
    'no-duplicate-imports': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error',
  },
}];
