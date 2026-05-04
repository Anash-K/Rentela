import prisma from "../libs/prisma.js";
import { throwError } from "../utils/common.js";

function toDec(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function buildInvoiceNumber(paymentId, bookingId) {
  const p = (paymentId || "NA").replace(/-/g, "").slice(0, 10).toUpperCase();
  return `INV-${(bookingId || "UNK").slice(0, 8)}-${p}`;
}

export async function upsertPaidInvoiceFromPayment(payload) {
  const {
    userId,
    bookingId,
    paymentId,
    totalAmount,
    breakdown,
    billingName = "Customer",
  } = payload;

  if (!userId || !paymentId || !bookingId) {
    throwError("userId, bookingId and paymentId are required", 400);
  }

  const total = toDec(totalAmount);
  if (total <= 0) throwError("Invalid totalAmount", 400);

  const existing = await prisma.invoice.findFirst({
    where: { paymentId },
  });
  if (existing) {
    const full = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        status: "PAID",
        amountPaid: total,
        balanceDue: 0,
        totalAmount: total,
      },
      include: { items: true },
    });
    return full;
  }

  const invoiceNumber = buildInvoiceNumber(paymentId, bookingId);

  const itemsPayload = breakdown
    ? [
        {
          title: "Base fare",
          description: "",
          quantity: 1,
          unitPrice: toDec(breakdown.baseAmount),
          totalPrice: toDec(breakdown.baseAmount),
        },
        ...(toDec(breakdown.extraKmCost) > 0
          ? [
              {
                title: "Extra kilometres",
                description: "",
                quantity: 1,
                unitPrice: toDec(breakdown.extraKmCost),
                totalPrice: toDec(breakdown.extraKmCost),
              },
            ]
          : []),
        ...(toDec(breakdown.extraTimeCost) > 0
          ? [
              {
                title: "Late return / extra time",
                description: "",
                quantity: 1,
                unitPrice: toDec(breakdown.extraTimeCost),
                totalPrice: toDec(breakdown.extraTimeCost),
              },
            ]
          : []),
        ...(toDec(breakdown.damageCost) > 0
          ? [
              {
                title: "Damage",
                description: "",
                quantity: 1,
                unitPrice: toDec(breakdown.damageCost),
                totalPrice: toDec(breakdown.damageCost),
              },
            ]
          : []),
        ...(toDec(breakdown.platformFee) > 0
          ? [
              {
                title: "Platform fee",
                description: "",
                quantity: 1,
                unitPrice: toDec(breakdown.platformFee),
                totalPrice: toDec(breakdown.platformFee),
              },
            ]
          : []),
        ...(toDec(breakdown.serviceFee) > 0
          ? [
              {
                title: "Service fee",
                description: "",
                quantity: 1,
                unitPrice: toDec(breakdown.serviceFee),
                totalPrice: toDec(breakdown.serviceFee),
              },
            ]
          : []),
        ...(toDec(breakdown.taxAmount) > 0
          ? [
              {
                title: "Tax",
                description: "",
                quantity: 1,
                unitPrice: toDec(breakdown.taxAmount),
                totalPrice: toDec(breakdown.taxAmount),
              },
            ]
          : []),
        ...(toDec(breakdown.discountAmount) > 0
          ? [
              {
                title: "Discount",
                description: "",
                quantity: 1,
                unitPrice: -Math.abs(toDec(breakdown.discountAmount)),
                totalPrice: -Math.abs(toDec(breakdown.discountAmount)),
              },
            ]
          : []),
      ]
    : [
        {
          title: "Booking total",
          description: "",
          quantity: 1,
          unitPrice: total,
          totalPrice: total,
        },
      ];

  const subtotal = itemsPayload.reduce((acc, row) => acc + row.totalPrice, 0);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        userId,
        bookingId,
        paymentId,
        status: "PAID",
        subtotal,
        platformFee: 0,
        convenienceFee: 0,
        extraAmount: 0,
        discountAmount: breakdown ? toDec(breakdown.discountAmount) : 0,
        taxAmount: breakdown ? toDec(breakdown.taxAmount) : 0,
        totalAmount: total,
        amountPaid: total,
        balanceDue: 0,
        currency: payload.currency ?? "INR",
        billingName,
        billingEmail: payload.billingEmail ?? null,
      },
    });

    for (const row of itemsPayload) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          title: row.title,
          description: row.description ?? null,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          totalPrice: row.totalPrice,
        },
      });
    }

    return tx.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true },
    });
  });
}
