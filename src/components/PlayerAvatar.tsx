import { useId } from 'react';
import { AVATAR_OPTIONS as O, type Avatar } from '../game/profile';

/*
 * Avatar del giocatore: un ritratto disegnato (SVG) in tuta da pilota.
 * Carnagione, capelli, occhi, sopracciglia, bocca, barba, occhiali e colore della tuta li sceglie il giocatore.
 */

// colore più scuro (ombre, naso, orecchie)
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// capelli dietro la testa (lunghi, afro, coda, chignon)
function HairBack({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'afro':
      return <circle cx="60" cy="44" r="33" fill={color} />;
    case 'long':
      return <path d="M32 50 C30 26 44 16 60 16 C76 16 90 26 88 50 L92 92 C80 98 72 94 70 84 L50 84 C48 94 40 98 28 92 Z" fill={color} />;
    case 'wavy':
      return <path d="M33 50 C30 26 44 17 60 17 C76 17 90 26 87 50 C92 62 88 72 92 80 C84 86 78 80 76 74 L44 74 C42 80 36 86 28 80 C32 72 28 62 33 50 Z" fill={color} />;
    case 'ponytail':
      return <path d="M80 34 C96 36 100 56 94 76 C92 82 86 80 87 74 C90 60 88 46 78 42 Z" fill={color} />;
    case 'bun':
      return <circle cx="60" cy="19" r="10" fill={color} />;
    case 'bob':
      return <path d="M30 50 C28 24 44 14 60 14 C76 14 92 24 90 50 L91 76 C87 82 81 82 79 77 L41 77 C39 82 33 82 29 76 Z" fill={color} />;
    case 'longbangs':
    case 'longfront':
      return <path d="M32 50 C30 26 44 16 60 16 C76 16 90 26 88 50 L92 92 C80 98 72 94 70 84 L50 84 C48 94 40 98 28 92 Z" fill={color} />;
    case 'pigtails':
      return (
        <g>
          <path d="M36 40 C21 43 15 62 19 80 C21 87 28 85 28 78 C26 65 28 53 37 47 Z" fill={color} />
          <path d="M84 40 C99 43 105 62 101 80 C99 87 92 85 92 78 C94 65 92 53 83 47 Z" fill={color} />
          <circle cx="35" cy="44" r="3.4" fill="#e0457b" />
          <circle cx="85" cy="44" r="3.4" fill="#e0457b" />
        </g>
      );
    case 'spacebuns':
      return (
        <g fill={color}>
          <circle cx="40" cy="21" r="11" />
          <circle cx="80" cy="21" r="11" />
        </g>
      );
    case 'afropuffs':
      return (
        <g fill={color}>
          <circle cx="31" cy="27" r="15" />
          <circle cx="89" cy="27" r="15" />
        </g>
      );
    case 'highpony':
      return (
        <g>
          <path d="M64 18 C86 6 106 22 101 50 C99 66 93 78 95 92 C86 88 83 72 86 57 C89 41 83 29 70 27 Z" fill={color} />
          <circle cx="68" cy="20" r="3.4" fill="#e0457b" />
        </g>
      );
    case 'curlylong':
      return (
        <g fill={color}>
          {[
            [34, 30], [86, 30], [29, 42], [91, 42], [28, 54], [92, 54], [28, 66], [92, 66], [30, 78], [90, 78], [35, 88], [85, 88],
            [46, 20], [60, 16], [74, 20],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="10" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

// capelli davanti alle spalle (trecce, ciocche lunghe): sopra la tuta ma sotto il viso
function HairOver({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'braid':
      return (
        <g fill={color}>
          {[62, 70, 78, 86, 94, 102].map((y, i) => (
            <ellipse key={y} cx={80 + i * 1.4} cy={y} rx={6.5 - i * 0.4} ry="5.2" stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
          ))}
          <circle cx="88.4" cy="108" r="3" fill="#e0457b" />
          <path d="M86 110 C84 116 88 118 90 116 C92 118 95 114 91 110 Z" />
        </g>
      );
    case 'longfront':
      return (
        <g fill={color}>
          <path d="M36 58 C31 72 29 88 25 106 C31 109 38 106 40 99 C41 86 43 74 43 62 Z" />
          <path d="M84 58 C89 72 91 88 95 106 C89 109 82 106 80 99 C79 86 77 74 77 62 Z" />
        </g>
      );
    default:
      return null;
  }
}

// capelli davanti (sopra la fronte)
function HairFront({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'buzz':
      return <path d="M36 48 C35 30 46 22 60 22 C74 22 85 30 84 48 C80 38 72 32 60 32 C48 32 40 38 36 48 Z" fill={color} opacity="0.75" />;
    case 'short':
      return <path d="M35 51 C32 28 46 19 61 19 C77 19 89 29 85 51 C83 42 79 36 73 33 C66 38 50 39 43 35 C39 40 36 45 35 51 Z" fill={color} />;
    case 'sidepart':
      return (
        <path d="M35 52 C31 28 45 18 62 18 C79 18 90 29 85 50 C82 40 76 33 67 31 C58 33 46 37 40 42 C37 45 36 48 35 52 Z M62 18 C56 22 52 28 50 34" fill={color} />
      );
    case 'curly':
    case 'curlylong':
      return (
        <g fill={color}>
          {[
            [38, 40, 8], [44, 30, 9], [54, 24, 9], [66, 24, 9], [76, 30, 9], [82, 40, 8], [48, 34, 7], [60, 30, 8], [72, 34, 7],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case 'afro':
      return <path d="M34 50 C30 30 42 18 60 18 C78 18 90 30 86 50 C80 38 70 34 60 34 C50 34 40 38 34 50 Z" fill={color} />;
    case 'long':
    case 'wavy':
      return <path d="M34 54 C30 28 45 18 60 18 C75 18 90 28 86 54 C82 40 74 32 64 30 C56 36 44 40 34 54 Z" fill={color} />;
    case 'ponytail':
    case 'bun':
    case 'pigtails':
    case 'spacebuns':
    case 'afropuffs':
    case 'highpony':
      return <path d="M35 50 C33 28 46 21 60 21 C74 21 87 28 85 50 C81 38 72 31 60 31 C48 31 39 38 35 50 Z" fill={color} />;
    case 'bob':
    case 'longbangs':
      // frangia dritta
      return <path d="M34 54 C31 27 45 17 60 17 C75 17 89 27 86 54 L84 42 L36 42 Z" fill={color} />;
    case 'braid':
    case 'longfront':
      return <path d="M34 54 C30 28 45 18 60 18 C75 18 90 28 86 54 C82 40 74 32 64 30 C56 36 44 40 34 54 Z" fill={color} />;
    case 'pixie':
      return (
        <path d="M35 52 C32 28 46 18 62 18 C78 18 89 28 85 47 C81 38 72 33 61 34 C53 35 46 39 42 46 C40 44 37 47 35 52 Z M41 45 C47 31 66 27 79 35 C68 33 55 38 45 48 Z" fill={color} />
      );
    case 'mohawk':
      return <path d="M53 34 C51 22 54 10 60 6 C66 10 69 22 67 34 C64 31 56 31 53 34 Z" fill={color} />;
    case 'spiky':
      return (
        <path d="M35 50 C34 38 36 30 40 26 L38 16 L48 22 L52 10 L58 20 L66 8 L68 20 L78 12 L78 24 L88 22 C86 30 87 40 85 50 C80 38 72 32 60 32 C48 32 40 38 35 50 Z" fill={color} />
      );
    default:
      return null; // calvo
  }
}

function Eyes({ style, color }: { style: string; color: string }) {
  const dark = '#1d1a18';
  const eye = (x: number, wink = false) => {
    if (wink) return <path d={`M${x - 5} 57 Q${x} 54 ${x + 5} 57`} stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" />;
    switch (style) {
      case 'happy':
        return <path d={`M${x - 5} 58 Q${x} 52 ${x + 5} 58`} stroke={dark} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
      case 'narrow':
        return (
          <g>
            <ellipse cx={x} cy="56" rx="5" ry="2.6" fill="#fff" />
            <circle cx={x} cy="56" r="2.2" fill={color} />
            <path d={`M${x - 5.5} 54.5 Q${x} 52.5 ${x + 5.5} 54.5`} stroke={dark} strokeWidth="1.4" fill="none" />
          </g>
        );
      case 'big':
        return (
          <g>
            <ellipse cx={x} cy="56" rx="5.4" ry="6" fill="#fff" />
            <circle cx={x} cy="57" r="3.6" fill={color} />
            <circle cx={x} cy="57" r="1.8" fill={dark} />
            <circle cx={x + 1.2} cy="55.4" r="1" fill="#fff" />
          </g>
        );
      default:
        return (
          <g>
            <ellipse cx={x} cy="56" rx="4.4" ry="4" fill="#fff" />
            <circle cx={x} cy="56.4" r="2.8" fill={color} />
            <circle cx={x} cy="56.4" r="1.4" fill={dark} />
            <circle cx={x + 0.9} cy="55.3" r="0.8" fill="#fff" />
          </g>
        );
    }
  };
  return (
    <g>
      {eye(50)}
      {eye(70, style === 'wink')}
    </g>
  );
}

function Brows({ style, color }: { style: string; color: string }) {
  const w = style === 'thick' ? 3.4 : 2;
  const d =
    style === 'arched'
      ? ['M44 48 Q50 43 56 47', 'M64 47 Q70 43 76 48']
      : style === 'straight'
        ? ['M44 47 L56 46.5', 'M64 46.5 L76 47']
        : style === 'raised'
          ? ['M44 46 Q50 41 56 45', 'M64 47 Q70 45 76 48']
          : ['M44 48 Q50 45 56 47', 'M64 47 Q70 45 76 48'];
  return (
    <g stroke={color} strokeWidth={w} strokeLinecap="round" fill="none">
      <path d={d[0]} />
      <path d={d[1]} />
    </g>
  );
}

function Mouth({ style }: { style: string }) {
  const lip = '#8e3b36';
  switch (style) {
    case 'grin':
      return (
        <g>
          <path d="M51 69 Q60 79 69 69 Z" fill="#5c1f1c" />
          <path d="M52.5 69.6 L67.5 69.6 L66.5 72 L53.5 72 Z" fill="#fff" />
        </g>
      );
    case 'neutral':
      return <path d="M53 71 L67 71" stroke={lip} strokeWidth="2.2" strokeLinecap="round" />;
    case 'open':
      return <ellipse cx="60" cy="72" rx="4.5" ry="3.6" fill="#5c1f1c" />;
    case 'smirk':
      return <path d="M53 71 Q62 73 68 68" stroke={lip} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    case 'tongue':
      return (
        <g>
          <path d="M52 69 Q60 77 68 69 Z" fill="#5c1f1c" />
          <path d="M56 71.5 Q60 79 64 71.5 Z" fill="#e8737a" />
        </g>
      );
    default:
      return <path d="M52 69 Q60 76 68 69" stroke={lip} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  }
}

function Beard({ style, color }: { style: string; color: string }) {
  switch (style) {
    case 'stubble':
      return <path d="M37 58 C37 80 48 88 60 88 C72 88 83 80 83 58 C80 70 72 76 60 76 C48 76 40 70 37 58 Z" fill={color} opacity="0.3" />;
    case 'moustache':
      return <path d="M50 66.5 C54 63 58 64 60 65.5 C62 64 66 63 70 66.5 C66 68 62 67.5 60 66.8 C58 67.5 54 68 50 66.5 Z" fill={color} />;
    case 'goatee':
      return (
        <g fill={color}>
          <path d="M52 66.5 C55 64 58 65 60 66 C62 65 65 64 68 66.5 C64 67.8 56 67.8 52 66.5 Z" />
          <path d="M54 77 C55 84 65 84 66 77 C63 79 57 79 54 77 Z" />
        </g>
      );
    case 'full':
      return (
        <path
          d="M36 56 C36 82 47 91 60 91 C73 91 84 82 84 56 C82 64 80 68 76 69 C72 65 66 64 60 65.5 C54 64 48 65 44 69 C40 68 38 64 36 56 Z M53 72 Q60 76 67 72 Q60 80 53 72 Z"
          fill={color}
          fillRule="evenodd"
        />
      );
    case 'chinstrap':
      return <path d="M36 54 C36 82 47 90 60 90 C73 90 84 82 84 54 L82 54 C81 74 72 84 60 84 C48 84 39 74 38 54 Z" fill={color} />;
    default:
      return null;
  }
}

function Glasses({ style }: { style: string }) {
  const frame = '#1f2228';
  switch (style) {
    case 'round':
      return (
        <g stroke={frame} strokeWidth="1.8" fill="none">
          <circle cx="50" cy="56" r="7" />
          <circle cx="70" cy="56" r="7" />
          <path d="M57 56 Q60 53.5 63 56 M43 55 L36 53 M77 55 L84 53" />
        </g>
      );
    case 'square':
      return (
        <g stroke={frame} strokeWidth="2" fill="none">
          <rect x="42" y="50.5" width="15" height="11" rx="2" />
          <rect x="63" y="50.5" width="15" height="11" rx="2" />
          <path d="M57 55 L63 55 M42 54 L36 52.5 M78 54 L84 52.5" />
        </g>
      );
    case 'aviator':
      return (
        <g>
          <path d="M42 51 L57 51 C57 59 55 63 49.5 63 C44 63 42 58 42 51 Z M63 51 L78 51 C78 58 76 63 70.5 63 C65 63 63 59 63 51 Z" fill="#c9a227" fillOpacity="0.28" stroke="#b08a1e" strokeWidth="1.5" />
          <path d="M57 52 L63 52 M42 52 L36 51 M78 52 L84 51" stroke="#b08a1e" strokeWidth="1.5" />
        </g>
      );
    case 'sunglasses':
      return (
        <g>
          <path d="M41 51 L58 51 C58 59 56 63 49.5 63 C43 63 41 58 41 51 Z M62 51 L79 51 C79 58 77 63 70.5 63 C64 63 62 59 62 51 Z" fill="#121418" />
          <path d="M58 52 L62 52 M41 52 L35 51 M79 52 L85 51" stroke="#121418" strokeWidth="2" />
          <path d="M44 53 L49 53" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

// inquadratura: tutto il ritratto, solo la testa (capelli) o solo il viso (occhi, bocca, barba, occhiali)
const VIEW = { full: '9 6 102 114', head: '22 2 76 76', face: '33 38 54 54' };
export type AvatarZoom = keyof typeof VIEW;

export function AvatarSvg({ avatar, zoom = 'full' }: { avatar: Avatar; zoom?: AvatarZoom }) {
  const id = useId().replace(/:/g, '');
  const skin = O.skin[avatar.skin] ?? O.skin[0];
  const hairStyle = O.hair[avatar.hair] ?? 'short';
  const hair = O.hairColor[avatar.hairColor] ?? O.hairColor[0];
  const suit = O.suit[avatar.suit] ?? O.suit[0];
  const light = suit === '#f4f4f5' || suit === '#ffd800';
  return (
    <svg viewBox={VIEW[zoom]} aria-hidden>
      <defs>
        <radialGradient id={`f${id}`} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </radialGradient>
      </defs>
      <HairBack style={hairStyle} color={hair} />
      {/* tuta da pilota: spalle, colletto, zip e una striscia */}
      <path d="M12 122 C14 98 34 87 60 87 C86 87 106 98 108 122 Z" fill={suit} />
      <path d="M22 122 C24 104 32 96 40 92 L44 96 C38 100 32 110 31 122 Z" fill={light ? '#15171d' : '#ffffff'} opacity="0.25" />
      <path d="M44 86 C48 94 72 94 76 86 L74 82 C68 88 52 88 46 82 Z" fill={light ? '#2a2d34' : '#ffffff'} opacity="0.9" />
      <path d="M60 92 L60 122" stroke={light ? '#2a2d34' : '#ffffff'} strokeOpacity="0.45" strokeWidth="1.5" />
      {/* collo e orecchie */}
      <path d="M50 72 L70 72 L70 86 C66 90 54 90 50 86 Z" fill={shade(skin, 0.86)} />
      <HairOver style={hairStyle} color={hair} />
      <ellipse cx="35.5" cy="57" rx="5" ry="6.5" fill={shade(skin, 0.92)} />
      <ellipse cx="84.5" cy="57" rx="5" ry="6.5" fill={shade(skin, 0.92)} />
      {/* viso */}
      <path d="M36 52 C36 30 46 22 60 22 C74 22 84 30 84 52 C84 74 74 86 60 86 C46 86 36 74 36 52 Z" fill={skin} />
      <path d="M36 52 C36 30 46 22 60 22 C74 22 84 30 84 52 C84 74 74 86 60 86 C46 86 36 74 36 52 Z" fill={`url(#f${id})`} />
      <Beard style={O.beard[avatar.beard] ?? 'none'} color={hair} />
      <HairFront style={hairStyle} color={hair} />
      <Brows style={O.brows[avatar.brows] ?? 'natural'} color={hairStyle === 'bald' ? shade(skin, 0.55) : hair} />
      <Eyes style={O.eyes[avatar.eyes] ?? 'round'} color={O.eyeColor[avatar.eyeColor] ?? O.eyeColor[0]} />
      <path d="M60 58 C58.5 62 57.5 64 59 65.5 C60.2 66.3 62 66 63 65" stroke={shade(skin, 0.7)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Mouth style={O.mouth[avatar.mouth] ?? 'smile'} />
      <Glasses style={O.glasses[avatar.glasses] ?? 'none'} />
    </svg>
  );
}

// L'avatar in un cerchio, del colore della tuta.
export function PlayerAvatar({
  avatar,
  size = 40,
  zoom,
  className = '',
}: {
  avatar: Avatar;
  size?: number;
  zoom?: AvatarZoom;
  className?: string;
}) {
  const suit = O.suit[avatar.suit] ?? O.suit[0];
  return (
    <span className={`player-avatar ${className}`} style={{ width: size, height: size, ['--suit' as string]: suit }} aria-hidden>
      <AvatarSvg avatar={avatar} zoom={zoom} />
    </span>
  );
}
