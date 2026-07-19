type EmailLayoutOptions = {
  title: string;
  preheader?: string;
  body: string;
};

export function emailLayout({ title, preheader, body }: EmailLayoutOptions) {
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
/>

<title>${title}</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial,Helvetica,sans-serif;
  "
>

${
  preheader
    ? `
<div
  style="
    display:none;
    max-height:0;
    overflow:hidden;
    opacity:0;
    color:transparent;
  "
>
${preheader}
</div>
`
    : ''
}

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="padding:40px 20px;"
>

<tr>

<td align="center">

<table
  width="600"
  cellpadding="0"
  cellspacing="0"
  style="
    background:#ffffff;
    border-radius:18px;
    overflow:hidden;
    box-shadow:0 8px 30px rgba(0,0,0,.08);
  "
>

<!-- HEADER -->

<tr>

<td
  align="center"
  style="
    background:#0f172a;
    padding:35px;
  "
>

<img
  src="https://www.honestpredict.com/logo1.png"
  alt="Honest Predict"
  width="90"
/>

</td>

</tr>

<!-- BANNER -->

<tr>

<td>

<img
  src="https://www.honestpredict.com/images/football1.png"
  alt="Football Predictions"
  width="600"
  style="
    display:block;
    width:100%;
    max-width:600px;
  "
/>

</td>

</tr>

<!-- CONTENT -->

<tr>

<td style="padding:40px;">

${body}

</td>

</tr>

<!-- FOOTER -->

<tr>

<td
  align="center"
  style="
    background:#f8fafc;
    padding:30px;
    border-top:1px solid #e5e7eb;
  "
>

<p
  style="
    margin:0;
    color:#6b7280;
    font-size:13px;
  "
>

© ${year} Honest Predict

</p>

<p style="margin:10px 0;">

Football Predictions • VIP Tips • Live Scores

</p>

<p style="margin:0;">

<a
  href="https://www.honestpredict.com"
  style="
    color:#2563eb;
    text-decoration:none;
    font-weight:bold;
  "
>

www.honestpredict.com

</a>

</p>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`;
}
