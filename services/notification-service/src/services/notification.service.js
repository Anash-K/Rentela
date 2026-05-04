// services/notification-service/src/services/notification.service.js

import prisma from "../lib/prisma.js";

// -----------------------------------------------------
// Create Notification
// -----------------------------------------------------
export const createNotification = async ({
  userId = null,
  channel = "IN_APP",
  eventKey = null,
  templateCode = null,
  subject = null,
  title = null,
  message,
  recipient = null,
  payload = null,
  priority = "MEDIUM",
  dedupeKey = null,
  actionUrl = null,
  imageUrl = null,
}) => {
  return prisma.notification.create({
    data: {
      userId,
      channel,
      eventKey,
      templateCode,
      subject,
      title,
      message,
      recipient,
      payload,
      priority,
      status: "PENDING",
      dedupeKey,
      actionUrl,
      imageUrl,
    },
  });
};

// -----------------------------------------------------
// Mark Sent
// -----------------------------------------------------
export const markAsSent = async (id) => {
  return prisma.notification.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: new Date(),
    },
  });
};

// -----------------------------------------------------
// Mark Failed
// -----------------------------------------------------
export const markAsFailed = async (id, reason) => {
  return prisma.notification.update({
    where: { id },
    data: {
      status: "FAILED",
      failureReason: reason,
      retryCount: {
        increment: 1,
      },
    },
  });
};

// -----------------------------------------------------
// Get User Notifications
// -----------------------------------------------------
export const getUserNotifications = async (userId) => {
  return prisma.notification.findMany({
    where: userId
      ? {
          OR: [{ userId }, { userId: null }],
        }
      : undefined,
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });
};

// -----------------------------------------------------
// Mark Read
// -----------------------------------------------------
export const markAsRead = async (id) => {
  return prisma.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};
