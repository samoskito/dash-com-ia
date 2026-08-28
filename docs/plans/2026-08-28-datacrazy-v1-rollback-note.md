# Data Crazy v1 migration rollback note

The Data Crazy enum migration is forward-only. PostgreSQL enum values are not
removed during rollback; if the release must be backed out, disable or remove
the Data Crazy parser release and connections in a later forward migration or
application deployment while retaining the enum values. Do not apply a
destructive enum rollback migration.
