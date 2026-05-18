class Player {
  constructor(x, y) {
    this.spawnX = x;
    this.spawnY = y;

    this.x = x;
    this.y = y;
    this.w = 42;
    this.h = 70;

    this.vx = 0;
    this.vy = 0;
    this.onGround = false;

    // Ground movement
    this.walkSpeed = 5;

    // Jump charging
    this.isChargingJump = false;
    this.jumpWasReleased = true;
    this.jumpCharge = 0;          // 0 to 1
    this.chargeTime = 0.7;
    this.jumpDirection = 0;

    this.minStandingJumpPower = 1.4;
    this.maxStandingJumpPower = 29.5;

    this.minSideJumpPower = 6.0;
    this.maxSideJumpPower = 29.5;

    this.minSideJumpXPower = 7.5;
    this.maxSideJumpXPower = 10;

    // Physics
    this.gravity = 0.85;
    this.maxFall = 22;

    //idle animation
    this.animFrame = 0;
    this.animTimer = 0;
    this.facing = 1;

    this.idleFrames = [
      idle1,
      idle1,
      idle2,
      idle2,
      idle3,
      idle3,
      idle2,
      idle2,
      idle1,
      idle1,
      idle4,
      idle4
    ];

  }

  reset() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.isChargingJump = false;
    this.jumpCharge = 0;
    this.jumpWasReleased = true;
    this.jumpDirection = 0;
  }

  update(level) {
    const dt = 1 / 60;

    const left = keys['ArrowLeft'] || keys['a'] || keys['A'];
    const right = keys['ArrowRight'] || keys['d'] || keys['D'];
    const jump = keys[' '] || keys['ArrowUp'] || keys['w'] || keys['W'];

    if (!jump) {
      this.jumpWasReleased = true;
      this.jumpDirection = 0;
    }

    if (this.onGround) {

      // Start charging
      if (jump && this.jumpWasReleased && !this.isChargingJump) {
        this.isChargingJump = true;
        this.jumpCharge = 0;
        this.vx = 0;
      }

      // Continue charging
      if (this.isChargingJump) {

        // Update locked direction while charging
        if (left && !right) {
          this.jumpDirection = -1;
          this.facing = -1;
        }

        if (right && !left) {
          this.jumpDirection = 1;
          this.facing = 1;
        }

        this.jumpCharge += dt / this.chargeTime;
        this.vx = 0;

        // Auto jump
        if (this.jumpCharge >= 1) {
          this.jumpCharge = 1;
          this.jumpWasReleased = false;
          this.releaseJump();
        }

        // Released early
        else if (!jump) {
          this.jumpWasReleased = false;
          this.releaseJump();
        }

      } else {

        // Normal walking
        this.vx = (right ? this.walkSpeed : 0) - (left ? this.walkSpeed : 0);

        if (this.vx > 0) {
          this.facing = 1;
        }

        if (this.vx < 0) {
          this.facing = -1;
        }
      }
    } else {
      this.isChargingJump = false;
      this.jumpCharge = 0;
    }

    // Idle animation
    this.animTimer++;

    if (this.animTimer >= 6) {
      this.animTimer = 0;

      this.animFrame++;
      this.animFrame %= this.idleFrames.length;
    }

    this.moveX(level);
    this.vy = Math.min(this.vy + this.gravity, this.maxFall);
    this.moveY(level);
    this.checkLevelTransition();
  }

  releaseJump() {
    const charge = Math.max(0, Math.min(1, this.jumpCharge));

    const direction = this.jumpDirection;
    
    if (direction !== 0) {
      this.facing = direction;
    }

    if (direction === 0) {
      const jumpPower = lerp(
        this.minStandingJumpPower,
        this.maxStandingJumpPower,
        charge
      );

      this.vx = 0;
      this.vy = -jumpPower;

    } else {
      const jumpPower = lerp(
        this.minSideJumpPower,
        this.maxSideJumpPower,
        charge
      );

      const jumpXPower = lerp(
        this.minSideJumpXPower,
        this.maxSideJumpXPower,
        charge
      );

      this.vx = direction * jumpXPower;
      this.vy = -jumpPower;
    }

    this.onGround = false;
    this.isChargingJump = false;
    this.jumpCharge = 0;
  }

  moveX(level) {
    this.x += this.vx;

    for (const line of level.lines) {
      if (!line.isVertical()) continue;
      if (this.y + this.h <= line.minY() || this.y >= line.maxY()) continue;

      // Hit wall from the left while moving right.
      if (this.vx > 0 && this.x + this.w > line.x1 && this.x < line.x1) {
        this.x = line.x1 - this.w;
        this.hitWall();
      }

      // Hit wall from the right while moving left.
      if (this.vx < 0 && this.x < line.x1 && this.x + this.w > line.x1) {
        this.x = line.x1;
        this.hitWall();
      }
    }

    // Outer image borders also act like walls.
    if (this.x < 0) {
      this.x = 0;
      this.hitWall();
    }
    if (this.x + this.w > level.width) {
      this.x = level.width - this.w;
      this.hitWall();
    }
  }

  hitWall() {
    if (this.onGround) {
      this.vx = 0;
    } else {
      this.vx = -this.vx * 0.7;
    }
  }

  moveY(level) {
    const oldY = this.y;
    this.y += this.vy;
    this.onGround = false;

    // Horizontal collisions
    for (const line of level.lines) {
      if (!line.isHorizontal()) continue;
      if (this.x + this.w <= line.minX() || this.x >= line.maxX()) continue;

      // Falling: land on a horizontal line.
      if (this.vy >= 0 && oldY + this.h <= line.y1 && this.y + this.h >= line.y1) {
        this.y = line.y1 - this.h;
        this.vy = 0;
        this.onGround = true;
      }

      // Jumping: hit underside of a horizontal line.
      if (this.vy < 0 && oldY >= line.y1 && this.y <= line.y1) {
        this.y = line.y1;
        this.vy = 0;
      }
    }

    // Slope collisions
    const oldX = this.x - this.vx;

    const samplePoints = [
      { oldX: oldX + this.w * 0.25, newX: this.x + this.w * 0.25 },
      { oldX: oldX + this.w * 0.50, newX: this.x + this.w * 0.50 },
      { oldX: oldX + this.w * 0.75, newX: this.x + this.w * 0.75 }
    ];

    for (const line of level.lines) {
      if (!line.isSlope()) continue;

      for (const p of samplePoints) {
        if (p.newX < line.minX() || p.newX > line.maxX()) continue;

        const oldSlopeY = line.getYAtX(p.oldX);
        const newSlopeY = line.getYAtX(p.newX);

        const oldBottom = oldY + this.h;
        const newBottom = this.y + this.h;

        const crossedSlope =
          oldBottom <= oldSlopeY &&
          newBottom >= newSlopeY;

        const alreadyInsideSlope =
          newBottom >= newSlopeY &&
          newBottom <= newSlopeY + 18;

        if (crossedSlope || alreadyInsideSlope) {
          this.y = newSlopeY - this.h;

          const downhill = line.getDownhillVector();

          // Project current velocity onto the slope.
          let slopeSpeed = this.vx * downhill.x + this.vy * downhill.y;

          // Gravity pulls the player along the slope.
          slopeSpeed += this.gravity * downhill.y;

          this.vx = downhill.x * slopeSpeed;
          this.vy = downhill.y * slopeSpeed;

          this.onGround = false;
          return;
        }
      }
    }
  }

  checkLevelTransition() {
    // Go up to next level
    if (this.y + this.h < 0) {
      if (currentLevelIndex < levels.length - 1) {
        currentLevelIndex++;

        const nextLevel = levels[currentLevelIndex];
        this.y = nextLevel.height - this.h - 2;
      } else {
        this.y = 0;
        this.vy = 0;
      }
    }

    // Fall down to previous level
    if (this.y > levels[currentLevelIndex].height) {
      if (currentLevelIndex > 0) {
        currentLevelIndex--;

        this.y = -this.h + 2;
      } else {
        this.y = levels[currentLevelIndex].height - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    }
  }

  draw(ctx, camera) {
    ctx.save();

    ctx.translate(this.x - camera.x, this.y - camera.y);

    const img = this.idleFrames[this.animFrame];

    const spriteScaleX = 2.7;
    const spriteScaleY = 1.5;

    const spriteW = this.w * spriteScaleX;
    const spriteH = this.h * spriteScaleY;

    ctx.save();

    if (this.facing === 1) {

      ctx.scale(-1, 1);

      ctx.drawImage(
        img,
        -((-(spriteW - this.w) / 2) + spriteW),
        -(spriteH - this.h),
        spriteW,
        spriteH
      );

    } else {

      ctx.drawImage(
        img,
        -(spriteW - this.w) / 2,
        -(spriteH - this.h),
        spriteW,
        spriteH
      );
    }

    ctx.restore();

    // Small charge bar above the player.
    if (this.isChargingJump) {
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(-8, -18, this.w + 16, 8);

      ctx.fillStyle = '#00ff66';
      ctx.fillRect(-8, -18, (this.w + 16) * this.jumpCharge, 8);
    }

    ctx.restore();
  }
}
