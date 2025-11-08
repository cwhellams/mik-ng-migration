# Migration scripts from old site to NG

Setup db to migrate from:

```
    ./start_mariadb.sh
    docker exec -it mariadb "/bin/bash"
    mariadb --user root --password password < /tmp/mik-2.sql

    Import Jasentiedot.csv into Jasentiedot table.
```

Run migration to empty db locally.

```
    ../../scripts/minimal_database.sh

    # delete old user mappings
    delete from mik_ng;

    pnpm dev login login_token_from_login_email
    pnpm dev all
    pnpm dev flights
```

Run to test env

```
    pnpm test login login_token_from_login_email
    pnpm test all
```

Run to production

```
    pnpm production login login_token_from_login_email
    pnpm production all
```
