import { sendSuccess } from "../../../../shared/utils/helper.js";
import {
  getUserNotifications,
  markAsRead,
} from "../services/notification.service.js";

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query.userId;

    const notifications = await getUserNotifications(userId);

    return sendSuccess(res, {
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

export const readNotification = async (req, res, next) => {
  try {
    const notification = await markAsRead(req.params.id);

    return sendSuccess(res, { notification }, "Notification marked as read");
  } catch (error) {
    next(error);
  }
};
