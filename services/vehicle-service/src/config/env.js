import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 5010;

export const DATABASE_URL = process.env.DATABASE_URL;
console.log(DATABASE_URL);

export const RABBITMQ_URL = process.env.RABBITMQ_URL;
