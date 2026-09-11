import sharp from 'sharp';
const [,, src, ...boxes] = process.argv;
for (const b of boxes) {
  const [x, y, w, h, label] = b.split(',');
  const { data, info } = await sharp(src).extract({ left:+x, top:+y, width:+w, height:+h }).raw().toBuffer({ resolveWithObject: true });
  let r=0,g=0,bl=0; const n = info.width*info.height;
  for (let i=0;i<n;i++){ r+=data[i*info.channels]; g+=data[i*info.channels+1]; bl+=data[i*info.channels+2]; }
  const R=r/n,G=g/n,B=bl/n;
  console.log(`${label||b}: RGB ${R.toFixed(0)}/${G.toFixed(0)}/${B.toFixed(0)}  luma ${(0.2126*R+0.7152*G+0.0722*B).toFixed(1)}`);
}
