import mariadb from 'mariadb'

export const conn = await mariadb.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mik',
})
