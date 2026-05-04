export default function errorHandler(err, req, res, next) {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    requestId: req.requestId,
    message: err.message || "Internal Server Error",
  });
}