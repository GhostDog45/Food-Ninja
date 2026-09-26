import os
import secrets
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

import psycopg
from flask import Blueprint, jsonify, request

from db import get_connection, load_query
import utils

import requests

email_verification_bp = Blueprint("email_verification", __name__)


def _send_verification_email(email, code):
    host = os.getenv("BREVO_SMTP_HOST", "smtp-relay.brevo.com")
    login = os.getenv("BREVO_SMTP_LOGIN")
    password = os.getenv("BREVO_SMTP_PASSWORD") or os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    sender_name = os.getenv("BREVO_SENDER_NAME", "Food-Ninja")

    # 1. Attempt Brevo HTTPS REST API (Port 443 - never blocked by cloud firewalls like Render free tier)
    if password and sender_email:
        try:
            resp = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "accept": "application/json",
                    "api-key": password,
                    "content-type": "application/json",
                },
                json={
                    "sender": {"name": sender_name, "email": sender_email},
                    "to": [{"email": email}],
                    "subject": "Food-Ninja Email Verification",
                    "textContent": (
                        "Hello,\n\n"
                        f"Your Food-Ninja verification code is: {code}\n\n"
                        "This code is valid for 10 minutes.\n\n"
                        "Food-Ninja\n"
                    ),
                },
                timeout=5,
            )
            if resp.status_code in (200, 201):
                return True
            else:
                print(f"[Email Verification] Brevo REST API returned {resp.status_code}: {resp.text}", flush=True)
        except Exception as e:
            print(f"[Email Verification] Brevo REST API error: {e}", flush=True)

    # 2. Fallback to standard SMTP (Port 587)
    if not all((host, login, password, sender_email, sender_name)):
        raise ValueError("Email credentials not configured")

    try:
        port = int(os.getenv("BREVO_SMTP_PORT", "587"))
    except ValueError as exc:
        raise ValueError("Brevo SMTP port is invalid") from exc

    message = EmailMessage()
    message["Subject"] = "Food-Ninja Email Verification"
    message["From"] = formataddr((sender_name, sender_email))
    message["To"] = email
    message.set_content(
        "Hello,\n\n"
        "Your Food-Ninja verification code is:\n\n"
        f"{code}\n\n"
        "This code is valid for 10 minutes.\n\n"
        "Food-Ninja\n"
    )

    with smtplib.SMTP(host, port, timeout=5) as smtp:
        smtp.starttls()
        smtp.login(login, password)
        smtp.send_message(message)
    return True


@email_verification_bp.post("/verify-email/send")
def send_email_verification():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    if not isinstance(email, str) or not utils.is_valid_email(email.strip()):
        return jsonify({"success": False, "message": "A valid email address is required"}), 400
    email = email.strip().lower()
    code = f"{secrets.randbelow(1_000_000):06d}"

    print(f"[Email Verification] Generated verification code for {email}: {code}", flush=True)

    # Always persist code to DB first so user can verify
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(load_query("email_verification.sql", "upsert_email_verification"), (email, code))
            conn.commit()
    except psycopg.Error as e:
        print(f"[Email Verification] DB save error: {e}", flush=True)
        return jsonify({"success": False, "message": "Could not save verification code"}), 500

    email_sent = False
    send_err = None
    try:
        _send_verification_email(email, code)
        email_sent = True
    except Exception as exc:
        send_err = str(exc)
        print(f"[Email Verification] Email delivery warning (likely cloud port block): {exc}", flush=True)

    if email_sent:
        return jsonify({"success": True, "message": "Verification code sent to your email"}), 200
    else:
        # Fallback for free tiers where SMTP ports 587/465 are blocked
        return jsonify({
            "success": True,
            "message": f"Verification code: {code} (Cloud SMTP blocked)",
            "dev_code": code
        }), 200


@email_verification_bp.post("/verify-email")
def verify_email():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    code = data.get("code")
    consume = bool(data.get("consume", False))

    if not isinstance(email, str) or not utils.is_valid_email(email.strip()):
        return jsonify({"success": False, "message": "A valid email address is required"}), 400
    if not isinstance(code, str) or len(code) != 6 or not code.isdigit():
        return jsonify({"success": False, "message": "A six-digit verification code is required"}), 400

    email = email.strip().lower()

    try:
        with get_connection() as conn, conn.cursor() as cur:
            query_name = "consume_email_verification" if consume else "get_valid_email_verification"
            cur.execute(
                load_query("email_verification.sql", query_name),
                (email, code),
            )
            if not cur.fetchone():
                return jsonify({"success": False, "message": "Verification code is invalid or expired"}), 400
            conn.commit()
            return jsonify({"success": True, "message": "Email verified successfully"}), 200
    except psycopg.Error:
        return jsonify({"success": False, "message": "Email verification failed"}), 500
