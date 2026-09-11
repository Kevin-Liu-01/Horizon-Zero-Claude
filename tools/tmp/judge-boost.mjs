import sharp from 'sharp';
const [,, src, out, x, y, w, h] = process.argv;
await sharp(src).extract({ left:+x, top:+y, width:+w, height:+h })
  .linear(2.2, -60).resize({ width: Math.round(+w*2), kernel:'nearest' }).toFile(out);
console.log('ok', out);
