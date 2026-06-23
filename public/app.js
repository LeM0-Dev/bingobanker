const ACCESS_STORAGE_KEY = 'bingo-maker-access-code';
const BOARD_PATH = /^\/b\/([a-z0-9_-]+)$/i;
const BINGO_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20]
];

let accessCode = sessionStorage.getItem(ACCESS_STORAGE_KEY) || '';
let currentBoard = null;
let card = [];
let marked = new Set();
let hasShownWin = false;

const app = document.querySelector('#app');
const lockedScreen = document.querySelector('#locked-screen');
const openForm = document.querySelector('#open-form');
const openId = document.querySelector('#open-id');
const boardForm = document.querySelector('#board-form');
const titleInput = document.querySelector('#title-input');
const wordsInput = document.querySelector('#words-input');
const wordCount = document.querySelector('#word-count');
const saveButton = document.querySelector('#save-button');
const modeLabel = document.querySelector('#mode-label');
const pageTitle = document.querySelector('#page-title');
const previewTitle = document.querySelector('#preview-title');
const shareBlock = document.querySelector('#share-block');
const copyLink = document.querySelector('#copy-link');
const generateButton = document.querySelector('#generate-button');
const grid = document.querySelector('#grid');
const playStatus = document.querySelector('#play-status');
const bingoDialog = document.querySelector('#bingo-dialog');
const closeDialog = document.querySelector('#close-dialog');

function unlock() {
  app.classList.remove('is-locked');
  app.removeAttribute('aria-hidden');
  lockedScreen.classList.add('is-open');
}

async function validateAccessCode(code) {
  const response = await fetch('/api/auth', {
    headers: {
      'x-access-code': code
    }
  });

  return response.ok;
}

async function requireAccessCode() {
  while (true) {
    while (!accessCode) {
      accessCode = window.prompt('Enter access code') || '';
      accessCode = accessCode.trim();
      if (!accessCode) return false;
    }

    if (await validateAccessCode(accessCode)) {
      sessionStorage.setItem(ACCESS_STORAGE_KEY, accessCode);
      unlock();
      return true;
    }

    sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    accessCode = '';
    window.alert('Wrong access code.');
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-access-code': accessCode,
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    accessCode = '';
    window.alert('Wrong access code.');
    window.location.reload();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function wordsFromTextarea() {
  return wordsInput.value
    .split(/\r?\n/)
    .map(word => word.trim())
    .filter(Boolean);
}

function setStatus(message) {
  playStatus.textContent = message;
}

function updateWordCount() {
  const count = wordsFromTextarea().length;
  wordCount.textContent = `${count} ${count === 1 ? 'word' : 'words'}`;
  generateButton.disabled = count === 0;
}

function setBoard(board, push = true) {
  currentBoard = board;
  titleInput.value = board.title || '';
  wordsInput.value = board.words.join('\n');
  modeLabel.textContent = 'Editing Bingo';
  pageTitle.textContent = board.title || 'Untitled bingo';
  previewTitle.textContent = board.title || 'Preview';
  saveButton.textContent = 'Save changes';
  shareBlock.hidden = false;
  shareBlock.querySelector('span').textContent = `ID ${board.id}`;
  openId.value = board.id;
  card = [];
  marked = new Set();
  hasShownWin = false;
  renderGrid();
  setStatus('Generate a fresh card from this word list.');
  updateWordCount();

  if (push) {
    history.pushState({ id: board.id }, '', `/b/${board.id}`);
  }
}

function setNewBoard() {
  currentBoard = null;
  titleInput.value = '';
  wordsInput.value = '';
  modeLabel.textContent = 'New Bingo';
  pageTitle.textContent = 'Build a 5x5 bingo';
  previewTitle.textContent = 'Preview';
  saveButton.textContent = 'Create bingo';
  shareBlock.hidden = true;
  openId.value = '';
  card = [];
  marked = new Set();
  hasShownWin = false;
  renderGrid();
  setStatus('Create or open a bingo, then generate a card.');
  updateWordCount();
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createCard(words) {
  if (words.length >= 25) return shuffle(words).slice(0, 25);

  const filled = [];
  while (filled.length < 25) {
    filled.push(...shuffle(words));
  }
  return filled.slice(0, 25);
}

function winningLine() {
  return BINGO_LINES.find(line => line.every(index => marked.has(index))) || null;
}

function renderGrid() {
  const line = winningLine();
  grid.innerHTML = '';

  for (let index = 0; index < 25; index += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.textContent = card[index] || '';
    cell.disabled = !card[index];
    cell.setAttribute('aria-pressed', marked.has(index) ? 'true' : 'false');

    if (marked.has(index)) cell.classList.add('is-marked');
    if (line && line.includes(index)) cell.classList.add('is-winning');

    cell.addEventListener('click', () => {
      if (marked.has(index)) {
        marked.delete(index);
      } else {
        marked.add(index);
      }

      const win = winningLine();
      renderGrid();

      if (win && !hasShownWin) {
        hasShownWin = true;
        bingoDialog.showModal();
      }
    });

    grid.append(cell);
  }
}

async function openBoard(id, push = true) {
  const board = await api(`/api/boards/${encodeURIComponent(id)}`);
  setBoard(board, push);
}

boardForm.addEventListener('submit', async event => {
  event.preventDefault();

  const words = wordsFromTextarea();
  const title = titleInput.value.trim();

  if (words.length === 0) {
    window.alert('Add at least one word.');
    return;
  }

  saveButton.disabled = true;
  try {
    const wasEditing = Boolean(currentBoard);
    const board = currentBoard
      ? await api(`/api/boards/${currentBoard.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, words })
        })
      : await api('/api/boards', {
          method: 'POST',
          body: JSON.stringify({ title, words })
        });

    setBoard(board);
    setStatus(wasEditing ? 'Saved. Generate a fresh card when ready.' : 'Created. Share the link or generate a card.');
  } catch (error) {
    window.alert(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

openForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = openId.value.trim();
  if (!id) return;

  try {
    await openBoard(id);
  } catch (error) {
    window.alert(error.message);
  }
});

wordsInput.addEventListener('input', updateWordCount);
titleInput.addEventListener('input', () => {
  const title = titleInput.value.trim();
  if (!currentBoard) {
    pageTitle.textContent = title || 'Build a 5x5 bingo';
    previewTitle.textContent = title || 'Preview';
  }
});

generateButton.addEventListener('click', () => {
  const words = wordsFromTextarea();
  if (words.length === 0) {
    window.alert('Add at least one word first.');
    return;
  }

  card = createCard(words);
  marked = new Set();
  hasShownWin = false;
  renderGrid();
  setStatus(words.length < 25 ? 'Generated with repeated entries because the list has fewer than 25 words.' : 'Click squares as they happen.');
});

copyLink.addEventListener('click', async () => {
  if (!currentBoard) return;
  const link = `${window.location.origin}/b/${currentBoard.id}`;

  try {
    await navigator.clipboard.writeText(link);
    copyLink.textContent = 'Copied';
    window.setTimeout(() => {
      copyLink.textContent = 'Copy link';
    }, 1200);
  } catch {
    window.prompt('Copy link', link);
  }
});

closeDialog.addEventListener('click', () => {
  bingoDialog.close();
});

window.addEventListener('popstate', () => {
  const match = window.location.pathname.match(BOARD_PATH);
  if (match) {
    openBoard(match[1], false).catch(error => window.alert(error.message));
  } else {
    setNewBoard();
  }
});

async function init() {
  if (!await requireAccessCode()) return;

  renderGrid();
  updateWordCount();

  const match = window.location.pathname.match(BOARD_PATH);
  if (!match) return;

  try {
    await openBoard(match[1], false);
  } catch (error) {
    window.alert(error.message);
    history.replaceState({}, '', '/');
    setNewBoard();
  }
}

init();
