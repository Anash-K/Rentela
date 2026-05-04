const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  req.log?.error(
    {
      message: err.message,
      stack: err.stack,
      statusCode,
      path: req.originalUrl,
      method: req.method,
    },
    "Request failed",
  );

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500 && isProd
        ? "Internal server error"
        : err.message || "Something went wrong",
    ...(isProd
      ? {}
      : {
          stack: err.stack,
        }),
  });
};

export default errorHandler;
