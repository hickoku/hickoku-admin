# Hickoku Admin — Perfume Ecommerce Admin Panel

A sleek, dark, password-protected admin panel for the Hickoku perfume storefront. Built on Next.js (App Router), it unifies **AWS DynamoDB**, **AWS S3**, **Razorpay**, and **Delhivery** into one dashboard.

## Features

- 🔐 **Login-gated** — one admin password, signed session cookie, middleware protects every page and API route.
- 📊 **Dashboard** — live revenue trend, order status breakdown, top-selling perfumes, recent orders.
- 🖼️ **Hero Section** — upload/replace/delete the homepage hero banner image, stored in S3; mark one as "active" for your storefront to read.
- 📦 **Orders** — every order pulled from your DynamoDB `orders` table, each row enriched with:
  - **Payment info** — live from Razorpay (status, method, amount captured).
  - **Delivery info** — live from Delhivery (shipment status, location, expected delivery).

## Quick Start

Requires **Node.js 20+** (this repo pins `24.16.0` via `.nvmrc` — the AWS SDK prints noisy version warnings on Node 18/19):

```bash
nvm use            # if you use nvm — picks up .nvmrc
npm install
cp .env.example .env.local   # already done for you — just fill in the blanks
npm run dev                   # http://localhost:3000
```

You'll land on `/login` first — set `ADMIN_PASSWORD` in `.env.local`, restart `npm run dev`, and sign in with that password.

## Environment Variables

All required keys are listed in [.env.example](.env.example) and already copied into `.env.local` for you to fill in. Nothing is hardcoded — every AWS/Razorpay/Delhivery credential is read from the environment at runtime.

| Variable | Used for |
|---|---|
| `ADMIN_PASSWORD` | Password to log into the admin panel |
| `ADMIN_SESSION_SECRET` | (optional) signs the login cookie; falls back to `ADMIN_PASSWORD` |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | DynamoDB (orders/products) + S3 (hero images) |
| `ORDERS_TABLE_NAME`, `PRODUCTS_TABLE_NAME` | Your DynamoDB table names |
| `S3_BUCKET_NAME` | Bucket the hero images upload into |
| `S3_PUBLIC_BASE_URL` | (optional) CloudFront/custom domain instead of the raw S3 URL |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Payment info per order |
| `DELHIVERY_API_TOKEN`, `DELHIVERY_BASE_URL` | Delivery/shipment status per order |

The same AWS/Razorpay/Delhivery account you already use in `~/Documents/Github/admin-panel` will work here too — just re-enter the values, this project does not copy secrets automatically.

## Setting up S3 for hero images (step by step)

The hero-image uploader needs one S3 bucket. Here's the full walkthrough:

1. **Create the bucket**
   - AWS Console → S3 → **Create bucket**.
   - Name it something like `hickoku-storefront-assets` (must be globally unique).
   - Region: match the `AWS_REGION` you're using for DynamoDB (e.g. `ap-south-1`) — keeps everything in one place.
   - Object Ownership: **ACLs disabled** (default, recommended).

2. **Allow public read of the images** (so your storefront's homepage can display them)
   - On the bucket → **Permissions** tab → **Block public access** → edit → **uncheck** "Block all public access" → save (confirm the warning).
   - Still on **Permissions** → **Bucket policy** → paste this, replacing `YOUR_BUCKET_NAME`:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Sid": "PublicReadHero",
           "Effect": "Allow",
           "Principal": "*",
           "Action": "s3:GetObject",
           "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/hero/*"
         },
         {
           "Sid": "PublicReadSiteConfig",
           "Effect": "Allow",
           "Principal": "*",
           "Action": "s3:GetObject",
           "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/site-config/*"
         }
       ]
     }
     ```
   - This only makes the `hero/` and `site-config/` folders public — nothing else in the bucket is exposed. (If you'd rather not open any public access, use CloudFront with Origin Access Control instead — set `S3_PUBLIC_BASE_URL` to the CloudFront domain in that case.)

3. **Give your AWS credentials permission to write to it**
   - The same IAM user/access key you use for `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on this bucket. Attach an inline policy like:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
           "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
         },
         {
           "Effect": "Allow",
           "Action": "s3:ListBucket",
           "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
         }
       ]
     }
     ```

4. **Set the env var**
   - In `.env.local`: `S3_BUCKET_NAME=hickoku-storefront-assets` (whatever you named it).
   - Leave `S3_PUBLIC_BASE_URL` blank unless you're using CloudFront/a custom domain — the app will fall back to `https://<bucket>.s3.<region>.amazonaws.com/<key>`.

5. **That's it.** Go to **Hero Section** in the sidebar, upload an image, click **Set Active**. The active image's public URL is shown at the top of the page — point your storefront's homepage at that URL, or have it read `https://.../site-config/hero.json` (contains `{ "activeKey": "hero/…" }`) to always resolve the current one.

## Project Structure

```
app/
  page.tsx                  → Dashboard (trending stats & charts)
  login/page.tsx             → Admin login
  orders/page.tsx             → Orders: DynamoDB + Razorpay payment + Delhivery delivery
  hero/page.tsx                → Hero image upload/management (S3)
  api/
    auth/login, auth/logout   → Session cookie
    dashboard/route.ts         → Aggregated stats
    orders/route.ts             → DynamoDB orders + product enrichment
    razorpay/route.ts            → Razorpay proxy
    delhivery/route.ts            → Delhivery proxy
    hero/route.ts                  → S3 upload/list/set-active/delete
lib/          → aws.ts, razorpay.ts, delhivery.ts, auth.ts (env-driven clients & helpers)
components/   → AdminLayout, Sidebar, OrderCard, States
middleware.ts → gates every route behind the login session
```

## Order ↔ Shipment linking

Orders link to Delhivery shipments by matching the Razorpay `order_id` to the Delhivery shipment's `reference_number`. When creating a shipment in Delhivery, set `reference_number` = the Razorpay order ID so it shows up automatically on the order.
