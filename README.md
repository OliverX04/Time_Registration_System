# Time Registration System

VIA internship time registration system for future interns.

## Database setup

The backend uses SQLite through `better-sqlite3`.

```sh
cd backend
npm install
npm run db:init
```

The command creates a local database at `backend/data/database.sqlite` and
applies the schema from `backend/src/database/schema.sql`. The generated
database file is ignored by Git.
