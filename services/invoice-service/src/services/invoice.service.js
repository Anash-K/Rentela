import prisma from "../libs/prisma.js";
import { throwError } from "../utils/common.js";

const MONEY_EPS = 0.005;

function toDec(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function normalizePhase(raw) {
  const allowed = new Set(["PREPAY", "SETTLEMENT", "EXTENSION"]);
  if (typeof raw === "string" && allowed.has(raw)) return raw;
  return "SETTLEMENT";
}

function buildInvoiceNumber(paymentId, bookingId, phase) {
  const p = (paymentId || "NA").replace(/-/g, "").slice(0, 10).toUpperCase();
  const prefix =
    phase === "PREPAY" ? "REC" : phase === "EXTENSION" ? "EXT" : "INV";
  return `${prefix}-${(bookingId || "UNK").slice(0, 8)}-${p}`;
}

function buildBreakdownItems(breakdown, settlementSnapshot, paidNow) {
  const items = [];

  if (breakdown) {
    items.push({
      title: "Base fare",
      description: "",
      quantity: 1,
      unitPrice: toDec(breakdown.baseAmount),
      totalPrice: toDec(breakdown.baseAmount),
    });
    if (toDec(breakdown.extraKmCost) > MONEY_EPS) {
      items.push({
        title: "Extra kilometres",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.extraKmCost),
        totalPrice: toDec(breakdown.extraKmCost),
      });
    }
    if (toDec(breakdown.extraTimeCost) > MONEY_EPS) {
      items.push({
        title: "Late return / extra time",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.extraTimeCost),
        totalPrice: toDec(breakdown.extraTimeCost),
      });
    }
    if (toDec(breakdown.extensionAmount) > MONEY_EPS) {
      items.push({
        title: "Booking extensions (scheduled)",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.extensionAmount),
        totalPrice: toDec(breakdown.extensionAmount),
      });
    }
    if (toDec(breakdown.damageCost) > MONEY_EPS) {
      items.push({
        title: "Damage",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.damageCost),
        totalPrice: toDec(breakdown.damageCost),
      });
    }
    if (toDec(breakdown.platformFee) > MONEY_EPS) {
      items.push({
        title: "Platform fee",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.platformFee),
        totalPrice: toDec(breakdown.platformFee),
      });
    }
    if (toDec(breakdown.serviceFee) > MONEY_EPS) {
      items.push({
        title: "Service fee",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.serviceFee),
        totalPrice: toDec(breakdown.serviceFee),
      });
    }
    if (toDec(breakdown.taxAmount) > MONEY_EPS) {
      items.push({
        title: "Tax",
        description: "",
        quantity: 1,
        unitPrice: toDec(breakdown.taxAmount),
        totalPrice: toDec(breakdown.taxAmount),
      });
    }
    if (toDec(breakdown.discountAmount) > MONEY_EPS) {
      items.push({
        title: "Discount",
        description: "",
        quantity: 1,
        unitPrice: -Math.abs(toDec(breakdown.discountAmount)),
        totalPrice: -Math.abs(toDec(breakdown.discountAmount)),
      });
    }
  }

  const prior = settlementSnapshot
    ? toDec(settlementSnapshot.amountPaidCumulative)
    : 0;
  if (prior > MONEY_EPS) {
    items.push({
      title: "Less: prepayments & credits (prior transactions)",
      description:
        "Applied before this charge — ledger excludes this payment until booking updates.",
      quantity: 1,
      unitPrice: -prior,
      totalPrice: -prior,
    });
  }

  const subtotal = items.reduce((acc, row) => acc + row.totalPrice, 0);
  if (Math.abs(subtotal - paidNow) > 0.05 && items.length > 0) {
    items.push({
      title: "Settlement adjustment",
      description: "Reconciles detailed charges to the amount captured for this payment",
      quantity: 1,
      unitPrice: paidNow - subtotal,
      totalPrice: paidNow - subtotal,
    });
  }

  return items;
}

export async function upsertPaidInvoiceFromPayment(payload) {
  const {
    userId,
    bookingId,
    paymentId,
    totalAmount,
    breakdown,
    billingName = "Customer",
    paymentPhase: phaseRaw,
    paymentAmount,
    settlementSnapshot,
    billTotalAmount,
  } = payload;

  if (!userId || !paymentId || !bookingId) {
    throwError("userId, bookingId and paymentId are required", 400);
  }

  const phase = normalizePhase(phaseRaw);
  const paidNow = toDec(
    paymentAmount != null ? paymentAmount : totalAmount,
  );
  if (paidNow <= 0) throwError("Invalid payment amount", 400);

  const tripTotalRef =
    billTotalAmount != null ? toDec(billTotalAmount) : paidNow;

  const existing = await prisma.invoice.findFirst({
    where: { paymentId },
  });
  if (existing) {
    const full = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        status: "PAID",
        amountPaid: paidNow,
        balanceDue: 0,
        totalAmount: paidNow,
      },
      include: { items: true },
    });
    return full;
  }

  const invoiceNumber = buildInvoiceNumber(paymentId, bookingId, phase);

  let notes;
  let itemsPayload;

  if (phase === "PREPAY") {
    notes =
      `Receipt — booking prepayment / deposit. Quoted rental total (reference): ${tripTotalRef.toFixed(2)} ${payload.currency ?? "INR"}.`;
    itemsPayload = [
      {
        title: "Booking prepayment (deposit toward rental)",
        description: "Applied per settlement rules when the trip ends.",
        quantity: 1,
        unitPrice: paidNow,
        totalPrice: paidNow,
      },
    ];
  } else if (phase === "EXTENSION") {
    notes =
      `Receipt — extension charges for booking ${bookingId}. Related trip charges may follow on final settlement.`;
    itemsPayload = [
      {
        title: "Booking extension",
        description: "Additional rental time or mileage bundle purchased.",
        quantity: 1,
        unitPrice: paidNow,
        totalPrice: paidNow,
      },
    ];
  } else {
    notes =
      `Tax invoice — trip settlement (final). Trip total reference: ${tripTotalRef.toFixed(2)} ${payload.currency ?? "INR"}.`;
    if (breakdown && settlementSnapshot) {
      itemsPayload = buildBreakdownItems(
        breakdown,
        settlementSnapshot,
        paidNow,
      );
    } else if (breakdown) {
      itemsPayload = buildBreakdownItems(breakdown, null, paidNow);
    } else {
      itemsPayload = [
        {
          title: "Trip settlement (amount captured)",
          description: "Detailed breakdown unavailable — see booking bill in app.",
          quantity: 1,
          unitPrice: paidNow,
          totalPrice: paidNow,
        },
      ];
    }
  }

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
        totalAmount: paidNow,
        amountPaid: paidNow,
        balanceDue: 0,
        currency: payload.currency ?? "INR",
        billingName,
        billingEmail: payload.billingEmail ?? null,
        notes,
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
