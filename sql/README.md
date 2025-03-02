# MIK ng Database

# Postgres
We use postgres as the db server, it is very easy to run locally using the postgres docker image. 

Assuming you have docker running on your local machine, this will get postgres started

    ./scripts/start_postgres.sh 

Assuming you have installed the toolstack the next step is to create the database. For now the creation of the mik_ng database is a manual step, we recommend DBeaver as a free SQL IDE that you can use to connect to postgres and run the DB creation script.

## Credentials and connection details
See the start_postgres.sh script, you should find the db on localhost:5432

uid : admin

pwd: password

> NOTE: These creds are for local development only and must never be used in the production database !

## Create the DB
In `./sql/database` the file `V10__CreateDb.sql` containes the DB creation script. This can be run in DBeaver to create the database, once the script has executed you should have a db named mik_ng available.

## Create the schema
Creating the database schema (tables etc) is now very easily done using flyway (we assume you have installed flyway to your local machine). Run the following bash script

    ./sql/flyway_schema_full.sh

Flyway should now deploy the db schema to the newly created database.

## Create test data
If you require test data we have scripts which will prime the db tables with some meaningful data

    ./sql/flyway_testdata_full.sh

## Cleaning / reset the database
If you want to clean the database and start fresh we have a script for that too

    ./sql/flyway_schema_clean.sh

This will burn down the existing schema and data and re-deploy an empty database, use the data scripts if you want test data.

# Schema evolution - WoW
If you wish to make changes to the database such as adding, changing or deleting schema elements it is extremely important to understand the way Flyway works - we will not cover that in-depth here, please RTFM. The rules are simple

1. Make changes granular i.e. in general 1 file for 1 db object
2. Follow the naming convention, in particular the version number of the scripts
3. we always increment by 10, this leaves space if we later realise we need additional scripts e.g. 2 devs working at the same time. 
4. The file naming is extremely important and must always follow the pattern Vxx__<description-of-change>.sql
5. When developing db changes always ensure you have run a full flyway deployment first, then make changes - this way we avoid the possibility of scripts interfering with each other. 
6. Once a DB object is deployed it must *NEVER* be changed by dropping or deleting it and re-creating (this will result in all data being lost - unless that is the intention of course). Changes should typically be made by modifying the existing object e.g. adding columns, altering etc 
7. Always test your changes by running flyway migrations
   1. first run a migration against the existing schema
   2. then a migration of the clean db

## Schema changes
Put all schema change scripts into `./sql/schema/migration`

## Test data changes
Put all test data scripts into `./sql/testdata`