import { useId } from "react";

type AsteriskMarkProps = {
  className?: string;
  /** Solid color. Omit to use the iridescent holographic gradient. */
  stroke?: string;
};

/**
 * The Valley six-spoke asterisk mark.
 * Renders with a self-contained iridescent gradient by default, or a solid
 * color when `stroke` is provided.
 */
export default function AsteriskMark({ className, stroke }: AsteriskMarkProps) {
  const id = useId();
  const fill = stroke ?? `url(#${id})`;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {!stroke && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8fe9ff" />
            <stop offset="0.35" stopColor="#f4b9ff" />
            <stop offset="0.6" stopColor="#fff2b0" />
            <stop offset="0.82" stopColor="#a8ffcf" />
            <stop offset="1" stopColor="#9db4ff" />
          </linearGradient>
        </defs>
      )}
      <g fill={fill}>
        {[0, 60, 120].map((r) => (
          <rect
            key={r}
            x="45"
            y="11"
            width="10"
            height="78"
            rx="2"
            transform={`rotate(${r} 50 50)`}
          />
        ))}
      </g>
    </svg>
  );
}
