import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = header.split(" ")[1];

    const payload = jwt.verify(token, ACCESS_SECRET);

    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      sessionId: payload.sid || null,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export default auth;
