let ripples = [];

function setup() {
  createCanvas(380, 570);
  frameRate(24);
  noStroke();
}

function draw() {
  // 清澈海面渐变背景（深海蓝到浅青蓝，模拟通透海水）
  for (let y = 0; y < height; y++) {
    let t = map(y, 0, height, 0, 1);
    let r = lerp(30, 70, t);
    let g = lerp(90, 160, t);
    let b = lerp(150, 200, t);
    fill(r, g, b);
    rect(0, y, width, 1);
  }

  // 鼠标移动：生成新水波纹（利用mouseX mouseY）
  if (mouseIsPressed || (abs(mouseX - pmouseX) > 2 || abs(mouseY - pmouseY) > 2)) {
    // random 给波纹随机初始速度偏移，满足random函数作业考点
    ripples.push({
      x: mouseX,
      y: mouseY,
      radius: 0,
      maxRadius: random(45, 90),
      alpha: 160,
      speed: random(1.6, 2.8)
    });
  }

  // 更新+绘制所有波纹
  for (let i = ripples.length - 1; i >= 0; i--) {
    let rp = ripples[i];
    rp.radius += rp.speed;
    rp.alpha -= 2.2;

    // if条件判断：波纹超出最大半径 或者透明度<=0，删除（if条件语句考点）
    if (rp.radius > rp.maxRadius || rp.alpha <= 0) {
      ripples.splice(i, 1);
      continue;
    }

    // 绘制多层同心水波纹，模拟真实海面涟漪
    noFill();
    stroke(220, 245, 255, rp.alpha);
    strokeWeight(1.3);
    ellipse(rp.x, rp.y, rp.radius * 2, rp.radius * 0.75); // 椭圆涟漪，更像水面
    stroke(220, 245, 255, rp.alpha * 0.5);
    ellipse(rp.x, rp.y, rp.radius * 1.4, rp.radius * 0.55);
  }

  // 微弱环境细波纹，让海面不是死板静止
  stroke(200,235,250,35);
  for(let i=0;i<12;i++){
    let wx = (i*47 + frameCount*0.4) % width;
    let wy = 120 + i*38;
    ellipse(wx, wy, 26, 8);
  }
}