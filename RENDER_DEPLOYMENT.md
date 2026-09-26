# Deploying Food-Ninja to Render (onrender.com)

This guide walks you through deploying both the **Flask Backend API** and the **Next.js Frontend** to [Render](https://render.com).

---

## Architecture Overview

- **Backend**: Python 3.11 + Flask + Gunicorn (with WebSocket support via `flask-sock`)
- **Frontend**: Next.js 16 + React 19 (Server + Client components)
- **Database**: PostgreSQL (Neon Cloud Database or Render Managed PostgreSQL)

---

## Method 1: Blueprint Deploy (Recommended - 1-Click)

The repository includes a ready-to-use [`render.yaml`](./render.yaml) blueprint that configures both services at once.

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Configure project for Render deployment"
   git push origin main
   ```
2. Go to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** in the top right corner and select **Blueprint**.
4. Connect your GitHub repository (`Food-Ninja`).
5. Render will automatically detect [`render.yaml`](./render.yaml) and list two services:
   - `food-ninja-backend`
   - `food-ninja-frontend`
6. Fill in the required environment variables prompted by Render:
   - **`DATABASE_URL`**: Your PostgreSQL connection string (from Neon or your database).
   - **`GOOGLE_MAPS_API_KEY`**: Your Google Maps API Key.
   - **`admin_invitation_code`**: Secret invite code for registering admin accounts.
   - **`BREVO_SMTP_LOGIN`**, **`BREVO_SMTP_PASSWORD`**, **`BREVO_SENDER_EMAIL`**: For email verification.
   - **`NEXT_PUBLIC_BACKEND_URL`**: Set this to your backend service's Render URL (e.g., `https://food-ninja-backend.onrender.com`).
7. Click **Apply**. Render will build and deploy both services!

---

## Method 2: Manual Setup on Render

If you prefer creating the services manually in the dashboard:

### Step 1: Deploy Backend Web Service

1. On the Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository.
3. Configure the backend:
   - **Name**: `food-ninja-backend` (or your chosen name)
   - **Root Directory**: `Backend`
   - **Runtime**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -b 0.0.0.0:$PORT --workers 1 --threads 50 wsgi:app`
   - **Plan**: `Free`
4. In **Environment Variables**, add:
   - `PYTHON_VERSION`: `3.11.9`
   - `DATABASE_URL`: `postgresql://<user>:<password>@<host>/<database>?sslmode=require`
   - `JWT_SECRET`: (Click generate or paste a random 32+ character string)
   - `GOOGLE_MAPS_API_KEY`: Your Google Maps API key
   - `admin_invitation_code`: Code required to register admins
   - `BREVO_SMTP_HOST`: `smtp-relay.brevo.com`
   - `BREVO_SMTP_PORT`: `587`
   - `BREVO_SMTP_LOGIN`: Your Brevo SMTP login
   - `BREVO_SMTP_PASSWORD`: Your Brevo SMTP password
   - `BREVO_SENDER_EMAIL`: Your verified sender email
   - `BREVO_SENDER_NAME`: `Food-Ninja`
5. Click **Create Web Service**.
6. Once deployed, copy your Backend URL (e.g., `https://food-ninja-backend.onrender.com`).
   - Test it by visiting `https://food-ninja-backend.onrender.com/api/health` in your browser. It should return `{"status":"healthy"}`.

---

### Step 2: Deploy Frontend Web Service

1. On the Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository.
3. Configure the frontend:
   - **Name**: `food-ninja-frontend`
   - **Root Directory**: `Frontend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
4. In **Environment Variables**, add:
   - `NODE_VERSION`: `20.18.0`
   - `NEXT_PUBLIC_BACKEND_URL`: `https://food-ninja-backend.onrender.com` *(use your actual backend URL from Step 1)*
   - `DATABASE_URL`: Your PostgreSQL connection string
5. Click **Create Web Service**.
6. Once deployment finishes, open your frontend URL (e.g., `https://food-ninja-frontend.onrender.com`).

---

## Important Operational Notes

1. **Free Tier Spin-Down**:
   On Render's Free tier, services spin down after 15 minutes of inactivity. When a new request arrives, it may take 30–50 seconds for the service to wake up. This is normal behavior on free plans.

2. **WebSocket Support**:
   Rider live tracking and order maps use WebSockets via `flask-sock`. The backend Gunicorn server is configured with `--workers 1 --threads 50`, allowing all concurrent WebSocket streams to share in-memory state smoothly without requiring an external Redis broker.

3. **Database Connection Resiliency**:
   The connection pool in `db.py` uses `check=ConnectionPool.check_connection` and `max_idle=300.0`. If Neon serverless PostgreSQL goes to sleep or drops an idle connection, the backend will automatically reconnect without throwing errors.
