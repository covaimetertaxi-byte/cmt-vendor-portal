import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>

  <!-- Full Background -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Subtle border accent -->
  <rect x="8" y="8" width="496" height="496" rx="104" fill="none" stroke="#eab308" stroke-width="4" stroke-opacity="0.3"/>

  <!-- Taxi Sign at top center -->
  <g transform="translate(196, 68)">
    <rect x="0" y="0" width="120" height="34" rx="8" fill="#fbbf24"/>
    <text x="60" y="24" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="#020617" text-anchor="middle" letter-spacing="2">TAXI</text>
  </g>

  <!-- Central Badge Box with Amber background -->
  <g transform="translate(96, 128)">
    <rect width="320" height="240" rx="36" fill="url(#goldGrad)"/>
    <!-- Bold CMT letters -->
    <text x="160" y="155" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="110" font-weight="950" fill="#020617" text-anchor="middle" letter-spacing="-2">CMT</text>
    <text x="160" y="205" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="#020617" text-anchor="middle" opacity="0.8" letter-spacing="3">COVAI METER</text>
  </g>

  <!-- Checkerboard taxi strip across bottom -->
  <g transform="translate(96, 400)">
    <rect x="0" y="0" width="40" height="20" fill="#fbbf24"/>
    <rect x="40" y="0" width="40" height="20" fill="#334155"/>
    <rect x="80" y="0" width="40" height="20" fill="#fbbf24"/>
    <rect x="120" y="0" width="40" height="20" fill="#334155"/>
    <rect x="160" y="0" width="40" height="20" fill="#fbbf24"/>
    <rect x="200" y="0" width="40" height="20" fill="#334155"/>
    <rect x="240" y="0" width="40" height="20" fill="#fbbf24"/>
    <rect x="280" y="0" width="40" height="20" fill="#334155"/>
  </g>
</svg>
`;

// Maskable icon with 15% safe padding
const maskableSvgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>

  <!-- Solid full bleed background (no border radius for maskable) -->
  <rect width="512" height="512" fill="url(#bgGrad)"/>

  <!-- Centered scaled content within safe 80% circle -->
  <g transform="translate(51.2, 51.2) scale(0.8)">
    <!-- Taxi Sign -->
    <g transform="translate(196, 68)">
      <rect x="0" y="0" width="120" height="34" rx="8" fill="#fbbf24"/>
      <text x="60" y="24" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="#020617" text-anchor="middle" letter-spacing="2">TAXI</text>
    </g>

    <!-- Central Badge Box with Amber background -->
    <g transform="translate(96, 128)">
      <rect width="320" height="240" rx="36" fill="url(#goldGrad)"/>
      <text x="160" y="155" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="110" font-weight="950" fill="#020617" text-anchor="middle" letter-spacing="-2">CMT</text>
      <text x="160" y="205" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="#020617" text-anchor="middle" opacity="0.8" letter-spacing="3">COVAI METER</text>
    </g>

    <!-- Checkerboard taxi strip -->
    <g transform="translate(96, 400)">
      <rect x="0" y="0" width="40" height="20" fill="#fbbf24"/>
      <rect x="40" y="0" width="40" height="20" fill="#334155"/>
      <rect x="80" y="0" width="40" height="20" fill="#fbbf24"/>
      <rect x="120" y="0" width="40" height="20" fill="#334155"/>
      <rect x="160" y="0" width="40" height="20" fill="#fbbf24"/>
      <rect x="200" y="0" width="40" height="20" fill="#334155"/>
      <rect x="240" y="0" width="40" height="20" fill="#fbbf24"/>
      <rect x="280" y="0" width="40" height="20" fill="#334155"/>
    </g>
  </g>
</svg>
`;

async function run() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write base SVG
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent.trim());

  // Generate pwa-512x512.png
  await sharp(Buffer.from(svgContent))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // Generate pwa-192x192.png
  await sharp(Buffer.from(svgContent))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // Generate apple-touch-icon.png (180x180)
  await sharp(Buffer.from(svgContent))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Generate maskable icon
  await sharp(Buffer.from(maskableSvgContent))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');

  console.log('All PWA icons successfully generated!');
}

run().catch(console.error);
