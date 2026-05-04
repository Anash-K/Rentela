import { Prisma } from "../generated/prisma/index.js";

export default function errorHandler(err, _req, res, _next) {
  if (err?.name === "ZodError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: err.flatten?.() ?? err.message,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Unique constraint violation",
        meta: err.meta,
      });
    }
  }
  const code = err.code || err?.cause?.code;
  const status =
    code?.startsWith?.("CLASSIFY") || code?.startsWith?.("QUOTE") || code === "NO_ACTIVE_RULE_VERSION"
      ? 422
      : err.statusCode || err.status || 500;

  const message = err.message || "Internal server error";

  if (status >= 500) {
    console.error("[pricing-service]", err);
  }

  res.status(status).json({
    success: false,
    message,
    code: code || undefined,
  });
}
