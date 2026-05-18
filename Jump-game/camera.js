class Camera {
  constructor(viewWidth, viewHeight) { this.x = 0; this.y = 0; this.viewWidth = viewWidth; this.viewHeight = viewHeight; }
  update(player, level) {
    const targetX = player.x + player.w / 2 - this.viewWidth / 2;
    const targetY = player.y + player.h / 2 - this.viewHeight / 2;
    this.x = clamp(targetX, 0, Math.max(0, level.width - this.viewWidth));
    this.y = clamp(targetY, 0, Math.max(0, level.height - this.viewHeight));
  }
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
