import sharp from 'sharp';
const [,, src, x, y, w, h] = process.argv;
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const W = info.width, C = info.channels;
let n=0, hot=0, sat=0, lum=0;
for (let j=+y;j<+y+ +h;j++) for (let i=+x;i<+x+ +w;i++){
  const o=(j*W+i)*C, R=data[o],G=data[o+1],B=data[o+2];
  const mx=Math.max(R,G,B), mn=Math.min(R,G,B), L=0.2126*R+0.7152*G+0.0722*B;
  lum+=L; sat+= mx?(mx-mn)/mx:0;
  if (L>225 && (mx?(mx-mn)/mx:0)<0.12) hot++;
  n++;
}
console.log(src.split('/').pop(), JSON.stringify({nearWhiteFrac:+(hot/n).toFixed(3), meanLum:+(lum/n).toFixed(1), meanSat:+(sat/n).toFixed(3)}));
