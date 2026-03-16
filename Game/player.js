window.PlayerController = (() => {
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
      standingPlatform: null
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
      player.vx = 0;
      if (keys.left) player.vx = -player.speed;
      if (keys.right) player.vx = player.speed;
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
    player.vx = directionalBoost * player.facing;
    player.grounded = false;
    player.isCharging = false;
    player.jumpCharge = 0;
    player.lockPositionUntilRelease = false;
    player.standingPlatform = null;
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
    }
  }

  function drawPlayer(ctx, player) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(player.x, player.y, player.w, player.h);

    const eyeOffset = player.facing < 0 ? -2 : player.facing > 0 ? 2 : 0;

    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(player.x + 5 + eyeOffset, player.y + 7, 6, 6);
    ctx.fillRect(player.x + player.w - 11 + eyeOffset, player.y + 7, 6, 6);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(player.x + 7, player.y + 22, player.w - 14, 4);

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