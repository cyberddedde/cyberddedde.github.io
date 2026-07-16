document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSnakeGame();
});

function initNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');

  if (!toggle || !nav) {
    return;
  }

  const closeNav = () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeNav();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNav();
    }
  });
}

function initSnakeGame() {
  const canvas = document.getElementById('snake-canvas');
  const startButton = document.getElementById('game-start');
  const pauseButton = document.getElementById('game-pause');
  const restartButton = document.getElementById('game-restart');
  const speedSelect = document.getElementById('speed-select');
  const stateLabel = document.getElementById('game-state');
  const scoreLabel = document.getElementById('game-score');
  const bestLabel = document.getElementById('game-best-score');
  const touchButtons = document.querySelectorAll('.touch-controls [data-dir]');

  if (!canvas || !startButton || !pauseButton || !restartButton || !speedSelect || !stateLabel || !scoreLabel || !bestLabel) {
    return;
  }

  const context = canvas.getContext('2d');
  const grid = { cols: 30, rows: 20 };
  const storageKey = 'tette-snake-best-score';
  const speedMap = {
    slow: 170,
    normal: 120,
    fast: 80,
  };

  const state = {
    snake: [],
    food: { x: 0, y: 0 },
    direction: { x: 1, y: 0 },
    queuedDirection: { x: 1, y: 0 },
    score: 0,
    bestScore: Number(localStorage.getItem(storageKey) || 0),
    started: false,
    paused: false,
    gameOver: false,
    accumulator: 0,
    lastFrameTime: 0,
    loopId: 0,
    stepMs: speedMap[speedSelect.value] || speedMap.normal,
  };

  window.__snakeGame = {
    getState: () => ({
      snake: state.snake.map((segment) => ({ ...segment })),
      food: { ...state.food },
      direction: { ...state.direction },
      queuedDirection: { ...state.queuedDirection },
      score: state.score,
      bestScore: state.bestScore,
      started: state.started,
      paused: state.paused,
      gameOver: state.gameOver,
      stepMs: state.stepMs,
    }),
    startGame,
    pauseGame: togglePause,
    queueDirection,
    step,
    render,
    setSpeed,
  };

  bestLabel.textContent = String(state.bestScore);
  scoreLabel.textContent = '0';
  render();
  ensureLoop();

  startButton.addEventListener('click', () => startGame());
  pauseButton.addEventListener('click', () => {
    if (!state.started || state.gameOver) return;
    state.paused = !state.paused;
    updateStatus();
    render();
  });
  restartButton.addEventListener('click', () => startGame());
  speedSelect.addEventListener('change', () => setSpeed(speedSelect.value));

  document.addEventListener('keydown', (event) => {
    const dir = keyToDirection(event.key);
    if (dir) {
      event.preventDefault();
      if (!state.started || state.gameOver) {
        startGame(dir);
        return;
      }
      queueDirection(dir);
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      togglePause();
    }
    if (event.key === 'Enter' && state.gameOver) {
      event.preventDefault();
      startGame();
    }
  });

  touchButtons.forEach((button) => {
    button.addEventListener('pointerdown', () => {
      const dir = keyToDirection(button.dataset.dir || '');
      if (!dir) return;
      if (!state.started || state.gameOver) {
        startGame(dir);
        return;
      }
      queueDirection(dir);
    });
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.started || state.gameOver) {
      startGame();
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const target = toGridPoint(x, y, bounds.width, bounds.height);
    const head = state.snake[0];
    const dx = target.x - head.x;
    const dy = target.y - head.y;
    const nextDirection = Math.abs(dx) > Math.abs(dy)
      ? { x: Math.sign(dx), y: 0 }
      : { x: 0, y: Math.sign(dy) };
    if (nextDirection.x || nextDirection.y) {
      queueDirection(nextDirection);
    }
  });

  window.addEventListener('resize', render);

  function setSpeed(level) {
    state.stepMs = speedMap[level] || speedMap.normal;
    render();
  }

  function startGame(initialDirection) {
    state.snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    state.direction = initialDirection || { x: 1, y: 0 };
    state.queuedDirection = { ...state.direction };
    state.food = randomFood();
    state.score = 0;
    state.started = true;
    state.paused = false;
    state.gameOver = false;
    state.accumulator = 0;
    state.lastFrameTime = 0;
    updateScore();
    updateStatus('게임 시작');
    render();
  }

  function togglePause() {
    if (!state.started || state.gameOver) return;
    state.paused = !state.paused;
    updateStatus();
    render();
  }

  function queueDirection(nextDirection) {
    const current = state.queuedDirection || state.direction;
    if (isOpposite(current, nextDirection)) return;
    state.queuedDirection = nextDirection;
  }

  function keyToDirection(key) {
    switch (key.toLowerCase()) {
      case 'arrowup':
      case 'w':
      case 'up':
        return { x: 0, y: -1 };
      case 'arrowdown':
      case 's':
      case 'down':
        return { x: 0, y: 1 };
      case 'arrowleft':
      case 'a':
      case 'left':
        return { x: -1, y: 0 };
      case 'arrowright':
      case 'd':
      case 'right':
        return { x: 1, y: 0 };
      default:
        return null;
    }
  }

  function isOpposite(a, b) {
    return a.x + b.x === 0 && a.y + b.y === 0;
  }

  function step() {
    if (!state.started || state.paused || state.gameOver) return;

    if (!isOpposite(state.direction, state.queuedDirection)) {
      state.direction = state.queuedDirection;
    }

    const head = state.snake[0];
    const nextHead = {
      x: head.x + state.direction.x,
      y: head.y + state.direction.y,
    };

    if (hitsWall(nextHead) || hitsSelf(nextHead)) {
      state.gameOver = true;
      state.started = true;
      state.paused = false;
      updateStatus('게임 오버');
      render();
      return;
    }

    state.snake.unshift(nextHead);

    if (nextHead.x === state.food.x && nextHead.y === state.food.y) {
      state.score += 10;
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        localStorage.setItem(storageKey, String(state.bestScore));
        bestLabel.textContent = String(state.bestScore);
      }
      state.food = randomFood();
      updateScore();
      updateStatus('음식을 먹었습니다');
    } else {
      state.snake.pop();
    }

    render();
  }

  function hitsWall(position) {
    return position.x < 0 || position.y < 0 || position.x >= grid.cols || position.y >= grid.rows;
  }

  function hitsSelf(position) {
    return state.snake.some((segment) => segment.x === position.x && segment.y === position.y);
  }

  function randomFood() {
    let next = { x: 0, y: 0 };
    do {
      next = {
        x: Math.floor(Math.random() * grid.cols),
        y: Math.floor(Math.random() * grid.rows),
      };
    } while (state.snake.some((segment) => segment.x === next.x && segment.y === next.y));
    return next;
  }

  function toGridPoint(x, y, width, height) {
    return {
      x: Math.max(0, Math.min(grid.cols - 1, Math.floor((x / width) * grid.cols))),
      y: Math.max(0, Math.min(grid.rows - 1, Math.floor((y / height) * grid.rows))),
    };
  }

  function updateScore() {
    scoreLabel.textContent = String(state.score);
  }

  function updateStatus(text) {
    if (text) {
      stateLabel.textContent = text;
      return;
    }
    if (!state.started) {
      stateLabel.textContent = '준비됨';
    } else if (state.gameOver) {
      stateLabel.textContent = '게임 오버';
    } else if (state.paused) {
      stateLabel.textContent = '일시정지';
    } else {
      stateLabel.textContent = '진행 중';
    }
  }

  function ensureLoop() {
    if (state.loopId) return;

    const loop = (timestamp) => {
      if (!state.lastFrameTime) {
        state.lastFrameTime = timestamp;
      }

      const elapsed = timestamp - state.lastFrameTime;
      state.lastFrameTime = timestamp;

      if (state.started && !state.paused && !state.gameOver) {
        state.accumulator += elapsed;
        while (state.accumulator >= state.stepMs) {
          step();
          state.accumulator -= state.stepMs;
          if (state.gameOver) {
            state.accumulator = 0;
            break;
          }
        }
      }

      render();
      state.loopId = window.requestAnimationFrame(loop);
    };

    state.loopId = window.requestAnimationFrame(loop);
  }

  function render() {
    const bounds = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(bounds.width * dpr));
    const height = Math.max(1, Math.floor(bounds.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (!context) return;

    const cellWidth = canvas.width / grid.cols;
    const cellHeight = canvas.height / grid.rows;
    const cellSize = Math.min(cellWidth, cellHeight);
    const offsetX = (canvas.width - cellSize * grid.cols) / 2;
    const offsetY = (canvas.height - cellSize * grid.rows) / 2;

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(offsetX, offsetY, cellSize);
    drawFood(offsetX, offsetY, cellSize);
    drawSnake(offsetX, offsetY, cellSize);
    drawOverlay(offsetX, offsetY, cellSize);
    updateStatus();
  }

  function drawGrid(offsetX, offsetY, cellSize) {
    context.save();
    context.translate(offsetX, offsetY);
    context.strokeStyle = 'rgba(84, 215, 255, 0.05)';
    context.lineWidth = 1;

    for (let x = 0; x <= grid.cols; x += 1) {
      context.beginPath();
      context.moveTo(x * cellSize + 0.5, 0);
      context.lineTo(x * cellSize + 0.5, grid.rows * cellSize);
      context.stroke();
    }

    for (let y = 0; y <= grid.rows; y += 1) {
      context.beginPath();
      context.moveTo(0, y * cellSize + 0.5);
      context.lineTo(grid.cols * cellSize, y * cellSize + 0.5);
      context.stroke();
    }

    context.restore();
  }

  function drawFood(offsetX, offsetY, cellSize) {
    context.save();
    context.translate(offsetX, offsetY);
    const centerX = state.food.x * cellSize + cellSize / 2;
    const centerY = state.food.y * cellSize + cellSize / 2;
    const radius = cellSize * 0.34;
    const gradient = context.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
    gradient.addColorStop(0, '#fff4c2');
    gradient.addColorStop(1, '#ff8a3d');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawSnake(offsetX, offsetY, cellSize) {
    context.save();
    context.translate(offsetX, offsetY);

    state.snake.forEach((segment, index) => {
      const padding = index === 0 ? cellSize * 0.1 : cellSize * 0.16;
      const x = segment.x * cellSize + padding;
      const y = segment.y * cellSize + padding;
      const size = cellSize - padding * 2;
      const ratio = 1 - index / Math.max(state.snake.length, 1);
      context.fillStyle = index === 0
        ? '#baf4ff'
        : `rgba(${Math.round(84 + ratio * 40)}, ${Math.round(215 - ratio * 25)}, 255, ${0.8 - index * 0.02})`;
      roundRect(context, x, y, size, size, size * 0.3);
      context.fill();
    });

    context.restore();
  }

  function drawOverlay(offsetX, offsetY, cellSize) {
    if (!state.started) {
      drawCenterMessage('시작 버튼을 누르거나 방향키를 누르세요.', offsetX, offsetY, cellSize);
      return;
    }

    if (state.paused) {
      drawCenterMessage('일시정지', offsetX, offsetY, cellSize);
      return;
    }

    if (state.gameOver) {
      drawCenterMessage('게임 오버 - 재시작을 눌러 다시 시작하세요.', offsetX, offsetY, cellSize);
    }
  }

  function drawCenterMessage(message, offsetX, offsetY, cellSize) {
    context.save();
    context.fillStyle = 'rgba(4, 11, 20, 0.58)';
    context.fillRect(offsetX, offsetY, grid.cols * cellSize, grid.rows * cellSize);
    context.fillStyle = '#eaf7ff';
    context.font = `${Math.max(16, Math.round(cellSize * 0.9))}px "Segoe UI", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    wrapText(message, offsetX + (grid.cols * cellSize) / 2, offsetY + (grid.rows * cellSize) / 2, grid.cols * cellSize * 0.68, cellSize * 1.25);
    context.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let line = '';

    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (context.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });

    if (line) {
      lines.push(line);
    }

    const totalHeight = (lines.length - 1) * lineHeight;
    lines.forEach((part, index) => {
      context.fillText(part, x, y - totalHeight / 2 + index * lineHeight);
    });
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}
