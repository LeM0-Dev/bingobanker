# Bingo Maker

Small self-hosted Node.js bingo maker with local SQLite storage.

## Run

```bash
npm start
```

Open `http://localhost:3000` and enter:

```text
ididntdonothin
```

## Configuration

- `PORT`: HTTP port, defaults to `3000`
- `ACCESS_CODE`: prompt/API access code, defaults to `ididntdonothin`

Boards are stored in `data/bingo.sqlite`. Each board gets a shareable `/b/:id` URL, and anyone with site access can edit any board.
