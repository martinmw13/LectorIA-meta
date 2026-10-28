// Paper and drawing tool per skin for the Picture this slot. Pure SVG,
// no state: picture-draw.tsx animates the tool along the strokes.
import type { PictureSkin } from "./picture-skin";

export function Paper({ skin, grainId }: { skin: PictureSkin; grainId: string }) {
  if (skin === "pencil") {
    return (
      <g>
        <rect width="300" height="380" fill="#FAFAF8" />
        <rect width="300" height="380" filter={`url(#${grainId})`} opacity="0.45" />
        <path d="M0 330Q150 316 300 336V380H0Z" fill="#3C3F44" opacity="0.05" />
      </g>
    );
  }
  if (skin === "comic") {
    const dots = `${grainId}d`;
    return (
      <g>
        <defs>
          <pattern id={dots} width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.1" fill="#14161C" opacity="0.08" />
          </pattern>
        </defs>
        <rect width="300" height="380" fill="#FFFDF4" />
        <rect width="300" height="380" fill={`url(#${dots})`} />
        <rect x="12" y="12" width="276" height="356" fill="none" stroke="#14161C" strokeWidth="5" />
        <rect x="12" y="12" width="96" height="26" fill="#FFE45C" stroke="#14161C" strokeWidth="2.5" />
      </g>
    );
  }
  if (skin === "chihiro") {
    const dusk = `${grainId}k`;
    return (
      <g>
        <defs>
          <linearGradient id={dusk} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#CFE6EE" />
            <stop offset="0.42" stopColor="#FFE2C2" />
            <stop offset="0.75" stopColor="#FFF7EC" />
          </linearGradient>
        </defs>
        <rect width="300" height="380" fill={`url(#${dusk})`} />
        <rect width="300" height="380" filter={`url(#${grainId})`} opacity="0.35" />
      </g>
    );
  }
  if (skin === "watercolor") {
    return (
      <g>
        <path
          d="M3 4Q80 0 150 3T297 2L299 120Q296 250 299 377Q150 381 2 378Q-1 250 2 120Z"
          fill="#FFFDF8"
          stroke="#E4DCCB"
        />
        <rect width="300" height="380" filter={`url(#${grainId})`} opacity="0.5" />
      </g>
    );
  }
  if (skin === "ink") {
    return (
      <g>
        <rect width="300" height="380" fill="#FFFFFF" stroke="#E3E8F2" />
        {Array.from({ length: 14 }, (_, i) => 34 + i * 24).map((y) => (
          <path key={y} d={`M0 ${y}H300`} stroke="#0866FF" strokeOpacity="0.09" />
        ))}
        <path d="M38 0V380" stroke="#E5484D" strokeOpacity="0.25" />
      </g>
    );
  }
  return (
    <g>
      <rect width="300" height="380" fill="#F7F1DE" />
      <rect width="300" height="380" filter={`url(#${grainId})`} opacity="0.9" />
      <rect x="12" y="12" width="276" height="356" fill="none" stroke="#2A241C" strokeWidth="0.6" opacity="0.35" />
    </g>
  );
}

export function Tool({ skin }: { skin: PictureSkin }) {
  if (skin === "pencil") {
    return (
      <g>
        <path d="M0 0L4 -9L8.6 -6.8Z" fill="#3E4147" />
        <path d="M4 -9L8.6 -6.8L13 -16L7.4 -18.4Z" fill="#E9D3AE" />
        <path d="M7.4 -18.4L13 -16L31 -54L25.4 -56.6Z" fill="#7A8088" stroke="#3E4147" strokeWidth="0.8" />
        <path d="M25.4 -56.6L31 -54L33.4 -59L27.8 -61.6Z" fill="#C9CDD2" stroke="#3E4147" strokeWidth="0.8" />
      </g>
    );
  }
  if (skin === "comic") {
    return (
      <g>
        <path d="M0 0C-1 -4 1 -8 4 -10L9 -7C8 -4 4 -1 0 0Z" fill="#14161C" />
        <path d="M4 -10L22 -48L30 -44L9 -7Z" fill="#FFE45C" stroke="#14161C" strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 -44L23 -50L31 -46L28 -40Z" fill="#14161C" />
      </g>
    );
  }
  if (skin === "chihiro") {
    return (
      <g>
        <path d="M0 0C-1 -5 1 -10 5 -13C9 -10 10 -5 0 0Z" fill="#E3A23C" stroke="#5A3A2A" strokeWidth="0.8" />
        <path d="M4 -12L9 -21L14 -18L9 -9Z" fill="#1F6E62" stroke="#5A3A2A" strokeWidth="0.8" />
        <path d="M11.5 -19.5L34 -60" stroke="#C2412D" strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  if (skin === "watercolor") {
    return (
      <g>
        <path d="M0 0C-1 -5 1 -10 5 -13C9 -10 10 -5 0 0Z" fill="#7FB0FF" stroke="#1F2A44" strokeWidth="0.8" />
        <path d="M4 -12L9 -21L14 -18L9 -9Z" fill="#B7BEC9" stroke="#1F2A44" strokeWidth="0.8" />
        <path d="M11.5 -19.5L34 -60" stroke="#1F2A44" strokeWidth="5.2" strokeLinecap="round" />
      </g>
    );
  }
  if (skin === "ink") {
    return (
      <g>
        <path d="M0 0L3.4 -7.2L6.6 -5.6Z" fill="#1B1F2A" />
        <path d="M3.4 -7.2L22 -46L28.6 -42.8L6.6 -5.6Z" fill="#fff" stroke="#0866FF" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M19 -40L22.5 -47.5L29 -44.3L25.5 -36.8Z" fill="#0866FF" />
      </g>
    );
  }
  return (
    <g>
      <path d="M0 0L14 -26" stroke="#9AA1AA" strokeWidth="1.2" />
      <path d="M12.5 -23L28 -52" stroke="#2A241C" strokeWidth="5" strokeLinecap="round" />
      <path d="M13 -24L27 -50" stroke="#6B4A2A" strokeWidth="3.2" strokeLinecap="round" />
    </g>
  );
}
