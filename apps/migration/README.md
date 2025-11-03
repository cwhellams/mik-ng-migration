# Migration scripts from old site to NG

Setup db to migrate from:

```
    ./start_mariadb.sh
    docker exec -it mariadb "/bin/bash"
    mariadb --user root --password password < /tmp/mik-2.sql

    Import Jasentiedot.csv into Jasentiedot table.
```

Run migration to empty db.

```
    ../../scripts/minimal_database.sh

    # delete old user mappings
    delete from mik_ng;

    pnpm dev all

```
