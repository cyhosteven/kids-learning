// 吉祥物「獅寶」：原創的圓臉小獅子，純 SVG（不用任何外部美術）。
export function mascotSvg(mood = "happy") {
  const mane = Array.from({ length: 12 }, (_, k) => {
    const a = (2 * Math.PI * k) / 12;
    return `<circle cx="${(50 + Math.cos(a) * 30).toFixed(1)}" cy="${(52 + Math.sin(a) * 30).toFixed(1)}" r="13" fill="#e07a1f"/>`;
  }).join("");
  const mouth = mood === "cheer"
    ? '<path d="M40 64 Q50 78 60 64 Z" fill="#8a3b12"/>'
    : '<path d="M42 64 Q50 71 58 64" stroke="#8a3b12" stroke-width="3" fill="none" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${mane}
    <circle cx="50" cy="52" r="30" fill="#e07a1f"/>
    <circle cx="27" cy="27" r="9" fill="#ffc94d"/><circle cx="73" cy="27" r="9" fill="#ffc94d"/>
    <circle cx="27" cy="27" r="4.5" fill="#f2a63a"/><circle cx="73" cy="27" r="4.5" fill="#f2a63a"/>
    <circle cx="50" cy="54" r="24" fill="#ffc94d"/>
    <circle cx="41" cy="48" r="3.6" fill="#2c3a2a"/><circle cx="59" cy="48" r="3.6" fill="#2c3a2a"/>
    <circle cx="42.2" cy="46.8" r="1.2" fill="#fff"/><circle cx="60.2" cy="46.8" r="1.2" fill="#fff"/>
    <ellipse cx="34" cy="58" rx="5" ry="3" fill="#ff9e80" opacity=".7"/><ellipse cx="66" cy="58" rx="5" ry="3" fill="#ff9e80" opacity=".7"/>
    <path d="M45 56 Q50 61 55 56 Q50 54 45 56 Z" fill="#8a4b1c"/>
    ${mouth}
  </svg>`;
}
