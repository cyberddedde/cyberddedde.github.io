document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSnakeGame();
  initMinesweeperGame();
  initTetrisGame();
});

function initNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');

  if (!toggle || !nav) return;

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
    if (event.key === 'Escape') closeNav();
  });
}

function initSnakeGame() {
  const canvas = document.getElementById('snake-canvas');
  const startButton = document.getElementById('snake-start');
  const pauseButton = document.getElementById('snake-pause');
  const restartButton = document.getElementById('snake-restart');
  const speedSelect = document.getElementById('snake-speed-select');
  const stateLabel = document.getElementById('snake-state');
  const scoreLabel = document.getElementById('snake-score');
  const bestLabel = document.getElementById('snake-best-score');
  const touchButtons = document.querySelectorAll('.touch-controls [data-dir]');

  if (!canvas || !startButton || !pauseButton || !restartButton || !speedSelect || !stateLabel || !scoreLabel || !bestLabel) {
    return;
  }

  const context = canvas.getContext('2d');
  const grid = { cols: 30, rows: 20 };
  const storageKey = 'tette-snake-best-score';
  const speedMap = { slow: 170, normal: 120, fast: 80 };

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
  pauseButton.addEventListener('click', () => togglePause());
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

    if (line) lines.push(line);

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

function initMinesweeperGame() {
  const boardEl = document.getElementById('mine-board');
  const levelSelect = document.getElementById('mine-level-select');
  const revealModeButton = document.getElementById('mine-reveal-mode');
  const flagModeButton = document.getElementById('mine-flag-mode');
  const stateLabel = document.getElementById('mine-state');
  const remainingLabel = document.getElementById('mine-remaining');
  const levelLabel = document.getElementById('mine-level-label');
  const startButton = document.getElementById('mine-start');
  const nextButton = document.getElementById('mine-next');
  const restartButton = document.getElementById('mine-restart');

  if (!boardEl || !levelSelect || !revealModeButton || !flagModeButton || !stateLabel || !remainingLabel || !levelLabel || !startButton || !nextButton || !restartButton) {
    return;
  }

  const levels = Array.from({ length: 10 }, (_, index) => {
    const size = 6 + index;
    return {
      label: `${index + 1}단계 · ${size} x ${size}`,
      rows: size,
      cols: size,
      mines: Math.min(size * size - 1, 5 + index * 4),
    };
  });

  const state = {
    levelIndex: 0,
    mode: 'reveal',
    board: [],
    gameOver: false,
    cleared: false,
    revealedCount: 0,
    totalSafe: 0,
  };

  populateLevels();
  setMode('reveal');
  setupLevel(0);

  window.__mineGame = {
    getState: () => ({
      levelIndex: state.levelIndex,
      mode: state.mode,
      gameOver: state.gameOver,
      cleared: state.cleared,
      revealedCount: state.revealedCount,
      totalSafe: state.totalSafe,
    }),
    setupLevel,
    revealAtIndex,
    toggleFlagAtIndex,
  };

  levelSelect.addEventListener('change', () => {
    setupLevel(Number(levelSelect.value) || 0);
  });

  revealModeButton.addEventListener('click', () => setMode('reveal'));
  flagModeButton.addEventListener('click', () => setMode('flag'));
  startButton.addEventListener('click', () => setupLevel(state.levelIndex));
  restartButton.addEventListener('click', () => setupLevel(state.levelIndex));
  nextButton.addEventListener('click', () => {
    if (state.levelIndex < levels.length - 1) {
      setupLevel(state.levelIndex + 1);
    }
  });

  boardEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const cell = event.target.closest('[data-index]');
    if (!cell) return;
    toggleFlagAtIndex(Number(cell.dataset.index));
  });

  boardEl.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-index]');
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (state.mode === 'flag') {
      toggleFlagAtIndex(index);
    } else {
      revealAtIndex(index);
    }
  });

  function populateLevels() {
    levelSelect.innerHTML = levels
      .map((level, index) => `<option value="${index}">${level.label}</option>`)
      .join('');
  }

  function setMode(mode) {
    state.mode = mode;
    revealModeButton.classList.toggle('is-active', mode === 'reveal');
    flagModeButton.classList.toggle('is-active', mode === 'flag');
    updateStatus();
  }

  function setupLevel(levelIndex) {
    const safeIndex = Math.max(0, Math.min(levels.length - 1, levelIndex));
    const config = levels[safeIndex];
    state.levelIndex = safeIndex;
    state.gameOver = false;
    state.cleared = false;
    state.revealedCount = 0;
    state.board = createBoard(config);
    levelSelect.value = String(safeIndex);
    renderBoard();
    updateStatus('준비됨');
  }

  function createBoard(config) {
    const total = config.rows * config.cols;
    const board = Array.from({ length: total }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }));
    const minePositions = new Set();
    while (minePositions.size < config.mines) {
      minePositions.add(Math.floor(Math.random() * total));
    }
    minePositions.forEach((index) => {
      board[index].mine = true;
    });
    board.forEach((cell, index) => {
      if (cell.mine) return;
      cell.adjacent = countAdjacentMines(index, config.cols, config.rows, board);
    });
    state.totalSafe = total - config.mines;
    remainingLabel.textContent = String(config.mines);
    levelLabel.textContent = String(state.levelIndex + 1);
    nextButton.hidden = true;
    return board;
  }

  function countAdjacentMines(index, cols, rows, board) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nr = row + dy;
        const nc = col + dx;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        if (board[nr * cols + nc].mine) count += 1;
      }
    }
    return count;
  }

  function renderBoard() {
    const config = levels[state.levelIndex];
    boardEl.style.gridTemplateColumns = `repeat(${config.cols}, minmax(0, 1fr))`;
    boardEl.innerHTML = state.board
      .map((cell, index) => {
        const content = cell.revealed
          ? (cell.mine ? '' : cell.adjacent || '')
          : (cell.flagged ? '⚑' : '');
        const classes = ['mine-cell'];
        if (cell.revealed) classes.push('revealed');
        if (cell.flagged) classes.push('flagged');
        if (cell.mine && (state.gameOver || cell.revealed)) classes.push('mine');
        return `<button type="button" class="${classes.join(' ')}" data-index="${index}" data-adjacent="${cell.adjacent}" aria-label="지뢰찾기 칸 ${index + 1}">${content}</button>`;
      })
      .join('');
  }

  function revealAtIndex(index) {
    const cell = state.board[index];
    if (!cell || state.gameOver || state.cleared || cell.flagged || cell.revealed) return;

    if (cell.mine) {
      cell.revealed = true;
      state.gameOver = true;
      revealAllMines();
      renderBoard();
      updateStatus('게임 오버');
      return;
    }

    floodReveal(index);
    renderBoard();

    if (state.revealedCount >= state.totalSafe) {
      state.cleared = true;
      updateStatus('클리어');
      nextButton.hidden = state.levelIndex >= levels.length - 1;
      if (!nextButton.hidden) {
        nextButton.textContent = '다음 단계';
      }
    } else {
      updateStatus();
    }
  }

  function floodReveal(startIndex) {
    const queue = [startIndex];
    const visited = new Set();
    const config = levels[state.levelIndex];

    while (queue.length) {
      const index = queue.shift();
      if (visited.has(index)) continue;
      visited.add(index);
      const cell = state.board[index];
      if (!cell || cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      state.revealedCount += 1;
      if (cell.adjacent !== 0) continue;
      for (const neighbor of neighborsOf(index, config.cols, config.rows)) {
        const nextCell = state.board[neighbor];
        if (nextCell && !nextCell.revealed && !nextCell.mine) {
          queue.push(neighbor);
        }
      }
    }
  }

  function neighborsOf(index, cols, rows) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nr = row + dy;
        const nc = col + dx;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        neighbors.push(nr * cols + nc);
      }
    }
    return neighbors;
  }

  function toggleFlagAtIndex(index) {
    const cell = state.board[index];
    if (!cell || state.gameOver || state.cleared || cell.revealed) return;
    cell.flagged = !cell.flagged;
    renderBoard();
    updateStatus();
  }

  function revealAllMines() {
    state.board.forEach((cell) => {
      if (cell.mine) {
        cell.revealed = true;
      }
    });
  }

  function updateStatus(forceText) {
    if (forceText) {
      stateLabel.textContent = forceText;
    } else if (state.gameOver) {
      stateLabel.textContent = '게임 오버';
    } else if (state.cleared) {
      stateLabel.textContent = '클리어';
    } else {
      stateLabel.textContent = `입력 모드: ${state.mode === 'reveal' ? '열기' : '깃발'}`;
    }
    const remaining = Math.max(0, levels[state.levelIndex].mines - state.board.filter((cell) => cell.flagged).length);
    remainingLabel.textContent = String(remaining);
    levelLabel.textContent = String(state.levelIndex + 1);
  }
}

function initTetrisGame() {
  const canvas = document.getElementById('tetris-canvas');
  const startButton = document.getElementById('tetris-start');
  const pauseButton = document.getElementById('tetris-pause');
  const restartButton = document.getElementById('tetris-restart');
  const levelSelect = document.getElementById('tetris-level-select');
  const stateLabel = document.getElementById('tetris-state');
  const scoreLabel = document.getElementById('tetris-score');
  const linesLabel = document.getElementById('tetris-lines');
  const levelLabel = document.getElementById('tetris-level-label');
  const controlButtons = document.querySelectorAll('.tetris-controls [data-tetris]');

  if (!canvas || !startButton || !pauseButton || !restartButton || !levelSelect || !stateLabel || !scoreLabel || !linesLabel || !levelLabel) {
    return;
  }

  const context = canvas.getContext('2d');
  const cols = 10;
  const rows = 20;
  const cellSize = 30;
  const tetrisLevels = Array.from({ length: 10 }, (_, index) => ({
    label: `${index + 1}단계 · 목표 ${5 + index * 4}줄`,
    dropMs: Math.max(120, 900 - index * 75),
    targetLines: 5 + index * 4,
  }));

  const PIECES = {
    I: { color: '#66e3ff', matrix: [[1, 1, 1, 1]] },
    J: { color: '#6d8dff', matrix: [[1, 0, 0], [1, 1, 1]] },
    L: { color: '#ffab66', matrix: [[0, 0, 1], [1, 1, 1]] },
    O: { color: '#f6db6d', matrix: [[1, 1], [1, 1]] },
    S: { color: '#7ee6a2', matrix: [[0, 1, 1], [1, 1, 0]] },
    T: { color: '#d18cff', matrix: [[0, 1, 0], [1, 1, 1]] },
    Z: { color: '#ff7f8a', matrix: [[1, 1, 0], [0, 1, 1]] },
  };
  const pieceTypes = Object.keys(PIECES);

  const state = {
    levelIndex: 0,
    board: createEmptyBoard(),
    current: null,
    score: 0,
    lines: 0,
    paused: false,
    started: false,
    gameOver: false,
    cleared: false,
    lastFrameTime: 0,
    accumulator: 0,
    loopId: 0,
    dropMs: tetrisLevels[0].dropMs,
    targetLines: tetrisLevels[0].targetLines,
  };

  populateLevels();
  setupLevel(0);

  window.__tetrisGame = {
    getState: () => ({
      levelIndex: state.levelIndex,
      score: state.score,
      lines: state.lines,
      paused: state.paused,
      started: state.started,
      gameOver: state.gameOver,
      cleared: state.cleared,
    }),
    setupLevel,
    startGame,
    step,
    rotateCurrent,
    moveCurrent,
    hardDrop,
    render,
  };

  startButton.addEventListener('click', () => startGame());
  pauseButton.addEventListener('click', () => togglePause());
  restartButton.addEventListener('click', () => startGame());
  levelSelect.addEventListener('change', () => setupLevel(Number(levelSelect.value) || 0));

  controlButtons.forEach((button) => {
    button.addEventListener('pointerdown', () => {
      if (!state.started || state.gameOver || state.cleared) {
        startGame();
      }
      const action = button.dataset.tetris;
      switch (action) {
        case 'left':
          moveCurrent(-1, 0);
          break;
        case 'right':
          moveCurrent(1, 0);
          break;
        case 'down':
          softDrop();
          break;
        case 'rotate':
          rotateCurrent();
          break;
        case 'drop':
          hardDrop();
          break;
        default:
          break;
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      togglePause();
      return;
    }

    const key = event.key.toLowerCase();
    const actionMap = {
      arrowleft: () => moveCurrent(-1, 0),
      a: () => moveCurrent(-1, 0),
      arrowright: () => moveCurrent(1, 0),
      d: () => moveCurrent(1, 0),
      arrowdown: () => softDrop(),
      s: () => softDrop(),
      arrowup: () => rotateCurrent(),
      w: () => rotateCurrent(),
      enter: () => {
        if (state.gameOver || state.cleared) startGame();
      },
    };

    if (actionMap[key]) {
      event.preventDefault();
      if (!state.started || state.gameOver || state.cleared) {
        startGame();
        return;
      }
      actionMap[key]();
    }
  });

  window.addEventListener('resize', render);
  render();
  ensureLoop();

  function populateLevels() {
    levelSelect.innerHTML = tetrisLevels
      .map((level, index) => `<option value="${index}">${level.label}</option>`)
      .join('');
  }

  function setupLevel(levelIndex) {
    const safeIndex = Math.max(0, Math.min(tetrisLevels.length - 1, levelIndex));
    state.levelIndex = safeIndex;
    state.dropMs = tetrisLevels[safeIndex].dropMs;
    state.targetLines = tetrisLevels[safeIndex].targetLines;
    state.board = createEmptyBoard();
    state.current = null;
    state.score = 0;
    state.lines = 0;
    state.paused = false;
    state.started = false;
    state.gameOver = false;
    state.cleared = false;
    state.lastFrameTime = 0;
    state.accumulator = 0;
    levelSelect.value = String(safeIndex);
    scoreLabel.textContent = '0';
    linesLabel.textContent = '0';
    levelLabel.textContent = String(state.levelIndex + 1);
    updateStatus('준비됨');
    spawnPiece();
    render();
  }

  function createEmptyBoard() {
    return Array.from({ length: rows }, () => Array(cols).fill(null));
  }

  function startGame() {
    setupLevel(state.levelIndex);
    state.started = true;
    state.paused = false;
    state.gameOver = false;
    state.cleared = false;
    updateStatus('게임 시작');
    render();
  }

  function togglePause() {
    if (!state.started || state.gameOver || state.cleared) return;
    state.paused = !state.paused;
    updateStatus();
    render();
  }

  function ensureLoop() {
    if (state.loopId) return;

    const loop = (timestamp) => {
      if (!state.lastFrameTime) state.lastFrameTime = timestamp;
      const elapsed = timestamp - state.lastFrameTime;
      state.lastFrameTime = timestamp;

      if (state.started && !state.paused && !state.gameOver && !state.cleared) {
        state.accumulator += elapsed;
        while (state.accumulator >= state.dropMs) {
          step();
          state.accumulator -= state.dropMs;
          if (state.gameOver || state.cleared) {
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

  function step() {
    if (!state.started || state.paused || state.gameOver || state.cleared) return;
    if (!moveCurrent(0, 1)) {
      lockPiece();
    }
  }

  function softDrop() {
    if (!state.started || state.paused || state.gameOver || state.cleared) return;
    if (!moveCurrent(0, 1)) {
      lockPiece();
    } else {
      state.score += 1;
      scoreLabel.textContent = String(state.score);
    }
    render();
  }

  function hardDrop() {
    if (!state.started || state.paused || state.gameOver || state.cleared) return;
    let moved = 0;
    while (moveCurrent(0, 1)) {
      moved += 1;
    }
    state.score += moved * 2;
    scoreLabel.textContent = String(state.score);
    lockPiece();
    render();
  }

  function moveCurrent(dx, dy) {
    if (!state.current) return false;
    const next = { ...state.current, x: state.current.x + dx, y: state.current.y + dy };
    if (collides(next)) return false;
    state.current = next;
    render();
    return true;
  }

  function rotateCurrent() {
    if (!state.current) return;
    const rotated = rotateMatrix(state.current.matrix);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      const next = { ...state.current, matrix: rotated, x: state.current.x + kick };
      if (!collides(next)) {
        state.current = next;
        render();
        return;
      }
    }
  }

  function spawnPiece() {
    const type = pieceTypes[Math.floor(Math.random() * pieceTypes.length)];
    const definition = PIECES[type];
    state.current = {
      type,
      color: definition.color,
      matrix: cloneMatrix(definition.matrix),
      x: Math.floor(cols / 2) - Math.ceil(definition.matrix[0].length / 2),
      y: 0,
    };
    if (collides(state.current)) {
      state.gameOver = true;
      state.started = true;
      state.paused = false;
      updateStatus('게임 오버');
    }
  }

  function lockPiece() {
    if (!state.current) return;
    placeCurrent();
    const cleared = clearLines();
    if (cleared > 0) {
      state.lines += cleared;
      state.score += cleared * 100;
      scoreLabel.textContent = String(state.score);
      linesLabel.textContent = String(state.lines);
      if (state.lines >= state.targetLines) {
        state.cleared = true;
        state.paused = false;
        updateStatus('스테이지 클리어');
        render();
        return;
      }
    }
    spawnPiece();
    if (state.gameOver) {
      updateStatus('게임 오버');
      render();
      return;
    }
    updateStatus();
    render();
  }

  function placeCurrent() {
    const { matrix, x, y, color } = state.current;
    matrix.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (!value) return;
        const boardRow = y + rowIndex;
        const boardCol = x + colIndex;
        if (boardRow >= 0 && boardRow < rows && boardCol >= 0 && boardCol < cols) {
          state.board[boardRow][boardCol] = color;
        }
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    state.board = state.board.filter((row) => {
      if (row.every(Boolean)) {
        cleared += 1;
        return false;
      }
      return true;
    });
    while (state.board.length < rows) {
      state.board.unshift(Array(cols).fill(null));
    }
    return cleared;
  }

  function collides(piece) {
    const { matrix, x, y } = piece;
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < matrix[rowIndex].length; colIndex += 1) {
        if (!matrix[rowIndex][colIndex]) continue;
        const boardRow = y + rowIndex;
        const boardCol = x + colIndex;
        if (boardCol < 0 || boardCol >= cols || boardRow >= rows) return true;
        if (boardRow >= 0 && state.board[boardRow][boardCol]) return true;
      }
    }
    return false;
  }

  function rotateMatrix(matrix) {
    return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
  }

  function cloneMatrix(matrix) {
    return matrix.map((row) => row.slice());
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
    } else if (state.cleared) {
      stateLabel.textContent = '스테이지 클리어';
    } else if (state.paused) {
      stateLabel.textContent = '일시정지';
    } else {
      stateLabel.textContent = '진행 중';
    }
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

    const scale = Math.min(canvas.width / (cols * cellSize), canvas.height / (rows * cellSize));
    const boardWidth = cols * cellSize * scale;
    const boardHeight = rows * cellSize * scale;
    const offsetX = (canvas.width - boardWidth) / 2;
    const offsetY = (canvas.height - boardHeight) / 2;

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawTetrisBoard(offsetX, offsetY, scale);
    drawCurrentPiece(offsetX, offsetY, scale);
    drawOverlay(offsetX, offsetY, boardWidth, boardHeight);
    updateStatus();
  }

  function drawTetrisBoard(offsetX, offsetY, scale) {
    context.save();
    context.translate(offsetX, offsetY);
    context.fillStyle = 'rgba(7, 18, 32, 0.7)';
    context.fillRect(0, 0, cols * cellSize * scale, rows * cellSize * scale);
    context.strokeStyle = 'rgba(84, 215, 255, 0.08)';
    context.lineWidth = 1;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * cellSize * scale;
        const y = row * cellSize * scale;
        context.strokeRect(x + 0.5, y + 0.5, cellSize * scale, cellSize * scale);
        const cell = state.board[row][col];
        if (cell) {
          context.fillStyle = cell;
          context.fillRect(x + 1, y + 1, cellSize * scale - 2, cellSize * scale - 2);
        }
      }
    }

    context.restore();
  }

  function drawCurrentPiece(offsetX, offsetY, scale) {
    if (!state.current || state.gameOver) return;
    const { matrix, x, y, color } = state.current;
    context.save();
    context.translate(offsetX, offsetY);
    context.fillStyle = color;
    matrix.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (!value) return;
        const drawX = (x + colIndex) * cellSize * scale;
        const drawY = (y + rowIndex) * cellSize * scale;
        context.fillRect(drawX + 1, drawY + 1, cellSize * scale - 2, cellSize * scale - 2);
      });
    });
    context.restore();
  }

  function drawOverlay(offsetX, offsetY, boardWidth, boardHeight) {
    if (!state.started) {
      drawCenterMessage('시작 버튼을 누르거나 방향키를 누르세요.', offsetX, offsetY, boardWidth, boardHeight);
      return;
    }
    if (state.paused) {
      drawCenterMessage('일시정지', offsetX, offsetY, boardWidth, boardHeight);
      return;
    }
    if (state.gameOver) {
      drawCenterMessage('게임 오버 - 재시작을 눌러 다시 시작하세요.', offsetX, offsetY, boardWidth, boardHeight);
      return;
    }
    if (state.cleared) {
      drawCenterMessage('스테이지 클리어', offsetX, offsetY, boardWidth, boardHeight);
    }
  }

  function drawCenterMessage(message, offsetX, offsetY, boardWidth, boardHeight) {
    context.save();
    context.fillStyle = 'rgba(4, 11, 20, 0.58)';
    context.fillRect(offsetX, offsetY, boardWidth, boardHeight);
    context.fillStyle = '#eaf7ff';
    context.font = `${Math.max(16, Math.round(cellSize * 0.9))}px "Segoe UI", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    wrapText(message, offsetX + boardWidth / 2, offsetY + boardHeight / 2, boardWidth * 0.7, cellSize * 1.25);
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

    if (line) lines.push(line);
    const totalHeight = (lines.length - 1) * lineHeight;
    lines.forEach((part, index) => {
      context.fillText(part, x, y - totalHeight / 2 + index * lineHeight);
    });
  }
}
