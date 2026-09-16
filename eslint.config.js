// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Deliberately narrow. The point of a linter here is the rules a type checker cannot
 * express -- above all react-hooks, whose suppressions were sitting in the code with
 * nothing to suppress. Formatting and style opinions are left out: they generate churn
 * without catching bugs, and TypeScript is already running in strict mode.
 */
export default tseslint.config(
  // android/ carries a copy of the built bundle, which is not source.
  { ignores: ["dist", "convex/_generated", "src/routeTree.gen.ts", "node_modules", "android"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    rules: {
      // The codebase leans on `!` for indexes it has already bounds-checked, and on
      // `any` nowhere. Neither needs a second opinion.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Stricter than React's own guidance, which allows an effect to set state when it is
      // synchronising with something outside React. Every remaining case here is that: a
      // countdown driven by a timer, or a size driven by a ResizeObserver. Kept visible as
      // a warning rather than muted, so a genuinely cascading render still shows up.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
