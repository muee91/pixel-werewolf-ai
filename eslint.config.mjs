// ESLint 扁平配置。门禁口径（与 CONTRIBUTING「提交前 typecheck 与单测都要过」并列）：
// - error（CI 会挂）：hooks 规则、未使用变量、prefer-const
// - warn（编辑器可见、不挡 CI）：no-explicit-any 与非空断言——存量较大，收敛后再升级
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    {
        ignores: ['dist/', 'dist-electron/', 'release/', 'node_modules/', 'playwright-report/', 'test-results/'],
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        extends: [...tseslint.configs.recommended],
        plugins: { 'react-hooks': reactHooks },
        languageOptions: {
            parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
                // 「解构剔除字段」惯用法（const { a, ...rest } = obj）不算未使用
                ignoreRestSiblings: true,
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            'prefer-const': 'error',
        },
    },
);
