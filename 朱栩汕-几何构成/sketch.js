function setup() {
  createCanvas(380, 570);
  noStroke();
}

function draw() {
  background(240);
  let step = 62;

  for(let y = 30; y < height; y += step){
    for(let x = 30; x < width; x += step){
      // 颜色随x、y坐标连续过渡
      let r = map(x, 0, width, 40, 210);
      let g = map(y, 0, height, 100, 220);
      let b = map(x+y, 0, width+height, 180, 60);
      
      // 图形大小也跟着缓慢变化
      let size = map(x+y, 0, width+height, 32, 52);

      if( ((x + y)/step) % 2 === 0 ){
        fill(r, g, b);
        ellipse(x, y, size, size);
      }else{
        fill(g, b, r);
        rect(x - size/2, y - size/2, size, size);
      }
    }
  }
  noLoop();
}