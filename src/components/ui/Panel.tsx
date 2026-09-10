import type { HTMLAttributes } from "react";

/** A sheet of paper on the felt. `ruled` adds score-sheet lines. */
export function Panel({ className = "", ruled = false, ...props }: HTMLAttributes<HTMLDivElement> & { ruled?: boolean }) {
  return <div {...props} className={`paper ${ruled ? "paper-ruled" : ""} p-5 ${className}`} />;
}
