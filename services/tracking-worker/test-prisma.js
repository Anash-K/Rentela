import prisma from "./src/libs/prisma.js";

console.log('Prisma keys:');
const keys = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
console.log(keys);

process.exit(0);
