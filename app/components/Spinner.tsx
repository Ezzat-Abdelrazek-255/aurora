// Inline button spinner. Pure CSS, no client JS — safe to render from server
// or client trees. `currentColor` so it matches the surrounding text color.

type Props = {
  size?: number;
  className?: string;
};

export function Spinner({ size = 14, className = "" }: Props) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] ${className}`}
      style={{ width: size, height: size, animationDuration: "0.7s" }}
    />
  );
}
