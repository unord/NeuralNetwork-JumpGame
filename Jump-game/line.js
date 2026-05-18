class Line {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
  }
  isHorizontal() { return this.y1 === this.y2; }
  isVertical() { return this.x1 === this.x2; }
  minX() { return Math.min(this.x1, this.x2); }
  maxX() { return Math.max(this.x1, this.x2); }
  minY() { return Math.min(this.y1, this.y2); }
  maxY() { return Math.max(this.y1, this.y2); }
  show(ctx) {
    ctx.beginPath(); ctx.moveTo(this.x1, this.y1); ctx.lineTo(this.x2, this.y2);
    ctx.lineWidth = 4; ctx.strokeStyle = 'transparent'; //'rgba(255,0,0,.8)'; ctx.stroke();
  }
  isSlope() {
    return !this.isHorizontal() && !this.isVertical();
  }

  getYAtX(x) {
    const t = (x - this.x1) / (this.x2 - this.x1);
    return this.y1 + t * (this.y2 - this.y1);
  }

  getDownhillVector() {
    let dx = this.x2 - this.x1;
    let dy = this.y2 - this.y1;

    // Make sure vector points downhill.
    if (dy < 0) {
      dx *= -1;
      dy *= -1;
    }

    const len = Math.sqrt(dx * dx + dy * dy);

    return {
      x: dx / len,
      y: dy / len
    };
  }
}
