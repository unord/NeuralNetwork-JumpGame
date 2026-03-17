window.PlayerController = (() => {
  // Load player sprite images for directions
  const spritePaths = {
    left: './GFX/player_sprite_left.png',
    right: './GFX/player_sprite_right.png',
    forward: './GFX/player_sprite_forward.png'
  };
  const sprites = {};
  let spritesLoaded = { left: false, right: false, forward: false };
  for (const dir in spritePaths) {
    const img = new window.Image();
    img.src = spritePaths[dir];
    img.onload = () => {
      spritesLoaded[dir] = true;
    };
    sprites[dir] = img;
  }
  function createPlayer(width, height, defaults) {
    return {
      x: width / 2 - defaults.w / 2,
      y: height - 120,
      w: defaults.w,
      h: defaults.h,
      vx: 0,
      vy: 0,
      speed: defaults.speed,
      grounded: false,
      isCharging: false,
      jumpCharge: 0,
      facing: 1,
      lockPositionUntilRelease: false,
      standingPlatform: null,
      chargeCarryVx: 0
    };
  }

  function resetPlayer(player, width, height) {
    player.x = width / 2 - player.w / 2;
    player.y = height - 120;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    player.isCharging = false;
    player.jumpCharge = 0;
    player.facing = 1;
    player.lockPositionUntilRelease = false;
    player.standingPlatform = null;
    player.chargeCarryVx = 0;
  }

  function updateFacing(player, keys) {
    if (keys.left && !keys.right) {
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.facing = 1;
    } else {
      player.facing = 0;
    }
  }

  function updateHorizontalVelocity(player, keys, settings) {
    if (player.lockPositionUntilRelease) {
      player.vx = 0;
      return;
    }

    if (player.grounded) {
      const onIcy = player.standingPlatform && player.standingPlatform.type === 'icy';

      if (onIcy) {
        const accel = settings.icyGroundAccel || 0.3;
        const friction = settings.icyGroundFriction || 0.94;
        const maxSpeed = player.speed * (settings.icyMaxSpeedMultiplier || 1.25);

        if (keys.left) player.vx -= accel;
        if (keys.right) player.vx += accel;
        if (!keys.left && !keys.right) player.vx *= friction;

        if (player.vx > maxSpeed) player.vx = maxSpeed;
        if (player.vx < -maxSpeed) player.vx = -maxSpeed;
      } else {
        player.vx = 0;
        if (keys.left) player.vx = -player.speed;
        if (keys.right) player.vx = player.speed;
      }

      return;
    }

    if (settings.disableAirControlWhileJumping) {
      player.vx *= settings.airDrag;
      return;
    }

    if (keys.left) player.vx -= 0.12;
    if (keys.right) player.vx += 0.12;
    if (player.vx > player.speed) player.vx = player.speed;
    if (player.vx < -player.speed) player.vx = -player.speed;
    player.vx *= settings.airDrag;
  }

  function startJumpCharge(player) {
    if (player.grounded && !player.isCharging) {
      player.isCharging = true;
      player.jumpCharge = 0;
      player.chargeCarryVx = player.vx;
      player.lockPositionUntilRelease = true;
      player.vx = 0;
    }
  }

  function releaseJump(player, settings) {
    if (!player.isCharging || !player.grounded) return false;

    const forceRange = settings.maxJumpForce - settings.minJumpForce;
    const jumpForce = settings.minJumpForce + forceRange * player.jumpCharge;
    const directionalRange = settings.maxDirectionalBoost - settings.minDirectionalBoost;
    const directionalBoost = settings.minDirectionalBoost + directionalRange * player.jumpCharge;

    player.vy = -jumpForce;
    player.vx = player.chargeCarryVx + directionalBoost * player.facing;
    player.grounded = false;
    player.isCharging = false;
    player.jumpCharge = 0;
    player.lockPositionUntilRelease = false;
    player.standingPlatform = null;
    player.chargeCarryVx = 0;
    return true;
  }

  function updateCharge(player, settings) {
    if (player.isCharging && player.grounded) {
      player.jumpCharge = Math.min(1, player.jumpCharge + settings.chargePerFrame);
      if (player.jumpCharge >= 1) {
        releaseJump(player, settings);
      }
    }

    if (!player.grounded && player.isCharging) {
      player.isCharging = false;
      player.jumpCharge = 0;
      player.lockPositionUntilRelease = false;
      player.chargeCarryVx = 0;
    }
  }

  function drawPlayer(ctx, player) {
    let dir = 'forward';
    if (player.facing < 0) dir = 'left';
    else if (player.facing > 0) dir = 'right';

    const idleSettings = window.GameConfig.settings;
    const isIdle = player.grounded && !player.isCharging && Math.abs(player.vx) < 0.15 && Math.abs(player.vy) < 0.15;
    const now = performance.now();
    const bobOffset = isIdle ? Math.sin(now * idleSettings.idleBobSpeed) * idleSettings.idleBobAmplitude : 0;
    const tiltOffset = isIdle ? Math.sin(now * idleSettings.idleTiltSpeed) * idleSettings.idleTiltAmplitude : 0;

    const sprite = sprites[dir];
    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2 + bobOffset);
    ctx.rotate(tiltOffset);

    if (spritesLoaded[dir]) {
      ctx.drawImage(sprite, -player.w / 2, -player.h / 2, player.w, player.h);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
    }
    ctx.restore();

    if (player.isCharging) {
      const barW = player.w;
      const fillW = Math.floor(barW * player.jumpCharge);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(player.x, player.y - 8, barW, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(player.x, player.y - 8, fillW, 4);
    }
  }

  return {
    createPlayer,
    resetPlayer,
    updateFacing,
    updateHorizontalVelocity,
    startJumpCharge,
    releaseJump,
    updateCharge,
    drawPlayer
  };
})();