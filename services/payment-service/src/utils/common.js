export const sendSuccess = (res, data = {}, message = "Success", status = 200) =>
  res.status(status).json({ success: true, message, data });

export const throwError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
};
