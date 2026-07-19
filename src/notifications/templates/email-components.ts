// ==========================================
// PRIMARY BUTTON
// ==========================================

export function primaryButton(text: string, url: string) {
  return `
<div
  style="
    text-align:center;
    margin:35px 0;
  "
>

<a
  href="${url}"
  style="
    background:#2563eb;
    color:#ffffff;
    text-decoration:none;
    display:inline-block;
    padding:15px 34px;
    border-radius:8px;
    font-size:16px;
    font-weight:bold;
  "
>

${text}

</a>

</div>
`;
}

// ==========================================
// SECONDARY BUTTON
// ==========================================

export function secondaryButton(text: string, url: string) {
  return `
<div
  style="
    text-align:center;
    margin:20px 0;
  "
>

<a
  href="${url}"
  style="
    background:#ffffff;
    color:#2563eb;
    text-decoration:none;
    display:inline-block;
    padding:14px 32px;
    border-radius:8px;
    border:2px solid #2563eb;
    font-size:15px;
    font-weight:bold;
  "
>

${text}

</a>

</div>
`;
}

// ==========================================
// SUCCESS MESSAGE
// ==========================================

export function successBox(message: string) {
  return `
<div
  style="
    background:#ecfdf5;
    border:1px solid #10b981;
    border-radius:10px;
    padding:18px;
    margin:25px 0;
  "
>

<div
  style="
    color:#065f46;
    font-size:18px;
    font-weight:bold;
    margin-bottom:8px;
  "
>

✅ Success

</div>

<div
  style="
    color:#065f46;
    line-height:1.7;
  "
>

${message}

</div>

</div>
`;
}

// ==========================================
// WARNING BOX
// ==========================================

export function warningBox(message: string) {
  return `
<div
  style="
    background:#fefce8;
    border:1px solid #facc15;
    border-radius:10px;
    padding:18px;
    margin:25px 0;
  "
>

<div
  style="
    color:#854d0e;
    font-size:18px;
    font-weight:bold;
    margin-bottom:8px;
  "
>

⏳ Pending

</div>

<div
  style="
    color:#854d0e;
    line-height:1.7;
  "
>

${message}

</div>

</div>
`;
}

// ==========================================
// ERROR BOX
// ==========================================

export function dangerBox(message: string) {
  return `
<div
  style="
    background:#fef2f2;
    border:1px solid #ef4444;
    border-radius:10px;
    padding:18px;
    margin:25px 0;
  "
>

<div
  style="
    color:#991b1b;
    font-size:18px;
    font-weight:bold;
    margin-bottom:8px;
  "
>

❌ Action Required

</div>

<div
  style="
    color:#991b1b;
    line-height:1.7;
  "
>

${message}

</div>

</div>
`;
}

// ==========================================
// SECTION TITLE
// ==========================================

export function sectionTitle(title: string) {
  return `
<h2
  style="
    color:#111827;
    margin-top:0;
    margin-bottom:20px;
  "
>

${title}

</h2>
`;
}

// ==========================================
// PARAGRAPH
// ==========================================

export function paragraph(text: string) {
  return `
<p
  style="
    color:#4b5563;
    font-size:16px;
    line-height:1.8;
  "
>

${text}

</p>
`;
}

// ==========================================
// INFORMATION CARD
// ==========================================

export function infoCard(
  title: string,
  rows: {
    label: string;
    value: string;
  }[],
) {
  return `
<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="
    background:#f8fafc;
    border:1px solid #e5e7eb;
    border-radius:12px;
    margin:30px 0;
  "
>

<tr>

<td
  style="
    padding:24px;
  "
>

<h3
  style="
    margin:0 0 20px 0;
    color:#111827;
    font-size:18px;
  "
>

${title}

</h3>


<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
>

${rows
  .map(
    (row) => `
<tr>

<td
  style="
    padding:10px 0;
    color:#374151;
    font-weight:bold;
    border-bottom:1px solid #e5e7eb;
  "
>

${row.label}

</td>


<td
  align="right"
  style="
    padding:10px 0;
    color:#4b5563;
    border-bottom:1px solid #e5e7eb;
  "
>

${row.value}

</td>

</tr>
`,
  )
  .join('')}

</table>

</td>

</tr>

</table>
`;
}
