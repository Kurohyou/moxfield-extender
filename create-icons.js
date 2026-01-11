const sharp = require('sharp');
const path = require('path');

const sizes = [16, 48, 128];

// Create a simple "M" icon using sharp
async function createIcons() {
  for (const size of sizes) {
    // Create SVG with the "M" letter
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#7aa2f7"/>
            <stop offset="100%" style="stop-color:#bb9af7"/>
          </linearGradient>
        </defs>
        <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#1a1b26"/>
        <text x="${size / 2}" y="${size * 0.72}" 
              font-family="Arial, sans-serif" 
              font-size="${size * 0.625}" 
              font-weight="bold" 
              text-anchor="middle" 
              fill="url(#grad)">M</text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(__dirname, 'icons', `icon${size}.png`));

    console.log(`Created icon${size}.png`);
  }
}

createIcons().catch(console.error);
