import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Configuração básica para arquivos JS/JSX
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // Usar a configuração recomendada do typescript-eslint para arquivos TS/TSX
  ...tseslint.configs.recommended,
  {
    // Configuração específica para arquivos TypeScript
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.browser,
        ...globals.node // Para arquivos .ts que podem precisar de variáveis Node
      }
    },
    rules: {
      'no-unused-vars': 'off', // Desabilitamos e usamos a regra do TS equivalente
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Configuração para arquivos de configuração
    files: ['vite.config.js', '*.config.js', '.eslintrc.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs
      }
    },
    rules: {
      'no-undef': 'off' // Desativa a regra no-undef para esses arquivos
    }
  }
])