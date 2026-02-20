# CSVista

CSVista is a CSV Viewer web application.

Homepage: [https://hintdesk.github.io/csvista](https://hintdesk.github.io/csvista)

Users can create a project, upload one CSV file, and view the data directly in the browser.

## Screenshots

![Project list](readme/1.png)

![Project data view](readme/2.png)

## Main Features

- Project management
  - Create a project
  - Open a project
  - Rename a project
  - Delete a project with confirmation
- CSV import and online viewing
  - Import CSV into the selected project
  - Render tabular data with pagination
  - Show row detail panel
- Data operations
  - Sort by any column (ascending or descending)
  - Filter by selected column and text query
  - Filter supports a None option (no filtering)
- Local persistence
  - Projects are stored in localStorage
  - Project data is stored in IndexedDB
  - Deleting a project also removes its IndexedDB table

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- idb (IndexedDB wrapper)
- Papa Parse (CSV parsing)

## Getting Started

1. Install dependencies

   npm install

2. Start development server

   npm run dev

3. Build for production

   npm run build

4. Preview production build

   npm run preview

## Project Structure (Key Files)

- [src/pages/ProjectListPage.tsx](src/pages/ProjectListPage.tsx): Project list, create dialog, delete confirmation
- [src/pages/ProjectPage.tsx](src/pages/ProjectPage.tsx): CSV import, table view, sort, filter, row detail
- [src/services/projectService.ts](src/services/projectService.ts): Project CRUD with localStorage
- [src/services/dataService.ts](src/services/dataService.ts): CSV parse and IndexedDB query/store logic

## Notes

- All data stays in the browser (no backend service).
- This app is designed for fast local CSV inspection and exploration.
