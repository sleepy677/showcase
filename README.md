# Showcase · 作品集

公开作品展示仓库。在线页面：**https://sleepy677.github.io/showcase/**

## 作品列表

| 作品 | 类型 | 说明 | 时间 |
| --- | --- | --- | --- |
| [躲避游戏 3D](projects/dodge-3d/) | 小游戏 · Three.js | WASD 在发光网格场地躲避能量球，撑满 180 秒 | 2026-11 |
| [运动轨迹](projects/motion-trajectory/) | 交互 · p5.js | 鼠标划过海面激起涟漪，透明衰减后消散 | 2026-11 |
| [几何构成](projects/geometric-composition/) | 生成艺术 · p5.js | 圆与方块按网格交替排布，颜色随坐标连续过渡的构成画面 | 2026-11 |

> 另有早期 2D 版本躲避游戏，保留在 [projects/dodge-forest/](projects/dodge-forest/)。

## 目录

```
showcase/
├── index.html      在线展示页（GitHub Pages 首页）
├── projects/       各个作品的子目录
└── README.md
```

## 添加作品

```bash
# 1. 新建作品目录
mkdir -p projects/作品名
cp -r /path/to/作品/* projects/作品名/

# 2. 提交推送
git add .
git commit -m "add: 作品名"
git push
```

## 联系方式

- GitHub：[@sleepy677](https://github.com/sleepy677)
