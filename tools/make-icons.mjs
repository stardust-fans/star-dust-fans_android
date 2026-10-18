// 由站点 logo 生成启动图标，并生成通知用的小图标（白色星形）。
// 产物已入库，构建时不再需要运行本脚本。
//
//   node tools/make-icons.mjs
//
// 依赖：站点仓库里的 sharp（用绝对路径引用，避免在本项目里再装一份）。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SITE_REPO = 'F:/desktop/粉丝站/git/star-dust-fans';
const sharp = require(`${SITE_REPO}/node_modules/sharp`);

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const resDir = resolve(projectRoot, 'app/src/main/res');

const logoSvg = readFileSync(`${SITE_REPO}/static/logo.svg`);

const BACKGROUND = '#0B0B14';
const INSET = 0.16; // 四周留白占比

const DENSITIES = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192],
];

const NOTIFICATION_STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <path fill="#FFFFFF" d="M24 3.5l5.9 12.1 13.3 1.9-9.6 9.4 2.3 13.2L24 33.9 12.1 40.1l2.3-13.2-9.6-9.4 13.3-1.9z"/>
</svg>`;

async function makeLauncherIcon(size) {
    const inner = Math.max(16, Math.round(size * (1 - INSET * 2)));
    const logo = await sharp(logoSvg, { density: 1024 })
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

    const canvas = await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: BACKGROUND,
        },
    })
        .png()
        .toBuffer();

    return sharp(canvas)
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toBuffer();
}

async function main() {
    for (const [dir, size] of DENSITIES) {
        const buffer = await makeLauncherIcon(size);
        const outPath = resolve(resDir, dir, 'ic_launcher.png');
        writeFileSync(outPath, buffer);
        console.log(`✅ ${dir}/ic_launcher.png (${size}x${size}, ${buffer.length} B)`);
    }

    const star = await sharp(Buffer.from(NOTIFICATION_STAR_SVG), { density: 384 })
        .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    const starPath = resolve(resDir, 'drawable', 'ic_stat_star.png');
    writeFileSync(starPath, star);
    console.log(`✅ drawable/ic_stat_star.png (96x96, ${star.length} B)`);
}

main().catch((error) => {
    console.error('❌ 生成图标失败：', error.message);
    process.exit(1);
});
