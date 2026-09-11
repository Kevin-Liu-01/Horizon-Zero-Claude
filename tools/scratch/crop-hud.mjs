import sharp from 'sharp';
const [,, src, out, l, t, w, h, scale] = process.argv;
await sharp(src).extract({ left:+l, top:+t, width:+w, height:+h })
  .resize({ width: Math.round(+w * (+scale||3)), kernel: 'nearest' }).png().toFile(out);
console.log('ok', out);
