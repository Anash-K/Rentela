import * as authService from "../services/index.js";

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
const sendSuccess = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

const setRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// -----------------------------------------------------
// Public Controllers
// -----------------------------------------------------
export const signup = async (req, res, next) => {
  console.log(req.body);
  try {
    const result = await authService.signup(req.body, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      platform: req.body.platform,
      deviceName: req.body.deviceName,
    });

    setRefreshCookie(res, result.refreshToken);

    return sendSuccess(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      "Signup successful",
      201,
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      platform: req.body.platform,
      deviceName: req.body.deviceName,
    });

    setRefreshCookie(res, result.refreshToken);

    return sendSuccess(res, {
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    const result = await authService.refresh(token);

    setRefreshCookie(res, result.refreshToken);

    return sendSuccess(res, {
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body.email);

    return sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const result = await authService.resetPassword(token, newPassword);

    res.clearCookie("refreshToken");

    return sendSuccess(res, result, "Password reset successful");
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// Protected Controllers
// -----------------------------------------------------
export const me = async (req, res, next) => {
  try {
    const user = await authService.me(req.user.id);

    return sendSuccess(res, { user });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);

    return sendSuccess(res, { user }, "Profile updated");
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.sessionId);

    res.clearCookie("refreshToken");

    return sendSuccess(res, {}, "Logged out");
  } catch (error) {
    next(error);
  }
};

export const logoutAll = async (req, res, next) => {
  try {
    await authService.logoutAll(req.user.id);

    res.clearCookie("refreshToken");

    return sendSuccess(res, {}, "Logged out from all devices");
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    await authService.changePassword(req.user.id, currentPassword, newPassword);

    res.clearCookie("refreshToken");

    return sendSuccess(res, {}, "Password changed successfully");
  } catch (error) {
    next(error);
  }
};

export const sessions = async (req, res, next) => {
  try {
    const data = await authService.getSessions(req.user.id, req.user.sessionId);

    return sendSuccess(res, { sessions: data });
  } catch (error) {
    next(error);
  }
};
