import js from "@eslint/js";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        ecmaVersion: 2022,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": [
        "error",
        {
          tabWidth: 4,
          semi: true,
          singleQuote: false,
          printWidth: 100,
          endOfLine: "auto"
        }
      ],
      // Import sorting rules
      "sort-imports": [
        "error",
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
          allowSeparatedGroups: true
        }
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { vars: "all", args: "none", ignoreRestSiblings: false, caughtErrors: "all" }
      ],
      "no-undef": "error",
      "no-restricted-globals": ["error", "event", "self"],
      "no-const-assign": ["error"],
      "no-debugger": ["error"],
      "no-dupe-class-members": ["error"],
      "no-dupe-keys": ["error"],
      "no-dupe-args": ["error"],
      "no-dupe-else-if": ["error"],
      "no-unsafe-negation": ["error"],
      "no-duplicate-imports": ["error"],
      "valid-typeof": ["error"],
      "no-unused-vars": [
        "error",
        { vars: "all", args: "none", ignoreRestSiblings: false, caughtErrors: "all" }
      ],
      curly: ["error", "all"],
      "no-restricted-syntax": ["error", "PrivateIdentifier"],
      "prefer-const": [
        "error",
        { destructuring: "all", ignoreReadBeforeAssign: true }
      ],
      "arrow-body-style": ["error", "as-needed"]
    }
  }
];
