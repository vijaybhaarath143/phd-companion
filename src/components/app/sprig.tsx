import { cn } from "cn";

/**
 * Sprig, the app's sprout come to life. Decoration only: the words next to it always carry the
 * meaning, so it's hidden from screen readers. Sprig is a cheerful lab-mate who is proud of her —
 * it never looks sad, never wilts and never nags. Moving parts sit still under reduced motion.
 *
 * - mood: one face per moment (hello at sign-in, proud at a real milestone, curious when nothing
 *   was found, cosy when nothing is due, oops when something broke on our side; love, dizzy and
 *   yawn are for playing with it)
 * - stage: how far it has grown (seed on day one … graduate after the defence); it only grows
 * - lively: breathes, blinks, sways its leaves and can look around (see LiveSprig, which also
 *   moves its eyes and reacts to clicks)
 *
 * Every Sprig shares one canvas, so the body stays the same size whatever grows above it.
 */
export type SprigMood = "happy" | "hello" | "proud" | "curious" | "cosy" | "oops" | "love" | "dizzy" | "yawn";
export type SprigStage = "seed" | "sprout" | "sapling" | "bloom" | "graduate";

const BODY = "var(--leaf-bright)";
const EDGE = "var(--primary)";
const DARK = "var(--leaf-strong)";
const INK = "#2d2d33"; // pupils and closed eyes; always on white or on the green body
// Solid, not see-through: a see-through pink over the green body mixes to olive.
const CHEEK = "#f5a08c";

function Leaf({ x, y, rx, ry, rotate, dark }: { x: number; y: number; rx: number; ry: number; rotate: number; dark?: boolean }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${rotate} ${x} ${y})`} fill={dark ? DARK : EDGE} />;
}

function Stem({ to }: { to: number }) {
  return <path d={`M0 -28 V${to}`} stroke={EDGE} strokeWidth={4} strokeLinecap="round" fill="none" />;
}

/** What grows above the body. Drawn first, so the stem tucks in behind. */
function Growth({ stage }: { stage: SprigStage }) {
  switch (stage) {
    case "seed":
      return <path d="M0 -28 Q3 -38 10 -40" stroke={EDGE} strokeWidth={4} strokeLinecap="round" fill="none" />;
    case "sprout":
      return (
        <>
          <Stem to={-46} />
          <Leaf x={-13} y={-51} rx={14} ry={8} rotate={-30} dark />
          <Leaf x={14} y={-55} rx={16} ry={8.5} rotate={25} />
        </>
      );
    case "sapling":
      return (
        <>
          <Stem to={-64} />
          <Leaf x={-12} y={-42} rx={12} ry={6.5} rotate={-25} dark />
          <Leaf x={12} y={-48} rx={12} ry={6.5} rotate={25} />
          <Leaf x={-13} y={-64} rx={14} ry={7.5} rotate={-35} />
          <Leaf x={14} y={-70} rx={15} ry={8} rotate={30} dark />
        </>
      );
    case "bloom":
      return (
        <>
          <Stem to={-68} />
          <Leaf x={-12} y={-42} rx={12} ry={6.5} rotate={-25} dark />
          <Leaf x={12} y={-48} rx={12} ry={6.5} rotate={25} />
          <Leaf x={-13} y={-58} rx={13} ry={7} rotate={-35} />
          <Leaf x={13} y={-62} rx={13} ry={7} rotate={30} dark />
          {[[0, -82], [8.6, -75.8], [5.3, -65.7], [-5.3, -65.7], [-8.6, -75.8]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={6.5} fill="var(--sun-bright)" />
          ))}
          <circle cx={0} cy={-73} r={5} fill="var(--clay)" />
        </>
      );
    case "graduate":
      // Leaves peek out from under the cap, which is drawn over the head later.
      return (
        <>
          <Leaf x={-20} y={-34} rx={13} ry={6.5} rotate={-40} dark />
          <Leaf x={21} y={-36} rx={14} ry={7} rotate={35} />
        </>
      );
  }
}

function GradCap() {
  return (
    <>
      <rect x={-14} y={-34} width={28} height={11} rx={2} fill="var(--grape-strong)" />
      <path d="M-28 -34 L0 -45 L28 -34 L0 -23 Z" fill="var(--grape)" />
      <path d="M22 -34 V-22" stroke="var(--sun-bright)" strokeWidth={2.5} fill="none" />
      <circle cx={22} cy={-21} r={3} fill="var(--sun-bright)" />
    </>
  );
}

function Arm({ x, y, rotate, front }: { x: number; y: number; rotate: number; front?: boolean }) {
  return <ellipse cx={x} cy={y} rx={front ? 8 : 9} ry={front ? 4 : 5} transform={`rotate(${rotate} ${x} ${y})`} fill={EDGE} />;
}

/** Arms behind the body. */
function Arms({ mood }: { mood: SprigMood }) {
  const left = <Arm x={-35} y={6} rotate={20} />;
  const right = <Arm x={35} y={6} rotate={-20} />;
  switch (mood) {
    case "hello":
      return (
        <>
          {left}
          <g className="origin-bottom-left [transform-box:fill-box] motion-safe:animate-[sprig-wave_0.7s_ease-in-out_3]">
            <Arm x={37} y={-8} rotate={-50} />
            <path d="M45 -26 Q49 -22 48 -17 M50 -31 Q56 -24 54 -15" stroke={BODY} strokeWidth={2.2} strokeLinecap="round" fill="none" />
          </g>
        </>
      );
    case "proud":
    case "yawn":
      return (
        <>
          <Arm x={-37} y={-12} rotate={55} />
          <Arm x={37} y={-12} rotate={-55} />
        </>
      );
    case "curious":
      return left;
    case "cosy":
      return null;
    default:
      return (
        <>
          {left}
          {right}
        </>
      );
  }
}

/** Open eyes: the whites blink as one, the pupils inside can look around (--sprig-lx / --sprig-ly). */
function OpenEyes({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) {
  return (
    <g className="sprig-blink">
      <ellipse cx={-11} cy={-4} rx={7.5} ry={8.5} fill="#fff" />
      <ellipse cx={11} cy={-4} rx={7.5} ry={8.5} fill="#fff" />
      <g className="sprig-look">
        <circle cx={-10 + dx} cy={-2 + dy} r={4.3} fill={INK} />
        <circle cx={12 + dx} cy={-2 + dy} r={4.3} fill={INK} />
        <circle cx={-8.5 + dx} cy={-4 + dy} r={1.5} fill="#fff" />
        <circle cx={13.5 + dx} cy={-4 + dy} r={1.5} fill="#fff" />
      </g>
    </g>
  );
}

function Line({ d, color = DARK, width = 2.5 }: { d: string; color?: string; width?: number }) {
  return <path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

function heart(cx: number, cy: number, s: number) {
  return `M${cx} ${cy + s * 0.9} C${cx - s * 1.6} ${cy - s * 0.2} ${cx - s * 0.9} ${cy - s * 1.5} ${cx} ${cy - s * 0.6} C${cx + s * 0.9} ${cy - s * 1.5} ${cx + s * 1.6} ${cy - s * 0.2} ${cx} ${cy + s * 0.9} Z`;
}

function spiral(cx: number, cy: number) {
  return `M${cx} ${cy} a1.6 1.6 0 1 1 1.6 1.6 a3.2 3.2 0 1 1 -3.2 -3.2 a4.8 4.8 0 1 1 4.8 4.8`;
}

const CLOSED_HAPPY = "M-15 -2 Q-11 -9 -7 -2 M7 -2 Q11 -9 15 -2";
const CLOSED_CALM = "M-15 -4 Q-11 1 -7 -4 M7 -4 Q11 1 15 -4";

const CHEEKS = (
  <>
    <ellipse cx={-21} cy={9} rx={4.5} ry={3.5} fill={CHEEK} />
    <ellipse cx={21} cy={9} rx={4.5} ry={3.5} fill={CHEEK} />
  </>
);

/** Eyes, mouth and anything in front of the body. */
function Face({ mood }: { mood: SprigMood }) {
  switch (mood) {
    case "hello":
      return (
        <>
          <OpenEyes />
          {CHEEKS}
          <path d="M-7 9 Q0 19 7 9 Z" fill={DARK} />
        </>
      );
    case "proud":
      return (
        <>
          <Line d={CLOSED_HAPPY} color={INK} width={2.8} />
          {CHEEKS}
          <path d="M-9 7 Q0 21 9 7 Z" fill={DARK} />
        </>
      );
    case "curious":
      return (
        <>
          <OpenEyes dx={2} dy={-4} />
          <Line d="M5 -17 Q11 -21 17 -16" />
          <circle cx={2} cy={12} r={3.2} fill={DARK} />
          <Arm x={20} y={21} rotate={-20} front />
        </>
      );
    case "cosy":
      return (
        <>
          <Line d={CLOSED_CALM} color={INK} width={2.8} />
          {CHEEKS}
          <Line d="M-5 11 Q0 15 5 11" />
          <Arm x={-14} y={21} rotate={15} front />
          <Arm x={14} y={21} rotate={-15} front />
          <g className="motion-safe:animate-[sprig-doze_3s_ease-in-out_infinite]">
            <Line d="M26 -30 H33 L26 -22 H33 M37 -44 H42 L37 -38 H42" color="var(--sky)" width={2.2} />
          </g>
        </>
      );
    case "oops":
      return (
        <>
          <Line d="M-17 -14 L-7 -18 M7 -18 L17 -14" />
          <OpenEyes />
          <Line d="M-6 13 Q-3 10 0 13 Q3 16 6 13" />
          <path d="M28 -25 Q32 -18 28 -15 Q24 -18 28 -25 Z" fill="var(--sky)" opacity={0.8} />
        </>
      );
    case "love":
      return (
        <>
          <g className="motion-safe:animate-[sprig-throb_0.9s_ease-in-out_infinite] [transform-box:fill-box] origin-center">
            <path d={heart(-11, -4, 5.5)} fill="var(--berry-bright)" />
            <path d={heart(11, -4, 5.5)} fill="var(--berry-bright)" />
          </g>
          {CHEEKS}
          <path d="M-7 8 Q0 18 7 8 Z" fill={DARK} />
        </>
      );
    case "dizzy":
      return (
        <>
          {[[-11, -4], [11, -4]].map(([cx, cy]) => (
            <g key={cx} className="motion-safe:animate-[sprig-spin-eye_0.9s_linear_infinite] [transform-box:fill-box] origin-center">
              <path d={spiral(cx, cy)} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
            </g>
          ))}
          {CHEEKS}
          <Line d="M-6 13 Q-3 10 0 13 Q3 16 6 13" />
        </>
      );
    case "yawn":
      return (
        <>
          <Line d={CLOSED_CALM} color={INK} width={2.8} />
          {CHEEKS}
          <ellipse cx={0} cy={12} rx={5.5} ry={7} fill={DARK} />
        </>
      );
    default:
      return (
        <>
          <OpenEyes />
          {CHEEKS}
          <Line d="M-6 10 Q0 16 6 10" />
        </>
      );
  }
}

export function Sprig({
  mood = "happy",
  stage = "sprout",
  lively = false,
  className,
}: {
  mood?: SprigMood;
  stage?: SprigStage;
  lively?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 120 136" aria-hidden focusable="false" className={cn("h-auto w-32 shrink-0 overflow-visible", lively && "sprig-lively", className)}>
      <ellipse cx={60} cy={131} rx={30} ry={3.5} fill="var(--foreground)" opacity={0.08} />
      {/* The hop is a CSS transform, so it sits on a group of its own: it would replace an SVG transform. */}
      <g className={cn(mood === "proud" && "motion-safe:animate-[sprig-hop_700ms_ease-out_both]")}>
        <g transform="translate(60 92)">
          <g className="sprig-breathe">
            <g className="sprig-sway">
              <Growth stage={stage} />
            </g>
            <Arms mood={mood} />
            <ellipse cx={-12} cy={31} rx={8} ry={4.5} fill={DARK} />
            <ellipse cx={12} cy={31} rx={8} ry={4.5} fill={DARK} />
            <ellipse cx={0} cy={5} rx={34} ry={30} fill={EDGE} />
            <ellipse cx={0} cy={0} rx={34} ry={30} fill={BODY} />
            <ellipse cx={-14} cy={-15} rx={8} ry={4.5} transform="rotate(-30 -14 -15)" fill="#fff" opacity={0.3} />
            <Face mood={mood} />
            {stage === "graduate" && <GradCap />}
          </g>
          {stage === "seed" && <path d="M-46 36 Q0 14 46 36 Z" fill="var(--clay)" opacity={0.3} />}
        </g>
      </g>
    </svg>
  );
}
