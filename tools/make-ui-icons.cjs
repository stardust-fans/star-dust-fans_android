// 生成底部 dock / 顶栏所需的一整套线性图标（单色白，运行时用 tint 染色）
//   node tools/make-ui-icons.cjs
//
// 产物：res/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_*.png

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const require2 = createRequire(__filename);
const sharp = require2('F:/desktop/粉丝站/git/star-dust-fans/node_modules/sharp');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'app/src/main/res');

/** 统一的 24x24 线性图标：stroke 白、线宽 2、圆角端点 */
function icon(body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${body}
    </svg>`;
}

const ICONS = {
    // 我的：人像
    ic_tab_my: icon('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.9 3.4-6 7.5-6s7.5 2.1 7.5 6"/>'),
    // 视频：播放键
    ic_tab_videos: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10.5 9.5l4.5 2.5-4.5 2.5z" fill="#FFFFFF"/>'),
    // 同人：图片
    ic_tab_fanart: icon('<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M20.5 16l-4.8-4.8L8 18.9"/>'),
    // 量贩：购物车
    ic_tab_shop: icon('<circle cx="9.2" cy="20" r="1.5" fill="#FFFFFF"/><circle cx="17.8" cy="20" r="1.5" fill="#FFFFFF"/><path d="M3 4h2.2l2.5 10.6h10.4l2-7.6H6"/>'),
    // 论坛：气泡
    ic_tab_forum: icon('<path d="M20.5 11.6a8 8 0 01-8.5 8 9 9 0 01-3.2-.6L4 21l1.4-4.2A8 8 0 0111.6 4a8 8 0 018.9 7.6z"/>'),
    // 搜索
    ic_search: icon('<circle cx="10.8" cy="10.8" r="6.8"/><path d="M20 20l-4.3-4.3"/>'),
    // 设置：滑杆
    ic_settings: icon('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="1.8" fill="#0B0B14"/><circle cx="15" cy="12" r="1.8" fill="#0B0B14"/><circle cx="9" cy="17" r="1.8" fill="#0B0B14"/>'),
    // 无头像时的占位
    ic_avatar_placeholder: icon('<circle cx="12" cy="8.5" r="3.4"/><path d="M5 19.5c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>'),
};

// dp 尺寸 -> 目录
const DENSITIES = [
    ['drawable-mdpi', 24],
    ['drawable-hdpi', 36],
    ['drawable-xhdpi', 48],
    ['drawable-xxhdpi', 72],
    ['drawable-xxxhdpi', 96],
];

(async () => {
    let count = 0;
    for (const [dir, size] of DENSITIES) {
        const outDir = path.join(RES, dir);
        fs.mkdirSync(outDir, { recursive: true });
        for (const [name, svg] of Object.entries(ICONS)) {
            const png = await sharp(Buffer.from(svg), { density: 96 * (size / 24) })
                .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();
            fs.writeFileSync(path.join(outDir, `${name}.png`), png);
            count++;
        }
        console.log(`✅ ${dir}: ${Object.keys(ICONS).length} 个图标 (${size}x${size})`);
    }
    console.log(`\n共生成 ${count} 个图标`);
})().catch((e) => {
    console.error('❌ 生成失败：', e.message);
    process.exit(1);
});
