# Folder file format

Nandemo Study can export a folder to a file and import that file again. You can also write an import file yourself, in a text editor or from a script. This page describes that file.

- **Export:** open a folder on the Decks page and click **Export** next to the folder name. The browser downloads `<folder name>.json`.
- **Import:** on the Decks page, click **Import folder…** under the folder list and choose a `.json` file. The cards go into a **new** folder; an existing folder never changes.

## Example

```json
{
  "format": "nandemo-folder",
  "version": 1,
  "name": "Japanese N5 verbs",
  "exportedAt": "2026-11-17T22:30:00.000Z",
  "cards": [
    { "question": "食べる", "answer": "to eat" },
    { "question": "飲む", "answer": "to drink" },
    { "question": "What does 行く mean?", "answer": "to go" }
  ]
}
```

The smallest file that imports:

```json
{ "cards": [{ "question": "2 + 2", "answer": "4" }] }
```

## Fields

The file is one JSON object, saved as UTF-8.

| Field        | Required | Type   | What it is |
|--------------|----------|--------|------------|
| `cards`      | Yes      | list   | The cards, in order. Each card is an object with `question` and `answer`. |
| `name`       | No       | text   | The name of the new folder. If it is missing or empty, the file name without `.json` is used. |
| `format`     | No       | text   | If it is present, it must be `"nandemo-folder"`. |
| `version`    | No       | number | If it is present, it must be `1`. |
| `exportedAt` | No       | text   | When the file was exported (an ISO 8601 date). Import ignores it. |

Each card in `cards`:

| Field      | Required | Type | Rules |
|------------|----------|------|-------|
| `question` | Yes      | text | Not empty, and 500 characters or fewer. |
| `answer`   | Yes      | text | Not empty, and 500 characters or fewer. |

Import removes spaces and line breaks from the start and end of every question and answer, and ignores all other fields.

## Limits

- **Cards:** an import can have at most **500 cards**, and at least 1.
- **Characters:** each question and each answer can have at most **500 characters**. This limit is the same as in the Add card dialog.
- **File size:** at most **5 MB**.

## What import does

1. The browser reads the whole file and checks every card before it sends anything. If the file has problems, nothing is imported. The dialog shows the first five problems with their card numbers (for example, `Card 12: "answer" is missing or empty.`).
2. You can change the folder name before you import. If you already have a folder with that name, the dialog suggests `Name (2)`, `Name (3)` and so on.
3. The app makes the new folder, then sends the cards **25 at a time**. It does not send all of them in one request. A progress bar shows how many cards are in. If a request fails, the app tries it again two more times.
4. If a request still fails, the import stops. The new folder keeps the cards that were added, and the dialog tells you how many. To try again, delete that folder and import the file again.

## What is not in the file

The file holds only the questions and answers. Study progress (ease, interval, due date, reviews) is not exported, and every imported card starts as a new card. The file also does not include the folder's daily-review setting.

## For developers

- The format code is `frontend/src/lib/folderFile.ts`. The import dialog is `ImportFolderDialog` in `frontend/src/app/home/page.tsx`.
- Import sends `POST /api/flashcards/batch` with `{ "folderId": "<id>", "cards": [{ "question": "…", "answer": "…" }] }`. One request can have at most 25 cards. The server refuses a request that would put more than 500 cards in the folder. It checks every card again, so a script that calls the route directly gets the same limits.
- If you change a limit, change it in `folderFile.ts`, in `backend/routes/flashcards.js` and on this page.
