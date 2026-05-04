/** Prisma P2002 unique constraint */
export function isUniqueViolation(err) {
  return Boolean(err && err.code === "P2002");
}

export function uniqueTarget(err) {
  return err?.meta?.target;
}
