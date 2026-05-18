class Level {
  constructor(image, lines) {
    this.image = image;
    this.lines = lines;
  }
  get width() { return this.image.width; }
  get height() { return this.image.height; }
  draw(ctx, camera) {
    ctx.drawImage(this.image, -camera.x, -camera.y);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    for (const line of this.lines) line.show(ctx);
    ctx.restore();
  }
}
