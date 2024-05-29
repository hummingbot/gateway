module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  env: {
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    semi: [2, 'always'],
    'prettier/prettier': ['error', { trailingComma: 'es5' }],
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-namespace': 'off',
    'comma-dangle': 'off',
  },
};
