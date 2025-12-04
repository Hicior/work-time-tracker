const js = require('@eslint/js');

module.exports = [
  // Apply recommended rules to all files
  js.configs.recommended,
  
  // Configuration for JavaScript files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        exports: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Recommended rules, not too strict
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off', // Allow console in Node.js app
      'no-undef': 'error',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'public/css/output.css',
      'dist/',
      'build/',
      '**/*.min.js',
      '**/*.ejs', // EJS files cannot be reliably linted due to mixed template syntax
    ],
  },
];

