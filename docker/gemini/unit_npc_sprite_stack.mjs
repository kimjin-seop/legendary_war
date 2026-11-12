// 세로 쌓기(호출 없음): node unit_npc_sprite_stack.mjs out.png a.png b.png ...
import { createRequire } from 'node:module';
const sharp = createRequire('/sp/')('sharp');
const [out, ...fs] = process.argv.slice(2);
const ms = await Promise.all(fs.map((f) => sharp(f).metadata())); const W = Math.max(...ms.map((m) => m.width)); let y = 0; const comp = [];
for (let i = 0; i < fs.length; i++) { comp.push({ input: fs[i], left: 0, top: y }); y += ms[i].height; }
await sharp({ create: { width: W, height: y, channels: 3, background: '#202020' } }).composite(comp).png().toFile(out); console.log('ok');
