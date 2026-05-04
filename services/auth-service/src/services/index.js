import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../libs/prisma.js";
import { ACCESS_SECRET, REFRESH_SECRET } from "../config/env.js";

const ACCESS_EXPIRES_IN = "15m";
const REFRESH_DAYS = 7;

console.log("ACCESS_SECRET:", ACCESS_SECRET);
console.log("REFRESH_SECRET:", REFRESH_SECRET);

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
const signAccessToken = (user, sessionId) => {
  return jwt.sign(
    {
      sub: user.id,
      sid: sessionId,
      role: user.role,
      email: user.email,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN },
  );
};

function signRefreshToken(sessionId, userId) {
  return jwt.sign(
    {
      sid: sessionId,
      sub: userId,
    },
    REFRESH_SECRET,
    { expiresIn: `${REFRESH_DAYS}d` },
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,
  };
}

// -----------------------------------------------------
// Signup
// -----------------------------------------------------
export async function signup(data, meta = {}) {
  const { name, email, phone, password } = data;

  const conditions = [{ email }];

  if (phone) {
    conditions.push({ phone });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: conditions,
    },
  });

  if (existing) {
    throw createError("User already exists", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
    },
  });

  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken(sessionId, user.id);
  const accessToken = signAccessToken(user, sessionId);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent,
      deviceName: meta.deviceName,
      platform: meta.platform,
      ipAddress: meta.ipAddress,
      expiresAt: addDays(REFRESH_DAYS),
    },
  });

  return {
    user: safeUser(user),
    accessToken,
    refreshToken,
  };
}

// -----------------------------------------------------
// Login
// -----------------------------------------------------
export async function login(data, meta = {}) {
  const { email, password } = data;

  console.log(Object.keys(prisma));

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw createError("Invalid credentials", 401);
  }

  if (user.status !== "ACTIVE") {
    throw createError("Account is not active", 403);
  }

  const matched = await bcrypt.compare(password, user.passwordHash);

  if (!matched) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: { increment: 1 },
      },
    });

    throw createError("Invalid credentials", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lastLoginAt: new Date(),
    },
  });

  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken(sessionId, user.id);
  const accessToken = signAccessToken(user, sessionId);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent,
      deviceName: meta.deviceName,
      platform: meta.platform,
      ipAddress: meta.ipAddress,
      expiresAt: addDays(REFRESH_DAYS),
    },
  });

  return {
    user: safeUser(user),
    accessToken,
    refreshToken,
  };
}

// -----------------------------------------------------
// Refresh Token
// -----------------------------------------------------
export async function refresh(refreshToken) {
  let payload;

  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    throw createError("Invalid refresh token", 401);
  }

  const tokenHash = hashToken(refreshToken);

  const session = await prisma.session.findFirst({
    where: {
      id: payload.sid,
      userId: payload.sub,
      refreshTokenHash: tokenHash,
      isRevoked: false,
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    throw createError("Session not found", 401);
  }

  if (session.expiresAt < new Date()) {
    throw createError("Session expired", 401);
  }

  const newRefreshToken = signRefreshToken(session.id, session.userId);
  const newAccessToken = signAccessToken(session.user, session.id);

  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      expiresAt: addDays(REFRESH_DAYS),
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

// -----------------------------------------------------
// Me
// -----------------------------------------------------
export async function me(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw createError("User not found", 404);
  }

  return safeUser(user);
}

// -----------------------------------------------------
// Update Profile
// -----------------------------------------------------
export async function updateProfile(userId, data) {
  const allowed = {
    name: data.name,
    phone: data.phone,
    avatarUrl: data.avatarUrl,
  };

  const user = await prisma.user.update({
    where: { id: userId },
    data: allowed,
  });

  return safeUser(user);
}

// -----------------------------------------------------
// Logout Current Session
// -----------------------------------------------------
export async function logout(sessionId) {
  await prisma.session.updateMany({
    where: {
      id: sessionId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });

  return { success: true };
}

// -----------------------------------------------------
// Logout All
// -----------------------------------------------------
export async function logoutAll(userId) {
  await prisma.session.updateMany({
    where: {
      userId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });

  return { success: true };
}

// -----------------------------------------------------
// Get Sessions
// -----------------------------------------------------
export async function getSessions(userId, currentSessionId) {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      isRevoked: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    deviceName: s.deviceName,
    platform: s.platform,
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    current: s.id === currentSessionId,
  }));
}

// -----------------------------------------------------
// Forgot Password
// -----------------------------------------------------
export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return {
      success: true,
      message: "If account exists, reset link sent",
    };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  return {
    success: true,
    resetToken: rawToken, // later send by email
  };
}

// -----------------------------------------------------
// Reset Password
// -----------------------------------------------------
export async function resetPassword(token, newPassword) {
  const tokenHash = hashToken(token);

  const reset = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
    },
  });

  if (!reset) {
    throw createError("Invalid token", 400);
  }

  if (reset.expiresAt < new Date()) {
    throw createError("Token expired", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash },
  });

  await prisma.passwordResetToken.update({
    where: { id: reset.id },
    data: {
      usedAt: new Date(),
    },
  });

  await prisma.session.updateMany({
    where: { userId: reset.userId },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });

  return { success: true };
}

// -----------------------------------------------------
// Change Password
// -----------------------------------------------------
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw createError("User not found", 404);
  }

  const matched = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!matched) {
    throw createError("Current password is wrong", 401);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await prisma.session.updateMany({
    where: {
      userId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });

  return { success: true };
}
