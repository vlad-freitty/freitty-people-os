import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import i18next from "eslint-plugin-i18next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", ".next-check/**", "out/**", "build/**", "next-env.d.ts", ".pgdata/**", ".uploads/**"],
  },
  // PRD 9, rule 2: data access only through the service layer in src/server
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@prisma/client", message: "Use services from src/server instead of Prisma directly.", allowTypeImports: true },
            { name: "@/server/db", message: "Use services from src/server instead of Prisma directly." },
          ],
        },
      ],
    },
  },
  // PRD 9, rule 7: every UI string goes through i18n keys
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "jsx-attributes": { include: ["placeholder", "title", "alt", "aria-label", "label"] },
          // icon-like symbols and the version prefix are not UI text
          words: { exclude: ["[\\s\\d·•●—–→↳↑↓✕✓☰+*:;,.()/%-]+", "🎂", "🔔", "📎.*", "v"] },
        },
      ],
    },
  },
];

export default eslintConfig;
