import { Router } from "express";
import auth from "../middlewares/auth.middleware.js";
import {
  signup,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  me,
  updateProfile,
  logout,
  logoutAll,
  changePassword,
  sessions,
} from "../controllers/auth.controller.js";

const router = Router();

// Public routes
router.post("/signup", signup);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected routes
router.get("/me", auth, me);
router.patch("/profile", auth, updateProfile);
router.post("/logout", auth, logout);
router.post("/logout-all", auth, logoutAll);
router.post("/change-password", auth, changePassword);

router.get("/sessions", auth, sessions);

export default router;
