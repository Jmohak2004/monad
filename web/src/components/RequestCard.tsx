"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/escrow";
import { buildPayLink, type Invoice } from "@/lib/requests";

const message = (inv: Invoice, link: string) =>
  `${inv.name || "I"} requested ${formatUsd(inv.amount)} on Ghar. Scan the QR or tap to pay: ${link}`;

/** A shareable PNG, like a UPI app's QR card: name, amount, and the QR. */
async function cardImage(inv: Invoice, link: string): Promise<File> {
  const W = 720, H = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1436c8";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f4f6ff";
  ctx.textAlign = "center";
  ctx.font = "500 36px system-ui, sans-serif";
  ctx.fillText(inv.name ? `Pay ${inv.name}` : "Payment request", W / 2, 110);
  ctx.font = "800 96px system-ui, sans-serif";
  ctx.fillText(formatUsd(inv.amount), W / 2, 220);

  const qr = document.createElement("canvas");
  // Integer pixels per module. A fixed `width` makes qrcode use a fractional scale (7px and 8px modules).
  await QRCode.toCanvas(qr, link, { scale: 6, margin: 2, errorCorrectionLevel: "M" });
  ctx.drawImage(qr, (W - qr.width) / 2, 280);

  ctx.font = "400 28px system-ui, sans-serif";
  ctx.fillText("Scan with your phone camera to pay", W / 2, 880);
  ctx.fillText(`Ghar · one-time · expires ${new Date(inv.expiry * 1000).toLocaleDateString()}`, W / 2, 930);

  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
  return new File([blob], "ghar-request.png", { type: "image/png" });
}

/** Shares the QR card as an image where the browser supports it, otherwise downloads it. */
export async function shareRequest(inv: Invoice) {
  const link = buildPayLink(inv);
  const file = await cardImage(inv, link);
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: message(inv, link) }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function RequestCard({ invoice }: { invoice: Invoice }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(buildPayLink(invoice), { scale: 6, margin: 2, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [invoice]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center bg-white p-3">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code to pay ${formatUsd(invoice.amount)}`} className="aspect-square w-full max-w-72" />
        ) : (
          <div className="aspect-square w-full max-w-72" />
        )}
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={sharing}
        onClick={async () => {
          setSharing(true);
          await shareRequest(invoice).finally(() => setSharing(false));
        }}
      >
        {sharing ? "Preparing…" : "Share QR"}
      </button>
      <button
        className="btn btn-secondary w-full"
        onClick={async () => {
          await navigator.clipboard.writeText(buildPayLink(invoice));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <p className="bg-warn-soft p-3 text-xs text-warn">
        Anyone with this QR can pay it, once. It stops working after it&apos;s paid, on{" "}
        {new Date(invoice.expiry * 1000).toLocaleDateString()}, or when you cancel it in Activity.
      </p>
    </div>
  );
}
