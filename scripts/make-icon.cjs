const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

(async () => {
  const root = path.resolve(__dirname, '..');
  const build = path.join(root, 'build');
  const linuxIcons = path.join(build, 'icons');
  fs.mkdirSync(build, { recursive: true });
  fs.mkdirSync(linuxIcons, { recursive: true });
  const source = path.join(build, 'homeflix-icon.svg');
  const png = path.join(build, 'homeflix-icon.png');
  const ico = path.join(build, 'homeflix.ico');
  await sharp(source).resize(512, 512).png().toFile(path.join(linuxIcons, '512x512.png'));
  await sharp(source).resize(256, 256).png().toFile(png);
  fs.writeFileSync(ico, await pngToIco(png));
  console.log('Generated HomeFlix Windows and Linux icons.');
})().catch(error => { console.error(error); process.exit(1); });
