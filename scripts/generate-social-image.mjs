import sharp from 'sharp';

const width = 1200;
const height = 630;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0b1425"/><stop offset="1" stop-color="#162b35"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1060" cy="-80" r="340" fill="#203d3b" opacity=".45"/>
  <circle cx="120" cy="650" r="300" fill="#183044" opacity=".6"/>
  <text x="525" y="255" fill="#ffffff" font-family="Arial,sans-serif" font-size="71" font-weight="700">Money Tree</text>
  <text x="525" y="338" fill="#ff983d" font-family="Arial,sans-serif" font-size="71" font-weight="700">Venture</text>
  <text x="530" y="410" fill="#c7d4df" font-family="Arial,sans-serif" font-size="26">Digital guides, learning resources</text>
  <text x="530" y="448" fill="#c7d4df" font-family="Arial,sans-serif" font-size="26">and 1:1 guidance</text>
  <rect x="530" y="492" width="236" height="5" rx="2" fill="#ff983d"/>
</svg>`;

await sharp(Buffer.from(svg)).composite([{ input: await sharp('src/app/icon.png').resize(360, 360).toBuffer(), left: 95, top: 135 }]).png().toFile('public/opengraph-image.png');
