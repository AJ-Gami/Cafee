import { useId } from 'react';

const SHIRTS = ['#c4673f', '#4d6b53', '#b9814f', '#5a6f8f', '#8a5a7a', '#d9a441', '#3f5a45'];
const SKIN = ['#f0d2b4', '#e8c4a0', '#c99a73', '#8d5a3b'];
const HAIR = ['#241914', '#3b2a20', '#6b4e3b', '#1c1c1c'];
const TUDUNG = ['#cfdccd', '#ecd3b6', '#8a5a7a', '#5a6f8f', '#efe4d3'];
/** Where customers stand at the counter, left to right. */
const SPOTS = [62, 112, 162, 212, 262, 312, 362, 87, 337];

/** A customer at the counter, seen from behind. `look` picks the clothes and hair. */
function Customer({ x, look }: { x: number; look: number }) {
  const shirt = SHIRTS[look % SHIRTS.length];
  const skin = SKIN[(look >> 1) % SKIN.length];
  const tudung = look % 3 === 1;
  return (
    <g className="motion-safe:animate-fade-up" style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}>
      <path d={`M${x - 19} 222c0-34 7-46 19-46s19 12 19 46z`} fill={shirt} />
      {tudung ? (
        <>
          <path d={`M${x - 15} 186c-2-26 6-40 15-40s17 14 15 40c-6 6-24 6-30 0z`} fill={TUDUNG[look % TUDUNG.length]} />
          <ellipse cx={x} cy="160" rx="10" ry="11" fill={TUDUNG[look % TUDUNG.length]} />
        </>
      ) : (
        <>
          <rect x={x - 4} y="166" width="8" height="10" fill={skin} />
          <circle cx={x} cy="157" r="11" fill={skin} />
          <path d={`M${x - 11} 158a11 11 0 0 1 22 0c0-4-3-14-11-14s-11 10-11 14z`} fill={HAIR[look % HAIR.length]} />
        </>
      )}
    </g>
  );
}

/**
 * Lightweight vector café interior used as the hero backdrop (no image downloads).
 * `evening` switches to warm lamp light after closing. `customers` (up to nine) stand at the
 * counter, dressed according to `seed`; `shaded` darkens the bottom for overlaid text.
 */
export function CafeScene({
  evening = false,
  customers = 0,
  seed = 0,
  shaded = true,
  className = '',
}: {
  evening?: boolean;
  customers?: number;
  seed?: number;
  shaded?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const shown = SPOTS.slice(0, Math.max(0, Math.round(customers))).map((x, i) => ({ x, i }));
  const g = (name: string) => `${name}-${id}`;
  return (
    <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g('wall')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={evening ? '#4a3427' : '#ead8bf'} />
          <stop offset="1" stopColor={evening ? '#33241b' : '#d9bf9d'} />
        </linearGradient>
        <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={evening ? '#1f2a3a' : '#f9ecd6'} />
          <stop offset="1" stopColor={evening ? '#3b3f52' : '#f3dcb8'} />
        </linearGradient>
        <linearGradient id={g('wood')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b4e3b" />
          <stop offset="1" stopColor="#3b2a20" />
        </linearGradient>
        <linearGradient id={g('top')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a5876c" />
          <stop offset="1" stopColor="#7f6250" />
        </linearGradient>
        <linearGradient id={g('steel')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8e8880" />
          <stop offset="0.45" stopColor="#d8d3cb" />
          <stop offset="1" stopColor="#7d776f" />
        </linearGradient>
        <radialGradient id={g('glow')} cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity={evening ? 0.75 : 0.35} />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor="#241914" stopOpacity="0" />
          <stop offset="1" stopColor="#241914" stopOpacity="0.78" />
        </linearGradient>
      </defs>

      <rect width="400" height="220" fill={`url(#${g('wall')})`} />

      {/* Window */}
      <g>
        <rect x="18" y="26" width="96" height="104" rx="6" fill="#3b2a20" />
        <rect x="24" y="32" width="84" height="92" rx="3" fill={`url(#${g('sky')})`} />
        <path d="M66 32v92M24 78h84" stroke="#3b2a20" strokeWidth="4" />
        {evening ? (
          <g fill="#ffe7b0" opacity="0.8">
            <circle cx="40" cy="50" r="1.2" />
            <circle cx="90" cy="44" r="1" />
            <circle cx="80" cy="60" r="0.8" />
          </g>
        ) : (
          <g fill="#6a8a70" opacity="0.55">
            <ellipse cx="44" cy="118" rx="22" ry="12" />
            <ellipse cx="92" cy="120" rx="18" ry="10" />
          </g>
        )}
      </g>

      {/* Chalkboard menu */}
      <g>
        <rect x="150" y="24" width="104" height="66" rx="5" fill="#6b4e3b" />
        <rect x="155" y="29" width="94" height="56" rx="3" fill="#2c302d" />
        <g stroke="#efe4d3" strokeLinecap="round" opacity="0.85">
          <path d="M166 40h36" strokeWidth="2.4" />
          <path d="M166 51h56M166 60h48M166 69h60M166 78h40" strokeWidth="1.4" opacity="0.7" />
          <path d="M232 51h8M228 60h12M232 69h8M232 78h8" strokeWidth="1.4" opacity="0.7" />
        </g>
      </g>

      {/* Shelf with jars and cups */}
      <g>
        <rect x="282" y="58" width="104" height="5" rx="2" fill="#50392b" />
        <rect x="292" y="38" width="14" height="20" rx="3" fill="#b9814f" opacity="0.9" />
        <rect x="310" y="42" width="14" height="16" rx="3" fill="#ecd3b6" />
        <rect x="328" y="36" width="14" height="22" rx="3" fill="#6b4e3b" />
        <path d="M350 48h14v6a7 7 0 0 1-14 0z" fill="#f7f0e6" />
        <path d="M368 48h14v6a7 7 0 0 1-14 0z" fill="#cfdccd" />
        <rect x="282" y="98" width="104" height="5" rx="2" fill="#50392b" />
        <g fill="#7f6250">
          <rect x="294" y="78" width="10" height="20" rx="2" />
          <rect x="308" y="82" width="10" height="16" rx="2" fill="#a5876c" />
          <rect x="322" y="76" width="10" height="22" rx="2" />
        </g>
        <path d="M346 98c0-10 8-18 18-18s18 8 18 18z" fill="#4d6b53" />
      </g>

      {/* Pendant lamps */}
      {[120, 270].map((x) => (
        <g key={x}>
          <path d={`M${x} 0v26`} stroke="#241914" strokeWidth="1.5" />
          <ellipse cx={x} cy="60" rx="70" ry="60" fill={`url(#${g('glow')})`} />
          <path d={`M${x - 13} 38a13 12 0 0 1 26 0z`} fill="#241914" />
          <ellipse cx={x} cy="39" rx="6" ry="2.4" fill="#ffe2ad" opacity={evening ? 1 : 0.7} />
        </g>
      ))}

      {/* Plant */}
      <g>
        <path d="M30 150h26l-4 30H34z" fill="#b9814f" />
        <g fill="#4d6b53">
          <path d="M43 150c-10-14-20-16-24-28 12 2 20 10 24 28z" />
          <path d="M43 150c6-18 14-24 26-26-4 12-12 18-26 26z" fill="#3f5a45" />
          <path d="M43 150c-2-18 0-28 6-38 4 12 2 24-6 38z" fill="#6a8a70" />
        </g>
      </g>

      {/* Counter */}
      <rect x="0" y="146" width="400" height="10" fill={`url(#${g('top')})`} />
      <rect x="0" y="156" width="400" height="64" fill={`url(#${g('wood')})`} />
      <g stroke="#241914" strokeOpacity="0.25" strokeWidth="2">
        {Array.from({ length: 13 }, (_, i) => (
          <path key={i} d={`M${16 + i * 31} 160v60`} />
        ))}
      </g>

      {/* Espresso machine */}
      <g>
        <rect x="212" y="104" width="96" height="42" rx="6" fill={`url(#${g('steel')})`} />
        <rect x="212" y="100" width="96" height="8" rx="3" fill="#50392b" />
        <rect x="222" y="112" width="76" height="8" rx="2" fill="#3b2a20" opacity="0.75" />
        <g fill="#3b2a20">
          <rect x="232" y="122" width="14" height="7" rx="2" />
          <rect x="274" y="122" width="14" height="7" rx="2" />
        </g>
        <path d="M234 134h10v6a5 5 0 0 1-10 0zM276 134h10v6a5 5 0 0 1-10 0z" fill="#f7f0e6" />
        <circle cx="300" cy="116" r="3" fill={evening ? '#f2b56b' : '#6a8a70'} />
      </g>

      {/* Cups and croissant on the counter */}
      <g>
        <path d="M120 132h18v8a9 9 0 0 1-18 0z" fill="#f7f0e6" />
        <path d="M138 135h3a4 4 0 0 1 0 8h-3" fill="none" stroke="#f7f0e6" strokeWidth="2" />
        <ellipse cx="129" cy="148" rx="14" ry="2.5" fill="#efe4d3" />
        <path d="M155 144c4-10 22-10 26 0-6-2-8 3-13 3s-7-5-13-3z" fill="#c98a3d" />
        <path d="M161 141c2-3 4-4 7-4M170 137c3 0 5 1 7 4" stroke="#8a5a12" strokeWidth="1.2" fill="none" />
        <path d="M340 128h16v10a8 8 0 0 1-16 0z" fill="#ecd3b6" />
        <path d="M344 120c-2 3 2 5 0 8M352 120c-2 3 2 5 0 8" stroke="#f7f0e6" strokeWidth="1.4" fill="none" opacity="0.7" strokeLinecap="round" />
      </g>

      {/* Customers at the counter; the last two stand between others, drawn behind them */}
      {[...shown.filter((c) => c.i >= 7), ...shown.filter((c) => c.i < 7)].map(({ x, i }) => (
        <Customer key={`${seed}-${i}`} x={x} look={(seed * 7 + i * 3) % 60} />
      ))}

      {/* Bottom shade so overlaid text stays legible */}
      {shaded ? <rect width="400" height="220" fill={`url(#${g('shade')})`} /> : null}
    </svg>
  );
}
