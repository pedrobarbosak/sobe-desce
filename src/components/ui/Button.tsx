import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "bg-brass-500 text-ink-900 hover:bg-brass-400 active:bg-brass-600 shadow-[0_3px_0_0_var(--color-brass-700)] active:translate-y-[2px] active:shadow-none",
  secondary: "bg-paper-50 text-ink-900 border border-ink-900/20 hover:bg-white",
  ghost: "bg-transparent text-current border border-current/30 hover:bg-current/10",
  danger: "bg-heart text-white hover:brightness-110",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
