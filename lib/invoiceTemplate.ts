import { InvoiceData, fmt } from "@/lib/invoice";

// Renders one HTML document containing BOTH a standard A4-style invoice and
// a narrow 80mm thermal-receipt layout, with a toggle to switch between them
// before printing — one URL covers both output formats.

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function addressLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

export function renderInvoiceHTML(inv: InvoiceData): string {
  // Each section is shown only if its switch is on in Settings → Store
  // details AND it has a value.
  const sh = inv.layout.show;
  const docTitle = inv.title;
  const sellerAddr = sh.sellerAddress
    ? addressLine([inv.seller.address, inv.seller.city, inv.seller.state && inv.seller.pin ? `${inv.seller.state} - ${inv.seller.pin}` : inv.seller.state || inv.seller.pin])
    : "";
  const sellerPhone = sh.sellerPhone ? inv.seller.phone : "";
  const sellerEmail = sh.sellerEmail ? inv.seller.email : "";
  const sellerWebsite = sh.sellerWebsite ? inv.seller.website : "";
  const gstin = sh.gstin ? inv.seller.gstin : "";
  const pan = sh.pan ? inv.seller.pan : "";
  const buyerPhone = sh.buyerPhone ? inv.buyer.phone : "";
  const buyerEmail = sh.buyerEmail ? inv.buyer.email : "";
  const awb = sh.awb ? inv.awb : null;
  const paid = ["paid", "captured"].includes((inv.payment.status || "").toLowerCase());
  const statusLabel = inv.isCancelled ? "CANCELLED" : paid ? "PAID" : (inv.payment.status || "UNPAID").toUpperCase();
  const paymentMethod = [inv.payment.via, inv.payment.method && inv.payment.method.toUpperCase()].filter(Boolean).join(" · ");
  const buyerAddr = addressLine([inv.buyer.address]);
  const buyerCityLine = addressLine([inv.buyer.city, inv.buyer.state, inv.buyer.pin]);

  // Totals in the same order as the storefront's admin order email:
  // subtotal, discount, taxable value, GST, waived fees, total charged.
  type TotalRow = { label: string; value: string; kind?: "sub" | "free" | "discount" };
  const money = (n: number) => `₹${fmt(n)}`;
  const g = inv.gst;
  const totalRows: TotalRow[] = [];
  if (sh.priceBreakdown && inv.subtotal != null) totalRows.push({ label: "Price (Subtotal)", value: money(inv.subtotal) });
  if (sh.priceBreakdown && inv.discount) totalRows.push({ label: "Discount", value: `-${money(inv.discount)}`, kind: "discount" });
  if (sh.gstBreakdown) {
    totalRows.push({ label: "Taxable value (excl. GST)", value: money(g.taxable) });
    totalRows.push({ label: `GST (${g.rate}%)`, value: money(g.amount) });
    if (g.split === "intra" && sh.cgstSgst) {
      totalRows.push({ label: `CGST ${g.rate / 2}%`, value: money(g.half), kind: "sub" });
      totalRows.push({ label: `SGST ${g.rate / 2}%`, value: money(Number((g.amount - g.half).toFixed(2))), kind: "sub" });
    } else if (g.split === "inter" && sh.igst) {
      totalRows.push({ label: `IGST ${g.rate}%`, value: money(g.amount), kind: "sub" });
    }
  } else if (inv.tax) {
    totalRows.push({ label: "Tax", value: money(inv.tax) });
  }
  if (sh.waivedFees) {
    if (inv.fees.handling) totalRows.push({ label: "Handling fee", value: money(inv.fees.handling), kind: "free" });
    if (inv.fees.delivery) totalRows.push({ label: "Delivery fee", value: money(inv.fees.delivery), kind: "free" });
  }
  const freeHtml = (v: string) => `<s style="color:#9ca3af;margin-right:4px">${v}</s> <strong style="color:#2e9e5b">FREE</strong>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${esc(inv.seller.name)} — Invoice ${esc(inv.invoiceNo)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #14120a; background: #f2f0ec; }
  .no-print { }
  @media print { body { background: #fff; } .no-print { display: none !important; } }

  /* ---------- print bar ---------- */
  .print-bar { background: #14120a; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .view-toggle { display: flex; gap: 6px; }
  .toggle-btn { padding: 7px 16px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #34343c; background: transparent; color: #a5a19a; font-family: inherit; }
  .toggle-btn.active { background: #cba135; color: #14120a; border-color: #cba135; }
  .btn { padding: 8px 20px; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; font-family: inherit; }
  .btn-gold { background: #cba135; color: #14120a; }
  .btn-ghost { background: transparent; color: #cfcac0; border: 1px solid #34343c; }

  /* ---------- standard (A4) invoice ---------- */
  .page { background: #fff; max-width: 800px; margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,.12); position: relative; }
  @media print { .page { margin: 0; box-shadow: none; max-width: 100%; } }
  .header { background: #14120a; color: #fff; padding: 28px 40px; display: flex; justify-content: space-between; align-items: flex-start; }
  .seller-name { font-size: 20px; font-weight: 800; color: #cba135; }
  .seller-details { font-size: 11px; color: #cfcac0; margin-top: 8px; line-height: 1.7; }
  .doc-label h1 { font-size: 26px; font-weight: 800; color: #cba135; letter-spacing: 2px; text-align: right; }
  .doc-label p { font-size: 11px; color: #a5a19a; text-align: right; margin-top: 4px; }
  .inv-no { font-size: 14px; font-weight: 700; color: #fff; text-align: right; margin-top: 6px; }
  .meta { background: #cba135; display: flex; justify-content: space-between; padding: 10px 40px; flex-wrap: wrap; gap: 10px; }
  .meta-item .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #4a3a0f; }
  .meta-item .val { font-size: 12px; font-weight: 700; color: #14120a; margin-top: 1px; }
  .addrs { display: flex; border-bottom: 1px solid #e8e6df; }
  .addr { flex: 1; padding: 22px 40px; }
  .addr:first-child { border-right: 1px solid #e8e6df; }
  .addr .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #8a8578; margin-bottom: 8px; }
  .addr-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .addr-line { font-size: 12px; color: #55524a; line-height: 1.7; }
  .gstin-badge { font-size: 11px; font-weight: 600; background: #f2f0ec; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 6px; }
  .sec-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #8a8578; padding: 16px 40px 8px; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead tr { background: #14120a; }
  table.items thead th { padding: 10px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #cfcac0; text-align: left; }
  table.items thead th.r { text-align: right; } table.items thead th.c { text-align: center; }
  table.items { margin: 0 40px; width: calc(100% - 80px); }
  table.items tbody tr { border-bottom: 1px solid #f2f0ec; }
  table.items tbody tr:last-child { border-bottom: 2px solid #e8e6df; }
  table.items tbody td { padding: 10px 12px; font-size: 12px; vertical-align: top; }
  table.items tbody td.r { text-align: right; font-variant-numeric: tabular-nums; }
  table.items tbody td.c { text-align: center; }
  .item-name { font-weight: 500; } .item-sku { font-size: 10px; color: #8a8578; margin-top: 2px; }
  .totals-wrap { display: flex; justify-content: flex-end; padding: 12px 40px 0; }
  .totals { width: 330px; border-collapse: collapse; }
  .totals td { padding: 5px 0; font-size: 12px; color: #55524a; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.sub td { font-size: 11px; color: #8a8578; padding: 1px 0 1px 12px; }
  .totals tr.disc td { color: #2e9e5b; }
  .totals .grand td { font-size: 16px; font-weight: 800; color: #14120a; border-top: 1px solid #e8e6df; padding-top: 10px; }
  .totals .grand td:last-child { color: #a8801f; }
  .words { margin: 16px 40px 0; padding: 12px 16px; background: #f9f8f5; border: 1px solid #e8e6df; border-radius: 6px; }
  .words .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #8a8578; margin-bottom: 3px; }
  .words .val { font-size: 12px; font-weight: 600; font-style: italic; }
  .pmt { display: flex; gap: 24px; margin: 16px 40px; padding: 14px 16px; background: #f2f8f4; border: 1px solid #c9e4d1; border-radius: 6px; flex-wrap: wrap; }
  .pmt .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #2e7d5b; margin-bottom: 2px; }
  .pmt .val { font-size: 12px; font-weight: 600; }
  .paid-badge { background: #2e9e5b; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; display: inline-block; }
  .bank { margin: 16px 40px 0; }
  .bank .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #8a8578; margin-bottom: 6px; }
  .bank .row { font-size: 12px; line-height: 1.7; } .bank .row span { color: #8a8578; font-size: 11px; }
  .sig { display: flex; justify-content: flex-end; padding: 0 40px; margin-top: 20px; }
  .sig-inner { text-align: right; } .sig-line { border-top: 1px solid #ccc; width: 140px; margin: 30px 0 4px auto; }
  .sig-name { font-size: 11px; font-weight: 600; } .sig-title { font-size: 10px; color: #8a8578; }
  .terms { margin: 16px 40px 0; padding: 14px 0 0; border-top: 1px solid #e8e6df; }
  .terms .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #8a8578; margin-bottom: 4px; }
  .terms .val { font-size: 11px; color: #8a8578; line-height: 1.6; }
  .footer { background: #14120a; color: #a5a19a; padding: 14px 40px; display: flex; justify-content: space-between; align-items: center; margin-top: 24px; font-size: 11px; }
  .watermark { position: absolute; top: 46%; left: 50%; transform: translate(-50%,-50%) rotate(-28deg); font-size: 72px; font-weight: 800; color: rgba(200,40,40,0.16); border: 6px solid rgba(200,40,40,0.16); padding: 6px 28px; border-radius: 10px; pointer-events: none; letter-spacing: 6px; }

  /* ---------- thermal (80mm) receipt ---------- */
  #thermal-view { display: none; }
  .receipt { width: 78mm; margin: 20px auto; background: #fff; padding: 10px 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #000; position: relative; }
  @media print { .receipt { margin: 0 auto; box-shadow: none; } }
  .receipt .center { text-align: center; }
  .receipt .biz-name { font-size: 14px; font-weight: 700; }
  .receipt .small { font-size: 9.5px; line-height: 1.5; }
  .receipt .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .receipt .row { display: flex; justify-content: space-between; gap: 6px; }
  .receipt .row .l { flex: 1; }
  .receipt .item-row { margin-bottom: 3px; }
  .receipt .item-row .item-line1 { display: flex; justify-content: space-between; font-weight: 600; }
  .receipt .item-row .item-line2 { display: flex; justify-content: space-between; color: #333; font-size: 10px; }
  .receipt .grand { font-size: 13px; font-weight: 700; }
  .receipt .watermark { font-size: 32px; padding: 4px 10px; border-width: 3px; letter-spacing: 2px; }
</style>
</head>
<body>
  <div class="no-print print-bar">
    <div class="view-toggle">
      <button class="toggle-btn active" id="btn-standard" onclick="showView('standard')">Standard (A4)</button>
      <button class="toggle-btn" id="btn-thermal" onclick="showView('thermal')">Thermal (80mm)</button>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost" onclick="window.close()">Close</button>
      <button class="btn btn-gold" onclick="window.print()">🖨 Print / Save PDF</button>
    </div>
  </div>

  <!-- ============ STANDARD (A4) VIEW ============ -->
  <div id="standard-view">
    <div class="page">
      ${inv.isCancelled ? `<div class="watermark">CANCELLED</div>` : ""}

      <div class="header">
        <div>
          <div class="seller-name">${esc(inv.seller.name)}</div>
          <div class="seller-details">
            ${sellerAddr ? esc(sellerAddr) + "<br/>" : ""}
            ${sellerPhone ? `Phone: ${esc(sellerPhone)}<br/>` : ""}
            ${sellerEmail ? `Email: ${esc(sellerEmail)}<br/>` : ""}
            ${sellerWebsite ? `${esc(sellerWebsite)}<br/>` : ""}
            ${gstin ? `GSTIN: ${esc(gstin)}` : ""}
          </div>
        </div>
        <div class="doc-label">
          <h1>${docTitle.toUpperCase()}</h1>
          <div class="inv-no">${esc(inv.invoiceNo)}</div>
        </div>
      </div>

      <div class="meta">
        <div class="meta-item"><div class="lbl">Invoice Date</div><div class="val">${esc(inv.invoiceDate)}</div></div>
        <div class="meta-item"><div class="lbl">Order ID</div><div class="val">${esc(inv.orderNumber)}</div></div>
        <div class="meta-item"><div class="lbl">Status</div><div class="val">${esc(statusLabel)}</div></div>
        ${awb ? `<div class="meta-item"><div class="lbl">AWB</div><div class="val">${esc(awb)}</div></div>` : ""}
      </div>

      <div class="addrs">
        <div class="addr">
          <div class="lbl">Sold By</div>
          <div class="addr-name">${esc(inv.seller.name)}</div>
          ${gstin ? `<div class="addr-line">GSTIN: ${esc(gstin)}${inv.seller.stateCode ? ` · State code ${esc(inv.seller.stateCode)}` : ""}</div>` : ""}
          ${pan ? `<div class="addr-line">PAN: ${esc(pan)}</div>` : ""}
        </div>
        <div class="addr">
          <div class="lbl">Billed To</div>
          <div class="addr-name">${esc(inv.buyer.name)}</div>
          <div class="addr-line">
            ${buyerAddr ? esc(buyerAddr) + "<br/>" : ""}
            ${buyerCityLine ? esc(buyerCityLine) : "—"}
            ${buyerPhone ? `<br/>Phone: ${esc(buyerPhone)}` : ""}
            ${buyerEmail ? `<br/>Email: ${esc(buyerEmail)}` : ""}
          </div>
        </div>
      </div>

      <div class="sec-title">Items</div>
      <table class="items">
        <thead><tr>
          <th class="c" style="width:32px">#</th>
          <th>Product</th>
          <th class="c">Qty</th>
          <th class="r">Unit Price</th>
          <th class="r">Total</th>
        </tr></thead>
        <tbody>
          ${inv.items
            .map(
              (item, i) => `
          <tr>
            <td class="c">${i + 1}</td>
            <td><div class="item-name">${esc(item.name)}</div>${sh.sku && item.sku ? `<div class="item-sku">SKU: ${esc(item.sku)}</div>` : ""}</td>
            <td class="c">${item.qty}</td>
            <td class="r">₹${fmt(item.unitPrice)}</td>
            <td class="r" style="font-weight:600">₹${fmt(item.total)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>

      <div class="totals-wrap">
        <table class="totals">
          ${totalRows
            .map((r) =>
              r.kind === "sub"
                ? `<tr class="sub"><td>${esc(r.label)}</td><td>${r.value}</td></tr>`
                : `<tr${r.kind === "discount" ? ' class="disc"' : ""}><td>${esc(r.label)}</td><td>${r.kind === "free" ? freeHtml(r.value) : r.value}</td></tr>`,
            )
            .join("")}
          <tr class="grand"><td>Total ${sh.gstBreakdown ? `<span style="font-size:10px;font-weight:600;color:#8a8578">(incl. GST)</span>` : ""}</td><td>₹${fmt(inv.total)}</td></tr>
        </table>
      </div>

      ${
        sh.amountInWords
          ? `<div class="words">
        <div class="lbl">Amount in Words</div>
        <div class="val">₹ ${esc(inv.amountInWords)}</div>
      </div>`
          : ""
      }

      ${
        sh.paymentInfo && !inv.isCancelled
          ? `<div class="pmt">
        <div><div class="lbl">Payment</div><div class="val">${paid ? `<span class="paid-badge">Paid</span>` : esc(statusLabel)}</div></div>
        ${paymentMethod ? `<div><div class="lbl">Method</div><div class="val">${esc(paymentMethod)}</div></div>` : ""}
        ${inv.payment.id ? `<div><div class="lbl">Reference</div><div class="val">${esc(inv.payment.id)}</div></div>` : ""}
      </div>`
          : ""
      }

      ${
        sh.bankDetails && inv.seller.bank
          ? `<div class="bank">
        <div class="lbl">Bank Details</div>
        <div class="row"><span>Bank: </span>${esc(inv.seller.bank)}</div>
        ${inv.seller.accountNo ? `<div class="row"><span>Account No: </span>${esc(inv.seller.accountNo)}</div>` : ""}
        ${inv.seller.ifsc ? `<div class="row"><span>IFSC: </span>${esc(inv.seller.ifsc)}</div>` : ""}
      </div>`
          : ""
      }

      ${
        sh.signature
          ? `<div class="sig">
        <div class="sig-inner">
          <div class="sig-line"></div>
          <div class="sig-name">${esc(inv.seller.name)}</div>
          <div class="sig-title">Authorised Signatory</div>
        </div>
      </div>`
          : ""
      }

      ${
        (sh.terms && inv.layout.terms) || (sh.footerNote && inv.layout.footerNote)
          ? `<div class="terms">
        ${sh.terms && inv.layout.terms ? `<div class="lbl">Terms &amp; Conditions</div><div class="val">${esc(inv.layout.terms)}</div>` : ""}
        ${sh.footerNote && inv.layout.footerNote ? `<div class="val" style="margin-top:4px">${esc(inv.layout.footerNote)}</div>` : ""}
      </div>`
          : ""
      }

      <div class="footer">
        <div>${esc(inv.invoiceNo)}</div>
        <div>Generated ${new Date().toLocaleString("en-IN")}</div>
      </div>
    </div>
  </div>

  <!-- ============ THERMAL (80mm) VIEW ============ -->
  <div id="thermal-view">
    <div class="receipt">
      ${inv.isCancelled ? `<div class="center watermark" style="position:static;transform:none;border:2px dashed #c00;color:#c00;margin-bottom:6px">CANCELLED</div>` : ""}
      <div class="center biz-name">${esc(inv.seller.name)}</div>
      <div class="center small">
        ${sellerAddr ? esc(sellerAddr) + "<br/>" : ""}
        ${sellerPhone ? esc(sellerPhone) : ""}
        ${gstin ? `<br/>GSTIN: ${esc(gstin)}` : ""}
      </div>
      <div class="divider"></div>
      <div class="row"><span>Invoice:</span><span>${esc(inv.invoiceNo)}</span></div>
      <div class="row"><span>Date:</span><span>${esc(inv.invoiceDate)}</span></div>
      <div class="row"><span>Order:</span><span>${esc(inv.orderNumber)}</span></div>
      <div class="divider"></div>
      ${inv.items
        .map(
          (item) => `
      <div class="item-row">
        <div class="item-line1"><span>${esc(item.name)}</span><span>₹${fmt(item.total)}</span></div>
        <div class="item-line2"><span>${item.qty} x ₹${fmt(item.unitPrice)}</span><span></span></div>
      </div>`,
        )
        .join("")}
      <div class="divider"></div>
      ${totalRows
        .map(
          (r) =>
            `<div class="row"${r.kind === "sub" ? ' style="font-size:10px;padding-left:8px"' : ""}><span>${esc(r.label)}:</span><span>${r.kind === "free" ? `<s>${r.value}</s> FREE` : r.value}</span></div>`,
        )
        .join("")}
      <div class="row grand"><span>TOTAL:</span><span>₹${fmt(inv.total)}</span></div>
      <div class="divider"></div>
      <div class="small"><strong>Bill To:</strong><br/>${esc(inv.buyer.name)}<br/>${buyerAddr ? esc(buyerAddr) + "<br/>" : ""}${esc(buyerCityLine)}${buyerPhone ? `<br/>Ph: ${esc(buyerPhone)}` : ""}</div>
      <div class="divider"></div>
      <div class="small">Payment: ${inv.isCancelled ? "CANCELLED" : `${esc(statusLabel)}${sh.paymentInfo && paymentMethod ? ` (${esc(paymentMethod)})` : ""}`}${awb ? `<br/>AWB: ${esc(awb)}` : ""}</div>
      <div class="divider"></div>
      ${inv.layout.thankYouNote ? `<div class="center small">${esc(inv.layout.thankYouNote)}</div>` : ""}
    </div>
  </div>

  <script>
    function showView(v) {
      document.getElementById('standard-view').style.display = v === 'standard' ? 'block' : 'none';
      document.getElementById('thermal-view').style.display = v === 'thermal' ? 'block' : 'none';
      document.getElementById('btn-standard').classList.toggle('active', v === 'standard');
      document.getElementById('btn-thermal').classList.toggle('active', v === 'thermal');
    }
  </script>
</body>
</html>`;
}
