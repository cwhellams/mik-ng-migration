```
 _____ ______       ___      ___  __            ________       ________     
|\   _ \  _   \    |\  \    |\  \|\  \         |\   ___  \    |\   ____\    
\ \  \\\__\ \  \   \ \  \   \ \  \/  /|_       \ \  \\ \  \   \ \  \___|    
 \ \  \\|__| \  \   \ \  \   \ \   ___  \       \ \  \\ \  \   \ \  \  ___  
  \ \  \    \ \  \   \ \  \   \ \  \\ \  \       \ \  \\ \  \   \ \  \|\  \ 
   \ \__\    \ \__\   \ \__\   \ \__\\ \__\       \ \__\\ \__\   \ \_______\
    \|__|     \|__|    \|__|    \|__| \|__|        \|__| \|__|    \|_______|
                                                                            
```       

The Backend......

# Overview
This is the backend project , mostly a node + express REST API

# Getting started
From the backend folder

    npm install

This will get you all the required packages, alternatively you can use pnpm.

## Run the DB codegen
We are using the [Kysely](https://kysely.dev/) micro-orm as our data layer. This seems to play nice with Typescript and provides an elegant abstraction over the raw db , whilst still being 'close to the metal'. It is quite well documented and reasonably popular. 

Kysely requires the DB schema to be mapped to code, which is a rather tedious chore. Luckily there's a tool for that [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen).

Before things will work you will need to codegen the DB schema, this is quite easy :

1. Ensure you have the Postgres up and running using the scripts in ./sql
2. The default .env file should already contain a DATABASE_URL entry which matches the settings from the start script
3. Run codegen ```npx kysely-codegen```
4. This will output a .d.ts file into the node_modules dir
5. Everything should "just work" after this, kysely will be bootstrapped with the generated DB model and intelli-sense / code-completion should work when writing kysely statements

# Scripts

## Prettier
To format code using prettier 

    npm run format
 
 ## Test
 To run the Jest tests

    npm run test

## Start the service

    npm run start
or
    
    npm run dev