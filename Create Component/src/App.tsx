import { useState } from "react";
import AsteriskMark from "@/components/AsteriskMark";

const S = 240; // plane size
const T = 50; // device thickness
const GAP = 150; // vertical gap between layers
const PIN = 0.66; // corner-pin inset (fraction of half-size)
const RAD = 34; // top-face corner radius
const C = 30; // corner chamfer size

const IRIS =
  "linear-gradient(115deg,#9fe8ff 0%,#bfe0ff 18%,#ecc9ff 38%,#fff0c8 58%,#ffe0c0 74%,#c7f0d4 88%,#a9c4ff 100%)";

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

/* ---------- icons ---------- */
type IconProps = { className?: string; stroke?: string };

const Lens = ({ className, stroke = "currentColor" }: IconProps) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke={stroke} strokeWidth="3">
    <circle cx="44" cy="46" r="22" />
    <path d="M60 62 L76 78" strokeLinecap="round" />
    <circle cx="44" cy="46" r="9" />
  </svg>
);

const Radar = ({ className, stroke = "currentColor" }: IconProps) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round">
    <path d="M50 74 L34 56 H66 Z" />
    <path d="M50 40 v14" />
    <path d="M38 34 a16 16 0 0 1 24 0" />
    <path d="M30 27 a26 26 0 0 1 40 0" />
  </svg>
);

const Check = ({ className, stroke = "currentColor" }: IconProps) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="30" y="30" width="40" height="40" rx="8" />
    <path d="M42 50 l7 8 l12 -16" />
  </svg>
);

const Message = ({ className, stroke = "currentColor" }: IconProps) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round">
    <path d="M28 34 h44 v28 h-26 l-12 12 v-12 h-6 Z" />
  </svg>
);

const LAYERS: Array<(p: IconProps) => JSX.Element> = [
  AsteriskMark,
  Lens,
  Radar,
  Check,
  Message,
];

/* louvered vent */
function Vent({ active }: { active: boolean }) {
  return (
    <div
      style={{
        width: 46,
        height: T * 0.4,
        backgroundImage: `repeating-linear-gradient(90deg, ${
          active ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.14)"
        } 0 1.5px, transparent 1.5px 4px)`,
      }}
    />
  );
}

/* a single vertical wall of the extruded body */
type WallDef = {
  cx: number;
  cy: number;
  theta: number; // yaw about the vertical axis
  len: number; // length along the edge
  bright: number;
  vent?: "left" | "right";
  seam?: boolean;
};

function Wall({ d, active }: { d: WallDef; active: boolean }) {
  return (
    <div
      className="absolute left-1/2 top-1/2 flex items-center overflow-hidden"
      style={{
        width: d.len,
        height: T,
        marginLeft: -d.len / 2,
        marginTop: -T / 2,
        transform: `translate(${d.cx}px, ${d.cy}px) translateZ(${T / 2}px) rotateZ(${d.theta}deg) rotateX(90deg)`,
        borderRadius: `0 0 ${RAD * 0.35}px ${RAD * 0.35}px`,
        backgroundImage: active ? `${NOISE}, ${IRIS}` : "none",
        backgroundColor: active ? "transparent" : "rgba(255,255,255,0.03)",
        backgroundBlendMode: "soft-light, normal",
        backgroundSize: "cover",
        filter: active ? `brightness(${d.bright}) saturate(1.15) contrast(1.05)` : "none",
        border: active ? "none" : "1px solid rgba(255,255,255,0.06)",
        transition: "background-color 400ms, filter 400ms",
        padding: "0 14px",
        justifyContent: d.vent === "right" ? "flex-end" : "flex-start",
      }}
    >
      {d.vent && <Vent active={active} />}
      {d.seam && <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/25" />}
    </div>
  );
}

const H = S / 2 - C; // half-length of a main edge
const M = S / 2 - C / 2; // corner-wall center offset
const LC = C * Math.SQRT2; // chamfer length

const WALLS: WallDef[] = [
  // main edges
  { cx: 0, cy: S / 2, theta: 0, len: 2 * H, bright: 0.96, vent: "left", seam: true },
  { cx: S / 2, cy: 0, theta: 90, len: 2 * H, bright: 0.62 },
  { cx: -S / 2, cy: 0, theta: 90, len: 2 * H, bright: 0.8, vent: "right" },
  { cx: 0, cy: -S / 2, theta: 0, len: 2 * H, bright: 0.5 },
  // chamfered corners
  { cx: M, cy: M, theta: -45, len: LC, bright: 0.78 },
  { cx: -M, cy: M, theta: 45, len: LC, bright: 0.88 },
  { cx: M, cy: -M, theta: 45, len: LC, bright: 0.5 },
  { cx: -M, cy: -M, theta: -45, len: LC, bright: 0.5 },
];

/* ---------- one 3D layer (fixed position) ---------- */
function Layer({
  Icon,
  z,
  active,
  onClick,
}: {
  Icon: (p: IconProps) => JSX.Element;
  z: number;
  active: boolean;
  onClick: () => void;
}) {
  const line = active ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.12)";
  return (
    <div
      className="absolute left-1/2 top-1/2 cursor-pointer"
      style={{
        width: S,
        height: S,
        marginLeft: -S / 2,
        marginTop: -S / 2,
        transformStyle: "preserve-3d",
        transform: `translateZ(${z}px)`,
      }}
      onClick={onClick}
    >
      {WALLS.map((d, i) => (
        <Wall key={i} d={d} active={active} />
      ))}

      {/* top face — dark with thin iridescent rim */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateZ(${T}px)`,
          borderRadius: RAD,
          padding: active ? 1.6 : 1,
          backgroundImage: active ? `${NOISE}, ${IRIS}` : "none",
          backgroundColor: active ? "transparent" : "rgba(255,255,255,0.13)",
          backgroundBlendMode: "soft-light, normal",
          backgroundSize: "cover",
          boxShadow: active ? "0 30px 60px rgba(0,0,0,0.6)" : "none",
          transition: "background-color 400ms",
        }}
      >
        <div className="relative grid size-full place-items-center bg-[#0b0b0d]" style={{ borderRadius: RAD - 2 }}>
          <div className="absolute inset-[10px] border" style={{ borderRadius: RAD - 11, borderColor: line }} />
          <div className="absolute inset-[26px] border border-dashed" style={{ borderRadius: RAD - 18, borderColor: line }} />
          <Icon className="h-[36%] w-[36%]" stroke={active ? undefined : "rgba(255,255,255,0.16)"} />
        </div>
      </div>

      {/* corner pins */}
      {[
        [PIN, PIN],
        [-PIN, PIN],
        [PIN, -PIN],
        [-PIN, -PIN],
      ].map(([px, py], i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 size-[7px] rounded-full"
          style={{
            transform: `translate(-50%,-50%) translate(${(px * S) / 2}px, ${(py * S) / 2}px) translateZ(${T}px)`,
            background: active ? "#fff" : "rgba(255,255,255,0.5)",
            boxShadow: active ? "0 0 10px rgba(255,255,255,0.7)" : "none",
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState(0);
  const N = LAYERS.length;
  const topZ = (N - 1) * GAP;
  const zFor = (i: number) => (N - 1 - i) * GAP; // layer 0 on top; fixed

  return (
    <div className="grid min-h-screen w-full place-items-center overflow-hidden bg-[var(--ground)]">
      <div style={{ perspective: "1900px", transform: "translateY(210px)" }}>
        <div
          className="relative"
          style={{
            width: 460,
            height: 940,
            transformStyle: "preserve-3d",
            transform: "rotateX(58deg) rotateZ(-45deg) translateZ(-40px)",
          }}
        >
          {/* connectors — continuous dashed lines through every corner + center */}
          {[
            [PIN, PIN],
            [-PIN, PIN],
            [PIN, -PIN],
            [-PIN, -PIN],
            [0, 0],
          ].map(([px, py], i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                width: 1,
                height: topZ,
                marginLeft: -0.5,
                marginTop: -topZ / 2,
                transform: `translate(${(px * S) / 2}px, ${(py * S) / 2}px) translateZ(${topZ / 2}px) rotateX(90deg)`,
                backgroundImage:
                  "repeating-linear-gradient(to bottom, rgba(255,255,255,0.4) 0 5px, transparent 5px 11px)",
              }}
            />
          ))}

          {LAYERS.map((Icon, i) => (
            <Layer key={i} Icon={Icon} z={zFor(i)} active={active === i} onClick={() => setActive(i)} />
          ))}

          {/* ground shadow */}
          <div
            className="absolute left-1/2 top-1/2 rounded-full bg-black/60 blur-2xl"
            style={{
              width: S,
              height: S,
              marginLeft: -S / 2,
              marginTop: -S / 2,
              transform: "translateZ(-60px)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
