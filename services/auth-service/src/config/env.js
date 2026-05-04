// services/auth-service/src/config/env.js

export const PORT = process.env.PORT || 5003;

export const DATABASE_URL = process.env.DATABASE_URL;

console.log(DATABASE_URL, "DataBase url");

export const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

export const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
