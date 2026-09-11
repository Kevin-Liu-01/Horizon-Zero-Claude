import sharp from 'sharp';
const [,, src, x, y, w, h, out, scale] = process.argv;
const s = sharp(src).extract({ left:+x, top:+y, width:+w, height:+h });
if (scale) s.resize({ width: Math.round(+w * +scale), kernel: 'nearest' });
await s.toFile(out);
console.log('wrote', out);
