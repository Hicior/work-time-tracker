const js = require('@eslint/js');
const html = require('eslint-plugin-html');

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
        varsIgnorePattern: '^_' 
      }],
      'no-console': 'off', // Allow console in Node.js app
      'no-undef': 'error',
    },
  },

  // Configuration for EJS files - only lints JavaScript inside <script> tags
  {
    files: ['**/*.ejs'],
    plugins: {
      html,
    },
    settings: {
      'html/html-extensions': ['.ejs', '.html'],
      'html/report-bad-indent': 'warn',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Browser globals for client-side scripts in EJS
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        FormData: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        JSON: 'readonly',
        Date: 'readonly',
        // Custom app globals
        showNotification: 'readonly',
      },
    },
    rules: {
      // More lenient rules for inline scripts
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_|^today$' 
      }],
      'no-console': 'off',
      'no-undef': 'warn', // Use 'warn' instead of 'error' for inline scripts
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
      // EJS files with embedded template syntax in JavaScript (can't be parsed)
      'views/admin/groups.ejs',
      'views/admin/statistics.ejs',
      'views/work-hours/index.ejs',
    ],
  },
];

