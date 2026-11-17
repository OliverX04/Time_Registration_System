# Database backup and restore

## Restore from the Supervisor dashboard

1. Sign in as an enabled Supervisor and open **Database backups**.
2. Select a restore point and confirm **Restore database**. Changes made after that point are rolled back, including changes to accounts and passwords.
3. Sign in again with credentials that were valid at the selected point. Check the expected projects, attendance and task-time entries.

The server validates the chosen copy and saves a **Before restore** snapshot of the current database before replacing it. To undo a restore, select that snapshot after signing in again. Every successful restore invalidates existing sessions.

## Automatic backups

In **Database backups**, select **Daily** or **Weekly**, set the time and choose a weekday for weekly backups. Times use `Europe/Copenhagen`. The default is daily at 02:00. A saved schedule takes effect at its next scheduled time and remains active after a restore.

The backend checks at startup and every minute, beginning once an enabled Supervisor exists. After downtime it catches up with one snapshot for the latest due run. The date and time shown in the dashboard indicate when the snapshot was actually created.

Snapshots are kept beside the SQLite database in `<database path>.backups`. The default is `Backend/data/database.sqlite.backups`. The files contain account data, password hashes and time records. Keep this directory on persistent, access-restricted storage. Copies on the same disk share its failure risk. Use separate protected storage if recovery from disk loss is required.

Use a single backend instance for this SQLite database. Restore briefly holds database access while the backend swaps files. If the dashboard reports a busy database, retry when the current request finishes. When a restore fails, check the backend logs before retrying. Snapshots are retained until removed by the operator.
