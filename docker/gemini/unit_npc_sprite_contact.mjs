// 대조용 이어붙이기(호출 없음): node unit_npc_sprite_contact.mjs out.png size a.png b.jpg ...  (회색 배경, contain)
import { createRequire } from 'node:module';
const sharp = createRequire('/sp/')('sharp');
const [out, sz, ...fs] = process.argv.slice(2); const S = +sz;
const ims = await Promise.all(fs.map((f) => sharp(f).resize(S, S, { fit: 'contain', background: '#808080', kernel: 'nearest' }).flatten({ background: '#808080' }).png().toBuffer()));
await sharp({ create: { width: S * fs.length, height: S, channels: 3, background: '#808080' } }).composite(ims.map((b, i) => ({ input: b, left: i * S, top: 0 }))).png().toFile(out);
console.log('ok', out);
