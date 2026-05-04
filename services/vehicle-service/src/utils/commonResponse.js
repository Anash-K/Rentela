export const sendSuccess = (
  res,
  data = {},
  message = "Success",
  status = 200,
) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

export const throwError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};
