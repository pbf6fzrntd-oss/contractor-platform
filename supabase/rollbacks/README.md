# Rollback scripts

One file per migration from Milestone 14 on, named `<migration>.down.sql`. They are **not** run by `npm run db:push`; run one by hand (Supabase SQL editor) only if a release must be undone, newest first.

Every migration in the industry-modules program is additive (new tables, new optional columns, new policies), so rolling back the **code** is normally enough: old code ignores the new objects. Use these scripts only to remove unused objects, and only after deploying the older code.
