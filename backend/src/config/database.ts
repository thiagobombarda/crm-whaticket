require("../bootstrap");

module.exports = {
  dialect: process.env.DB_DIALECT || "postgres",
  timezone: "America/Sao_Paulo",
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  logging: false,
  pool: {
    max: 30,
    min: 5,
    acquire: 30000,
    idle: 10000,
    evict: 1000
  }
};
